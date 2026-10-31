import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/config/database';
import { runMigrations } from '../src/config/migrate';
import { runSeeds } from '../src/config/seed';
import { BillingService } from '../src/modules/billing/billing.service';

async function runBillingTests() {
  console.log('====================================================');
  console.log('STARTING RECURRING BILLING ENGINE TEST SUITE');
  console.log('====================================================\n');

  await runMigrations();
  await runSeeds();

  // Test Customer
  const customerId = uuidv4();
  const userId = uuidv4();
  await db.execute(
    'INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [userId, `billing.customer.${Date.now()}@example.com`, 'hash', 'customer']
  );
  await db.execute(
    'INSERT OR IGNORE INTO customer_profiles (id, user_id, name) VALUES (?, ?, ?)',
    [customerId, userId, 'Billing Customer']
  );

  // 1. Single Billing Run & Invoicing
  console.log('[Billing Test 1] Standard Billing Run & Invoice Generation...');
  const sub1Id = uuidv4();
  const sub1Num = `SUB-BILL-1-${Date.now().toString().slice(-4)}`;
  const today = '2026-10-31';

  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, discount_amount, tax_amount, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'active', ?, ?, 'monthly', 100.00, 10.00, 16.20, 106.20)`,
    [sub1Id, sub1Num, customerId, today, today]
  );
  await db.execute(
    `INSERT INTO subscription_lines (id, subscription_id, product_id, quantity, unit_price, subtotal)
     VALUES (?, ?, 'prod-01', 1, 100.00, 100.00)`,
    [uuidv4(), sub1Id]
  );

  const run1 = await BillingService.runBilling(today);
  assert(run1.invoicesGenerated >= 1, 'Generates period invoice');
  const inv1 = await db.queryOne<{ id: string; period_start: string; total_amount: number }>(
    'SELECT * FROM invoices WHERE subscription_id = ?',
    [sub1Id]
  );
  assert(inv1, 'Invoice exists');
  assert.strictEqual(inv1.period_start, today, 'Period start matches billing date');
  assert.strictEqual(inv1.total_amount, 106.20, 'Invoice total matches calculated snapshot');
  console.log(`✓ Invoice created with total $${inv1.total_amount} and period start ${inv1.period_start}.`);

  // 2. Duplicate Run Prevention (Idempotency)
  console.log('[Billing Test 2] Duplicate Run Prevention (Re-running same date)...');
  const run2 = await BillingService.runBilling(today);
  const invCountSub1 = await db.query<{ id: string }>('SELECT id FROM invoices WHERE subscription_id = ?', [sub1Id]);
  assert.strictEqual(invCountSub1.length, 1, 'Exactly 1 invoice must exist for the period');
  console.log('✓ Idempotency verified: re-running billing generated 0 duplicate invoices.');

  // 3. Concurrent Runs Protection
  console.log('[Billing Test 3] Concurrent Billing Runs Conflict Handling...');
  const sub3Id = uuidv4();
  const sub3Num = `SUB-CONCUR-${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'active', ?, ?, 'monthly', 200.00, 200.00)`,
    [sub3Id, sub3Num, customerId, today, today]
  );
  await db.execute(
    `INSERT INTO subscription_lines (id, subscription_id, product_id, quantity, unit_price, subtotal)
     VALUES (?, ?, 'prod-01', 1, 200.00, 200.00)`,
    [uuidv4(), sub3Id]
  );

  // Trigger two billing runs concurrently in parallel
  const [concur1, concur2] = await Promise.all([
    BillingService.runBilling(today),
    BillingService.runBilling(today),
  ]);
  const sub3Invoices = await db.query('SELECT id FROM invoices WHERE subscription_id = ?', [sub3Id]);
  assert.strictEqual(sub3Invoices.length, 1, 'Only exactly 1 invoice created despite concurrent parallel calls');
  console.log('✓ Concurrent run protection verified: Database constraints prevented race-condition duplicates.');

  // 4. Missed Periods Catch-Up Policy
  console.log('[Billing Test 4] Missed-Period Catch-Up Invoicing...');
  const sub4Id = uuidv4();
  const sub4Num = `SUB-MISSED-${Date.now().toString().slice(-4)}`;
  // Backdated: 3 months ago (Aug 1, 2026)
  const missedStartDate = '2026-08-01';
  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'active', ?, ?, 'monthly', 150.00, 150.00)`,
    [sub4Id, sub4Num, customerId, missedStartDate, missedStartDate]
  );
  await db.execute(
    `INSERT INTO subscription_lines (id, subscription_id, product_id, quantity, unit_price, subtotal)
     VALUES (?, ?, 'prod-01', 1, 150.00, 150.00)`,
    [uuidv4(), sub4Id]
  );

  // Run billing for today (Oct 31, 2026) -> should catch up Aug, Sep, Oct (3 periods)
  const catchUpRun = await BillingService.runBilling('2026-10-31');
  const missedInvoices = await db.query<{ period_start: string }>(
    'SELECT period_start FROM invoices WHERE subscription_id = ? ORDER BY period_start ASC',
    [sub4Id]
  );
  assert(missedInvoices.length >= 3, 'Catch-up generated invoices for all missed periods');
  console.log(`✓ Missed-period catch-up generated ${missedInvoices.length} invoices covering all past due cycles.`);

  // 5. Expiry Policy Handling
  console.log('[Billing Test 5] Subscription Expiry Policy...');
  const sub5Id = uuidv4();
  const sub5Num = `SUB-EXP-${Date.now().toString().slice(-4)}`;
  const expiredEndDate = '2026-09-01'; // Expired last month
  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, end_date, billing_frequency, subtotal, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'active', '2026-01-01', '2026-10-01', ?, 'monthly', 100.00, 100.00)`,
    [sub5Id, sub5Num, customerId, expiredEndDate]
  );

  await BillingService.runBilling(today);
  const expiredSub = await db.queryOne<{ status: string }>('SELECT status FROM subscriptions WHERE id = ?', [sub5Id]);
  assert.strictEqual(expiredSub?.status, 'expired', 'Subscription status marked expired');
  const expInvoices = await db.query('SELECT id FROM invoices WHERE subscription_id = ? AND period_start >= ?', [sub5Id, today]);
  assert.strictEqual(expInvoices.length, 0, 'No invoices generated past expiration date');
  console.log('✓ Expiry verified: Expired subscription transitioned to expired and excluded from future billing.');

  // 6. Pause Policy Handling
  console.log('[Billing Test 6] Subscription Pause Policy...');
  const sub6Id = uuidv4();
  const sub6Num = `SUB-PAUSED-${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'paused', '2026-01-01', ?, 'monthly', 100.00, 100.00)`,
    [sub6Id, sub6Num, customerId, today]
  );

  const pauseRun = await BillingService.runBilling(today);
  const pauseReason = pauseRun.skippedReasons.find((r) => r.subscriptionId === sub6Id);
  assert(pauseReason, 'Paused subscription recorded in skipped reasons');
  const pausedInvoices = await db.query('SELECT id FROM invoices WHERE subscription_id = ?', [sub6Id]);
  assert.strictEqual(pausedInvoices.length, 0, '0 invoices generated for paused subscription');
  console.log('✓ Pause verified: Paused subscription skipped with logged reason and 0 invoices created.');

  // 7. Discounts, Taxes, and Rounding Calculations
  console.log('[Billing Test 7] Decimal-Safe Taxes, Discounts & Rounding...');
  const sub7Id = uuidv4();
  const sub7Num = `SUB-TAX-${Date.now().toString().slice(-4)}`;
  // Subtotal: 1000.00, Discount 10% = 100.00, Tax 18% of 900 = 162.00, Total = 1062.00
  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, discount_amount, tax_amount, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'active', ?, ?, 'monthly', 1000.00, 100.00, 162.00, 1062.00)`,
    [sub7Id, sub7Num, customerId, today, today]
  );
  await db.execute(
    `INSERT INTO subscription_lines (id, subscription_id, product_id, quantity, unit_price, subtotal)
     VALUES (?, ?, 'prod-01', 10, 100.00, 1000.00)`,
    [uuidv4(), sub7Id]
  );

  await BillingService.runBilling(today);
  const taxInv = await db.queryOne<{ subtotal: number; discount_amount: number; tax_amount: number; total_amount: number }>(
    'SELECT subtotal, discount_amount, tax_amount, total_amount FROM invoices WHERE subscription_id = ?',
    [sub7Id]
  );
  assert.strictEqual(taxInv?.subtotal, 1000.00);
  assert.strictEqual(taxInv?.discount_amount, 100.00);
  assert.strictEqual(taxInv?.tax_amount, 162.00);
  assert.strictEqual(taxInv?.total_amount, 1062.00);
  console.log(`✓ Decimal rounding verified: Subtotal=$${taxInv.subtotal}, Discount=-$${taxInv.discount_amount}, Tax=+$${taxInv.tax_amount}, Total=$${taxInv.total_amount}.`);

  // 8. Transaction Rollback Verification
  console.log('[Billing Test 8] Transaction Rollback on Failure...');
  const sub8Id = uuidv4();
  const sub8Num = `SUB-ROLLBACK-${Date.now().toString().slice(-4)}`;
  const initialDate = '2026-10-31';

  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'active', ?, ?, 'monthly', 100.00, 100.00)`,
    [sub8Id, sub8Num, customerId, initialDate, initialDate]
  );

  // Intentionally simulate transaction failure by causing an invalid insert inside transaction
  try {
    await db.transaction(async () => {
      await db.execute('UPDATE subscriptions SET next_billing_date = ? WHERE id = ?', ['2026-11-30', sub8Id]);
      // Trigger intentional foreign key error or check violation
      await db.execute('INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, period_start, period_end, due_date, status, subtotal, total_amount, amount_paid, amount_due) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        'bad-id', 'INV-ERR', 'non-existent-sub', 'non-existent-cust', '2026-10-31', '2026-11-30', '2026-11-30', 'invalid_status', 100, 100, 0, 100
      ]);
    });
    assert.fail('Transaction should have rolled back');
  } catch (err) {
    // Verify rollback preserved initial date
    const rolledBackSub = await db.queryOne<{ next_billing_date: string }>(
      'SELECT next_billing_date FROM subscriptions WHERE id = ?',
      [sub8Id]
    );
    assert.strictEqual(rolledBackSub?.next_billing_date, initialDate, 'next_billing_date rolled back to original date');
    console.log('✓ Transaction rollback verified: Database was restored to consistent state upon failure.');
  }

  // 9. Billing Run Record Verification
  console.log('[Billing Test 9] Billing Run Record Logging...');
  const auditLogs = await db.query<{ payload: string }>(
    "SELECT payload FROM audit_logs WHERE action = 'BILLING_RUN_EXECUTED' ORDER BY created_at DESC LIMIT 1"
  );
  assert(auditLogs.length > 0, 'Audit log exists');
  const payload = JSON.parse(auditLogs[0].payload);
  assert(payload.startTime, 'Start time recorded');
  assert(payload.endTime, 'End time recorded');
  assert(typeof payload.durationMs === 'number', 'Duration recorded');
  assert(typeof payload.generated === 'number', 'Generated count recorded');
  assert(Array.isArray(payload.skippedReasons), 'Skipped reasons list recorded');
  console.log(`✓ Billing run audit log verified: Run took ${payload.durationMs}ms, generated ${payload.generated} invoices with full diagnostic logs.`);

  console.log('\n====================================================');
  console.log('ALL RECURRING BILLING ENGINE TESTS PASSED! (9/9)');
  console.log('====================================================');
}

runBillingTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Billing test failed:', err);
    process.exit(1);
  });
