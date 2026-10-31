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
  const sub1Num = `SUB-BILL-1-${uuidv4().slice(0, 8)}`;
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
  const sub3Num = `SUB-CONCUR-${uuidv4().slice(0, 8)}`;
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
  const sub4Num = `SUB-MISSED-${uuidv4().slice(0, 8)}`;
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

  const missedRun = await BillingService.runBilling(today);
  const sub4Invoices = await db.query<{ period_start: string }>('SELECT period_start FROM invoices WHERE subscription_id = ? ORDER BY period_start ASC', [sub4Id]);
  // From Aug 1, 2026 to Oct 31, 2026 covers: Aug 1, Sept 1, Oct 1 (3 invoices)
  assert(sub4Invoices.length >= 3, `Expected at least 3 catch-up invoices, got ${sub4Invoices.length}`);
  console.log(`✓ Missed-period catch-up generated ${sub4Invoices.length} invoices covering all past due cycles.`);

  // 5. Expiry Policy Enforcement
  console.log('[Billing Test 5] Subscription Expiry Policy...');
  const sub5Id = uuidv4();
  const sub5Num = `SUB-EXP-${uuidv4().slice(0, 8)}`;
  // Past end_date
  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, end_date, billing_frequency, subtotal, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'active', '2026-01-01', '2026-10-31', '2026-09-01', 'monthly', 100.00, 100.00)`,
    [sub5Id, sub5Num, customerId]
  );

  await BillingService.runBilling(today);
  const sub5 = await db.queryOne<{ status: string }>('SELECT status FROM subscriptions WHERE id = ?', [sub5Id]);
  assert.strictEqual(sub5?.status, 'expired', 'Subscription status transitioned to expired');
  const expInvoices = await db.query('SELECT id FROM invoices WHERE subscription_id = ?', [sub5Id]);
  assert.strictEqual(expInvoices.length, 0, '0 invoices generated for expired subscription');
  console.log('✓ Expiry verified: Expired subscription transitioned to expired and excluded from future billing.');

  // 6. Pause Policy Enforcement
  console.log('[Billing Test 6] Subscription Pause Policy...');
  const sub6Id = uuidv4();
  const sub6Num = `SUB-PAUSED-${uuidv4().slice(0, 8)}`;
  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'paused', '2026-10-01', '2026-10-31', 'monthly', 100.00, 100.00)`,
    [sub6Id, sub6Num, customerId]
  );

  const pauseRun = await BillingService.runBilling(today);
  const pausedSubRecord = pauseRun.skippedReasons.find((s) => s.subscriptionId === sub6Id);
  assert(pausedSubRecord, 'Paused subscription recorded in skipped reasons');
  const pausedInvoices = await db.query('SELECT id FROM invoices WHERE subscription_id = ?', [sub6Id]);
  assert.strictEqual(pausedInvoices.length, 0, '0 invoices generated for paused subscription');
  console.log('✓ Pause verified: Paused subscription skipped with logged reason and 0 invoices created.');

  // 7. Discounts, Taxes, and Rounding Calculations
  console.log('[Billing Test 7] Decimal-Safe Taxes, Discounts & Rounding...');
  const sub7Id = uuidv4();
  const sub7Num = `SUB-TAX-${uuidv4().slice(0, 8)}`;
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
  const sub8Num = `SUB-ROLLBACK-${uuidv4().slice(0, 8)}`;
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

  // 10. Billing with Active, Pending Activation, and Removed Subscription Add-ons
  console.log('[Billing Test 10] Billing with Subscription Add-ons (Active billed, Future & Removed excluded)...');
  const sub10Id = uuidv4();
  const sub10Num = `SUB-ADDON-${uuidv4().slice(0, 8)}`;
  const addonBillingDate = '2026-10-31';

  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'active', ?, ?, 'monthly', 100.00, 100.00)`,
    [sub10Id, sub10Num, customerId, addonBillingDate, addonBillingDate]
  );
  await db.execute(
    `INSERT INTO subscription_lines (id, subscription_id, product_id, quantity, unit_price, subtotal)
     VALUES (?, ?, 'prod-01', 1, 100.00, 100.00)`,
    [uuidv4(), sub10Id]
  );

  // Create products for future and removed add-ons
  const prodFutureId = uuidv4();
  const prodRemovedId = uuidv4();
  await db.execute(
    `INSERT INTO products (id, name, type, sales_price, cost_price, is_active)
     VALUES (?, 'Future Add-on Module', 'service', 75.00, 10.00, 1),
            (?, 'Retired Legacy Module', 'service', 40.00, 5.00, 1)`,
    [prodFutureId, prodRemovedId]
  );

  // 1. Active add-on: 2 x $50.00 = $100.00 (MUST BE BILLED for 2026-10-31)
  const activeAddonId = uuidv4();
  await db.execute(
    `INSERT INTO subscription_addons (id, subscription_id, product_id, quantity, unit_price, status, effective_start_date)
     VALUES (?, ?, 'prod-02', 2, 50.00, 'active', ?)`,
    [activeAddonId, sub10Id, addonBillingDate]
  );

  // 2. Future / not-yet-effective add-on: 1 x $75.00 (MUST NOT BE BILLED for 2026-10-31)
  const futureAddonId = uuidv4();
  await db.execute(
    `INSERT INTO subscription_addons (id, subscription_id, product_id, quantity, unit_price, status, effective_start_date)
     VALUES (?, ?, ?, 1, 75.00, 'pending_activation', '2026-11-30')`,
    [futureAddonId, sub10Id, prodFutureId]
  );

  // 3. Removed add-on: 1 x $40.00 (MUST NOT BE BILLED for 2026-10-31)
  const removedAddonId = uuidv4();
  await db.execute(
    `INSERT INTO subscription_addons (id, subscription_id, product_id, quantity, unit_price, status, effective_start_date, effective_end_date)
     VALUES (?, ?, ?, 1, 40.00, 'removed', '2026-09-30', '2026-10-31')`,
    [removedAddonId, sub10Id, prodRemovedId]
  );

  const run10 = await BillingService.runBilling(addonBillingDate);
  assert(run10.invoicesGenerated >= 1, 'Generates period invoice with add-on');
  const inv10 = await db.queryOne<{ id: string; subtotal: number; total_amount: number }>(
    'SELECT * FROM invoices WHERE subscription_id = ?',
    [sub10Id]
  );
  assert(inv10, 'Invoice for add-on subscription exists');

  // Verify only base line ($100) + active add-on line ($100) are billed -> total $200.00
  // If future ($75) or removed ($40) were included, total would be $275 or $315
  assert.strictEqual(inv10.subtotal, 200.00, 'Invoice subtotal includes base line ($100) + active add-on ($100); excludes future ($75) and removed ($40)');
  assert.strictEqual(inv10.total_amount, 200.00, 'Invoice total matches recalculated sum with active add-on only');

  const inv10Lines = await db.query<{ product_id: string; description: string; quantity: number; unit_price: number; subtotal: number }>(
    'SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY unit_price DESC',
    [inv10.id]
  );
  assert.strictEqual(inv10Lines.length, 2, 'Contains exactly 2 lines (base line + active add-on line)');

  const activeAddonLine = inv10Lines.find((l) => l.product_id === 'prod-02');
  assert(activeAddonLine, 'Active add-on line exists');
  assert(activeAddonLine.description.includes('(Add-on)'), 'Active add-on line has (Add-on) label');
  assert.strictEqual(activeAddonLine.quantity, 2, 'Active add-on quantity matches 2');
  assert.strictEqual(activeAddonLine.unit_price, 50.00, 'Active add-on unit price matches $50.00');
  assert.strictEqual(activeAddonLine.subtotal, 100.00, 'Active add-on subtotal matches $100.00');

  // Verify future and removed add-ons are NOT present in invoice_lines
  const futureAddonLine = inv10Lines.find((l) => l.product_id === prodFutureId);
  assert.strictEqual(futureAddonLine, undefined, 'Future add-on is strictly excluded from period invoice');

  const removedAddonLine = inv10Lines.find((l) => l.product_id === prodRemovedId);
  assert.strictEqual(removedAddonLine, undefined, 'Removed add-on is strictly excluded from period invoice');

  console.log(`✓ Add-on billing verified: Invoice created with total $${inv10.total_amount} and ${inv10Lines.length} snapshot lines.`);
  console.log('✓ Verified: Pending activation and removed add-ons are strictly excluded from the invoice.');

  console.log('\n====================================================');
  console.log('ALL RECURRING BILLING ENGINE TESTS PASSED! (10/10)');
  console.log('====================================================');
}

runBillingTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Billing test failed:', err);
    process.exit(1);
  });
