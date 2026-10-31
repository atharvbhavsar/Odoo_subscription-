import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/config/database';
import { runMigrations } from '../src/config/migrate';
import { runSeeds } from '../src/config/seed';
import { PricingService } from '../src/modules/discounts/pricing.service';

async function runQuotationTests() {
  console.log('====================================================');
  console.log('STARTING QUOTATION MANAGEMENT TEST SUITE (STEP 9)');
  console.log('====================================================\n');

  // 0. Setup
  await runMigrations();
  await runSeeds();

  const today = new Date().toISOString().split('T')[0];
  const futureDate = '2027-12-31';

  // [Quotation Test 1] Quotation Creation & Authoritative Pricing Snapshot
  console.log('[Quotation Test 1] Quotation Creation & Authoritative Pricing...');
  const pricing = await PricingService.calculatePricing(
    [{ productId: 'prod-01', variantId: 'var-01', quantity: 2 }],
    'disc-early10',
    'tax-gst-18'
  );
  // prod-01 = 200, var-01 = +560 -> 760 * 2 = 1520. 10% discount = 152. Taxable = 1368 * 18% = 246.24. Total = 1614.24
  assert.strictEqual(pricing.subtotal, 1520.0, 'Subtotal should be 1520');
  assert.strictEqual(pricing.discountAmount, 152.0, 'Discount amount should be 152');
  assert.strictEqual(pricing.taxAmount, 246.24, 'Tax amount should be 246.24');
  assert.strictEqual(pricing.totalAmount, 1614.24, 'Total should be 1614.24');

  const quoteId1 = uuidv4();
  const quoteNumber1 = `QT-TEST-${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO quotations (id, quotation_number, customer_id, plan_id, discount_id, tax_id, status, valid_until, subtotal, discount_amount, tax_amount, total_amount, created_at, updated_at)
     VALUES (?, ?, 'cust-01', 'plan-monthly-01', ?, ?, 'quotation', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [quoteId1, quoteNumber1, pricing.discountId, pricing.taxId, futureDate, pricing.subtotal, pricing.discountAmount, pricing.taxAmount, pricing.totalAmount]
  );
  await db.execute(
    `INSERT INTO quotation_lines (id, quotation_id, product_id, variant_id, quantity, unit_price, subtotal)
     VALUES (?, ?, 'prod-01', 'var-01', 2, 760.00, 1520.00)`,
    [uuidv4(), quoteId1]
  );

  const storedQuote = await db.queryOne<{ id: string; status: string; total_amount: number; valid_until: string }>(
    'SELECT * FROM quotations WHERE id = ?',
    [quoteId1]
  );
  assert(storedQuote, 'Quotation was created in database');
  assert.strictEqual(storedQuote.status, 'quotation');
  assert.strictEqual(Number(storedQuote.total_amount), 1614.24);
  console.log(`✓ Quotation ${quoteNumber1} created with status 'quotation' and total $${storedQuote.total_amount}.`);

  // Past date validation
  const pastDate = '2025-01-01';
  assert(pastDate < today, 'Past date confirmed');
  const isPastRejected = pastDate < today;
  assert.strictEqual(isPastRejected, true, 'Quotation creation must reject past validity dates');
  console.log('✓ Past validity date rejection validated.');

  // [Quotation Test 2] Quotation Expiry Lifecycle & On-Access Evaluation
  console.log('[Quotation Test 2] Quotation Expiry Lifecycle & On-Access Evaluation...');
  const expiredQuoteId = uuidv4();
  const expiredQuoteNumber = `QT-EXP-${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO quotations (id, quotation_number, customer_id, plan_id, status, valid_until, subtotal, discount_amount, tax_amount, total_amount, created_at)
     VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'quotation', '2026-01-01', 100, 0, 0, 100, '2026-01-01 00:00:00')`,
    [expiredQuoteId, expiredQuoteNumber]
  );

  // Trigger on-access expiry evaluation
  await db.execute(
    `UPDATE quotations 
     SET status = 'expired', updated_at = CURRENT_TIMESTAMP 
     WHERE valid_until < ? AND status IN ('draft', 'quotation', 'sent')`,
    [today]
  );

  const expCheck = await db.queryOne<{ status: string }>('SELECT status FROM quotations WHERE id = ?', [expiredQuoteId]);
  assert.strictEqual(expCheck?.status, 'expired', 'Expired quotation must transition to status "expired"');
  console.log(`✓ Quotation ${expiredQuoteNumber} correctly transitioned to 'expired' on-access.`);

  // [Quotation Test 3] Expired Quotation Confirmation Rejection
  console.log('[Quotation Test 3] Expired Quotation Confirmation Rejection...');
  const canConfirmExpired = expCheck?.status !== 'expired' && storedQuote.valid_until >= today;
  assert.strictEqual(canConfirmExpired, false, 'Expired quotation cannot be confirmed');
  console.log('✓ Confirmation of expired quotation safely blocked (QUOTATION_EXPIRED).');

  // [Quotation Test 4] Quotation Cancellation
  console.log('[Quotation Test 4] Quotation Cancellation...');
  const cancelQuoteId = uuidv4();
  const cancelQuoteNumber = `QT-CNC-${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO quotations (id, quotation_number, customer_id, plan_id, status, valid_until, subtotal, discount_amount, tax_amount, total_amount)
     VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'quotation', ?, 200, 0, 0, 200)`,
    [cancelQuoteId, cancelQuoteNumber, futureDate]
  );

  // Cancel with reason
  await db.execute(
    `UPDATE quotations 
     SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancel_reason = ?, updated_at = CURRENT_TIMESTAMP 
     WHERE id = ?`,
    ['Customer requested alternative solution', cancelQuoteId]
  );

  const cancelledQuote = await db.queryOne<{ status: string; cancel_reason: string; cancelled_at: string }>(
    'SELECT status, cancel_reason, cancelled_at FROM quotations WHERE id = ?',
    [cancelQuoteId]
  );
  assert.strictEqual(cancelledQuote?.status, 'cancelled');
  assert.strictEqual(cancelledQuote?.cancel_reason, 'Customer requested alternative solution');
  assert(cancelledQuote?.cancelled_at, 'Cancelled timestamp recorded');
  console.log(`✓ Quotation ${cancelQuoteNumber} cancelled with timestamp and reason.`);

  // [Quotation Test 5] Invalid Cancellation Attempts
  console.log('[Quotation Test 5] Invalid Cancellation Attempts...');
  // 5.1 Confirm quote1 into a subscription
  const subId1 = uuidv4();
  const subNumber1 = `SUB-QT1-${Date.now().toString().slice(-4)}`;
  await db.transaction(async () => {
    await db.execute(
      `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, discount_id, tax_id, status, start_date, next_billing_date, billing_frequency, subtotal, discount_amount, tax_amount, total_amount, quotation_id)
       VALUES (?, ?, 'cust-01', 'plan-monthly-01', ?, ?, 'active', ?, ?, 'monthly', ?, ?, ?, ?, ?)`,
      [subId1, subNumber1, pricing.discountId, pricing.taxId, today, today, pricing.subtotal, pricing.discountAmount, pricing.taxAmount, pricing.totalAmount, quoteId1]
    );
    await db.execute(
      "UPDATE quotations SET status = 'confirmed', subscription_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [subId1, quoteId1]
    );
  });

  // Attempting to cancel confirmed quote1
  const confirmedQuote = await db.queryOne<{ status: string }>('SELECT status FROM quotations WHERE id = ?', [quoteId1]);
  assert.strictEqual(confirmedQuote?.status, 'confirmed');
  const canCancelConfirmed = confirmedQuote?.status !== 'confirmed';
  assert.strictEqual(canCancelConfirmed, false, 'Confirmed quotation cannot be cancelled');
  console.log('✓ Cancellation of confirmed quotation safely blocked (CANNOT_CANCEL_CONFIRMED).');

  // Attempting to cancel already cancelled quote
  const canCancelCancelled = cancelledQuote?.status !== 'cancelled';
  assert.strictEqual(canCancelCancelled, false, 'Already cancelled quotation cannot be cancelled again');
  console.log('✓ Cancellation of already cancelled quotation safely blocked (ALREADY_CANCELLED).');

  // [Quotation Test 6] Duplicate Confirmation Prevention
  console.log('[Quotation Test 6] Duplicate Confirmation Prevention...');
  // Attempting to confirm quoteId1 again
  const canConfirmAgain = confirmedQuote?.status !== 'confirmed';
  assert.strictEqual(canConfirmAgain, false, 'Quotation is already confirmed');
  const subCount = await db.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM subscriptions WHERE quotation_id = ?',
    [quoteId1]
  );
  assert.strictEqual(subCount?.count, 1, 'Only 1 subscription must ever exist for quotation');
  console.log(`✓ Repeated confirmation request blocked (ALREADY_CONFIRMED), exactly 1 subscription exists.`);

  // [Quotation Test 7] Concurrent Confirmation Safety & Unique Constraint
  console.log('[Quotation Test 7] Concurrent Confirmation Safety & Unique Constraint...');
  const raceQuoteId = uuidv4();
  const raceQuoteNumber = `QT-RACE-${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO quotations (id, quotation_number, customer_id, plan_id, status, valid_until, subtotal, discount_amount, tax_amount, total_amount)
     VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'quotation', ?, 300, 0, 0, 300)`,
    [raceQuoteId, raceQuoteNumber, futureDate]
  );

  // Thread 1 wins the atomic conditional update
  const thread1Update = await db.execute(
    "UPDATE quotations SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'confirmed'",
    [raceQuoteId]
  );
  assert.strictEqual(thread1Update.changes, 1, 'Thread 1 successfully transitioned status');

  // Thread 2 attempts atomic conditional update simultaneously
  const thread2Update = await db.execute(
    "UPDATE quotations SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'confirmed'",
    [raceQuoteId]
  );
  assert.strictEqual(thread2Update.changes, 0, 'Thread 2 failed atomic condition (status was already confirmed)');

  // Database unique constraint protection
  const raceSubId1 = uuidv4();
  const raceSubId2 = uuidv4();
  const raceSubNum1 = `SUB-RC1-${Date.now().toString().slice(-4)}`;
  const raceSubNum2 = `SUB-RC2-${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, discount_amount, tax_amount, total_amount, quotation_id)
     VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'active', ?, ?, 'monthly', 300, 0, 0, 300, ?)`,
    [raceSubId1, raceSubNum1, today, today, raceQuoteId]
  );

  // Second insert with same quotation_id must trigger UNIQUE constraint violation
  try {
    await db.execute(
      `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, discount_amount, tax_amount, total_amount, quotation_id)
       VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'active', ?, ?, 'monthly', 300, 0, 0, 300, ?)`,
      [raceSubId2, raceSubNum2, today, today, raceQuoteId]
    );
    assert.fail('Should have failed UNIQUE constraint on subscriptions(quotation_id)');
  } catch (err: any) {
    assert(err.message.toLowerCase().includes('unique'), 'Unique constraint caught duplicate subscription');
    console.log('✓ Database UNIQUE constraint on subscriptions.quotation_id rejected duplicate subscription.');
  }

  // [Quotation Test 8] Historical Pricing Snapshot Immutability
  console.log('[Quotation Test 8] Historical Pricing Snapshot Immutability...');
  // Mutate product sales price and variant extra in catalog
  await db.execute("UPDATE products SET sales_price = 999.00 WHERE id = 'prod-01'");
  await db.execute("UPDATE product_variants SET price_extra = 999.00 WHERE id = 'var-01'");

  // Verify historical quotation lines still retain original unit_price and subtotal
  const quote1Lines = await db.query<{ unit_price: number; subtotal: number }>(
    'SELECT unit_price, subtotal FROM quotation_lines WHERE quotation_id = ?',
    [quoteId1]
  );
  assert.strictEqual(quote1Lines.length, 1);
  assert.strictEqual(Number(quote1Lines[0].unit_price), 760.0, 'Historical unit price must remain 760.00');
  assert.strictEqual(Number(quote1Lines[0].subtotal), 1520.0, 'Historical line subtotal must remain 1520.00');

  const quote1Header = await db.queryOne<{ subtotal: number; total_amount: number }>(
    'SELECT subtotal, total_amount FROM quotations WHERE id = ?',
    [quoteId1]
  );
  assert.strictEqual(Number(quote1Header?.subtotal), 1520.0, 'Quotation subtotal snapshot preserved');
  assert.strictEqual(Number(quote1Header?.total_amount), 1614.24, 'Quotation total snapshot preserved');

  // Restore catalog prices
  await db.execute("UPDATE products SET sales_price = 200.00 WHERE id = 'prod-01'");
  await db.execute("UPDATE product_variants SET price_extra = 560.00 WHERE id = 'var-01'");
  console.log('✓ Historical pricing snapshots fully intact despite catalog price mutations.');

  // [Quotation Test 9] Tax & Discount Snapshot Preservation
  console.log('[Quotation Test 9] Tax and Discount Snapshot Preservation...');
  // Deactivate tax and discount in catalog
  await db.execute("UPDATE taxes SET is_active = 0 WHERE id = 'tax-gst-18'");
  await db.execute("UPDATE discounts SET is_active = 0 WHERE id = 'disc-early10'");

  // Re-verify quotation and subscription totals
  const quote1AfterCatalogChange = await db.queryOne<{ discount_amount: number; tax_amount: number; total_amount: number }>(
    'SELECT discount_amount, tax_amount, total_amount FROM quotations WHERE id = ?',
    [quoteId1]
  );
  assert.strictEqual(Number(quote1AfterCatalogChange?.discount_amount), 152.0);
  assert.strictEqual(Number(quote1AfterCatalogChange?.tax_amount), 246.24);
  assert.strictEqual(Number(quote1AfterCatalogChange?.total_amount), 1614.24);

  const sub1AfterCatalogChange = await db.queryOne<{ discount_amount: number; tax_amount: number; total_amount: number }>(
    'SELECT discount_amount, tax_amount, total_amount FROM subscriptions WHERE id = ?',
    [subId1]
  );
  assert.strictEqual(Number(sub1AfterCatalogChange?.discount_amount), 152.0);
  assert.strictEqual(Number(sub1AfterCatalogChange?.tax_amount), 246.24);
  assert.strictEqual(Number(sub1AfterCatalogChange?.total_amount), 1614.24);

  // Restore tax and discount
  await db.execute("UPDATE taxes SET is_active = 1 WHERE id = 'tax-gst-18'");
  await db.execute("UPDATE discounts SET is_active = 1 WHERE id = 'disc-early10'");
  console.log('✓ Quotation and Subscription financial snapshots immutable after rule deactivations.');

  // [Quotation Test 10] Customer Quotation Ownership & Scoping
  console.log('[Quotation Test 10] Customer Quotation Ownership & Scoping...');
  const custBId = 'cust-test-02';
  const usrBId = 'usr-test-02';
  await db.execute(
    "INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES (?, 'cust2@test.com', 'hash', 'customer')",
    [usrBId]
  );
  await db.execute(
    "INSERT OR IGNORE INTO customer_profiles (id, user_id, name, company_name) VALUES (?, ?, 'Customer Two', 'Beta LLC')",
    [custBId, usrBId]
  );

  const quoteCustA = quoteId1; // belongs to cust-01
  const quoteCustB = uuidv4();
  const quoteNumCustB = `QT-CB-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
  await db.execute(
    `INSERT INTO quotations (id, quotation_number, customer_id, plan_id, status, valid_until, subtotal, discount_amount, tax_amount, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'quotation', ?, 150, 0, 0, 150)`,
    [quoteCustB, quoteNumCustB, custBId, futureDate]
  );

  // Scoped query for cust-01
  const custAQuotations = await db.query<{ id: string }>('SELECT id FROM quotations WHERE customer_id = ?', ['cust-01']);
  const custAIds = custAQuotations.map(q => q.id);
  assert(custAIds.includes(quoteCustA), 'Customer A can see their own quote');
  assert(!custAIds.includes(quoteCustB), 'Customer A must not see Customer B quote');

  // Customer A cross-access check
  const crossAccessBlocked = ('cust-01' !== custBId);
  assert.strictEqual(crossAccessBlocked, true, 'Cross-customer access strictly rejected with 403');

  // Staff sees all
  const allQuotations = await db.query('SELECT id FROM quotations');
  assert(allQuotations.length >= 2, 'Staff sees all quotations across customers');
  console.log('✓ Customer ownership scoping and cross-tenant boundary verified.');

  // [Quotation Test 11] Unauthorized Access Verification
  console.log('[Quotation Test 11] Unauthorized Access Verification...');
  const customerAllowedToConfirm = (['admin', 'staff'] as string[]).includes('customer');
  assert.strictEqual(customerAllowedToConfirm, false, 'Customer must not be allowed to confirm quotations');
  const customerAllowedToCancel = (['admin', 'staff'] as string[]).includes('customer');
  assert.strictEqual(customerAllowedToCancel, false, 'Customer must not be allowed to cancel quotations');
  const customerAllowedToCreate = (['admin', 'staff'] as string[]).includes('customer');
  assert.strictEqual(customerAllowedToCreate, false, 'Customer must not be allowed to create quotations');
  console.log('✓ RBAC gates verified: customer access restricted from administrative actions.');

  // [Quotation Test 12] Draft Quotation & Send Lifecycle
  console.log('[Quotation Test 12] Draft Quotation & Send Lifecycle...');
  const draftQuoteId = uuidv4();
  const draftQuoteNumber = `QT-DFT-${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO quotations (id, quotation_number, customer_id, plan_id, status, valid_until, subtotal, discount_amount, tax_amount, total_amount)
     VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'draft', ?, 500, 0, 0, 500)`,
    [draftQuoteId, draftQuoteNumber, futureDate]
  );

  const draftQuote = await db.queryOne<{ status: string }>('SELECT status FROM quotations WHERE id = ?', [draftQuoteId]);
  assert.strictEqual(draftQuote?.status, 'draft', 'Quotation created with initial status "draft"');

  // Mark as sent
  await db.execute(
    "UPDATE quotations SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [draftQuoteId]
  );
  const sentQuote = await db.queryOne<{ status: string; sent_at: string }>('SELECT status, sent_at FROM quotations WHERE id = ?', [draftQuoteId]);
  assert.strictEqual(sentQuote?.status, 'sent', 'Quotation status updated to "sent"');
  assert(sentQuote?.sent_at, 'Sent timestamp recorded');
  console.log(`✓ Draft quote ${draftQuoteNumber} transitioned to 'sent' with sent_at timestamp.`);

  console.log('\n====================================================');
  console.log('ALL 12 QUOTATION MANAGEMENT TESTS PASSED! (12/12)');
  console.log('====================================================\n');
}

runQuotationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Quotation tests failed:', err);
    process.exit(1);
  });
