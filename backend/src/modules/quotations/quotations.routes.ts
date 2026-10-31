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

// Helper: on-access expiry evaluation
async function evaluateExpiredQuotations(today: string, customerId?: string) {
  let sql = `
    UPDATE quotations 
    SET status = 'expired', updated_at = CURRENT_TIMESTAMP 
    WHERE valid_until < ? AND status IN ('draft', 'quotation', 'sent')
  `;
  const params: any[] = [today];
  if (customerId) {
    sql += ' AND customer_id = ?';
    params.push(customerId);
  }
  await db.execute(sql, params);
}

// List quotations (Admin/Staff sees all, Customer sees own)
// Supports ?search= and ?status= filters
quotationsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const today = new Date().toISOString().split('T')[0];
  const isCustomer = req.user?.role === 'customer';
  const customerId = isCustomer ? req.user?.customerId : undefined;

  // On-access expiry handling
  await evaluateExpiredQuotations(today, customerId);

  let sql = `
    SELECT q.*, c.name as customer_name, c.company_name, p.name as plan_name, p.billing_frequency,
           s.subscription_number,
           (SELECT COUNT(*) FROM quotation_lines ql WHERE ql.quotation_id = q.id) as line_count
    FROM quotations q
    JOIN customer_profiles c ON q.customer_id = c.id
    JOIN plans p ON q.plan_id = p.id
    LEFT JOIN subscriptions s ON q.subscription_id = s.id
  `;
  const conditions: string[] = [];
  const params: any[] = [];

  if (isCustomer) {
    conditions.push('q.customer_id = ?');
    params.push(req.user?.customerId);
  } else if (req.query.customer_id) {
    conditions.push('q.customer_id = ?');
    params.push(req.query.customer_id);
  }

  // Status filter
  const statusFilter = req.query.status as string;
  if (statusFilter && statusFilter !== 'all') {
    conditions.push('q.status = ?');
    params.push(statusFilter);
  }

  // Search filter
  const search = req.query.search as string;
  if (search && search.trim().length > 0) {
    const term = `%${search.trim().toLowerCase()}%`;
    conditions.push('(LOWER(q.quotation_number) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(COALESCE(c.company_name, "")) LIKE ? OR LOWER(p.name) LIKE ?)');
    params.push(term, term, term, term);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ' ORDER BY q.created_at DESC';

  const quotations = await db.query(sql, params);
  res.json({ data: quotations, message: 'Quotations retrieved successfully' });
});

// Get quotation details with lines
quotationsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const today = new Date().toISOString().split('T')[0];

  const quotation = await db.queryOne<{
    id: string;
    customer_id: string;
    status: string;
    valid_until: string;
    subscription_id?: string | null;
    [key: string]: any;
  }>(
    `SELECT q.*, c.name as customer_name, c.company_name, c.email as customer_email,
            p.name as plan_name, p.billing_frequency,
            d.code as discount_code, d.type as discount_type, d.value as discount_value,
            t.name as tax_name, t.rate_percentage as tax_rate,
            s.subscription_number
     FROM quotations q
     JOIN customer_profiles c ON q.customer_id = c.id
     JOIN plans p ON q.plan_id = p.id
     LEFT JOIN discounts d ON q.discount_id = d.id
     LEFT JOIN taxes t ON q.tax_id = t.id
     LEFT JOIN subscriptions s ON q.subscription_id = s.id
     WHERE q.id = ?`,
    [req.params.id]
  );

  if (!quotation) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Quotation not found' } });
  }

  if (req.user?.role === 'customer' && req.user.customerId !== quotation.customer_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access to quotation' } });
  }

  // On-access expiry check for single item
  if (quotation.valid_until < today && ['draft', 'quotation', 'sent'].includes(quotation.status)) {
    await db.execute("UPDATE quotations SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [quotation.id]);
    quotation.status = 'expired';
  }

  const lines = await db.query(
    `SELECT ql.*, pr.name as product_name, pv.attribute_name, pv.attribute_value, pv.price_extra as variant_price_extra
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
  customer_id: z.string().min(1, 'Customer ID is required'),
  plan_id: z.string().min(1, 'Plan ID is required'),
  discount_id: z.string().optional().nullable(),
  tax_id: z.string().optional().nullable(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid until must be a YYYY-MM-DD date'),
  status: z.enum(['draft', 'quotation', 'sent']).optional(),
  lines: z.array(
    z.object({
      product_id: z.string().min(1, 'Product ID is required'),
      variant_id: z.string().optional().nullable(),
      quantity: z.number().int().min(1, 'Quantity must be at least 1'),
      unit_price: z.number().min(0).optional(),
    })
  ).min(1, 'At least one product line is required'),
});

// Staff/Admin creates quotation
quotationsRouter.post('/', requireAuth, requireRole(['admin', 'staff']), validateRequest(createQuotationSchema), async (req: Request, res: Response) => {
  const { customer_id, plan_id, discount_id, tax_id, valid_until, status: initialStatus, lines } = req.body;
  const today = new Date().toISOString().split('T')[0];

  // Validate customer existence
  const customer = await db.queryOne<{ id: string }>('SELECT id FROM customer_profiles WHERE id = ?', [customer_id]);
  if (!customer) {
    return res.status(400).json({ error: { code: 'INVALID_CUSTOMER', message: 'Selected customer profile does not exist' } });
  }

  // Validity date validation: cannot be in the past
  if (valid_until < today) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: `Quotation validity date (${valid_until}) cannot be in the past` },
    });
  }

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

  // Calculate authoritative pricing via PricingService
  const pricingInputs = lines.map((l: any) => ({
    productId: l.product_id,
    variantId: l.variant_id,
    quantity: l.quantity,
    unitPrice: l.unit_price,
  }));

  const pricing = await PricingService.calculatePricing(pricingInputs, discount_id, tax_id);

  const quotationId = uuidv4();
  const quoteNumber = `QT-${Date.now().toString().slice(-6)}`;
  const statusToSave = initialStatus || 'quotation';

  await db.transaction(async () => {
    await db.execute(
      `INSERT INTO quotations (id, quotation_number, customer_id, plan_id, discount_id, tax_id, status, valid_until, subtotal, discount_amount, tax_amount, total_amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        quotationId,
        quoteNumber,
        customer_id,
        plan_id,
        pricing.discountId || null,
        pricing.taxId || null,
        statusToSave,
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
        [uuidv4(), quotationId, line.productId, line.variantId || null, line.quantity, line.unitPrice, line.subtotal]
      );
    }
  });

  await AuditService.log('QUOTATION_CREATED', 'quotations', quotationId, req.user?.id, { quoteNumber, total: pricing.totalAmount, status: statusToSave });

  res.status(201).json({
    data: {
      id: quotationId,
      quotation_number: quoteNumber,
      status: statusToSave,
      valid_until,
      subtotal: pricing.subtotal,
      discount_amount: pricing.discountAmount,
      tax_amount: pricing.taxAmount,
      total_amount: pricing.totalAmount,
    },
    message: 'Quotation created successfully',
  });
});

// Confirm quotation -> Turns quote into Subscription
// Safeguarded against duplicate confirmation, concurrent confirmations, expired quotes, and cancelled quotes
quotationsRouter.post('/:id/confirm', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const quoteId = req.params.id;
  const today = new Date().toISOString().split('T')[0];

  const quote = await db.queryOne<{
    id: string;
    customer_id: string;
    plan_id: string;
    discount_id: string | null;
    tax_id: string | null;
    status: string;
    valid_until: string;
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
    subscription_id?: string | null;
  }>('SELECT * FROM quotations WHERE id = ?', [quoteId]);

  if (!quote) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Quotation not found' } });
  }

  // 1. Duplicate check: Already confirmed
  if (quote.status === 'confirmed' || quote.subscription_id) {
    return res.status(400).json({ error: { code: 'ALREADY_CONFIRMED', message: 'Quotation is already confirmed and converted to a subscription' } });
  }

  // 2. Cancellation check
  if (quote.status === 'cancelled') {
    return res.status(400).json({ error: { code: 'CANNOT_CONFIRM_CANCELLED', message: 'Cannot confirm a cancelled quotation' } });
  }

  // 3. Expiry check: Prevent confirmation of expired quotations
  if (quote.status === 'expired' || quote.valid_until < today) {
    // Ensure marked as expired in database
    await db.execute("UPDATE quotations SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [quoteId]);
    return res.status(400).json({ error: { code: 'QUOTATION_EXPIRED', message: `Cannot confirm quotation: validity expired on ${quote.valid_until}` } });
  }

  // 4. Validate associated Plan
  const plan = await db.queryOne<{ id: string; billing_frequency: string; is_active: number }>('SELECT * FROM plans WHERE id = ?', [quote.plan_id]);
  if (!plan) {
    return res.status(400).json({ error: { code: 'INVALID_PLAN', message: 'Associated plan not found' } });
  }

  if (!plan.is_active) {
    return res.status(400).json({ error: { code: 'INACTIVE_PLAN', message: 'Associated plan is inactive and cannot be activated into a new subscription' } });
  }

  // 5. Check discount usage limit if discount was applied
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
  const startDate = today;
  const nextBillingDate = startDate; // Immediate billing on activation

  await db.transaction(async () => {
    // Atomic status transition check inside transaction to prevent concurrent race condition duplicates
    const updateRes = await db.execute(
      "UPDATE quotations SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'confirmed' AND status != 'cancelled' AND status != 'expired'",
      [quoteId]
    );

    if (updateRes.changes === 0) {
      // Another concurrent thread or process altered the status
      const current = await db.queryOne<{ status: string }>('SELECT status FROM quotations WHERE id = ?', [quoteId]);
      if (current?.status === 'confirmed') {
        throw new Error('ALREADY_CONFIRMED: Quotation is already confirmed');
      }
      if (current?.status === 'cancelled') {
        throw new Error('CANNOT_CONFIRM_CANCELLED: Cannot confirm a cancelled quotation');
      }
      if (current?.status === 'expired') {
        throw new Error('QUOTATION_EXPIRED: Cannot confirm an expired quotation');
      }
      throw new Error('INVALID_STATUS_TRANSITION: Quotation cannot be confirmed in its current state');
    }

    // Increment discount usage if discount applied
    if (quote.discount_id) {
      await db.execute('UPDATE discounts SET used_count = used_count + 1 WHERE id = ?', [quote.discount_id]);
    }

    // Create Subscription with quotation_id backlink
    await db.execute(
      `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, discount_id, tax_id, status, start_date, next_billing_date, billing_frequency, subtotal, discount_amount, tax_amount, total_amount, quotation_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
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
        quoteId,
      ]
    );

    // Link subscription_id to quotation now that subscription exists
    await db.execute('UPDATE quotations SET subscription_id = ? WHERE id = ?', [subscriptionId, quoteId]);

    // Create Subscription lines snapshot
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

const cancelQuotationSchema = z.object({
  reason: z.string().optional(),
});

// Cancel quotation -> Allowed for staff/admin on eligible quotations (draft, quotation, sent, expired)
// Prevents cancellation of already confirmed quotations
const cancelQuotationHandler = async (req: Request, res: Response) => {
  const quoteId = req.params.id;
  const { reason } = req.body || {};

  const quote = await db.queryOne<{
    id: string;
    quotation_number: string;
    status: string;
    subscription_id?: string | null;
  }>('SELECT id, quotation_number, status, subscription_id FROM quotations WHERE id = ?', [quoteId]);

  if (!quote) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Quotation not found' } });
  }

  // Business Rule: Prevent cancellation of confirmed quotations
  if (quote.status === 'confirmed' || quote.subscription_id) {
    return res.status(400).json({
      error: { code: 'CANNOT_CANCEL_CONFIRMED', message: 'Cannot cancel an already confirmed quotation that has an active subscription' },
    });
  }

  // Already cancelled
  if (quote.status === 'cancelled') {
    return res.status(400).json({
      error: { code: 'ALREADY_CANCELLED', message: 'Quotation is already cancelled' },
    });
  }

  await db.execute(
    "UPDATE quotations SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancel_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [reason || 'Cancelled by staff', quoteId]
  );

  await AuditService.log('QUOTATION_CANCELLED', 'quotations', quoteId, req.user?.id, { quoteNumber: quote.quotation_number, reason });

  res.json({
    data: { id: quoteId, status: 'cancelled' },
    message: 'Quotation cancelled successfully',
  });
};

quotationsRouter.post('/:id/cancel', requireAuth, requireRole(['admin', 'staff']), validateRequest(cancelQuotationSchema), cancelQuotationHandler);
quotationsRouter.patch('/:id/cancel', requireAuth, requireRole(['admin', 'staff']), validateRequest(cancelQuotationSchema), cancelQuotationHandler);

// Send quotation -> Transitions 'draft' or 'quotation' to 'sent'
const sendQuotationHandler = async (req: Request, res: Response) => {
  const quoteId = req.params.id;
  const today = new Date().toISOString().split('T')[0];

  const quote = await db.queryOne<{
    id: string;
    quotation_number: string;
    status: string;
    valid_until: string;
  }>('SELECT id, quotation_number, status, valid_until FROM quotations WHERE id = ?', [quoteId]);

  if (!quote) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Quotation not found' } });
  }

  if (quote.status === 'confirmed') {
    return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Cannot send an already confirmed quotation' } });
  }
  if (quote.status === 'cancelled') {
    return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Cannot send a cancelled quotation' } });
  }
  if (quote.status === 'expired' || quote.valid_until < today) {
    return res.status(400).json({ error: { code: 'QUOTATION_EXPIRED', message: 'Cannot send an expired quotation' } });
  }

  await db.execute(
    "UPDATE quotations SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [quoteId]
  );

  await AuditService.log('QUOTATION_SENT', 'quotations', quoteId, req.user?.id, { quoteNumber: quote.quotation_number });

  res.json({
    data: { id: quoteId, status: 'sent' },
    message: 'Quotation marked as sent',
  });
};

quotationsRouter.post('/:id/send', requireAuth, requireRole(['admin', 'staff']), sendQuotationHandler);
quotationsRouter.patch('/:id/send', requireAuth, requireRole(['admin', 'staff']), sendQuotationHandler);
