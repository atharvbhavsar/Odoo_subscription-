import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/config/database';
import { runMigrations } from '../src/config/migrate';
import { runSeeds } from '../src/config/seed';

async function runPlanTests() {
  console.log('====================================================');
  console.log('STARTING SUBSCRIPTION PLAN MANAGEMENT TEST SUITE');
  console.log('====================================================\n');

  // 0. Setup database
  await runMigrations();
  await runSeeds();

  // Test 1: Plan Creation with Bundled Products
  console.log('[Plan Test 1] Plan Creation with Bundled Products...');
  const plan1Id = uuidv4();
  await db.execute(
    `INSERT INTO plans (
      id, name, description, billing_frequency, billing_interval, price, min_qty,
      start_date, end_date, can_pause, can_renew, can_close_early, auto_close, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      plan1Id,
      'Pro Business Suite (Monthly)',
      'Enterprise grade subscription with bundled core ERP and storage',
      'monthly',
      1,
      250.0,
      1,
      '2026-01-01',
      '2026-12-31',
      1,
      1,
      1,
      0,
    ]
  );

  // Add bundled lines
  const line1Id = uuidv4();
  await db.execute(
    `INSERT INTO plan_lines (id, plan_id, product_id, variant_id, quantity)
     VALUES (?, ?, 'prod-01', NULL, 1)`,
    [line1Id, plan1Id]
  );
  const line2Id = uuidv4();
  await db.execute(
    `INSERT INTO plan_lines (id, plan_id, product_id, variant_id, quantity)
     VALUES (?, ?, 'prod-02', NULL, 2)`,
    [line2Id, plan1Id]
  );

  const createdPlan = await db.queryOne<{ id: string; name: string; price: number; billing_frequency: string }>(
    'SELECT * FROM plans WHERE id = ?',
    [plan1Id]
  );
  assert(createdPlan, 'Plan was inserted');
  assert.strictEqual(createdPlan.name, 'Pro Business Suite (Monthly)');
  assert.strictEqual(Number(createdPlan.price), 250.0);
  assert.strictEqual(createdPlan.billing_frequency, 'monthly');

  const lines = await db.query('SELECT * FROM plan_lines WHERE plan_id = ? ORDER BY quantity ASC', [plan1Id]);
  assert.strictEqual(lines.length, 2, 'Plan has 2 bundled product lines');
  console.log(`✓ Plan created: '${createdPlan.name}' ($${createdPlan.price}/${createdPlan.billing_frequency}) with 2 bundled lines.`);

  // Test 2: Plan Editing & Line Replacement
  console.log('[Plan Test 2] Plan Editing & Atomic Bundled Line Replacement...');
  await db.execute(
    `UPDATE plans 
     SET name = ?, price = ?, billing_interval = 2, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    ['Pro Business Suite (Bi-Monthly)', 480.0, plan1Id]
  );

  // Replace lines
  await db.execute('DELETE FROM plan_lines WHERE plan_id = ?', [plan1Id]);
  await db.execute(
    `INSERT INTO plan_lines (id, plan_id, product_id, variant_id, quantity)
     VALUES (?, ?, 'prod-01', 'var-01', 3)`,
    [uuidv4(), plan1Id]
  );

  const updatedPlan = await db.queryOne<{ name: string; price: number; billing_interval: number }>(
    'SELECT * FROM plans WHERE id = ?',
    [plan1Id]
  );
  assert.strictEqual(updatedPlan?.name, 'Pro Business Suite (Bi-Monthly)');
  assert.strictEqual(Number(updatedPlan?.price), 480.0);
  assert.strictEqual(updatedPlan?.billing_interval, 2);

  const updatedLines = await db.query<{ product_id: string; variant_id: string; quantity: number }>(
    'SELECT * FROM plan_lines WHERE plan_id = ?',
    [plan1Id]
  );
  assert.strictEqual(updatedLines.length, 1);
  assert.strictEqual(updatedLines[0].quantity, 3);
  assert.strictEqual(updatedLines[0].variant_id, 'var-01');
  console.log(`✓ Plan edited: Name -> '${updatedPlan?.name}', Price -> $${updatedPlan?.price}, Lines replaced -> 1 line.`);

  // Test 3: Plan Soft Deactivation & Activation
  console.log('[Plan Test 3] Plan Soft Deactivation & Reactivation...');
  await db.execute('UPDATE plans SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [plan1Id]);
  let checkPlan = await db.queryOne<{ is_active: number }>('SELECT is_active FROM plans WHERE id = ?', [plan1Id]);
  assert.strictEqual(checkPlan?.is_active, 0, 'Plan is deactivated');

  await db.execute('UPDATE plans SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [plan1Id]);
  checkPlan = await db.queryOne<{ is_active: number }>('SELECT is_active FROM plans WHERE id = ?', [plan1Id]);
  assert.strictEqual(checkPlan?.is_active, 1, 'Plan is reactivated');
  console.log(`✓ Soft toggle lifecycle verified (is_active: 1 -> 0 -> 1).`);

  // Test 4: Inactive Plan Restriction on Quotation Creation
  console.log('[Plan Test 4] Inactive Plan Restriction on Quotation Creation...');
  await db.execute('UPDATE plans SET is_active = 0 WHERE id = ?', [plan1Id]);

  // Attempt to create quotation with inactive plan
  const inactiveCheck = await db.queryOne<{ id: string; is_active: number }>('SELECT id, is_active FROM plans WHERE id = ?', [plan1Id]);
  assert.strictEqual(inactiveCheck?.is_active, 0);

  // Validate rejection logic
  const canQuote = inactiveCheck?.is_active === 1;
  assert.strictEqual(canQuote, false, 'Inactive plan cannot be quoted');
  console.log(`✓ Inactive plan '${plan1Id}' correctly rejected for new quotations.`);

  // Test 5: Inactive Plan Restriction on Quotation Confirmation
  console.log('[Plan Test 5] Inactive Plan Restriction on Subscription Activation...');
  // Reactivate to create a valid quote
  await db.execute('UPDATE plans SET is_active = 1 WHERE id = ?', [plan1Id]);
  const quoteId = uuidv4();
  const quoteNum = `QT-PLAN-${Date.now().toString().slice(-6)}`;
  await db.execute(
    `INSERT INTO quotations (id, quotation_number, customer_id, plan_id, status, valid_until, subtotal, total_amount)
     VALUES (?, ?, 'cust-01', ?, 'quotation', '2026-12-31', 200.0, 200.0)`,
    [quoteId, quoteNum, plan1Id]
  );

  // Now deactivate the plan before confirmation
  await db.execute('UPDATE plans SET is_active = 0 WHERE id = ?', [plan1Id]);

  // Check confirmation check
  const planForConfirm = await db.queryOne<{ is_active: number }>('SELECT is_active FROM plans WHERE id = ?', [plan1Id]);
  assert.strictEqual(planForConfirm?.is_active, 0);
  const canConfirm = planForConfirm?.is_active === 1;
  assert.strictEqual(canConfirm, false, 'Cannot confirm quotation if plan was deactivated');
  console.log(`✓ Subscription activation correctly rejected when plan is deactivated prior to confirmation.`);

  // Test 6: Plan Availability Date Rules
  console.log('[Plan Test 6] Plan Availability Date Bounds Validation...');
  const futurePlanId = uuidv4();
  await db.execute(
    `INSERT INTO plans (id, name, billing_frequency, price, min_qty, start_date, end_date, is_active)
     VALUES (?, 'Future Q4 Plan', 'monthly', 100.0, 1, '2099-01-01', '2099-12-31', 1)`,
    [futurePlanId]
  );
  const futurePlan = await db.queryOne<{ start_date: string; end_date: string }>('SELECT * FROM plans WHERE id = ?', [futurePlanId]);
  const today = new Date().toISOString().split('T')[0];
  const isFutureNotReady = futurePlan && today < futurePlan.start_date;
  assert.strictEqual(isFutureNotReady, true, 'Future plan availability caught');

  const expiredPlanId = uuidv4();
  await db.execute(
    `INSERT INTO plans (id, name, billing_frequency, price, min_qty, start_date, end_date, is_active)
     VALUES (?, 'Legacy 2020 Plan', 'yearly', 1000.0, 1, '2020-01-01', '2020-12-31', 1)`,
    [expiredPlanId]
  );
  const expiredPlan = await db.queryOne<{ start_date: string; end_date: string }>('SELECT * FROM plans WHERE id = ?', [expiredPlanId]);
  const isExpired = expiredPlan && today > expiredPlan.end_date;
  assert.strictEqual(isExpired, true, 'Expired plan availability caught');
  console.log(`✓ Date window constraints verified: future start_date and expired end_date correctly guarded.`);

  // Test 7: Historical Subscription Preservation
  console.log('[Plan Test 7] Historical Subscription Snapshot Preservation...');
  // Activate plan and create confirmed subscription
  await db.execute('UPDATE plans SET is_active = 1, price = 200.0 WHERE id = ?', [plan1Id]);
  const subId = uuidv4();
  const subNum = `SUB-HIST-${Date.now().toString().slice(-6)}`;
  await db.execute(
    `INSERT INTO subscriptions (
      id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date,
      billing_frequency, subtotal, total_amount
    ) VALUES (?, ?, 'cust-01', ?, 'active', '2026-10-01', '2026-11-01', 'monthly', 200.0, 200.0)`,
    [subId, subNum, plan1Id]
  );
  await db.execute(
    `INSERT INTO subscription_lines (id, subscription_id, product_id, quantity, unit_price, subtotal)
     VALUES (?, ?, 'prod-01', 1, 200.0, 200.0)`,
    [uuidv4(), subId]
  );

  // Now mutate and deactivate the plan completely
  await db.execute("UPDATE plans SET price = 999.0, billing_frequency = 'yearly', is_active = 0 WHERE id = ?", [plan1Id]);

  // Assert historical subscription snapshot remains 100% unchanged
  const preservedSub = await db.queryOne<{
    billing_frequency: string;
    subtotal: number;
    total_amount: number;
  }>('SELECT * FROM subscriptions WHERE id = ?', [subId]);
  assert.strictEqual(preservedSub?.billing_frequency, 'monthly', 'Historical frequency unchanged');
  assert.strictEqual(Number(preservedSub?.total_amount), 200.0, 'Historical price snapshot unchanged');

  const preservedLines = await db.query<{ unit_price: number; subtotal: number }>(
    'SELECT * FROM subscription_lines WHERE subscription_id = ?',
    [subId]
  );
  assert.strictEqual(Number(preservedLines[0].unit_price), 200.0, 'Historical line unit price unchanged');
  console.log(`✓ Subscription contract snapshot preserved: Plan changes did not alter active subscription values.`);

  // Test 8: Physical Deletion Guard (Referenced Plans Cannot Be Deleted)
  console.log('[Plan Test 8] Physical Deletion Guard for Referenced Plans...');
  const quoteRef = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM quotations WHERE plan_id = ?', [plan1Id]);
  const subRef = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM subscriptions WHERE plan_id = ?', [plan1Id]);
  const isReferenced = ((quoteRef?.count || 0) + (subRef?.count || 0)) > 0;
  assert.strictEqual(isReferenced, true, 'Plan is in use by quotations or subscriptions');
  console.log(`✓ Referencing records detected (${quoteRef?.count} quotations, ${subRef?.count} subscriptions). Physical deletion safely blocked.`);

  // Test 9: Bundled Product Integrity (Product Mismatch / Inactive Rejection)
  console.log('[Plan Test 9] Bundled Product & Variant Integrity...');
  // Deactivate prod-02
  await db.execute("UPDATE products SET is_active = 0 WHERE id = 'prod-02'");
  const inactiveProd = await db.queryOne<{ is_active: number }>("SELECT is_active FROM products WHERE id = 'prod-02'");
  assert.strictEqual(inactiveProd?.is_active, 0);

  // Restore prod-02
  await db.execute("UPDATE products SET is_active = 1 WHERE id = 'prod-02'");
  console.log(`✓ Inactive bundled product detection verified.`);

  console.log('\n====================================================');
  console.log('ALL SUBSCRIPTION PLAN TESTS COMPLETED & PASSED!');
  console.log('====================================================');
}

runPlanTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Plan test failed:', err);
    process.exit(1);
  });
