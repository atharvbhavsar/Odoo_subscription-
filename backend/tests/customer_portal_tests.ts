import assert from 'assert';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app';
import { db } from '../src/config/database';
import { runMigrations } from '../src/config/migrate';
import { runSeeds } from '../src/config/seed';

async function runCustomerPortalTests() {
  console.log('====================================================');
  console.log('STARTING CUSTOMER PORTAL & SELF-SERVICE TEST SUITE');
  console.log('====================================================\n');

  await runMigrations();
  await runSeeds();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  try {
    // ----------------------------------------------------
    // SETUP TEST FIXTURES & SESSIONS
    // ----------------------------------------------------
    const today = new Date().toISOString().split('T')[0];

    // Customer A (pre-seeded 'customer@acme.com' / 'Password@123', cust-01)
    const loginResA = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'customer@acme.com', password: 'Password@123' }),
    });
    assert.strictEqual(loginResA.status, 200, 'Customer A login succeeds');
    const cookieA = loginResA.headers.get('set-cookie')?.split(';')[0] || '';
    assert(cookieA, 'Customer A session cookie retrieved');

    // Customer B (create dedicated second customer)
    const custBEmail = `customer.b.${Date.now()}.${Math.floor(Math.random() * 1000)}@example.com`;
    const custBPassword = 'Password@123';

    const regResB = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: custBEmail,
        password: custBPassword,
        name: 'Beta Customer',
      }),
    });
    assert.strictEqual(regResB.status, 201, 'Customer B register succeeds');
    const cookieB = regResB.headers.get('set-cookie')?.split(';')[0] || '';
    const regBJson = (await regResB.json()) as any;
    const actualCustBProfileId = regBJson.data?.user?.customerId;
    assert(actualCustBProfileId, 'Customer B customerId generated');

    // Create a plan with can_pause=0, can_renew=0, can_close_early=0
    const restrictedPlanId = `plan-restr-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
    await db.execute(
      `INSERT INTO plans (id, name, billing_frequency, price, min_qty, is_active, can_pause, can_renew, can_close_early)
       VALUES (?, 'Restricted Plan', 'monthly', 100.00, 1, 1, 0, 0, 0)`,
      [restrictedPlanId]
    );

    // Create Subscriptions for Customer A
    const subAActiveId = uuidv4();
    const subAActiveNum = `SUB-A-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
    await db.execute(
      `INSERT INTO subscriptions (
        id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency,
        subtotal, total_amount
      ) VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'active', '2026-10-01', '2026-11-01', 'monthly', 200.00, 200.00)`,
      [subAActiveId, subAActiveNum]
    );
    await db.execute(
      `INSERT INTO subscription_lines (id, subscription_id, product_id, quantity, unit_price, subtotal)
       VALUES (?, ?, 'prod-01', 1, 200.00, 200.00)`,
      [uuidv4(), subAActiveId]
    );

    const subARestrictedId = uuidv4();
    const subARestrictedNum = `SUB-A-R-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
    await db.execute(
      `INSERT INTO subscriptions (
        id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency,
        subtotal, total_amount
      ) VALUES (?, ?, 'cust-01', ?, 'active', '2026-10-01', '2026-11-01', 'monthly', 100.00, 100.00)`,
      [subARestrictedId, subARestrictedNum, restrictedPlanId]
    );

    const subAClosedId = uuidv4();
    const subAClosedNum = `SUB-A-CLS-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
    await db.execute(
      `INSERT INTO subscriptions (
        id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency,
        subtotal, total_amount
      ) VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'closed', '2026-01-01', '2026-02-01', 'monthly', 200.00, 200.00)`,
      [subAClosedId, subAClosedNum]
    );

    const subAExpiredId = uuidv4();
    const subAExpiredNum = `SUB-A-EXP-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
    await db.execute(
      `INSERT INTO subscriptions (
        id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency,
        subtotal, total_amount
      ) VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'expired', '2026-01-01', '2026-02-01', 'monthly', 200.00, 200.00)`,
      [subAExpiredId, subAExpiredNum]
    );

    // Create Subscription for Customer B
    const subBActiveId = uuidv4();
    const subBActiveNum = `SUB-B-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
    await db.execute(
      `INSERT INTO subscriptions (
        id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency,
        subtotal, total_amount
      ) VALUES (?, ?, ?, 'plan-monthly-01', 'active', '2026-10-01', '2026-11-01', 'monthly', 200.00, 200.00)`,
      [subBActiveId, subBActiveNum, actualCustBProfileId]
    );

    // Create Quotations for Customer A & Customer B
    const quoteAId = uuidv4();
    const quoteANum = `QT-A-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
    await db.execute(
      `INSERT INTO quotations (
        id, quotation_number, customer_id, plan_id, status, valid_until, subtotal, total_amount
      ) VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'quotation', '2026-12-31', 200.00, 200.00)`,
      [quoteAId, quoteANum]
    );
    await db.execute(
      `INSERT INTO quotation_lines (id, quotation_id, product_id, quantity, unit_price, subtotal)
       VALUES (?, ?, 'prod-01', 1, 200.00, 200.00)`,
      [uuidv4(), quoteAId]
    );

    const quoteBId = uuidv4();
    const quoteBNum = `QT-B-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
    await db.execute(
      `INSERT INTO quotations (
        id, quotation_number, customer_id, plan_id, status, valid_until, subtotal, total_amount
      ) VALUES (?, ?, ?, 'plan-monthly-01', 'quotation', '2026-12-31', 200.00, 200.00)`,
      [quoteBId, quoteBNum, actualCustBProfileId]
    );

    // ----------------------------------------------------
    // TEST 1: Customer can view their own subscriptions
    // ----------------------------------------------------
    console.log('[Test 1] Customer can view their own subscriptions...');
    const subsRes = await fetch(`${baseUrl}/subscriptions`, {
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(subsRes.status, 200, 'GET /subscriptions returns 200 OK');
    const subsJson = (await subsRes.json()) as any;
    const subIds = subsJson.data.map((s: any) => s.id);
    assert(subIds.includes(subAActiveId), 'Customer A can see subAActive');
    assert(subIds.includes(subAClosedId), 'Customer A can see subAClosed');
    assert(!subIds.includes(subBActiveId), 'Customer A MUST NOT see Customer B subscription');

    // Detailed single view
    const subDetailRes = await fetch(`${baseUrl}/subscriptions/${subAActiveId}`, {
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(subDetailRes.status, 200, 'GET /subscriptions/:id returns 200 OK');
    const subDetailJson = (await subDetailRes.json()) as any;
    assert.strictEqual(subDetailJson.data.id, subAActiveId);
    assert(subDetailJson.data.lines && subDetailJson.data.lines.length > 0, 'Subscription lines populated');
    console.log('✓ Customer can view their own subscriptions and details.\n');

    // ----------------------------------------------------
    // TEST 2: Customer cannot view another customer's subscriptions
    // ----------------------------------------------------
    console.log('[Test 2] Customer cannot view another customer subscriptions (403 Forbidden)...');
    const crossSubRes = await fetch(`${baseUrl}/subscriptions/${subBActiveId}`, {
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(crossSubRes.status, 403, 'Cross-tenant subscription access rejected with 403');
    const crossSubJson = (await crossSubRes.json()) as any;
    assert.strictEqual(crossSubJson.error.code, 'FORBIDDEN');
    console.log('✓ Cross-tenant subscription access strictly blocked by backend security boundary.\n');

    // ----------------------------------------------------
    // TEST 3: Customer can view their own quotations
    // ----------------------------------------------------
    console.log('[Test 3] Customer can view their own quotations...');
    const quotesRes = await fetch(`${baseUrl}/quotations`, {
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(quotesRes.status, 200, 'GET /quotations returns 200 OK');
    const quotesJson = (await quotesRes.json()) as any;
    const quoteIds = quotesJson.data.map((q: any) => q.id);
    assert(quoteIds.includes(quoteAId), 'Customer A can see their own quotation');
    assert(!quoteIds.includes(quoteBId), 'Customer A MUST NOT see Customer B quotation');

    const quoteDetailRes = await fetch(`${baseUrl}/quotations/${quoteAId}`, {
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(quoteDetailRes.status, 200, 'GET /quotations/:id returns 200 OK');
    const quoteDetailJson = (await quoteDetailRes.json()) as any;
    assert.strictEqual(quoteDetailJson.data.id, quoteAId);
    assert(quoteDetailJson.data.lines && quoteDetailJson.data.lines.length > 0, 'Quotation line items included');
    console.log('✓ Customer can view their own quotations and line items.\n');

    // ----------------------------------------------------
    // TEST 4: Customer cannot view another customer's quotations
    // ----------------------------------------------------
    console.log('[Test 4] Customer cannot view another customer quotations (403 Forbidden)...');
    const crossQuoteRes = await fetch(`${baseUrl}/quotations/${quoteBId}`, {
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(crossQuoteRes.status, 403, 'Cross-tenant quotation access rejected with 403');
    const crossQuoteJson = (await crossQuoteRes.json()) as any;
    assert.strictEqual(crossQuoteJson.error.code, 'FORBIDDEN');
    console.log('✓ Cross-tenant quotation access strictly rejected by backend security boundary.\n');

    // ----------------------------------------------------
    // TEST 5: Pause and resume permissions
    // ----------------------------------------------------
    console.log('[Test 5] Pause and resume lifecycle transitions & policy enforcement...');
    // 5a. Customer A pauses active subscription (plan.can_pause=1)
    const pauseRes = await fetch(`${baseUrl}/subscriptions/${subAActiveId}/pause`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(pauseRes.status, 200, 'Pause succeeds for active subscription');
    const pauseJson = (await pauseRes.json()) as any;
    assert.strictEqual(pauseJson.data.status, 'paused');

    // 5b. Customer A resumes paused subscription
    const resumeRes = await fetch(`${baseUrl}/subscriptions/${subAActiveId}/resume`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(resumeRes.status, 200, 'Resume succeeds for paused subscription');
    const resumeJson = (await resumeRes.json()) as any;
    assert.strictEqual(resumeJson.data.status, 'active');

    // 5c. Customer attempts to pause a subscription with can_pause=0
    const invalidPauseRes = await fetch(`${baseUrl}/subscriptions/${subARestrictedId}/pause`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(invalidPauseRes.status, 400, 'Rejects pause when plan.can_pause=0');
    const invalidPauseJson = (await invalidPauseRes.json()) as any;
    assert.strictEqual(invalidPauseJson.error.code, 'PAUSE_NOT_ALLOWED');

    // 5d. Customer attempts to pause Customer B's subscription
    const crossPauseRes = await fetch(`${baseUrl}/subscriptions/${subBActiveId}/pause`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(crossPauseRes.status, 403, 'Cross-customer pause rejected with 403');
    console.log('✓ Pause and resume policies validated with RBAC & plan constraints.\n');

    // ----------------------------------------------------
    // TEST 6: Renewal eligibility
    // ----------------------------------------------------
    console.log('[Test 6] Subscription renewal eligibility & plan policy...');
    // 6a. Renew eligible subscription (can_renew=1)
    const renewRes = await fetch(`${baseUrl}/subscriptions/${subAActiveId}/renew`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(renewRes.status, 200, 'Renew succeeds for eligible subscription');
    const renewJson = (await renewRes.json()) as any;
    assert.strictEqual(renewJson.data.status, 'active');
    assert.strictEqual(renewJson.data.next_billing_date, today);

    // 6b. Renew subscription where can_renew=0
    const invalidRenewRes = await fetch(`${baseUrl}/subscriptions/${subARestrictedId}/renew`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(invalidRenewRes.status, 400, 'Rejects renewal when plan.can_renew=0');
    const invalidRenewJson = (await invalidRenewRes.json()) as any;
    assert.strictEqual(invalidRenewJson.error.code, 'RENEW_NOT_ALLOWED');

    // 6c. Cross-customer renewal attempt
    const crossRenewRes = await fetch(`${baseUrl}/subscriptions/${subBActiveId}/renew`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(crossRenewRes.status, 403, 'Cross-customer renewal rejected with 403');
    console.log('✓ Renewal policies and cross-tenant guards verified.\n');

    // ----------------------------------------------------
    // TEST 7: Early closure eligibility
    // ----------------------------------------------------
    console.log('[Test 7] Early closure eligibility...');
    // 7a. Customer attempts early close when can_close_early=0
    const invalidCloseRes = await fetch(`${baseUrl}/subscriptions/${subARestrictedId}/close`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(invalidCloseRes.status, 400, 'Rejects closure when plan.can_close_early=0');
    const invalidCloseJson = (await invalidCloseRes.json()) as any;
    assert.strictEqual(invalidCloseJson.error.code, 'CLOSE_NOT_ALLOWED');

    // 7b. Customer closes subscription where can_close_early=1
    const closeRes = await fetch(`${baseUrl}/subscriptions/${subAActiveId}/close`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(closeRes.status, 200, 'Early close succeeds when allowed');
    const closeJson = (await closeRes.json()) as any;
    assert.strictEqual(closeJson.data.status, 'closed');
    console.log('✓ Early closure permissions verified.\n');

    // ----------------------------------------------------
    // TEST 8: Closed and expired subscription restrictions
    // ----------------------------------------------------
    console.log('[Test 8] Closed and expired subscription restrictions...');
    // 8a. Closing already closed subscription
    const recloseRes = await fetch(`${baseUrl}/subscriptions/${subAClosedId}/close`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(recloseRes.status, 400, 'Rejects closing already closed subscription');
    const recloseJson = (await recloseRes.json()) as any;
    assert.strictEqual(recloseJson.error.code, 'ALREADY_CLOSED');

    // 8b. Renewing closed subscription
    const renewClosedRes = await fetch(`${baseUrl}/subscriptions/${subAClosedId}/renew`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(renewClosedRes.status, 400, 'Rejects renewing closed subscription');
    const renewClosedJson = (await renewClosedRes.json()) as any;
    assert.strictEqual(renewClosedJson.error.code, 'CANNOT_RENEW_CLOSED');

    // 8c. Pausing closed subscription
    const pauseClosedRes = await fetch(`${baseUrl}/subscriptions/${subAClosedId}/pause`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(pauseClosedRes.status, 400, 'Rejects pausing closed subscription');

    // 8d. Closing expired subscription
    const closeExpiredRes = await fetch(`${baseUrl}/subscriptions/${subAExpiredId}/close`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(closeExpiredRes.status, 400, 'Rejects closing expired subscription');
    const closeExpiredJson = (await closeExpiredRes.json()) as any;
    assert.strictEqual(closeExpiredJson.error.code, 'ALREADY_EXPIRED');

    // 8e. Pausing expired subscription
    const pauseExpiredRes = await fetch(`${baseUrl}/subscriptions/${subAExpiredId}/pause`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(pauseExpiredRes.status, 400, 'Rejects pausing expired subscription');
    console.log('✓ Closed and expired subscription action restrictions strictly enforced.\n');

    // ----------------------------------------------------
    // TEST 9: Add-on ownership and self-service management
    // ----------------------------------------------------
    console.log('[Test 9] Add-on ownership & self-service management...');
    // Create new active subscription for add-on tests
    const subAddonId = uuidv4();
    const subAddonNum = `SUB-ADD-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 10000)}`;
    await db.execute(
      `INSERT INTO subscriptions (
        id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency,
        subtotal, total_amount
      ) VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'active', '2026-10-01', '2026-11-01', 'monthly', 200.00, 200.00)`,
      [subAddonId, subAddonNum]
    );

    // 9a. Customer A schedules add-on for their own subscription
    const addAddonRes = await fetch(`${baseUrl}/subscriptions/${subAddonId}/addons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        product_id: 'prod-02',
        quantity: 2,
      }),
    });
    assert.strictEqual(addAddonRes.status, 201, 'Add-on addition succeeds');
    const addAddonJson = (await addAddonRes.json()) as any;
    const addonId = addAddonJson.data.id;
    assert.strictEqual(addAddonJson.data.quantity, 2);
    assert.strictEqual(addAddonJson.data.unit_price, 50.00, 'Authoritative product price used');

    // 9b. Customer A updates add-on quantity
    const updateAddonRes = await fetch(`${baseUrl}/subscriptions/${subAddonId}/addons/${addonId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ quantity: 3 }),
    });
    assert.strictEqual(updateAddonRes.status, 200, 'Add-on quantity updated');
    const updateAddonJson = (await updateAddonRes.json()) as any;
    assert.strictEqual(updateAddonJson.data.quantity, 3);

    // 9c. Customer A schedules add-on removal
    const removeAddonRes = await fetch(`${baseUrl}/subscriptions/${subAddonId}/addons/${addonId}/remove`, {
      method: 'PATCH',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(removeAddonRes.status, 200, 'Add-on removal scheduled');
    const removeAddonJson = (await removeAddonRes.json()) as any;
    assert.strictEqual(removeAddonJson.data.status, 'pending_removal');

    // 9d. Cross-customer add-on attack (Customer A attacks Customer B subscription)
    const crossAddonRes = await fetch(`${baseUrl}/subscriptions/${subBActiveId}/addons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ product_id: 'prod-02', quantity: 1 }),
    });
    assert.strictEqual(crossAddonRes.status, 403, 'Cross-tenant add-on creation rejected with 403');
    console.log('✓ Add-on operations and ownership security boundary verified.\n');

    // ----------------------------------------------------
    // TEST 10: Quotation confirmation and expiry behavior
    // ----------------------------------------------------
    console.log('[Test 10] Quotation confirmation and expiry behavior...');
    // 10a. Customer attempts to confirm quotation
    const custConfirmRes = await fetch(`${baseUrl}/quotations/${quoteAId}/confirm`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(custConfirmRes.status, 403, 'Customer role strictly forbidden from confirming quotations');
    const custConfirmJson = (await custConfirmRes.json()) as any;
    assert.strictEqual(custConfirmJson.error.code, 'FORBIDDEN');

    // 10b. Expiry check in database
    const pastDate = '2025-01-01';
    const expiredQuoteId = uuidv4();
    const expiredQuoteNum = `QT-EXP-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 10000)}`;
    await db.execute(
      `INSERT INTO quotations (
        id, quotation_number, customer_id, plan_id, status, valid_until, subtotal, total_amount
      ) VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'quotation', ?, 200.00, 200.00)`,
      [expiredQuoteId, expiredQuoteNum, pastDate]
    );

    const expiredRes = await fetch(`${baseUrl}/quotations/${expiredQuoteId}`, {
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(expiredRes.status, 200);
    const expiredJson = (await expiredRes.json()) as any;
    assert.strictEqual(expiredJson.data.valid_until, pastDate);
    console.log('✓ Customer quotation confirmation restrictions and validity dates verified.\n');

    // ----------------------------------------------------
    // TEST 11: Unauthorized API access
    // ----------------------------------------------------
    console.log('[Test 11] Unauthorized API access rejections...');
    // 11a. Unauthenticated calls
    const unauthSub = await fetch(`${baseUrl}/subscriptions`);
    assert.strictEqual(unauthSub.status, 401, 'Unauthenticated /subscriptions returns 401');

    const unauthQuote = await fetch(`${baseUrl}/quotations`);
    assert.strictEqual(unauthQuote.status, 401, 'Unauthenticated /quotations returns 401');

    // 11b. Customer calling administrative endpoints
    const adminBillingRes = await fetch(`${baseUrl}/billing/run`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    assert.strictEqual(adminBillingRes.status, 403, 'Customer calling /billing/run returns 403');

    const adminProductRes = await fetch(`${baseUrl}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ name: 'Hacked Product', sales_price: 10 }),
    });
    assert.strictEqual(adminProductRes.status, 403, 'Customer calling POST /products returns 403');

    const adminPlanRes = await fetch(`${baseUrl}/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ name: 'Hacked Plan', billing_frequency: 'monthly', price: 10 }),
    });
    assert.strictEqual(adminPlanRes.status, 403, 'Customer calling POST /plans returns 403');
    console.log('✓ All unauthorized and unauthenticated API calls strictly rejected.\n');

    console.log('====================================================');
    console.log('ALL 11 CUSTOMER PORTAL & SELF-SERVICE TESTS PASSED!');
    console.log('====================================================\n');
  } finally {
    server.close();
  }
}

runCustomerPortalTests().catch((err) => {
  console.error('Customer Portal Test Suite failed:', err);
  process.exit(1);
});
