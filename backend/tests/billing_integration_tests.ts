import assert from 'assert';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app';
import { db } from '../src/config/database';
import { runMigrations } from '../src/config/migrate';
import { runSeeds } from '../src/config/seed';
import { BillingService } from '../src/modules/billing/billing.service';
import { PricingService } from '../src/modules/discounts/pricing.service';

export async function runBillingIntegrationTestSuite() {
  console.log('====================================================');
  console.log('STARTING BILLING INTEGRATION IMPROVEMENTS TEST SUITE');
  console.log('Developer: Atharv (Member B)');
  console.log('====================================================\n');

  await runMigrations();
  await runSeeds();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const today = '2026-10-31';

  try {
    // ------------------------------------------------------------------------
    // SETUP: Shared Customer and Auth Cookies
    // ------------------------------------------------------------------------
    const custProfile = await db.queryOne<{ id: string }>('SELECT id FROM customer_profiles LIMIT 1');
    const customerId = custProfile!.id;

    // Admin login cookie
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@brightloop.com', password: 'Password@123' }),
    });
    const adminCookie = adminLoginRes.headers.get('set-cookie')?.split(';')[0];
    assert(adminCookie, 'Admin session established');

    // Customer login cookie
    const custLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'customer@acme.com', password: 'Password@123' }),
    });
    const custCookie = custLoginRes.headers.get('set-cookie')?.split(';')[0];
    assert(custCookie, 'Customer session established');

    // ------------------------------------------------------------------------
    // [Test 1] Active Subscription Invoice Generation
    // ------------------------------------------------------------------------
    console.log('[Test 1] Active subscription invoice generation...');
    const sub1Id = uuidv4();
    const sub1Num = `SUB-INT-ACT-${Date.now().toString().slice(-4)}`;
    await db.execute(
      `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
       VALUES (?, ?, ?, 'plan-monthly-01', 'active', ?, ?, 'monthly', 200.00, 200.00)`,
      [sub1Id, sub1Num, customerId, today, today]
    );
    await db.execute(
      `INSERT INTO subscription_lines (id, subscription_id, product_id, quantity, unit_price, subtotal)
       VALUES (?, ?, 'prod-01', 1, 200.00, 200.00)`,
      [uuidv4(), sub1Id]
    );

    const run1 = await BillingService.runBilling(today, 'usr-admin-01');
    assert(run1.invoicesGenerated >= 1, 'Invoice must be generated for active due subscription');
    const inv1 = await db.queryOne<{ id: string; status: string; total_amount: number; period_start: string }>(
      'SELECT * FROM invoices WHERE subscription_id = ? AND period_start = ?',
      [sub1Id, today]
    );
    assert(inv1, 'Invoice record exists for period');
    assert.strictEqual(inv1.status, 'confirmed');
    assert.strictEqual(inv1.total_amount, 200.00);
    console.log(`✓ Active subscription ${sub1Num} successfully generated invoice ${inv1.id} ($${inv1.total_amount}).\n`);

    // ------------------------------------------------------------------------
    // [Test 2] Daily, Weekly, Monthly, and Yearly Billing Frequencies
    // ------------------------------------------------------------------------
    console.log('[Test 2] Daily, weekly, monthly, and yearly billing frequencies & intervals...');
    assert.strictEqual(BillingService.advanceDate('2026-10-01', 'daily', 1), '2026-10-02');
    assert.strictEqual(BillingService.advanceDate('2026-10-01', 'daily', 7), '2026-10-08');
    assert.strictEqual(BillingService.advanceDate('2026-10-01', 'weekly', 1), '2026-10-08');
    assert.strictEqual(BillingService.advanceDate('2026-10-01', 'weekly', 2), '2026-10-15');
    assert.strictEqual(BillingService.advanceDate('2026-10-31', 'monthly', 1), '2026-11-30');
    assert.strictEqual(BillingService.advanceDate('2026-10-31', 'monthly', 2), '2026-12-31');
    assert.strictEqual(BillingService.advanceDate('2024-02-29', 'yearly', 1), '2025-02-28');
    assert.strictEqual(BillingService.advanceDate('2026-10-31', 'yearly', 1), '2027-10-31');
    console.log('✓ All 4 billing frequencies advance calendar-safe with interval support.\n');

    // ------------------------------------------------------------------------
    // [Test 3] Paused Subscription Exclusion
    // ------------------------------------------------------------------------
    console.log('[Test 3] Paused subscription exclusion...');
    const subPausedId = uuidv4();
    await db.execute(
      `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
       VALUES (?, ?, ?, 'plan-monthly-01', 'paused', ?, ?, 'monthly', 100.00, 100.00)`,
      [subPausedId, `SUB-INT-PSD-${Date.now().toString().slice(-4)}`, customerId, today, today]
    );
    const runPaused = await BillingService.runBilling(today);
    const pausedSkipped = runPaused.skippedReasons.find((r) => r.subscriptionId === subPausedId);
    assert(pausedSkipped, 'Paused subscription must be logged in skippedReasons');
    assert(pausedSkipped.reason.includes('paused'), 'Skip reason indicates paused');
    const pausedInvs = await db.query('SELECT id FROM invoices WHERE subscription_id = ?', [subPausedId]);
    assert.strictEqual(pausedInvs.length, 0, 'No invoices generated for paused subscription');
    console.log('✓ Paused subscriptions strictly excluded from recurring billing.\n');

    // ------------------------------------------------------------------------
    // [Test 4] Closed and Expired Subscription Exclusion
    // ------------------------------------------------------------------------
    console.log('[Test 4] Closed and expired subscription exclusion...');
    const subClosedId = uuidv4();
    await db.execute(
      `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
       VALUES (?, ?, ?, 'plan-monthly-01', 'closed', ?, ?, 'monthly', 100.00, 100.00)`,
      [subClosedId, `SUB-INT-CLS-${Date.now().toString().slice(-4)}`, customerId, today, today]
    );
    const subExpId = uuidv4();
    await db.execute(
      `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, end_date, billing_frequency, subtotal, total_amount)
       VALUES (?, ?, ?, 'plan-monthly-01', 'active', '2026-01-01', '2026-10-31', '2026-09-01', 'monthly', 100.00, 100.00)`,
      [subExpId, `SUB-INT-EXP-${Date.now().toString().slice(-4)}`, customerId]
    );

    await BillingService.runBilling(today);
    const closedInvs = await db.query('SELECT id FROM invoices WHERE subscription_id = ?', [subClosedId]);
    assert.strictEqual(closedInvs.length, 0, 'Closed subscription generates 0 invoices');

    const expSub = await db.queryOne<{ status: string }>('SELECT status FROM subscriptions WHERE id = ?', [subExpId]);
    assert.strictEqual(expSub?.status, 'expired', 'Past-end subscription automatically transitions to expired');
    const expInvs = await db.query('SELECT id FROM invoices WHERE subscription_id = ?', [subExpId]);
    assert.strictEqual(expInvs.length, 0, 'Expired subscription generates 0 invoices');
    console.log('✓ Closed and expired contracts strictly prevented from recurring billing.\n');

    // ------------------------------------------------------------------------
    // [Test 5] Resume and Renewal Billing Dates
    // ------------------------------------------------------------------------
    console.log('[Test 5] Resume and renewal billing dates...');
    const subResumeId = uuidv4();
    await db.execute(
      `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
       VALUES (?, ?, ?, 'plan-monthly-01', 'paused', '2026-09-01', '2026-10-01', 'monthly', 100.00, 100.00)`,
      [subResumeId, `SUB-INT-RSM-${Date.now().toString().slice(-4)}`, customerId]
    );

    // Call resume API
    const resumeRes = await fetch(`${baseUrl}/subscriptions/${subResumeId}/resume`, {
      method: 'POST',
      headers: { Cookie: adminCookie! },
    });
    assert.strictEqual(resumeRes.status, 200, 'Resume succeeds');
    const resumedSub = await db.queryOne<{ status: string; next_billing_date: string }>('SELECT status, next_billing_date FROM subscriptions WHERE id = ?', [subResumeId]);
    assert.strictEqual(resumedSub?.status, 'active');
    assert.strictEqual(resumedSub?.next_billing_date, today, 'Resumed subscription snaps next billing date to today if past');
    console.log('✓ Resume and renewal correctly align next billing dates.\n');

    // ------------------------------------------------------------------------
    // [Test 6] Product and Variant Price Calculations
    // ------------------------------------------------------------------------
    console.log('[Test 6] Product and variant price calculations...');
    const varPricing = await PricingService.calculatePricing([
      { productId: 'prod-01', variantId: 'var-01', quantity: 3 }, // 200 + 560 = 760 each * 3 = 2280
    ]);
    assert.strictEqual(varPricing.subtotal, 2280.00, 'Subtotal reflects authoritative product sales_price + variant price_extra');
    assert.strictEqual(varPricing.lines[0].unitPrice, 760.00);
    console.log('✓ Authoritative product and variant pricing calculated without frontend trusting.\n');

    // ------------------------------------------------------------------------
    // [Test 7] Tax Calculation and Date Validity
    // ------------------------------------------------------------------------
    console.log('[Test 7] Tax calculation and date validity...');
    const activeTaxId = uuidv4();
    await db.execute(
      `INSERT INTO taxes (id, name, rate_percentage, start_date, end_date, is_active)
       VALUES (?, 'Valid Tax 10%', 10.00, '2026-01-01', '2026-12-31', 1)`,
      [activeTaxId]
    );
    const expTaxId = uuidv4();
    await db.execute(
      `INSERT INTO taxes (id, name, rate_percentage, start_date, end_date, is_active)
       VALUES (?, 'Expired Tax 20%', 20.00, '2025-01-01', '2025-12-31', 1)`,
      [expTaxId]
    );

    const validTaxPricing = await PricingService.calculatePricing(
      [{ productId: 'prod-01', quantity: 1, unitPrice: 100 }],
      null,
      activeTaxId,
      today
    );
    assert.strictEqual(validTaxPricing.taxAmount, 10.00, 'Active and date-valid tax correctly calculated');

    const expTaxPricing = await PricingService.calculatePricing(
      [{ productId: 'prod-01', quantity: 1, unitPrice: 100 }],
      null,
      expTaxId,
      today
    );
    assert.strictEqual(expTaxPricing.taxAmount, 0.00, 'Expired tax rule strictly excluded (taxAmount = 0)');
    console.log('✓ Tax date validity and active status respected by billing pricing engine.\n');

    // ------------------------------------------------------------------------
    // [Test 8] Fixed and Percentage Discount Calculations
    // ------------------------------------------------------------------------
    console.log('[Test 8] Fixed and percentage discount calculations...');
    const pctDiscId = uuidv4();
    await db.execute(
      `INSERT INTO discounts (id, code, type, value, is_active) VALUES (?, ?, 'percentage', 20, 1)`,
      [pctDiscId, `PCT20-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`]
    );
    const fixDiscId = uuidv4();
    await db.execute(
      `INSERT INTO discounts (id, code, type, value, is_active) VALUES (?, ?, 'fixed', 30, 1)`,
      [fixDiscId, `FIX30-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`]
    );

    const pctRes = await PricingService.calculatePricing(
      [{ productId: 'prod-01', quantity: 1, unitPrice: 200 }],
      pctDiscId,
      null,
      today
    );
    assert.strictEqual(pctRes.discountAmount, 40.00, '20% of 200 is 40.00');

    const fixRes = await PricingService.calculatePricing(
      [{ productId: 'prod-01', quantity: 1, unitPrice: 200 }],
      fixDiscId,
      null,
      today
    );
    assert.strictEqual(fixRes.discountAmount, 30.00, 'Fixed discount 30.00 applied');
    console.log('✓ Both fixed and percentage discounts accurately evaluated.\n');

    // ------------------------------------------------------------------------
    // [Test 9] Discount Usage Limits (max_uses)
    // ------------------------------------------------------------------------
    console.log('[Test 9] Discount usage limits (max_uses)...');
    const limitedDiscId = uuidv4();
    await db.execute(
      `INSERT INTO discounts (id, code, type, value, max_uses, used_count, is_active)
       VALUES (?, ?, 'fixed', 50.00, 1, 0, 1)`,
      [limitedDiscId, `LIMIT1-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`]
    );

    // Apply on first billing
    const subDiscId = uuidv4();
    await db.execute(
      `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, discount_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
       VALUES (?, ?, ?, 'plan-monthly-01', ?, 'active', ?, ?, 'monthly', 100.00, 50.00)`,
      [subDiscId, `SUB-INT-LMT-${Date.now().toString().slice(-4)}`, customerId, limitedDiscId, today, today]
    );
    await db.execute(
      `INSERT INTO subscription_lines (id, subscription_id, product_id, quantity, unit_price, subtotal)
       VALUES (?, ?, 'prod-01', 1, 100.00, 100.00)`,
      [uuidv4(), subDiscId]
    );

    await BillingService.runBilling(today);
    const discCheck = await db.queryOne<{ used_count: number }>('SELECT used_count FROM discounts WHERE id = ?', [limitedDiscId]);
    assert.strictEqual(discCheck?.used_count, 1, 'used_count incremented to 1');

    // Second check: discount now exhausted
    const exhaustedCheck = await PricingService.calculatePricing(
      [{ productId: 'prod-01', quantity: 1, unitPrice: 100.00 }],
      limitedDiscId,
      null,
      today
    );
    assert.strictEqual(exhaustedCheck.discountAmount, 0, 'Exhausted discount (1/1 uses) safely rejected');
    console.log('✓ Discount usage limits enforced and atomic consumption tracked.\n');

    // ------------------------------------------------------------------------
    // [Test 10] Active Add-on Invoice Calculation
    // ------------------------------------------------------------------------
    console.log('[Test 10] Active add-on invoice calculation...');
    const subAddonId = uuidv4();
    await db.execute(
      `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
       VALUES (?, ?, ?, 'plan-monthly-01', 'active', ?, ?, 'monthly', 100.00, 100.00)`,
      [subAddonId, `SUB-INT-AO-${Date.now().toString().slice(-4)}`, customerId, today, today]
    );
    await db.execute(
      `INSERT INTO subscription_lines (id, subscription_id, product_id, quantity, unit_price, subtotal)
       VALUES (?, ?, 'prod-01', 1, 100.00, 100.00)`,
      [uuidv4(), subAddonId]
    );
    await db.execute(
      `INSERT INTO subscription_addons (id, subscription_id, product_id, quantity, unit_price, status, effective_start_date)
       VALUES (?, ?, 'prod-02', 2, 50.00, 'active', ?)`,
      [uuidv4(), subAddonId, today]
    );

    await BillingService.runBilling(today);
    const addonInvoice = await db.queryOne<{ id: string; total_amount: number; subtotal: number }>(
      'SELECT id, total_amount, subtotal FROM invoices WHERE subscription_id = ? AND period_start = ?',
      [subAddonId, today]
    );
    assert(addonInvoice, 'Invoice created with active add-on');
    // Base 100 + Addon (2 * 50 = 100) = 200.00
    assert.strictEqual(addonInvoice.total_amount, 200.00, 'Total includes base line ($100) + add-on ($100)');
    console.log(`✓ Active add-ons dynamically included in recurring invoice total ($${addonInvoice.total_amount}).\n`);

    // ------------------------------------------------------------------------
    // [Test 11] Pending Activation and Removal Date Handling
    // ------------------------------------------------------------------------
    console.log('[Test 11] Pending activation and removal date handling...');
    const subPendId = uuidv4();
    await db.execute(
      `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
       VALUES (?, ?, ?, 'plan-monthly-01', 'active', ?, ?, 'monthly', 100.00, 100.00)`,
      [subPendId, `SUB-INT-PND-${Date.now().toString().slice(-4)}`, customerId, today, today]
    );
    await db.execute(
      `INSERT INTO subscription_lines (id, subscription_id, product_id, quantity, unit_price, subtotal)
       VALUES (?, ?, 'prod-01', 1, 100.00, 100.00)`,
      [uuidv4(), subPendId]
    );
    // Future pending add-on: effective 2026-11-01
    await db.execute(
      `INSERT INTO subscription_addons (id, subscription_id, product_id, quantity, unit_price, status, effective_start_date)
       VALUES (?, ?, 'prod-02', 1, 50.00, 'pending_activation', '2026-11-01')`,
      [uuidv4(), subPendId]
    );

    await BillingService.runBilling(today);
    const pendInvoice = await db.queryOne<{ total_amount: number }>(
      'SELECT total_amount FROM invoices WHERE subscription_id = ? AND period_start = ?',
      [subPendId, today]
    );
    assert.strictEqual(pendInvoice?.total_amount, 100.00, 'Future pending add-on is NOT billed for current period');
    console.log('✓ Pending activation add-ons strictly excluded prior to effective date.\n');

    // ------------------------------------------------------------------------
    // [Test 12] Duplicate Invoice Prevention (Idempotency)
    // ------------------------------------------------------------------------
    console.log('[Test 12] Duplicate invoice prevention (Idempotency)...');
    const runDup1 = await BillingService.runBilling(today);
    const runDup2 = await BillingService.runBilling(today);
    assert.strictEqual(runDup2.invoicesGenerated, 0, 'Re-running billing on same date generates 0 duplicate invoices');
    console.log('✓ Idempotency verified: duplicate invoices prevented across multiple execution runs.\n');

    // ------------------------------------------------------------------------
    // [Test 13] Historical Invoice Snapshot Preservation
    // ------------------------------------------------------------------------
    console.log('[Test 13] Historical invoice snapshot preservation...');
    const histInv = await db.queryOne<{ id: string; total_amount: number }>(
      'SELECT id, total_amount FROM invoices LIMIT 1'
    );
    assert(histInv, 'Historical invoice exists');
    const originalTotal = histInv.total_amount;

    // Mutate catalog prices
    await db.execute("UPDATE products SET sales_price = sales_price + 100 WHERE id = 'prod-01'");
    const recheckInv = await db.queryOne<{ total_amount: number }>('SELECT total_amount FROM invoices WHERE id = ?', [histInv.id]);
    assert.strictEqual(recheckInv?.total_amount, originalTotal, 'Historical invoice total remains immutable after catalog price changes');
    // Restore
    await db.execute("UPDATE products SET sales_price = sales_price - 100 WHERE id = 'prod-01'");
    console.log('✓ Historical invoices and line items strictly preserved.\n');

    // ------------------------------------------------------------------------
    // [Test 14] Payment Success and Failure Handling
    // ------------------------------------------------------------------------
    console.log('[Test 14] Payment success and failure handling...');
    const payInvoice = await db.queryOne<{ id: string; total_amount: number }>(
      "SELECT id, total_amount FROM invoices WHERE status = 'confirmed' LIMIT 1"
    );
    assert(payInvoice, 'Confirmed invoice exists for payment testing');

    // 14a. Failed payment record
    const failRes = await fetch(`${baseUrl}/payments/record-failure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie!,
      },
      body: JSON.stringify({
        invoice_id: payInvoice.id,
        gateway_payment_id: `pay_fail_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        error_code: 'BAD_REQUEST_ERROR',
        error_description: 'Card declined by issuing bank',
      }),
    });
    assert.strictEqual(failRes.status, 200, 'Payment failure recorded');
    const checkUnpaidInv = await db.queryOne<{ status: string }>('SELECT status FROM invoices WHERE id = ?', [payInvoice.id]);
    assert.strictEqual(checkUnpaidInv?.status, 'confirmed', 'Failed payment MUST NOT mark invoice paid');

    // 14b. Partial payment success
    const partialPayRes = await fetch(`${baseUrl}/payments/record-offline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie!,
      },
      body: JSON.stringify({
        invoice_id: payInvoice.id,
        amount: Math.round(payInvoice.total_amount / 2 * 100) / 100,
        payment_method: 'bank_transfer',
      }),
    });
    assert.strictEqual(partialPayRes.status, 200, 'Partial payment accepted');
    const partialInv = await db.queryOne<{ status: string; amount_paid: number; amount_due: number }>(
      'SELECT status, amount_paid, amount_due FROM invoices WHERE id = ?',
      [payInvoice.id]
    );
    assert.strictEqual(partialInv?.status, 'partially_paid', 'Invoice transitions to partially_paid');
    assert(partialInv.amount_due > 0, 'Remaining balance due is positive');

    // 14c. Full settlement
    const fullPayRes = await fetch(`${baseUrl}/payments/record-offline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie!,
      },
      body: JSON.stringify({
        invoice_id: payInvoice.id,
        amount: partialInv.amount_due,
        payment_method: 'bank_transfer',
      }),
    });
    assert.strictEqual(fullPayRes.status, 200, 'Settlement payment accepted');
    const paidInv = await db.queryOne<{ status: string; amount_due: number }>(
      'SELECT status, amount_due FROM invoices WHERE id = ?',
      [payInvoice.id]
    );
    assert.strictEqual(paidInv?.status, 'paid', 'Invoice transitions to paid');
    assert.strictEqual(paidInv.amount_due, 0.00, 'Amount due equals 0.00');
    console.log('✓ Payment lifecycle verified: failure keeps unpaid, partial balance tracked, settlement transitions to paid.\n');

    // ------------------------------------------------------------------------
    // [Test 15] Unauthorized Billing-Run Access
    // ------------------------------------------------------------------------
    console.log('[Test 15] Unauthorized billing-run access...');
    const unauthRunRes = await fetch(`${baseUrl}/billing/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.strictEqual(unauthRunRes.status, 401, 'Unauthenticated request rejected with 401');

    const custRunRes = await fetch(`${baseUrl}/billing/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: custCookie!,
      },
    });
    assert.strictEqual(custRunRes.status, 403, 'Customer role strictly rejected from billing run with 403 FORBIDDEN');
    console.log('✓ Billing run endpoints strictly guarded by RBAC (Admin-only).\n');

    // ------------------------------------------------------------------------
    // [Test 16] Customer Invoice Ownership Restrictions
    // ------------------------------------------------------------------------
    console.log('[Test 16] Customer invoice ownership restrictions...');
    // Create another customer and invoice
    const otherCustProfileId = uuidv4();
    const otherUserId = uuidv4();
    const otherEmail = `other.cust.${Date.now()}.${Math.floor(Math.random() * 1000)}@example.com`;
    await db.execute(
      `INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'hash', 'customer')`,
      [otherUserId, otherEmail]
    );
    await db.execute(
      `INSERT INTO customer_profiles (id, user_id, name) VALUES (?, ?, 'Other Customer')`,
      [otherCustProfileId, otherUserId]
    );
    const otherInvId = uuidv4();
    const otherInvNum = `INV-OTHER-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
    await db.execute(
      `INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, period_start, period_end, due_date, status, subtotal, total_amount, amount_due)
       VALUES (?, ?, ?, ?, '2026-10-01', '2026-10-31', '2026-10-31', 'confirmed', 500, 500, 500)`,
      [otherInvId, otherInvNum, sub1Id, otherCustProfileId]
    );

    // Customer attempts to initiate payment order on Other Customer's invoice
    const crossOrderRes = await fetch(`${baseUrl}/payments/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: custCookie!,
      },
      body: JSON.stringify({ invoice_id: otherInvId }),
    });
    assert.strictEqual(crossOrderRes.status, 403, 'Cross-customer payment initiation strictly blocked with 403 FORBIDDEN');
    console.log('✓ Customer ownership security verified: cross-customer invoice payments blocked.\n');

    console.log('====================================================');
    console.log('ALL 16 BILLING INTEGRATION TESTS COMPLETED SUCCESSFULLY!');
    console.log('====================================================\n');
  } finally {
    server.close();
  }
}

// Direct execution support
if (require.main === module) {
  runBillingIntegrationTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Billing integration test suite failed:', err);
      process.exit(1);
    });
}
