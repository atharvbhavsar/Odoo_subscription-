import { Router, Request, Response } from 'express';
import { db } from '../../config/database';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', requireAuth, requireRole(['admin', 'staff']), async (req: Request, res: Response) => {
  const today = new Date().toISOString().split('T')[0];

  // 1. Active Subscriptions & MRR
  const activeSubs = await db.query<{ billing_frequency: string; total_amount: number }>(
    "SELECT billing_frequency, total_amount FROM subscriptions WHERE status = 'active'"
  );

  let mrr = 0;
  for (const s of activeSubs) {
    const amt = Number(s.total_amount) || 0;
    if (s.billing_frequency === 'monthly') mrr += amt;
    else if (s.billing_frequency === 'yearly') mrr += amt / 12;
    else if (s.billing_frequency === 'weekly') mrr += amt * 4.333;
    else if (s.billing_frequency === 'daily') mrr += amt * 30;
  }
  mrr = Math.round(mrr * 100) / 100;

  // 2. Invoiced Revenue
  const invoiceAgg = await db.queryOne<{ total_invoiced: number; total_due: number }>(
    "SELECT COALESCE(SUM(total_amount), 0) as total_invoiced, COALESCE(SUM(amount_due), 0) as total_due FROM invoices WHERE status != 'cancelled'"
  );

  // 3. Payments Received
  const paymentAgg = await db.queryOne<{ total_collected: number }>(
    "SELECT COALESCE(SUM(amount), 0) as total_collected FROM payments WHERE status = 'successful'"
  );

  // 4. Overdue Invoices
  const overdueAgg = await db.queryOne<{ overdue_count: number; overdue_amount: number }>(
    "SELECT COUNT(*) as overdue_count, COALESCE(SUM(amount_due), 0) as overdue_amount FROM invoices WHERE due_date < ? AND amount_due > 0 AND status != 'cancelled'",
    [today]
  );

  // 5. Recent Invoices
  const recentInvoices = await db.query(
    `SELECT i.id, i.invoice_number, i.total_amount, i.amount_due, i.status, i.due_date, c.name as customer_name
     FROM invoices i
     JOIN customer_profiles c ON i.customer_id = c.id
     ORDER BY i.created_at DESC LIMIT 5`
  );

  // 6. Recent Payments
  const recentPayments = await db.query(
    `SELECT p.id, p.amount, p.payment_method, p.status, p.recorded_at, i.invoice_number
     FROM payments p
     JOIN invoices i ON p.invoice_id = i.id
     ORDER BY p.recorded_at DESC LIMIT 5`
  );

  res.json({
    data: {
      mrr,
      activeSubscriptions: activeSubs.length,
      totalInvoiced: Math.round((Number(invoiceAgg?.total_invoiced) || 0) * 100) / 100,
      totalCollected: Math.round((Number(paymentAgg?.total_collected) || 0) * 100) / 100,
      totalOutstanding: Math.round((Number(invoiceAgg?.total_due) || 0) * 100) / 100,
      overdueCount: Number(overdueAgg?.overdue_count) || 0,
      overdueAmount: Math.round((Number(overdueAgg?.overdue_amount) || 0) * 100) / 100,
      recentInvoices,
      recentPayments,
    },
    message: 'Dashboard metrics retrieved',
  });
});

