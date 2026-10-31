import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validate.middleware';
import { PricingService, PricingLineInput } from '../discounts/pricing.service';
import { Router, Request, Response } from 'express';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { EmailService } from '../invoices/email.service';
import { subscriptionAddonsRouter } from './subscription-addons.routes';

export const subscriptionsRouter = Router();

// Sub-router for subscription add-ons (/api/subscriptions/:id/addons)
subscriptionsRouter.use('/:id/addons', subscriptionAddonsRouter);

// Helper: on-access expiry evaluation for subscriptions
async function evaluateExpiredSubscriptions(today: string, customerId?: string) {
  let sql = `
    UPDATE subscriptions 
    SET status = 'expired', updated_at = CURRENT_TIMESTAMP 
    WHERE end_date IS NOT NULL AND end_date < ? AND status IN ('active', 'paused')
  `;
  const params: any[] = [today];
  if (customerId) {
    sql += ' AND customer_id = ?';
    params.push(customerId);
  }
  await db.execute(sql, params);
}

// List subscriptions (Admin/Staff sees all, Customer sees own)
// Supports ?search=, ?status=, and ?customer_id= query filters
subscriptionsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const today = new Date().toISOString().split('T')[0];
  const isCustomer = req.user?.role === 'customer';
  const customerId = isCustomer ? req.user?.customerId : undefined;

  // On-access expiry evaluation
  await evaluateExpiredSubscriptions(today, customerId);

  let sql = `
    SELECT s.*, c.name as customer_name, c.company_name, u.email as customer_email,
           p.name as plan_name, p.can_pause, p.can_renew, p.can_close_early, p.billing_interval,
           (SELECT COUNT(*) FROM subscription_lines sl WHERE sl.subscription_id = s.id) as line_count,
           (SELECT COUNT(*) FROM subscription_addons sa WHERE sa.subscription_id = s.id AND sa.status != 'removed') as active_addon_count
    FROM subscriptions s
    JOIN customer_profiles c ON s.customer_id = c.id
    LEFT JOIN users u ON c.user_id = u.id
    JOIN plans p ON s.plan_id = p.id
  `;
  const conditions: string[] = [];
  const params: any[] = [];

  if (isCustomer) {
    conditions.push('s.customer_id = ?');
    params.push(req.user?.customerId);
  } else if (req.query.customer_id) {
    conditions.push('s.customer_id = ?');
    params.push(req.query.customer_id);
  }

  // Status filter
  const statusFilter = req.query.status as string;
  if (statusFilter && statusFilter !== 'all') {
    conditions.push('s.status = ?');
    params.push(statusFilter);
  }

  // Search filter
  const search = req.query.search as string;
  if (search && search.trim().length > 0) {
    const term = `%${search.trim().toLowerCase()}%`;
    conditions.push('(LOWER(s.subscription_number) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(COALESCE(c.company_name, "")) LIKE ? OR LOWER(p.name) LIKE ?)');
    params.push(term, term, term, term);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ' ORDER BY s.created_at DESC';

  const subs = await db.query(sql, params);
  res.json({ data: subs, message: 'Subscriptions retrieved successfully' });
});

const createSubscriptionSchema = z.object({
  customer_id: z.string().min(1, 'Customer is required'),
  plan_id: z.string().min(1, 'Plan is required'),
  start_date: z.string().optional(),
  discount_id: z.string().optional().nullable(),
  tax_id: z.string().optional().nullable(),
  lines: z
    .array(
      z.object({
        product_id: z.string().min(1),
        variant_id: z.string().optional().nullable(),
        quantity: z.number().int().min(1).default(1),
      })
    )
    .optional(),
});

// Create new Subscription directly (Admin / Staff)
subscriptionsRouter.post(
  '/',
  requireAuth,
  requireRole(['admin', 'staff']),
  validateRequest(createSubscriptionSchema),
  async (req: Request, res: Response) => {
    const { customer_id, plan_id, start_date, discount_id, tax_id, lines: customLines } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const startDate = start_date || today;

    // Verify Customer
    const customer = await db.queryOne('SELECT id, name FROM customer_profiles WHERE id = ?', [customer_id]);
    if (!customer) {
      return res.status(404).json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'Selected customer not found' } });
    }

    // Verify Plan
    const plan = await db.queryOne<{
      id: string;
      name: string;
      billing_frequency: string;
      billing_interval: number;
      price: number;
      is_active: number;
    }>('SELECT * FROM plans WHERE id = ?', [plan_id]);

    if (!plan) {
      return res.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'Selected subscription plan not found' } });
    }

    if (plan.is_active === 0) {
      return res.status(400).json({ error: { code: 'PLAN_INACTIVE', message: 'Cannot create subscription for an inactive plan' } });
    }

    // Determine line inputs
    let lineInputs: PricingLineInput[] = [];
    if (customLines && customLines.length > 0) {
      lineInputs = customLines.map((l: any) => ({
        productId: l.product_id,
        variantId: l.variant_id || null,
        quantity: l.quantity,
      }));
    } else {
      // Load bundled lines from plan_lines
      const planLines = await db.query<{ product_id: string; variant_id: string | null; quantity: number }>(
        'SELECT product_id, variant_id, quantity FROM plan_lines WHERE plan_id = ?',
        [plan_id]
      );
      if (planLines && planLines.length > 0) {
        lineInputs = planLines.map((pl) => ({
          productId: pl.product_id,
          variantId: pl.variant_id,
          quantity: pl.quantity,
        }));
      } else {
        // Fallback: primary product
        const defaultProduct = await db.queryOne<{ id: string }>('SELECT id FROM products WHERE is_active = 1 LIMIT 1');
        if (defaultProduct) {
          lineInputs = [{ productId: defaultProduct.id, quantity: 1 }];
        }
      }
    }

    if (lineInputs.length === 0) {
      return res.status(400).json({ error: { code: 'NO_LINES', message: 'At least one product line is required' } });
    }

    // Authoritative pricing calculation
    const pricing = await PricingService.calculatePricing(lineInputs, discount_id, tax_id, { evalDate: startDate });

    const subscriptionId = uuidv4();
    const subNumber = `SUB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const nextBillingDate = BillingService.advanceDate(startDate, plan.billing_frequency, plan.billing_interval || 1);
    const endDate = BillingService.advanceDate(startDate, plan.billing_frequency, (plan.billing_interval || 1) * 12);

    await db.transaction(async () => {
      await db.execute(
        `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, discount_id, tax_id, status, start_date, next_billing_date, end_date, billing_frequency, subtotal, discount_amount, tax_amount, total_amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          subscriptionId,
          subNumber,
          customer_id,
          plan_id,
          pricing.discountId || null,
          pricing.taxId || null,
          startDate,
          nextBillingDate,
          endDate,
          plan.billing_frequency,
          pricing.subtotal,
          pricing.discountAmount,
          pricing.taxAmount,
          pricing.totalAmount,
        ]
      );

      for (const line of pricing.lines) {
        await db.execute(
          `INSERT INTO subscription_lines (id, subscription_id, product_id, variant_id, quantity, unit_price, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), subscriptionId, line.productId, line.variantId || null, line.quantity, line.unitPrice, line.subtotal]
        );
      }
    });

    await AuditService.log('SUBSCRIPTION_CREATED', 'subscriptions', subscriptionId, req.user?.id, {
      subNumber,
      customer_id,
      plan_id,
      totalAmount: pricing.totalAmount,
    });

    const createdSub = await db.queryOne<{ id: string }>(
      `SELECT s.*, c.name as customer_name, c.company_name, u.email as customer_email,
              p.name as plan_name, p.can_pause, p.can_renew, p.can_close_early, p.billing_interval
       FROM subscriptions s
       JOIN customer_profiles c ON s.customer_id = c.id
       LEFT JOIN users u ON c.user_id = u.id
       JOIN plans p ON s.plan_id = p.id
       WHERE s.id = ?`,
      [subscriptionId]
    );

    res.status(201).json({
      data: createdSub,
      message: 'Subscription created successfully',
    });
  }
);


// Subscription detail with lines, add-ons, plan policies, and recent invoices
subscriptionsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const today = new Date().toISOString().split('T')[0];

  const sub = await db.queryOne<{
    id: string;
    customer_id: string;
    status: string;
    end_date: string | null;
    [key: string]: any;
  }>(
    `SELECT s.*, c.name as customer_name, c.company_name, u.email as customer_email,
            p.name as plan_name, p.billing_interval, p.can_pause, p.can_renew, p.can_close_early, p.is_active as plan_is_active,
            d.code as discount_code, d.type as discount_type, d.value as discount_value,
            t.name as tax_name, t.rate_percentage as tax_rate
     FROM subscriptions s
     JOIN customer_profiles c ON s.customer_id = c.id
     LEFT JOIN users u ON c.user_id = u.id
     JOIN plans p ON s.plan_id = p.id
     LEFT JOIN discounts d ON s.discount_id = d.id
     LEFT JOIN taxes t ON s.tax_id = t.id
     WHERE s.id = ?`,
    [req.params.id]
  );

  if (!sub) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
  }

  if (req.user?.role === 'customer' && req.user.customerId !== sub.customer_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access to subscription' } });
  }

  // On-access expiry check for this single subscription
  if (sub.end_date && sub.end_date < today && ['active', 'paused'].includes(sub.status)) {
    await db.execute("UPDATE subscriptions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [sub.id]);
    sub.status = 'expired';
  }

  const lines = await db.query(
    `SELECT sl.*, pr.name as product_name, pv.attribute_name, pv.attribute_value, pv.price_extra as variant_price_extra
     FROM subscription_lines sl
     JOIN products pr ON sl.product_id = pr.id
     LEFT JOIN product_variants pv ON sl.variant_id = pv.id
     WHERE sl.subscription_id = ?`,
    [sub.id]
  );

  const addons = await db.query(
    `SELECT sa.*, pr.name as product_name, pv.attribute_name, pv.attribute_value
     FROM subscription_addons sa
     JOIN products pr ON sa.product_id = pr.id
     LEFT JOIN product_variants pv ON sa.variant_id = pv.id
     WHERE sa.subscription_id = ?
     ORDER BY sa.created_at DESC`,
    [sub.id]
  );

  const invoices = await db.query(
    `SELECT id, invoice_number, status, total_amount, amount_due, due_date, period_start, period_end, created_at
     FROM invoices
     WHERE subscription_id = ?
     ORDER BY period_start DESC
     LIMIT 10`,
    [sub.id]
  );

  res.json({ data: { ...sub, lines, addons, invoices }, message: 'Subscription details retrieved' });
});

// Pause subscription
// Allowed only for active subscriptions where plan.can_pause === 1
subscriptionsRouter.post('/:id/pause', requireAuth, async (req: Request, res: Response) => {
  const sub = await db.queryOne<{ id: string; customer_id: string; status: string; can_pause: number }>(
    `SELECT s.*, p.can_pause FROM subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.id = ?`,
    [req.params.id]
  );

  if (!sub) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
  }

  if (req.user?.role === 'customer' && req.user.customerId !== sub.customer_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access' } });
  }

  if (!sub.can_pause) {
    return res.status(400).json({ error: { code: 'PAUSE_NOT_ALLOWED', message: 'Plan does not permit pausing' } });
  }

  if (sub.status === 'paused') {
    return res.status(400).json({ error: { code: 'ALREADY_PAUSED', message: 'Subscription is already paused' } });
  }

  if (sub.status === 'closed') {
    return res.status(400).json({ error: { code: 'CANNOT_PAUSE_CLOSED', message: 'Cannot pause a closed subscription' } });
  }

  if (sub.status === 'expired') {
    return res.status(400).json({ error: { code: 'CANNOT_PAUSE_EXPIRED', message: 'Cannot pause an expired subscription' } });
  }

  if (sub.status !== 'active') {
    return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Only active subscriptions can be paused' } });
  }

  await db.execute(
    "UPDATE subscriptions SET status = 'paused', paused_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [sub.id]
  );
  await AuditService.log('SUBSCRIPTION_PAUSED', 'subscriptions', sub.id, req.user?.id);

  res.json({ data: { id: sub.id, status: 'paused' }, message: 'Subscription paused' });
});

// Resume subscription
// Allowed only for paused subscriptions
subscriptionsRouter.post('/:id/resume', requireAuth, async (req: Request, res: Response) => {
  const today = new Date().toISOString().split('T')[0];

  const sub = await db.queryOne<{ id: string; customer_id: string; status: string; next_billing_date: string }>(
    'SELECT * FROM subscriptions WHERE id = ?',
    [req.params.id]
  );

  if (!sub) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
  }

  if (req.user?.role === 'customer' && req.user.customerId !== sub.customer_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access' } });
  }

  if (sub.status === 'active') {
    return res.status(400).json({ error: { code: 'ALREADY_ACTIVE', message: 'Subscription is already active' } });
  }

  if (sub.status === 'closed') {
    return res.status(400).json({ error: { code: 'CANNOT_RESUME_CLOSED', message: 'Cannot resume a closed subscription' } });
  }

  if (sub.status === 'expired') {
    return res.status(400).json({ error: { code: 'CANNOT_RESUME_EXPIRED', message: 'Cannot resume an expired subscription' } });
  }

  if (sub.status !== 'paused') {
    return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Only paused subscriptions can be resumed' } });
  }

  // Handle next billing date: if scheduled next billing date is in the past, align to today
  const effectiveNextBilling = sub.next_billing_date < today ? today : sub.next_billing_date;

  await db.execute(
    "UPDATE subscriptions SET status = 'active', next_billing_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [effectiveNextBilling, sub.id]
  );
  await AuditService.log('SUBSCRIPTION_RESUMED', 'subscriptions', sub.id, req.user?.id, { next_billing_date: effectiveNextBilling });

  res.json({ data: { id: sub.id, status: 'active', next_billing_date: effectiveNextBilling }, message: 'Subscription resumed' });
});

// Renew subscription
// Allowed for active, expired, or paused subscriptions where plan.can_renew === 1
subscriptionsRouter.post('/:id/renew', requireAuth, async (req: Request, res: Response) => {
  const today = new Date().toISOString().split('T')[0];

  const sub = await db.queryOne<{
    id: string;
    customer_id: string;
    status: string;
    start_date: string;
    end_date: string | null;
    next_billing_date: string;
    billing_frequency: string;
    can_renew: number;
    billing_interval: number;
    plan_is_active: number;
  }>(
    `SELECT s.*, p.can_renew, p.billing_frequency, p.billing_interval, p.is_active as plan_is_active 
     FROM subscriptions s 
     JOIN plans p ON s.plan_id = p.id 
     WHERE s.id = ?`,
    [req.params.id]
  );

  if (!sub) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
  }

  if (req.user?.role === 'customer' && req.user.customerId !== sub.customer_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access' } });
  }

  if (!sub.can_renew) {
    return res.status(400).json({ error: { code: 'RENEW_NOT_ALLOWED', message: 'Plan does not permit renewal' } });
  }

  if (!sub.plan_is_active) {
    return res.status(400).json({ error: { code: 'INACTIVE_PLAN', message: 'Associated plan is inactive and cannot be renewed' } });
  }

  if (sub.status === 'closed') {
    return res.status(400).json({ error: { code: 'CANNOT_RENEW_CLOSED', message: 'Cannot renew a closed subscription' } });
  }

  // Calculate renewal end_date and next_billing_date
  // Base date for renewal extension: if end_date exists and is in the future, extend from end_date; otherwise extend from today
  const baseDate = sub.end_date && sub.end_date > today ? sub.end_date : today;
  const newEndDate = BillingService.advanceDate(baseDate, sub.billing_frequency, sub.billing_interval || 1);

  // If subscription was expired, reactivate next billing date to today
  const effectiveNextBilling = today;

  await db.execute(
    "UPDATE subscriptions SET status = 'active', end_date = ?, next_billing_date = ?, renewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [newEndDate, effectiveNextBilling, sub.id]
  );

  await AuditService.log('SUBSCRIPTION_RENEWED', 'subscriptions', sub.id, req.user?.id, {
    previousEndDate: sub.end_date,
    newEndDate,
    nextBillingDate: effectiveNextBilling,
  });

  res.json({
    data: {
      id: sub.id,
      status: 'active',
      end_date: newEndDate,
      next_billing_date: effectiveNextBilling,
    },
    message: 'Subscription renewed successfully',
  });
});

// Close subscription (early closure)
// Staff/admin can always close; Customer can close if plan.can_close_early === 1
subscriptionsRouter.post('/:id/close', requireAuth, async (req: Request, res: Response) => {
  const today = new Date().toISOString().split('T')[0];

  const sub = await db.queryOne<{ id: string; customer_id: string; status: string; can_close_early: number }>(
    `SELECT s.*, p.can_close_early FROM subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.id = ?`,
    [req.params.id]
  );

  if (!sub) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
  }

  if (req.user?.role === 'customer' && req.user.customerId !== sub.customer_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access' } });
  }

  if (req.user?.role === 'customer' && !sub.can_close_early) {
    return res.status(400).json({ error: { code: 'CLOSE_NOT_ALLOWED', message: 'Plan does not permit early closure' } });
  }

  if (sub.status === 'closed') {
    return res.status(400).json({ error: { code: 'ALREADY_CLOSED', message: 'Subscription is already closed' } });
  }

  if (sub.status === 'expired') {
    return res.status(400).json({ error: { code: 'ALREADY_EXPIRED', message: 'Subscription is already expired' } });
  }

  await db.transaction(async () => {
    // 1. Mark subscription closed with closed_at and snap end_date
    await db.execute(
      "UPDATE subscriptions SET status = 'closed', end_date = ?, closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [today, sub.id]
    );

    // 2. Cascade closure to active add-ons to ensure clean lifecycle alignment
    await db.execute(
      "UPDATE subscription_addons SET status = 'removed', effective_end_date = ?, updated_at = CURRENT_TIMESTAMP WHERE subscription_id = ? AND status != 'removed'",
      [today, sub.id]
    );
  });

  await AuditService.log('SUBSCRIPTION_CLOSED', 'subscriptions', sub.id, req.user?.id, { closedAt: today });

  res.json({ data: { id: sub.id, status: 'closed', end_date: today }, message: 'Subscription closed' });
});


// Customer Self-Service & Admin: Buy a subscription directly
// Atomically creates confirmed quotation snapshot, activates subscription, and generates initial invoice
subscriptionsRouter.post('/subscribe', requireAuth, async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const isCustomer = req.user?.role === 'customer';

    // 1. Resolve Customer ID
    let customerId = isCustomer ? req.user?.customerId : (req.body.customer_id || req.user?.customerId);
    if (!customerId && req.user?.id) {
      const profile = await db.queryOne<{ id: string }>('SELECT id FROM customer_profiles WHERE user_id = ?', [req.user.id]);
      if (profile) {
        customerId = profile.id;
      } else {
        customerId = 'cust-' + Date.now().toString().slice(-6);
        await db.execute(
          'INSERT INTO customer_profiles (id, user_id, name, company_name) VALUES (?, ?, ?, ?)',
          [customerId, req.user.id, req.user.name || req.user.email.split('@')[0], req.user.name || 'Customer Account']
        );
      }
    }

    if (!customerId) {
      return res.status(400).json({ error: { code: 'CUSTOMER_PROFILE_NOT_FOUND', message: 'No customer profile found for this account' } });
    }

    const { plan_id, discount_code } = req.body;
    if (!plan_id) {
      return res.status(400).json({ error: { code: 'PLAN_REQUIRED', message: 'A valid plan_id is required' } });
    }

    // 2. Validate selected Plan
    const plan = await db.queryOne<{
      id: string;
      name: string;
      billing_frequency: string;
      billing_interval: number;
      price: number;
      is_active: number;
    }>('SELECT * FROM plans WHERE id = ?', [plan_id]);

    if (!plan || !plan.is_active) {
      return res.status(400).json({ error: { code: 'INVALID_PLAN', message: 'Selected plan is not available or is currently inactive' } });
    }

    // 3. Resolve bundled plan lines
    const planLines = await db.query<{ product_id: string; variant_id: string | null; quantity: number }>(
      'SELECT product_id, variant_id, quantity FROM plan_lines WHERE plan_id = ?',
      [plan_id]
    );

    let lineInputs: PricingLineInput[] = [];
    if (planLines && planLines.length > 0) {
      lineInputs = planLines.map(pl => ({
        productId: pl.product_id,
        variantId: pl.variant_id,
        quantity: pl.quantity || 1,
      }));
    } else {
      const defaultProduct = await db.queryOne<{ id: string }>('SELECT id FROM products WHERE is_active = 1 LIMIT 1');
      if (defaultProduct) {
        lineInputs = [{ productId: defaultProduct.id, quantity: 1, unitPrice: plan.price }];
      } else {
        return res.status(400).json({ error: { code: 'NO_PRODUCTS', message: 'No active products found to bundle with this plan' } });
      }
    }

    // 4. Resolve optional discount code
    let discountId: string | null = null;
    if (discount_code && typeof discount_code === 'string' && discount_code.trim()) {
      const discount = await db.queryOne<{ id: string; is_active: number; max_uses: number; used_count: number; start_date: string; end_date: string }>(
        'SELECT * FROM discounts WHERE code = ? AND is_active = 1',
        [discount_code.trim().toUpperCase()]
      );
      if (discount) {
        if (discount.max_uses > 0 && discount.used_count >= discount.max_uses) {
          return res.status(400).json({ error: { code: 'DISCOUNT_MAX_USES_REACHED', message: 'Discount code has reached its maximum usage limit' } });
        }
        if (discount.start_date && discount.start_date > today) {
          return res.status(400).json({ error: { code: 'DISCOUNT_NOT_ACTIVE', message: 'Discount code is not yet valid' } });
        }
        if (discount.end_date && discount.end_date < today) {
          return res.status(400).json({ error: { code: 'DISCOUNT_EXPIRED', message: 'Discount code has expired' } });
        }
        discountId = discount.id;
      } else {
        return res.status(400).json({ error: { code: 'INVALID_DISCOUNT', message: 'Provided discount code was not found or is inactive' } });
      }
    }

    // 5. Resolve active tax
    const defaultTax = await db.queryOne<{ id: string }>('SELECT id FROM taxes WHERE is_active = 1 LIMIT 1');
    const taxId = defaultTax ? defaultTax.id : null;

    // 6. Calculate authoritative pricing
    const pricing = await PricingService.calculatePricing(lineInputs, discountId, taxId, { evalDate: today });

    const subscriptionId = uuidv4();
    const subNumber = `SUB-${Date.now().toString().slice(-6)}`;
    const quoteId = uuidv4();
    const quoteNumber = `QT-${Date.now().toString().slice(-6)}`;
    const invoiceId = uuidv4();
    const invNumber = `INV-${today.replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const periodStart = today;
    const periodEnd = BillingService.advanceDate(today, plan.billing_frequency, plan.billing_interval || 1);

    // 7. Atomic transaction for quotation, subscription, lines, and invoice
    await db.transaction(async () => {
      // Create confirmed quotation record for full financial tracking
      await db.execute(
        `INSERT INTO quotations (id, quotation_number, customer_id, plan_id, discount_id, tax_id, status, valid_until, subtotal, discount_amount, tax_amount, total_amount, subscription_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          quoteId, quoteNumber, customerId, plan_id, discountId, taxId, periodEnd,
          pricing.subtotal, pricing.discountAmount, pricing.taxAmount, pricing.totalAmount, subscriptionId
        ]
      );

      for (const line of pricing.lines) {
        await db.execute(
          `INSERT INTO quotation_lines (id, quotation_id, product_id, variant_id, quantity, unit_price, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), quoteId, line.productId, line.variantId || null, line.quantity, line.unitPrice, line.subtotal]
        );
      }

      // Create Active Subscription
      await db.execute(
        `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, discount_id, tax_id, status, start_date, next_billing_date, billing_frequency, subtotal, discount_amount, tax_amount, total_amount, quotation_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          subscriptionId, subNumber, customerId, plan_id, discountId, taxId,
          today, periodEnd, plan.billing_frequency,
          pricing.subtotal, pricing.discountAmount, pricing.taxAmount, pricing.totalAmount, quoteId
        ]
      );

      for (const line of pricing.lines) {
        await db.execute(
          `INSERT INTO subscription_lines (id, subscription_id, product_id, variant_id, quantity, unit_price, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), subscriptionId, line.productId, line.variantId || null, line.quantity, line.unitPrice, line.subtotal]
        );
      }

      // Create Initial Period Invoice for immediate settlement
      await db.execute(
        `INSERT INTO invoices (id, invoice_number, customer_id, subscription_id, period_start, period_end, due_date, status, subtotal, discount_amount, tax_amount, total_amount, amount_paid, amount_due, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, 0.00, ?, CURRENT_TIMESTAMP)`,
        [
          invoiceId, invNumber, customerId, subscriptionId, periodStart, periodEnd, today,
          pricing.subtotal, pricing.discountAmount, pricing.taxAmount, pricing.totalAmount, pricing.totalAmount
        ]
      );

      for (const line of pricing.lines) {
        await db.execute(
          `INSERT INTO invoice_lines (id, invoice_id, product_id, variant_id, description, quantity, unit_price, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), invoiceId, line.productId, line.variantId || null, line.description || plan.name, line.quantity, line.unitPrice, line.subtotal]
        );
      }

      if (discountId) {
        await db.execute('UPDATE discounts SET used_count = used_count + 1 WHERE id = ?', [discountId]);
      }
    });

    await AuditService.log('CUSTOMER_SUBSCRIPTION_PURCHASED', 'subscriptions', subscriptionId, req.user?.id, {
      subNumber,
      planName: plan.name,
      totalAmount: pricing.totalAmount,
      invoiceId,
      customerId
    });

    // Automatically send invoice email with PDF attachment to customer login email
    try {
      await EmailService.sendInvoiceEmail(invoiceId, { userId: req.user?.id });
    } catch (mailErr) {
      console.warn('Notice: Background invoice email delivery deferred:', mailErr);
    }

    res.status(201).json({
      data: {
        subscription_id: subscriptionId,
        subscription_number: subNumber,
        invoice_id: invoiceId,
        invoice_number: invNumber,
        plan_name: plan.name,
        total_amount: pricing.totalAmount,
        status: 'active'
      },
      message: `Successfully subscribed to ${plan.name}! Initial invoice ${invNumber} generated.`
    });
  } catch (err: any) {
    console.error('Error during customer self-service subscription purchase:', err);
    res.status(500).json({ error: { code: 'SUBSCRIBE_FAILED', message: err.message || 'Failed to complete subscription purchase' } });
  }
});
