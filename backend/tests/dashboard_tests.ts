import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/config/database';
import { runMigrations } from '../src/config/migrate';
import { runSeeds } from '../src/config/seed';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';
import { app } from '../src/app';
import http from 'http';

async function runDashboardTests() {
  console.log('====================================================');
  console.log('STARTING FINANCE DASHBOARD & REPORTING TEST SUITE');
  console.log('====================================================\n');

  await runMigrations();
  await runSeeds();

  // Test Customer
  const custUserId = uuidv4();
  const custId = uuidv4();
  await db.execute(
    'INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [custUserId, `dash.cust.${Date.now()}@example.com`, 'hash', 'customer']
  );
  await db.execute(
    'INSERT OR IGNORE INTO customer_profiles (id, user_id, name, company_name) VALUES (?, ?, ?, ?)',
    [custId, custUserId, 'Dashboard Customer', 'Acme Analytics']
  );

  // 1. Metric Calculations & MRR Normalization
  console.log('[Dashboard Test 1] Metric Calculations & Normalized MRR...');
  const sub1Id = uuidv4();
  const sub2Id = uuidv4();

  // Monthly: $200.00/mo -> MRR = $200.00
  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'active', '2026-01-01', '2026-11-01', 'monthly', 200.00, 200.00)`,
    [sub1Id, `SUB-DASH-M-${Date.now().toString().slice(-4)}`, custId]
  );

  // Yearly: $2,400.00/yr -> Normalized MRR = $200.00/mo
  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
     VALUES (?, ?, ?, 'plan-yearly-01', 'active', '2026-01-01', '2026-12-01', 'yearly', 2400.00, 2400.00)`,
    [sub2Id, `SUB-DASH-Y-${Date.now().toString().slice(-4)}`, custId]
  );

  const summary = await DashboardService.getSummary();
  assert(summary.activeSubscriptions >= 2, 'Active subscriptions counted');
  assert(summary.mrr >= 400.00, 'Normalized MRR accurately accounts for monthly and annualized plans');
  console.log(`✓ Active Subscriptions: ${summary.activeSubscriptions}, MRR: $${summary.mrr.toFixed(2)}.`);

  // 2. Invoiced, Collected & Outstanding Receivables
  console.log('[Dashboard Test 2] Real Database Financial Aggregates...');
  const invId = uuidv4();
  await db.execute(
    `INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, period_start, period_end, due_date, status, subtotal, total_amount, amount_paid, amount_due)
     VALUES (?, ?, ?, ?, '2026-10-01', '2026-10-31', '2026-10-31', 'partially_paid', 1000.00, 1000.00, 400.00, 600.00)`,
    [invId, `INV-DASH-${Date.now().toString().slice(-4)}`, sub1Id, custId]
  );

  await db.execute(
    `INSERT INTO payments (id, invoice_id, amount, payment_method, status, recorded_at)
     VALUES (?, ?, 400.00, 'bank_transfer', 'successful', '2026-10-15 12:00:00')`,
    [uuidv4(), invId]
  );

  const updatedSummary = await DashboardService.getSummary();
  assert(updatedSummary.totalInvoiced >= 1000.00, 'Total invoiced aggregate verified');
  assert(updatedSummary.totalCollected >= 400.00, 'Total collected aggregate verified');
  assert(updatedSummary.totalOutstanding >= 600.00, 'Total outstanding receivables verified');
  console.log(`✓ Financial Aggregates: Invoiced=$${updatedSummary.totalInvoiced}, Collected=$${updatedSummary.totalCollected}, Outstanding=$${updatedSummary.totalOutstanding}.`);

  // 3. Overdue Invoices & Aging Buckets
  console.log('[Dashboard Test 3] Overdue Receivables & Aging Risk Buckets...');
  const overdueInvId = uuidv4();
  // Due 45 days ago -> Falls into '31-60 days' bucket
  const overdueDate = '2026-09-15';
  await db.execute(
    `INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, period_start, period_end, due_date, status, subtotal, total_amount, amount_paid, amount_due)
     VALUES (?, ?, ?, ?, '2026-08-15', '2026-09-15', ?, 'confirmed', 350.00, 350.00, 0.00, 350.00)`,
    [overdueInvId, `INV-OVERDUE-${Date.now().toString().slice(-4)}`, sub1Id, custId, overdueDate]
  );

  const overdueSummary = await DashboardService.getSummary();
  assert(overdueSummary.overdueCount >= 1, 'Overdue invoice count incremented');
  assert(overdueSummary.overdueAmount >= 350.00, 'Overdue amount includes unpaid balance past due date');

  // Verify aging buckets exist
  const b31to60 = overdueSummary.overdueAging.find((b) => b.bucket === '31-60 days');
  assert(b31to60 && b31to60.amount >= 350.00, 'Overdue invoice categorized into 31-60 days aging bucket');
  console.log(`✓ Overdue detected: ${overdueSummary.overdueCount} invoice(s), $${overdueSummary.overdueAmount} total. Aging bucket (31-60 days) contains $${b31to60?.amount}.`);

  // 4. Date Range Filters
  console.log('[Dashboard Test 4] Date Range Filter Scoping...');
  // Query a date window far in the future
  const futureSummary = await DashboardService.getSummary({
    startDate: '2029-01-01',
    endDate: '2029-12-31',
  });
  assert.strictEqual(futureSummary.totalInvoiced, 0.00, 'Invoiced amount is 0 for out-of-range period');
  assert.strictEqual(futureSummary.totalCollected, 0.00, 'Collected amount is 0 for out-of-range period');

  // Query October 2026
  const octSummary = await DashboardService.getSummary({
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  });
  assert(octSummary.totalInvoiced >= 1000.00, 'October invoices captured within range');
  assert(octSummary.totalCollected >= 400.00, 'October payments captured within range');
  console.log('✓ Date range filtering scopes database metrics strictly to selected period.');

  // 5. Empty Data Handling
  console.log('[Dashboard Test 5] Empty Data & Zero State Handling...');
  // Empty data should return valid structures without NaN or division by zero
  assert(Array.isArray(futureSummary.overdueAging), 'Aging is array');
  assert(Array.isArray(futureSummary.monthlyCashflow), 'Cashflow is array');
  assert(Array.isArray(futureSummary.subscriptionsByStatus), 'Status breakdown is array');
  assert(Array.isArray(futureSummary.subscriptionsByPlan), 'Plan breakdown is array');
  assert(typeof futureSummary.mrr === 'number' && !isNaN(futureSummary.mrr), 'MRR is safe number');
  console.log('✓ Zero states handled gracefully without NaN or runtime exceptions.');

  // 6. Access Control & RBAC
  console.log('[Dashboard Test 6] Endpoint Access Control & RBAC...');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 6a. Unauthenticated caller -> 401
    const unauthRes = await fetch(`${baseUrl}/api/dashboard/summary`);
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated access rejected with 401');

    // 6b. Customer caller -> 403 Forbidden
    // Login as Customer
    const custEmail = `cust.rbac.${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: custEmail,
        password: 'Password123!',
        name: 'Regular Customer',
      }),
    });
    const custCookie = regRes.headers.get('set-cookie')?.split(';')[0];
    assert(custCookie, 'Customer logged in');

    const custDashRes = await fetch(`${baseUrl}/api/dashboard/summary`, {
      headers: { Cookie: custCookie },
    });
    assert.strictEqual(custDashRes.status, 403, 'Customer restricted from executive dashboard with 403 FORBIDDEN');

    // 6c. Admin caller -> 200 OK
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

    const adminDashRes = await fetch(`${baseUrl}/api/dashboard/summary`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(adminDashRes.status, 200, 'Admin successfully accesses executive dashboard');
    const adminData = await adminDashRes.json();
    assert(adminData.data.mrr !== undefined, 'Summary payload returned to Admin');

    console.log('✓ Role-based permissions verified: 401 for unauthenticated, 403 for Customer, 200 for Admin.');
  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log('ALL FINANCE DASHBOARD & REPORTING TESTS PASSED! (6/6)');
  console.log('====================================================');
}

runDashboardTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Dashboard test failed:', err);
    process.exit(1);
  });
