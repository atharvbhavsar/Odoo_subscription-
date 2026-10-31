import assert from 'assert';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app';
import { db } from '../src/config/database';
import { runMigrations } from '../src/config/migrate';
import { runSeeds } from '../src/config/seed';

async function runBillingRunHttpTests() {
  console.log('====================================================');
  console.log('STARTING BILLING-RUN HTTP & REPORTING TEST SUITE');
  console.log('====================================================\n');

  await runMigrations();
  await runSeeds();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Unauthorized Access (No Session) -> 401
    console.log('[Billing Run HTTP 1] Unauthenticated request to POST /api/billing/run...');
    const unauthRes = await fetch(`${baseUrl}/api/billing/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must be rejected with 401');
    console.log('✓ Unauthenticated request strictly rejected with 401 UNAUTHORIZED.');

    // 2. Customer Access -> 403 FORBIDDEN
    console.log('[Billing Run HTTP 2] Customer attempting to call POST /api/billing/run...');
    const custEmail = `cust.billing.${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: custEmail,
        password: 'Password123!',
        name: 'Billing Test Customer',
      }),
    });
    const custCookie = regRes.headers.get('set-cookie')?.split(';')[0];
    assert(custCookie, 'Customer registered and session cookie received');

    const custBillingRes = await fetch(`${baseUrl}/api/billing/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: custCookie,
      },
      body: JSON.stringify({ targetDate: '2026-10-31' }),
    });
    assert.strictEqual(custBillingRes.status, 403, 'Customer role must be blocked from running billing engine');
    console.log('✓ Customer role strictly rejected with 403 FORBIDDEN.');

    // 3. Staff Access -> 403 FORBIDDEN (Admin-Only Endpoint)
    console.log('[Billing Run HTTP 3] Staff role attempting to call POST /api/billing/run...');
    const staffLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'staff@brightloop.com',
        password: 'Password@123',
      }),
    });
    const staffCookie = staffLoginRes.headers.get('set-cookie')?.split(';')[0];
    assert(staffCookie, 'Staff logged in');

    const staffBillingRes = await fetch(`${baseUrl}/api/billing/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: staffCookie,
      },
      body: JSON.stringify({ targetDate: '2026-10-31' }),
    });
    assert.strictEqual(staffBillingRes.status, 403, 'Staff role must be rejected from Admin-only billing run');
    console.log('✓ Staff role strictly blocked from manual billing run with 403 FORBIDDEN.');

    // 4. Admin Success Execution & Agreed Report Schema
    console.log('[Billing Run HTTP 4] Admin executing POST /api/billing/run (Agreed Report Schema)...');
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@brightloop.com',
        password: 'Password@123',
      }),
    });
    const adminCookie = adminLoginRes.headers.get('set-cookie')?.split(';')[0];
    assert(adminCookie, 'Admin logged in');

    // Create an eligible subscription due today
    const custProfile = await db.queryOne<{ id: string }>('SELECT id FROM customer_profiles LIMIT 1');
    const testSubId = uuidv4();
    const testSubNum = `SUB-RUN-HTTP-${Date.now().toString().slice(-4)}`;
    const today = '2026-10-31';

    await db.execute(
      `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
       VALUES (?, ?, ?, 'plan-monthly-01', 'active', ?, ?, 'monthly', 120.00, 120.00)`,
      [testSubId, testSubNum, custProfile!.id, today, today]
    );

    const adminRunRes = await fetch(`${baseUrl}/api/billing/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ targetDate: today }),
    });

    assert.strictEqual(adminRunRes.status, 200, 'Admin request succeeds with 200 OK');
    const body = await adminRunRes.json();
    const report = body.data;

    assert(report.runId, 'runId present');
    assert(report.startTime, 'startTime present');
    assert(report.endTime, 'endTime present');
    assert(typeof report.durationMs === 'number', 'durationMs present');
    assert(typeof report.subscriptionsChecked === 'number', 'subscriptionsChecked count present');
    assert(typeof report.invoicesGenerated === 'number', 'invoicesGenerated count present');
    assert(typeof report.alreadyBilledCount === 'number', 'alreadyBilledCount present');
    assert(Array.isArray(report.alreadyBilledRecords), 'alreadyBilledRecords array present');
    assert(Array.isArray(report.skippedReasons), 'skippedReasons array present');
    assert(Array.isArray(report.errors), 'errors array present');
    assert(Array.isArray(report.invoices), 'invoices list present');

    console.log(`✓ Admin billing run completed: Run ${report.runId} (${report.durationMs}ms) generated ${report.invoicesGenerated} invoices.`);

    // 5. Backend Idempotency & Repeated Request Protection
    console.log('[Billing Run HTTP 5] Repeated Run (Idempotency Protection Verification)...');
    const repeatedRes = await fetch(`${baseUrl}/api/billing/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ targetDate: today }),
    });

    assert.strictEqual(repeatedRes.status, 200, 'Repeated run returns 200');
    const repeatedBody = await repeatedRes.json();
    const repeatedReport = repeatedBody.data;

    assert.strictEqual(repeatedReport.invoicesGenerated, 0, 'Zero duplicate invoices created on repeated run');
    console.log(`✓ Idempotency verified: Second run safely skipped already-billed periods (${repeatedReport.alreadyBilledCount} already billed).`);

    // 6. Billing Run Audit History Endpoint
    console.log('[Billing Run HTTP 6] GET /api/billing/history (Audit Log Verification)...');
    const historyRes = await fetch(`${baseUrl}/api/billing/history`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(historyRes.status, 200, 'History retrieved with 200 OK');
    const historyBody = await historyRes.json();
    assert(Array.isArray(historyBody.data), 'History returns list of audit records');
    assert(historyBody.data.length >= 2, 'History contains executed billing run entries');
    console.log(`✓ Billing audit ledger retrieved successfully with ${historyBody.data.length} historical run records.`);

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log('ALL BILLING-RUN HTTP & REPORTING TESTS PASSED! (6/6)');
  console.log('====================================================');
}

runBillingRunHttpTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Billing Run HTTP test failed:', err);
    process.exit(1);
  });
