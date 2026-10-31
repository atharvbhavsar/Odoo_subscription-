import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { PricingService } from '../discounts/pricing.service';
import { AuditService } from '../audit/audit.service';

export const quotationsRouter = Router();

// List quotations (Admin/Staff sees all, Customer sees own)
quotationsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  let sql = `
    SELECT q.*, c.name as customer_name, c.company_name, p.name as plan_name, p.billing_frequency
    FROM quotations q
    JOIN customer_profiles c ON q.customer_id = c.id
    JOIN plans p ON q.plan_id = p.id
  `;
  const params: any[] = [];

  if (req.user?.role === 'customer') {
    sql += ' WHERE q.customer_id = ?';
    params.push(req.user.customerId);
  }

  sql += ' ORDER BY q.created_at DESC';

  const quotations = await db.query(sql, params);
  res.json({ data: quotations, message: 'Quotations retrieved successfully' });
});

// Get quotation details with lines
quotationsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const quotation = await db.queryOne<{
    id: string;
    customer_id: string;
    status: string;
    [key: string]: any;
  }>(
    `SELECT q.*, c.name as customer_name, c.company_name, p.name as plan_name, p.billing_frequency
     FROM quotations q
     JOIN customer_profiles c ON q.customer_id = c.id
     JOIN plans p ON q.plan_id = p.id
     WHERE q.id = ?`,
    [req.params.id]
  );

  if (!quotation) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Quotation not found' } });
  }

  if (req.user?.role === 'customer' && req.user.customerId !== quotation.customer_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access to quotation' } });
  }

  const lines = await db.query(
    `SELECT ql.*, pr.name as product_name, pv.attribute_name, pv.attribute_value
     FROM quotation_lines ql
     JOIN products pr ON ql.product_id = pr.id
     LEFT JOIN product_variants pv ON ql.variant_id = pv.id
     WHERE ql.quotation_id = ?`,
    [quotation.id]
  );

  res.json({
    data: { ...quotation, lines },
    message: 'Quotation details retrieved',
  });
});

const createQuotationSchema = z.object({
  customer_id: z.string().min(1),
  plan_id: z.string().min(1),
  discount_id: z.string().optional().nullable(),
  tax_id: z.string().optional().nullable(),
  valid_until: z.string(),
  lines: z.array(
    z.object({
      product_id: z.string().min(1),
      variant_id: z.string().optional().nullable(),
      quantity: z.number().int().min(1),
      unit_price: z.number().min(0).optional(),
    })
  ).min(1),
});

// Staff/Admin creates quotation
quotationsRouter.post('/', requireAuth, requireRole(['admin', 'staff']), validateRequest(createQuotationSchema), async (req: Request, res: Response) => {
  const { customer_id, plan_id, discount_id, tax_id, valid_until, lines } = req.body;
  const today = new Date().toISOString().split('T')[0];

  // 1. Validate Plan
  const plan = await db.queryOne<{
    id: string;
    min_qty: number;
    is_active: number;
    start_date?: string | null;
    end_date?: string | null;
  }>('SELECT id, min_qty, is_active, start_date, end_date FROM plans WHERE id = ?', [plan_id]);

  if (!plan) {
    return res.status(400).json({ error: { code: 'INVALID_PLAN', message: 'Selected plan does not exist' } });
  }

  if (!plan.is_active) {
    return res.status(400).json({ error: { code: 'INACTIVE_PLAN', message: 'Selected plan is inactive and cannot be used for new quotations' } });
  }

  if (plan.start_date && today < plan.start_date) {
    return res.status(400).json({ error: { code: 'PLAN_NOT_AVAILABLE', message: `Plan is not yet available (available from ${plan.start_date})` } });
  }
  if (plan.end_date && today > plan.end_date) {
    return res.status(400).json({ error: { code: 'PLAN_EXPIRED', message: `Plan availability expired on ${plan.end_date}` } });
  }

  const totalQty = lines.reduce((acc: number, l: any) => acc + l.quantity, 0);
  if (totalQty < plan.min_qty) {
    return res.status(400).json({
      error: { code: 'MIN_QUANTITY_NOT_MET', message: `Plan requires a minimum quantity of ${plan.min_qty}` },
    });
  }

  // 2. Validate Tax rule if provided
  if (tax_id) {
    const tax = await db.queryOne<{
      id: string;
      name: string;
      is_active: number;
      start_date?: string | null;
      end_date?: string | null;
    }>('SELECT id, name, is_active, start_date, end_date FROM taxes WHERE id = ?', [tax_id]);

    if (!tax) {
      return res.status(400).json({ error: { code: 'INVALID_TAX', message: 'Selected tax rule does not exist' } });
    }
    if (!tax.is_active) {
      return res.status(400).json({ error: { code: 'INACTIVE_TAX', message: 'Selected tax rule is inactive and cannot be applied to new quotations' } });
    }
    if (tax.start_date && today < tax.start_date) {
      return res.status(400).json({ error: { code: 'TAX_NOT_AVAILABLE', message: `Tax rule is not yet effective (effective from ${tax.start_date})` } });
    }
    if (tax.end_date && today > tax.end_date) {
      return res.status(400).json({ error: { code: 'TAX_EXPIRED', message: `Tax rule expired on ${tax.end_date}` } });
    }
  }

  // 3. Validate Discount rule if provided
  if (discount_id) {
    const discount = await db.queryOne<{
      id: string;
      code: string;
      is_active: number;
      start_date?: string | null;
      end_date?: string | null;
      max_uses: number;
      used_count: number;
      min_purchase_amount: number;
      min_quantity: number;
    }>('SELECT * FROM discounts WHERE id = ?', [discount_id]);

    if (!discount) {
      return res.status(400).json({ error: { code: 'INVALID_DISCOUNT', message: 'Selected discount code does not exist' } });
    }
    if (!discount.is_active) {
      return res.status(400).json({ error: { code: 'INACTIVE_DISCOUNT', message: 'Selected discount code is inactive and cannot be applied to new quotations' } });
    }
    if (discount.start_date && today < discount.start_date) {
      return res.status(400).json({ error: { code: 'DISCOUNT_NOT_AVAILABLE', message: `Discount is not yet active (active from ${discount.start_date})` } });
    }
    if (discount.end_date && today > discount.end_date) {
      return res.status(400).json({ error: { code: 'DISCOUNT_EXPIRED', message: `Discount expired on ${discount.end_date}` } });
    }
    if (discount.max_uses > 0 && discount.used_count >= discount.max_uses) {
      return res.status(400).json({ error: { code: 'DISCOUNT_MAX_USES_REACHED', message: 'Discount has reached its maximum allowable uses' } });
    }
  }

  // Calculate authoritative pricing
  const pricingInputs = lines.map((l: any) => ({
    productId: l.product_id,
    variantId: l.variant_id,
    quantity: l.quantity,
    unitPrice: l.unit_price,
  }));

  const pricing = await PricingService.calculatePricing(pricingInputs, discount_id, tax_id);

  const quotationId = uuidv4();
  const quoteNumber = `QT-${Date.now().toString().slice(-6)}`;

  await db.transaction(async () => {
    await db.execute(
      `INSERT INTO quotations (id, quotation_number, customer_id, plan_id, discount_id, tax_id, status, valid_until, subtotal, discount_amount, tax_amount, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, 'quotation', ?, ?, ?, ?, ?)`,
      [
        quotationId,
        quoteNumber,
        customer_id,
        plan_id,
        pricing.discountId,
        pricing.taxId,
        valid_until,
        pricing.subtotal,
        pricing.discountAmount,
        pricing.taxAmount,
        pricing.totalAmount,
      ]
    );

    for (const line of pricing.lines) {
      await db.execute(
        `INSERT INTO quotation_lines (id, quotation_id, product_id, variant_id, quantity, unit_price, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), quotationId, line.productId, line.variantId, line.quantity, line.unitPrice, line.subtotal]
      );
    }
  });

  await AuditService.log('QUOTATION_CREATED', 'quotations', quotationId, req.user?.id, { quoteNumber, total: pricing.totalAmount });

  res.status(201).json({
    data: { id: quotationId, quotation_number: quoteNumber, total_amount: pricing.totalAmount },
    message: 'Quotation created successfully',
  });
});

// Confirm quotation -> Turns quote into Subscription
quotationsRouter.post('/:id/confirm', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const quoteId = req.params.id;

  const quote = await db.queryOne<{
    id: string;
    customer_id: string;
    plan_id: string;
    discount_id: string | null;
    tax_id: string | null;
    status: string;
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
  }>('SELECT * FROM quotations WHERE id = ?', [quoteId]);

  if (!quote) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Quotation not found' } });
  }

  if (quote.status === 'confirmed') {
    return res.status(400).json({ error: { code: 'ALREADY_CONFIRMED', message: 'Quotation is already confirmed' } });
  }

  if (quote.status === 'cancelled') {
    return res.status(400).json({ error: { code: 'CANNOT_CONFIRM_CANCELLED', message: 'Cannot confirm a cancelled quotation' } });
  }

  const plan = await db.queryOne<{ id: string; billing_frequency: string; is_active: number }>('SELECT * FROM plans WHERE id = ?', [quote.plan_id]);
  if (!plan) {
    return res.status(400).json({ error: { code: 'INVALID_PLAN', message: 'Associated plan not found' } });
  }

  if (!plan.is_active) {
    return res.status(400).json({ error: { code: 'INACTIVE_PLAN', message: 'Associated plan is inactive and cannot be activated into a new subscription' } });
  }

  // Check discount usage limit if discount was applied
  if (quote.discount_id) {
    const discount = await db.queryOne<{ max_uses: number; used_count: number }>(
      'SELECT max_uses, used_count FROM discounts WHERE id = ?',
      [quote.discount_id]
    );
    if (discount && discount.max_uses > 0 && discount.used_count >= discount.max_uses) {
      return res.status(400).json({
        error: { code: 'DISCOUNT_MAX_USES_REACHED', message: 'Cannot confirm quotation: discount maximum usage limit has been reached' },
      });
    }
  }

  const quoteLines = await db.query('SELECT * FROM quotation_lines WHERE quotation_id = ?', [quoteId]);

  const subscriptionId = uuidv4();
  const subNumber = `SUB-${Date.now().toString().slice(-6)}`;
  const startDate = new Date().toISOString().split('T')[0];
  const nextBillingDate = startDate; // Immediate billing on activation

  await db.transaction(async () => {
    // 1. Mark quotation confirmed
    await db.execute("UPDATE quotations SET status = 'confirmed' WHERE id = ?", [quoteId]);

    // 2. Increment discount usage if discount applied
    if (quote.discount_id) {
      await db.execute('UPDATE discounts SET used_count = used_count + 1 WHERE id = ?', [quote.discount_id]);
    }

    // 3. Create Subscription
    await db.execute(
      `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, discount_id, tax_id, status, start_date, next_billing_date, billing_frequency, subtotal, discount_amount, tax_amount, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
      [
        subscriptionId,
        subNumber,
        quote.customer_id,
        quote.plan_id,
        quote.discount_id,
        quote.tax_id,
        startDate,
        nextBillingDate,
        plan.billing_frequency,
        quote.subtotal,
        quote.discount_amount,
        quote.tax_amount,
        quote.total_amount,
      ]
    );

    // 4. Create Subscription lines snapshot
    for (const ql of quoteLines) {
      await db.execute(
        `INSERT INTO subscription_lines (id, subscription_id, product_id, variant_id, quantity, unit_price, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), subscriptionId, ql.product_id, ql.variant_id, ql.quantity, ql.unit_price, ql.subtotal]
      );
    }
  });

  await AuditService.log('SUBSCRIPTION_ACTIVATED', 'subscriptions', subscriptionId, req.user?.id, { subNumber, quoteId });

  res.json({
    data: {
      subscription_id: subscriptionId,
      subscription_number: subNumber,
      status: 'active',
    },
    message: 'Quotation confirmed and subscription activated successfully',
  });
});
