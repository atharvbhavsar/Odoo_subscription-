import { Router, Request, Response } from 'express';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { AuditService } from '../audit/audit.service';

export const subscriptionsRouter = Router();

// List subscriptions
subscriptionsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  let sql = `
    SELECT s.*, c.name as customer_name, c.company_name, p.name as plan_name, p.can_pause, p.can_renew, p.can_close_early
    FROM subscriptions s
    JOIN customer_profiles c ON s.customer_id = c.id
    JOIN plans p ON s.plan_id = p.id
  `;
  const params: any[] = [];

  if (req.user?.role === 'customer') {
    sql += ' WHERE s.customer_id = ?';
    params.push(req.user.customerId);
  }

  sql += ' ORDER BY s.created_at DESC';

  const subs = await db.query(sql, params);
  res.json({ data: subs, message: 'Subscriptions retrieved successfully' });
});

// Subscription detail with lines
subscriptionsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const sub = await db.queryOne<{
    id: string;
    customer_id: string;
    status: string;
    [key: string]: any;
  }>(
    `SELECT s.*, c.name as customer_name, c.company_name, p.name as plan_name, p.can_pause, p.can_renew, p.can_close_early
     FROM subscriptions s
     JOIN customer_profiles c ON s.customer_id = c.id
     JOIN plans p ON s.plan_id = p.id
     WHERE s.id = ?`,
    [req.params.id]
  );

  if (!sub) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
  }

  if (req.user?.role === 'customer' && req.user.customerId !== sub.customer_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access to subscription' } });
  }

  const lines = await db.query(
    `SELECT sl.*, pr.name as product_name, pv.attribute_name, pv.attribute_value
     FROM subscription_lines sl
     JOIN products pr ON sl.product_id = pr.id
     LEFT JOIN product_variants pv ON sl.variant_id = pv.id
     WHERE sl.subscription_id = ?`,
    [sub.id]
  );

  res.json({ data: { ...sub, lines }, message: 'Subscription details retrieved' });
});

// Pause subscription
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

  if (sub.status !== 'active') {
    return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Only active subscriptions can be paused' } });
  }

  await db.execute("UPDATE subscriptions SET status = 'paused' WHERE id = ?", [sub.id]);
  await AuditService.log('SUBSCRIPTION_PAUSED', 'subscriptions', sub.id, req.user?.id);

  res.json({ data: { id: sub.id, status: 'paused' }, message: 'Subscription paused' });
});

// Resume subscription
subscriptionsRouter.post('/:id/resume', requireAuth, async (req: Request, res: Response) => {
  const sub = await db.queryOne<{ id: string; customer_id: string; status: string }>(
    'SELECT * FROM subscriptions WHERE id = ?',
    [req.params.id]
  );

  if (!sub) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
  }

  if (req.user?.role === 'customer' && req.user.customerId !== sub.customer_id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access' } });
  }

  if (sub.status !== 'paused') {
    return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Only paused subscriptions can be resumed' } });
  }

  await db.execute("UPDATE subscriptions SET status = 'active' WHERE id = ?", [sub.id]);
  await AuditService.log('SUBSCRIPTION_RESUMED', 'subscriptions', sub.id, req.user?.id);

  res.json({ data: { id: sub.id, status: 'active' }, message: 'Subscription resumed' });
});

// Renew subscription
subscriptionsRouter.post('/:id/renew', requireAuth, async (req: Request, res: Response) => {
  const sub = await db.queryOne<{ id: string; customer_id: string; status: string; can_renew: number; billing_frequency: string }>(
    `SELECT s.*, p.can_renew, p.billing_frequency FROM subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.id = ?`,
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

  const today = new Date().toISOString().split('T')[0];
  await db.execute("UPDATE subscriptions SET status = 'active', next_billing_date = ? WHERE id = ?", [today, sub.id]);
  await AuditService.log('SUBSCRIPTION_RENEWED', 'subscriptions', sub.id, req.user?.id);

  res.json({ data: { id: sub.id, status: 'active', next_billing_date: today }, message: 'Subscription renewed successfully' });
});

// Close subscription
subscriptionsRouter.post('/:id/close', requireAuth, async (req: Request, res: Response) => {
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

  await db.execute("UPDATE subscriptions SET status = 'closed' WHERE id = ?", [sub.id]);
  await AuditService.log('SUBSCRIPTION_CLOSED', 'subscriptions', sub.id, req.user?.id);

  res.json({ data: { id: sub.id, status: 'closed' }, message: 'Subscription closed' });
});
