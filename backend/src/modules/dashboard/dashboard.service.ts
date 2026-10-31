import { db } from '../../config/database';

export interface DashboardFilterOptions {
  startDate?: string;
  endDate?: string;
}

export interface OverdueAgingBucket {
  bucket: string;
  count: number;
  amount: number;
}

export interface MonthlyCashflowMetric {
  month: string;
  invoiced: number;
  collected: number;
}

export interface SubscriptionsByStatusMetric {
  status: string;
  count: number;
  totalValue: number;
}

export interface SubscriptionsByPlanMetric {
  planName: string;
  count: number;
  totalValue: number;
}

export interface DashboardSummaryData {
  activeSubscriptions: number;
  mrr: number;
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  overdueAging: OverdueAgingBucket[];
  monthlyCashflow: MonthlyCashflowMetric[];
  subscriptionsByStatus: SubscriptionsByStatusMetric[];
  subscriptionsByPlan: SubscriptionsByPlanMetric[];
  recentInvoices: any[];
  recentPayments: any[];
  filtersApplied: {
    startDate?: string;
    endDate?: string;
  };
}

export class DashboardService {
  /**
   * Calculates real-time database aggregates for executive financial reporting
   */
  static async getSummary(filters: DashboardFilterOptions = {}): Promise<DashboardSummaryData> {
    const today = new Date().toISOString().split('T')[0];

    // 1. Active Subscriptions & Normalized MRR
    const activeSubs = await db.query<{ billing_frequency: string; total_amount: number }>(
      "SELECT billing_frequency, total_amount FROM subscriptions WHERE status = 'active'"
    );

    let mrr = 0;
    for (const sub of activeSubs) {
      const amount = Number(sub.total_amount) || 0;
      switch (sub.billing_frequency) {
        case 'monthly':
          mrr += amount;
          break;
        case 'yearly':
          mrr += amount / 12;
          break;
        case 'weekly':
          mrr += (amount * 52) / 12;
          break;
        case 'daily':
          mrr += (amount * 365) / 12;
          break;
        default:
          mrr += amount;
      }
    }
    mrr = Math.round(mrr * 100) / 100;

    // 2. Invoiced Totals (Filtered by period if specified)
    const invoiceWhere: string[] = ["status != 'cancelled'"];
    const invoiceParams: any[] = [];

    if (filters.startDate) {
      invoiceWhere.push('period_start >= ?');
      invoiceParams.push(filters.startDate);
    }
    if (filters.endDate) {
      invoiceWhere.push('period_start <= ?');
      invoiceParams.push(filters.endDate);
    }

    const invoiceSql = `
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_invoiced,
        COALESCE(SUM(amount_due), 0) as total_due
      FROM invoices
      WHERE ${invoiceWhere.join(' AND ')}
    `;
    const invoiceAgg = await db.queryOne<{ total_invoiced: number; total_due: number }>(
      invoiceSql,
      invoiceParams
    );

    // 3. Payments Received (Filtered by period if specified)
    const paymentWhere: string[] = ["status = 'successful'"];
    const paymentParams: any[] = [];

    if (filters.startDate) {
      paymentWhere.push('recorded_at >= ?');
      paymentParams.push(filters.startDate);
    }
    if (filters.endDate) {
      paymentWhere.push('recorded_at <= ?');
      paymentParams.push(`${filters.endDate} 23:59:59`);
    }

    const paymentSql = `
      SELECT COALESCE(SUM(amount), 0) as total_collected
      FROM payments
      WHERE ${paymentWhere.join(' AND ')}
    `;
    const paymentAgg = await db.queryOne<{ total_collected: number }>(paymentSql, paymentParams);

    // 4. All-time Outstanding Receivables
    const outstandingAgg = await db.queryOne<{ total_outstanding: number }>(
      "SELECT COALESCE(SUM(amount_due), 0) as total_outstanding FROM invoices WHERE status NOT IN ('cancelled', 'paid') AND amount_due > 0"
    );

    // 5. Overdue Invoices Total
    const overdueAgg = await db.queryOne<{ overdue_count: number; overdue_amount: number }>(
      `SELECT 
         COUNT(*) as overdue_count, 
         COALESCE(SUM(amount_due), 0) as overdue_amount 
       FROM invoices 
       WHERE due_date < ? AND amount_due > 0 AND status NOT IN ('cancelled', 'paid')`,
      [today]
    );

    // 6. Overdue Invoice Ageing Buckets (1-30, 31-60, 61-90, 90+ days)
    const overdueAgingRaw = await db.query<{
      bucket: string;
      count: number;
      amount: number;
    }>(
      `SELECT 
         CASE 
           WHEN (julianday(?) - julianday(due_date)) <= 30 THEN '1-30 days'
           WHEN (julianday(?) - julianday(due_date)) <= 60 THEN '31-60 days'
           WHEN (julianday(?) - julianday(due_date)) <= 90 THEN '61-90 days'
           ELSE '90+ days'
         END as bucket,
         COUNT(*) as count,
         COALESCE(SUM(amount_due), 0) as amount
       FROM invoices
       WHERE due_date < ? AND amount_due > 0 AND status NOT IN ('cancelled', 'paid')
       GROUP BY bucket`,
      [today, today, today, today]
    );

    const standardBuckets = ['1-30 days', '31-60 days', '61-90 days', '90+ days'];
    const overdueAging: OverdueAgingBucket[] = standardBuckets.map((bucketName) => {
      const found = overdueAgingRaw.find((r) => r.bucket === bucketName);
      return {
        bucket: bucketName,
        count: found ? Number(found.count) : 0,
        amount: found ? Math.round(Number(found.amount) * 100) / 100 : 0,
      };
    });

    // 7. Monthly Cashflow Comparison (Invoices vs Payments for past 6 months)
    const monthlyInvoices = await db.query<{ month: string; invoiced: number }>(
      `SELECT 
         strftime('%Y-%m', period_start) as month,
         COALESCE(SUM(total_amount), 0) as invoiced
       FROM invoices
       WHERE status != 'cancelled' AND period_start IS NOT NULL
       GROUP BY month
       ORDER BY month DESC
       LIMIT 6`
    );

    const monthlyPayments = await db.query<{ month: string; collected: number }>(
      `SELECT 
         strftime('%Y-%m', recorded_at) as month,
         COALESCE(SUM(amount), 0) as collected
       FROM payments
       WHERE status = 'successful' AND recorded_at IS NOT NULL
       GROUP BY month
       ORDER BY month DESC
       LIMIT 6`
    );

    const allMonths = Array.from(
      new Set([
        ...monthlyInvoices.map((i) => i.month),
        ...monthlyPayments.map((p) => p.month),
      ])
    ).filter(Boolean).sort();

    const monthlyCashflow: MonthlyCashflowMetric[] = allMonths.map((m) => {
      const invMatch = monthlyInvoices.find((i) => i.month === m);
      const payMatch = monthlyPayments.find((p) => p.month === m);
      return {
        month: m,
        invoiced: invMatch ? Math.round(Number(invMatch.invoiced) * 100) / 100 : 0,
        collected: payMatch ? Math.round(Number(payMatch.collected) * 100) / 100 : 0,
      };
    });

    // 8. Subscriptions Breakdown by Status
    const statusRaw = await db.query<{ status: string; count: number; total_value: number }>(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total_value
       FROM subscriptions
       GROUP BY status`
    );
    const subscriptionsByStatus: SubscriptionsByStatusMetric[] = statusRaw.map((s) => ({
      status: s.status,
      count: Number(s.count),
      totalValue: Math.round(Number(s.total_value) * 100) / 100,
    }));

    // 9. Subscriptions Breakdown by Plan
    const planRaw = await db.query<{ plan_name: string; count: number; total_value: number }>(
      `SELECT p.name as plan_name, COUNT(*) as count, COALESCE(SUM(s.total_amount), 0) as total_value
       FROM subscriptions s
       JOIN plans p ON s.plan_id = p.id
       WHERE s.status = 'active'
       GROUP BY p.name`
    );
    const subscriptionsByPlan: SubscriptionsByPlanMetric[] = planRaw.map((p) => ({
      planName: p.plan_name,
      count: Number(p.count),
      totalValue: Math.round(Number(p.total_value) * 100) / 100,
    }));

    // 10. Recent Invoices & Payments for audit table
    const recentInvoices = await db.query(
      `SELECT i.id, i.invoice_number, i.total_amount, i.amount_due, i.status, i.due_date, c.name as customer_name
       FROM invoices i
       JOIN customer_profiles c ON i.customer_id = c.id
       ORDER BY i.created_at DESC LIMIT 5`
    );

    const recentPayments = await db.query(
      `SELECT p.id, p.amount, p.payment_method, p.status, p.recorded_at, i.invoice_number
       FROM payments p
       JOIN invoices i ON p.invoice_id = i.id
       ORDER BY p.recorded_at DESC LIMIT 5`
    );

    return {
      activeSubscriptions: activeSubs.length,
      mrr,
      totalInvoiced: Math.round((Number(invoiceAgg?.total_invoiced) || 0) * 100) / 100,
      totalCollected: Math.round((Number(paymentAgg?.total_collected) || 0) * 100) / 100,
      totalOutstanding: Math.round((Number(outstandingAgg?.total_outstanding) || 0) * 100) / 100,
      overdueCount: Number(overdueAgg?.overdue_count) || 0,
      overdueAmount: Math.round((Number(overdueAgg?.overdue_amount) || 0) * 100) / 100,
      overdueAging,
      monthlyCashflow,
      subscriptionsByStatus,
      subscriptionsByPlan,
      recentInvoices,
      recentPayments,
      filtersApplied: {
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
    };
  }
}
