import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database';
import { AuditService } from '../audit/audit.service';

export interface BillingRunResult {
  subscriptionsChecked: number;
  invoicesGenerated: number;
  errors: Array<{ subscriptionId: string; error: string }>;
  invoices: Array<{ id: string; invoiceNumber: string; amount: number }>;
}

export class BillingService {
  static advanceDate(dateStr: string, frequency: string): string {
    const d = new Date(dateStr);
    switch (frequency) {
      case 'daily':
        d.setDate(d.getDate() + 1);
        break;
      case 'weekly':
        d.setDate(d.getDate() + 7);
        break;
      case 'monthly':
        d.setMonth(d.getMonth() + 1);
        break;
      case 'yearly':
        d.setFullYear(d.getFullYear() + 1);
        break;
      default:
        d.setMonth(d.getMonth() + 1);
    }
    return d.toISOString().split('T')[0];
  }

  static async runBilling(targetDate?: string, triggerUserId?: string): Promise<BillingRunResult> {
    const currentDate = targetDate || new Date().toISOString().split('T')[0];

    // Find all active subscriptions due for billing on or before currentDate
    const dueSubscriptions = await db.query<{
      id: string;
      subscription_number: string;
      customer_id: string;
      plan_id: string;
      status: string;
      next_billing_date: string;
      end_date: string | null;
      billing_frequency: string;
      subtotal: number;
      discount_amount: number;
      tax_amount: number;
      total_amount: number;
    }>(
      `SELECT * FROM subscriptions 
       WHERE status = 'active' AND next_billing_date <= ?
       ORDER BY next_billing_date ASC`,
      [currentDate]
    );

    const result: BillingRunResult = {
      subscriptionsChecked: dueSubscriptions.length,
      invoicesGenerated: 0,
      errors: [],
      invoices: [],
    };

    for (const sub of dueSubscriptions) {
      try {
        await db.transaction(async () => {
          // Verify subscription is still active inside transaction
          const currentSub = await db.queryOne<{ status: string; next_billing_date: string; end_date: string | null }>(
            'SELECT status, next_billing_date, end_date FROM subscriptions WHERE id = ?',
            [sub.id]
          );

          if (!currentSub || currentSub.status !== 'active') {
            return;
          }

          // Check if subscription has expired
          if (currentSub.end_date && currentSub.end_date < currentDate) {
            await db.execute("UPDATE subscriptions SET status = 'expired' WHERE id = ?", [sub.id]);
            await AuditService.log('SUBSCRIPTION_EXPIRED', 'subscriptions', sub.id, triggerUserId, {
              endDate: currentSub.end_date,
              currentDate,
            });
            return;
          }

          const periodStart = currentSub.next_billing_date;
          const periodEnd = this.advanceDate(periodStart, sub.billing_frequency);
          const dueDate = periodEnd; // Due at period end

          // Check if invoice for this (subscription_id, period_start) already exists (Idempotency)
          const existingInvoice = await db.queryOne(
            'SELECT id FROM invoices WHERE subscription_id = ? AND period_start = ?',
            [sub.id, periodStart]
          );

          if (existingInvoice) {
            // Already billed for this period, advance date safely
            await db.execute('UPDATE subscriptions SET next_billing_date = ? WHERE id = ?', [periodEnd, sub.id]);
            return;
          }

          const invoiceId = uuidv4();
          const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;

          // 1. Insert Invoice
          await db.execute(
            `INSERT INTO invoices (
              id, invoice_number, subscription_id, customer_id, period_start, period_end, due_date,
              status, subtotal, discount_amount, tax_amount, total_amount, amount_paid, amount_due
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, 0.00, ?)`,
            [
              invoiceId,
              invoiceNumber,
              sub.id,
              sub.customer_id,
              periodStart,
              periodEnd,
              dueDate,
              sub.subtotal,
              sub.discount_amount,
              sub.tax_amount,
              sub.total_amount,
              sub.total_amount,
            ]
          );

          // 2. Snapshot lines from subscription_lines
          const subLines = await db.query<{
            product_id: string;
            variant_id: string | null;
            quantity: number;
            unit_price: number;
            subtotal: number;
          }>('SELECT * FROM subscription_lines WHERE subscription_id = ?', [sub.id]);

          for (const sl of subLines) {
            const prod = await db.queryOne<{ name: string }>('SELECT name FROM products WHERE id = ?', [sl.product_id]);
            let desc = prod ? prod.name : 'Subscription Item';
            if (sl.variant_id) {
              const variant = await db.queryOne<{ attribute_value: string }>(
                'SELECT attribute_value FROM product_variants WHERE id = ?',
                [sl.variant_id]
              );
              if (variant) desc += ` (${variant.attribute_value})`;
            }

            await db.execute(
              `INSERT INTO invoice_lines (id, invoice_id, product_id, variant_id, description, quantity, unit_price, subtotal)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [uuidv4(), invoiceId, sl.product_id, sl.variant_id, desc, sl.quantity, sl.unit_price, sl.subtotal]
            );
          }

          // 3. Atomically advance next_billing_date or expire if end_date reached
          if (currentSub.end_date && periodEnd >= currentSub.end_date) {
            await db.execute("UPDATE subscriptions SET next_billing_date = ?, status = 'expired' WHERE id = ?", [periodEnd, sub.id]);
          } else {
            await db.execute('UPDATE subscriptions SET next_billing_date = ? WHERE id = ?', [periodEnd, sub.id]);
          }

          result.invoicesGenerated++;
          result.invoices.push({ id: invoiceId, invoiceNumber, amount: sub.total_amount });
        });
      } catch (err: any) {
        result.errors.push({ subscriptionId: sub.id, error: err.message });
      }
    }

    await AuditService.log('BILLING_RUN_EXECUTED', 'billing', undefined, triggerUserId, {
      date: currentDate,
      generated: result.invoicesGenerated,
      checked: result.subscriptionsChecked,
    });

    return result;
  }
}
