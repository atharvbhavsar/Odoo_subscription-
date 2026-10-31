import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database';
import { AuditService } from '../audit/audit.service';
import { InvoiceService } from '../invoices/invoices.service';
import { SubscriptionAddonService } from '../subscriptions/subscription-addons.service';
import { PricingService } from '../discounts/pricing.service';

export interface SkippedSubscriptionRecord {
  subscriptionId: string;
  subscriptionNumber?: string;
  reason: string;
}

export interface AlreadyBilledRecord {
  subscriptionId: string;
  subscriptionNumber?: string;
  periodStart: string;
  reason: string;
}

export interface BillingRunResult {
  runId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  subscriptionsChecked: number;
  invoicesGenerated: number;
  alreadyBilledCount: number;
  alreadyBilledRecords: AlreadyBilledRecord[];
  skippedCount: number;
  skippedReasons: SkippedSubscriptionRecord[];
  errors: Array<{ subscriptionId: string; error: string }>;
  invoices: Array<{ id: string; invoiceNumber: string; amount: number; periodStart: string; periodEnd: string }>;
}

export class BillingService {
  static advanceDate(dateStr: string, frequency: string, interval: number = 1): string {
    const parts = dateStr.split('-').map(Number);
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];

    switch (frequency.toLowerCase()) {
      case 'daily': {
        const d = new Date(Date.UTC(year, month - 1, day + interval));
        return d.toISOString().split('T')[0];
      }
      case 'weekly': {
        const d = new Date(Date.UTC(year, month - 1, day + (7 * interval)));
        return d.toISOString().split('T')[0];
      }
      case 'monthly': {
        const totalMonths = (month - 1) + interval;
        const targetYear = year + Math.floor(totalMonths / 12);
        const targetMonth = ((totalMonths % 12) + 12) % 12;
        const maxDays = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
        const targetDay = Math.min(day, maxDays);
        return new Date(Date.UTC(targetYear, targetMonth, targetDay)).toISOString().split('T')[0];
      }
      case 'yearly': {
        const targetYear = year + interval;
        const targetMonth = month - 1;
        const maxDays = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
        const targetDay = Math.min(day, maxDays);
        return new Date(Date.UTC(targetYear, targetMonth, targetDay)).toISOString().split('T')[0];
      }
      default: {
        const totalMonths = (month - 1) + interval;
        const targetYear = year + Math.floor(totalMonths / 12);
        const targetMonth = ((totalMonths % 12) + 12) % 12;
        const maxDays = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
        const targetDay = Math.min(day, maxDays);
        return new Date(Date.UTC(targetYear, targetMonth, targetDay)).toISOString().split('T')[0];
      }
    }
  }

  static async runBilling(targetDate?: string, triggerUserId?: string): Promise<BillingRunResult> {
    const runId = uuidv4();
    const startTimeDate = new Date();
    const startTime = startTimeDate.toISOString();
    const currentDate = targetDate || startTime.split('T')[0];

    // Find all subscriptions that might be eligible or need checking
    const subscriptions = await db.query<{
      id: string;
      subscription_number: string;
      customer_id: string;
      plan_id: string;
      discount_id: string | null;
      tax_id: string | null;
      status: string;
      next_billing_date: string;
      start_date: string;
      end_date: string | null;
      billing_frequency: string;
      billing_interval?: number;
      subtotal: number;
      discount_amount: number;
      tax_amount: number;
      total_amount: number;
    }>(
      `SELECT s.*, p.billing_interval
       FROM subscriptions s
       JOIN plans p ON s.plan_id = p.id
       WHERE s.next_billing_date <= ?
       ORDER BY s.next_billing_date ASC`,
      [currentDate]
    );

    const result: BillingRunResult = {
      runId,
      startTime,
      endTime: '',
      durationMs: 0,
      subscriptionsChecked: subscriptions.length,
      invoicesGenerated: 0,
      alreadyBilledCount: 0,
      alreadyBilledRecords: [],
      skippedCount: 0,
      skippedReasons: [],
      errors: [],
      invoices: [],
    };

    for (const sub of subscriptions) {
      // 1. Check Pause Policy
      if (sub.status === 'paused') {
        result.skippedCount++;
        result.skippedReasons.push({
          subscriptionId: sub.id,
          subscriptionNumber: sub.subscription_number,
          reason: 'Subscription is paused; recurring billing suspended',
        });
        continue;
      }

      // 2. Check Closed or Cancelled
      if (sub.status === 'closed' || sub.status === 'cancelled') {
        result.skippedCount++;
        result.skippedReasons.push({
          subscriptionId: sub.id,
          subscriptionNumber: sub.subscription_number,
          reason: `Subscription is in status '${sub.status}'`,
        });
        continue;
      }

      // 3. Check Expiry Policy
      if (sub.end_date && sub.end_date < currentDate) {
        await db.execute("UPDATE subscriptions SET status = 'expired' WHERE id = ?", [sub.id]);
        await AuditService.log('SUBSCRIPTION_EXPIRED', 'subscriptions', sub.id, triggerUserId, {
          endDate: sub.end_date,
          currentDate,
        });
        result.skippedCount++;
        result.skippedReasons.push({
          subscriptionId: sub.id,
          subscriptionNumber: sub.subscription_number,
          reason: `Subscription expired on ${sub.end_date}`,
        });
        continue;
      }

      if (sub.status !== 'active') {
        result.skippedCount++;
        result.skippedReasons.push({
          subscriptionId: sub.id,
          subscriptionNumber: sub.subscription_number,
          reason: `Subscription status '${sub.status}' is not eligible for active billing`,
        });
        continue;
      }

      // 4. Missed-period catch-up loop: invoice all due periods sequentially up to currentDate
      let currentBillingDate = sub.next_billing_date;

      while (currentBillingDate <= currentDate) {
        // Do not invoice periods outside the subscription's valid dates
        if (sub.end_date && currentBillingDate >= sub.end_date) {
          await db.execute("UPDATE subscriptions SET status = 'expired' WHERE id = ?", [sub.id]);
          result.skippedReasons.push({
            subscriptionId: sub.id,
            subscriptionNumber: sub.subscription_number,
            reason: `Period starts at or after subscription end date (${sub.end_date}); marked expired`,
          });
          break;
        }

        try {
          let periodProcessed = false;

          await db.transaction(async () => {
            // Row-level lock / state recheck inside transaction
            const currentSub = await db.queryOne<{ status: string; next_billing_date: string; end_date: string | null }>(
              'SELECT status, next_billing_date, end_date FROM subscriptions WHERE id = ?',
              [sub.id]
            );

            if (!currentSub || currentSub.status !== 'active') {
              return;
            }

            const periodStart = currentSub.next_billing_date;
            const periodEnd = this.advanceDate(periodStart, sub.billing_frequency, sub.billing_interval || 1);
            const dueDate = periodEnd;

            // Database uniqueness check on (subscription_id, period_start)
            const existingInvoice = await db.queryOne(
              'SELECT id FROM invoices WHERE subscription_id = ? AND period_start = ?',
              [sub.id, periodStart]
            );

            if (existingInvoice) {
              // Already billed for this period, advance date safely to prevent infinite loop
              await db.execute('UPDATE subscriptions SET next_billing_date = ? WHERE id = ?', [periodEnd, sub.id]);
              result.alreadyBilledCount++;
              result.alreadyBilledRecords.push({
                subscriptionId: sub.id,
                subscriptionNumber: sub.subscription_number,
                periodStart,
                reason: `Period starting ${periodStart} was previously billed; safely skipped by idempotency constraint`,
              });
              currentBillingDate = periodEnd;
              return;
            }

            const invoiceId = uuidv4();
            const invoiceNumber = await InvoiceService.generateInvoiceNumber();

            // Fetch base subscription lines
            const subLines = await db.query<{
              product_id: string;
              variant_id: string | null;
              quantity: number;
              unit_price: number;
              subtotal: number;
            }>('SELECT * FROM subscription_lines WHERE subscription_id = ?', [sub.id]);

            // Query active add-ons for this period
            const activeAddons = await SubscriptionAddonService.getActiveAddonsForPeriod(sub.id, periodStart);

            let invoiceSubtotal = sub.subtotal;
            let invoiceDiscount = sub.discount_amount;
            let invoiceTax = sub.tax_amount;
            let invoiceTotal = sub.total_amount;

            // Compute authoritative line items via PricingService when lines or add-ons exist
            if (subLines.length > 0 || activeAddons.length > 0) {
              const lineInputs = [
                ...subLines.map((l) => ({
                  productId: l.product_id,
                  variantId: l.variant_id,
                  quantity: l.quantity,
                  unitPrice: l.unit_price,
                })),
                ...activeAddons.map((a) => ({
                  productId: a.product_id,
                  variantId: a.variant_id,
                  quantity: a.quantity,
                  unitPrice: a.unit_price,
                })),
              ];

              const pricing = await PricingService.calculatePricing(
                lineInputs,
                sub.discount_id,
                sub.tax_id,
                { evalDate: periodStart, allowInactiveProducts: true }
              );

              invoiceSubtotal = pricing.subtotal;
              invoiceDiscount = pricing.discountAmount;
              invoiceTax = pricing.taxAmount;
              invoiceTotal = pricing.totalAmount;

              // Fallback for tests/legacy records without linked discount_id or tax_id foreign keys
              if (!sub.discount_id && sub.discount_amount > 0 && activeAddons.length === 0) {
                invoiceDiscount = Math.min(sub.discount_amount, invoiceSubtotal);
                const discounted = Math.max(0, invoiceSubtotal - invoiceDiscount);
                if (!sub.tax_id && sub.tax_amount > 0) {
                  invoiceTax = sub.tax_amount;
                }
                invoiceTotal = Math.round((discounted + invoiceTax + Number.EPSILON) * 100) / 100;
              }
            }

            // Increment discount usage when applied
            if (sub.discount_id && invoiceDiscount > 0) {
              await db.execute('UPDATE discounts SET used_count = used_count + 1 WHERE id = ?', [sub.discount_id]);
            }

            // Transition add-on statuses for this period
            for (const ao of activeAddons) {
              if (ao.status === 'pending_activation') {
                await db.execute("UPDATE subscription_addons SET status = 'active', updated_at = datetime('now') WHERE id = ?", [ao.id]);
              }
            }
            await db.execute(
              "UPDATE subscription_addons SET status = 'removed', updated_at = datetime('now') WHERE subscription_id = ? AND status = 'pending_removal' AND effective_end_date <= ?",
              [sub.id, periodEnd]
            );

            // Create Invoice Snapshot
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
                invoiceSubtotal,
                invoiceDiscount,
                invoiceTax,
                invoiceTotal,
                invoiceTotal,
              ]
            );

            // Copy Lines & Add-ons to invoice_lines snapshot
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

            // Copy Add-on lines
            for (const ao of activeAddons) {
              let desc = `${ao.product_name || 'Add-on Item'}`;
              if (ao.attribute_value) {
                desc += ` (${ao.attribute_value})`;
              }
              desc += ' (Add-on)';

              const addonLineSubtotal = Math.round((ao.unit_price * ao.quantity + Number.EPSILON) * 100) / 100;
              await db.execute(
                `INSERT INTO invoice_lines (id, invoice_id, product_id, variant_id, description, quantity, unit_price, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), invoiceId, ao.product_id, ao.variant_id, desc, ao.quantity, ao.unit_price, addonLineSubtotal]
              );
            }

            // Atomically advance next_billing_date inside transaction
            if (currentSub.end_date && periodEnd >= currentSub.end_date) {
              await db.execute("UPDATE subscriptions SET next_billing_date = ?, status = 'expired' WHERE id = ?", [periodEnd, sub.id]);
            } else {
              await db.execute('UPDATE subscriptions SET next_billing_date = ? WHERE id = ?', [periodEnd, sub.id]);
            }

            result.invoicesGenerated++;
            result.invoices.push({ id: invoiceId, invoiceNumber, amount: invoiceTotal, periodStart, periodEnd });
            currentBillingDate = periodEnd;
            periodProcessed = true;
          });

          if (!periodProcessed) {
            break; // Break if sub was not active or already reached end
          }
        } catch (err: any) {
          result.errors.push({ subscriptionId: sub.id, error: err.message });
          break; // Stop loop on error for this subscription to avoid infinite loop
        }
      }
    }

    const endTimeDate = new Date();
    result.endTime = endTimeDate.toISOString();
    result.durationMs = endTimeDate.getTime() - startTimeDate.getTime();

    // Record complete billing run log
    await AuditService.log('BILLING_RUN_EXECUTED', 'billing', runId, triggerUserId, {
      runId,
      startTime: result.startTime,
      endTime: result.endTime,
      durationMs: result.durationMs,
      targetDate: currentDate,
      generated: result.invoicesGenerated,
      checked: result.subscriptionsChecked,
      alreadyBilledCount: result.alreadyBilledCount,
      alreadyBilledRecords: result.alreadyBilledRecords,
      skippedCount: result.skippedCount,
      errorsCount: result.errors.length,
      skippedReasons: result.skippedReasons,
    });

    return result;
  }
}
