import { Router, Request, Response } from 'express';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
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
    SELECT s.*, c.name as customer_name, c.company_name, c.email as customer_email,
           p.name as plan_name, p.can_pause, p.can_renew, p.can_close_early, p.billing_interval,
           (SELECT COUNT(*) FROM subscription_lines sl WHERE sl.subscription_id = s.id) as line_count,
           (SELECT COUNT(*) FROM subscription_addons sa WHERE sa.subscription_id = s.id AND sa.status != 'removed') as active_addon_count
    FROM subscriptions s
    JOIN customer_profiles c ON s.customer_id = c.id
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
    `SELECT s.*, c.name as customer_name, c.company_name, c.email as customer_email,
            p.name as plan_name, p.billing_interval, p.can_pause, p.can_renew, p.can_close_early, p.is_active as plan_is_active,
            d.code as discount_code, d.type as discount_type, d.value as discount_value,
            t.name as tax_name, t.rate_percentage as tax_rate
     FROM subscriptions s
     JOIN customer_profiles c ON s.customer_id = c.id
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
  const effectiveNextBilling = sub.status === 'expired' || sub.next_billing_date < today ? today : sub.next_billing_date;

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
