import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/config/database';
import { runMigrations } from '../src/config/migrate';
import { runSeeds } from '../src/config/seed';
import { InvoiceService } from '../src/modules/invoices/invoices.service';

async function runInvoiceTests() {
  console.log('====================================================');
  console.log('STARTING INVOICE MANAGEMENT & AUDIT TEST SUITE');
  console.log('====================================================\n');

  await runMigrations();
  await runSeeds();

  // Seed two distinct customers
  const custA_UserId = uuidv4();
  const custA_Id = uuidv4();
  await db.execute(
    'INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [custA_UserId, `invoicetest.a.${Date.now()}@example.com`, 'hash', 'customer']
  );
  await db.execute(
    'INSERT OR IGNORE INTO customer_profiles (id, user_id, name, company_name) VALUES (?, ?, ?, ?)',
    [custA_Id, custA_UserId, 'Customer Alpha', 'Alpha Corp']
  );

  const custB_UserId = uuidv4();
  const custB_Id = uuidv4();
  await db.execute(
    'INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [custB_UserId, `invoicetest.b.${Date.now()}@example.com`, 'hash', 'customer']
  );
  await db.execute(
    'INSERT OR IGNORE INTO customer_profiles (id, user_id, name, company_name) VALUES (?, ?, ?, ?)',
    [custB_Id, custB_UserId, 'Customer Beta', 'Beta LLC']
  );

  // Seed Subscriptions for A and B
  const subA_Id = uuidv4();
  const subA_Num = `SUB-A-${Date.now().toString().slice(-6)}`;
  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'active', '2026-10-01', '2026-11-01', 'monthly', 100.00, 100.00)`,
    [subA_Id, subA_Num, custA_Id]
  );

  const subB_Id = uuidv4();
  const subB_Num = `SUB-B-${Date.now().toString().slice(-6)}`;
  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'active', '2026-10-01', '2026-11-01', 'monthly', 200.00, 200.00)`,
    [subB_Id, subB_Num, custB_Id]
  );

  // 1. Collision-Resistant Unique Invoice Numbering
  console.log('[Invoice Test 1] Concurrent Unique Invoice Number Generation...');
  const generateCount = 50;
  const generatedNumbers = await Promise.all(
    Array.from({ length: generateCount }, () => InvoiceService.generateInvoiceNumber())
  );
  const uniqueSet = new Set(generatedNumbers);
  assert.strictEqual(uniqueSet.size, generateCount, 'All generated invoice numbers must be strictly unique');
  generatedNumbers.forEach((num) => {
    assert(num.startsWith('INV-'), 'Invoice number must begin with prefix INV-');
  });
  console.log(`✓ Generated ${generateCount} unique invoice numbers concurrently with zero collisions.`);

  // 2. Draft Invoice Creation & State Machine Confirmation
  console.log('[Invoice Test 2] Draft Invoice Confirmation (State Machine)...');
  const draftInvId = uuidv4();
  const draftInvNum = await InvoiceService.generateInvoiceNumber();
  await db.execute(
    `INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, period_start, period_end, due_date, status, subtotal, total_amount, amount_paid, amount_due)
     VALUES (?, ?, ?, ?, '2026-10-01', '2026-11-01', '2026-11-01', 'draft', 100.00, 100.00, 0.00, 100.00)`,
    [draftInvId, draftInvNum, subA_Id, custA_Id]
  );

  const adminUser = await db.queryOne<{ id: string }>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  const adminId = adminUser ? adminUser.id : custA_UserId;

  // Confirm draft as Staff/Admin
  const confirmed = await InvoiceService.confirmInvoice(draftInvId, adminId);
  assert.strictEqual(confirmed.status, 'confirmed', 'Draft transitions to confirmed');

  // Attempting to confirm already confirmed invoice must be rejected
  try {
    await InvoiceService.confirmInvoice(draftInvId, adminId);
    assert.fail('Should reject confirming non-draft invoice');
  } catch (err: any) {
    assert.strictEqual(err.code, 'INVALID_STATE_TRANSITION');
    console.log('✓ Draft invoice confirmed successfully; re-confirming rejected by state machine.');
  }

  // 3. Invoice Cancellation Rules
  console.log('[Invoice Test 3] Cancellation Restrictions (Unpaid vs Paid)...');
  // 3a. Unpaid confirmed invoice can be cancelled
  const unpaidInvId = uuidv4();
  const unpaidInvNum = await InvoiceService.generateInvoiceNumber();
  await db.execute(
    `INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, period_start, period_end, due_date, status, subtotal, total_amount, amount_paid, amount_due)
     VALUES (?, ?, ?, ?, '2026-11-01', '2026-12-01', '2026-12-01', 'confirmed', 100.00, 100.00, 0.00, 100.00)`,
    [unpaidInvId, unpaidInvNum, subA_Id, custA_Id]
  );

  const cancelled = await InvoiceService.cancelInvoice(unpaidInvId, adminId, 'Client billing adjustment');
  assert.strictEqual(cancelled.status, 'cancelled');
  console.log('✓ Unpaid confirmed invoice successfully cancelled.');

  // 3b. Partially or fully paid invoice CANNOT be cancelled
  const paidInvId = uuidv4();
  const paidInvNum = await InvoiceService.generateInvoiceNumber();
  await db.execute(
    `INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, period_start, period_end, due_date, status, subtotal, total_amount, amount_paid, amount_due)
     VALUES (?, ?, ?, ?, '2026-12-01', '2027-01-01', '2027-01-01', 'partially_paid', 100.00, 100.00, 40.00, 60.00)`,
    [paidInvId, paidInvNum, subA_Id, custA_Id]
  );

  try {
    await InvoiceService.cancelInvoice(paidInvId, adminId);
    assert.fail('Should reject cancelling invoice with recorded payments');
  } catch (err: any) {
    assert.strictEqual(err.code, 'CANNOT_CANCEL_PAID_INVOICE');
    console.log('✓ Paid invoice cancellation strictly blocked with CANNOT_CANCEL_PAID_INVOICE.');
  }

  // 4. Customer Data Boundary & Ownership Enforcement
  console.log('[Invoice Test 4] Customer Invoice Ownership Restrictions...');
  // Customer A accesses own invoice
  const custA_Details = await InvoiceService.getInvoiceDetails(draftInvId, {
    role: 'customer',
    customerId: custA_Id,
  });
  assert.strictEqual(custA_Details.id, draftInvId);

  // Customer B attempts to access Customer A's invoice -> FORBIDDEN
  try {
    await InvoiceService.getInvoiceDetails(draftInvId, {
      role: 'customer',
      customerId: custB_Id,
    });
    assert.fail('Customer B must not access Customer A invoice');
  } catch (err: any) {
    assert.strictEqual(err.code, 'FORBIDDEN');
    console.log('✓ Cross-customer access rejected with 403 FORBIDDEN.');
  }

  // Admin can access any invoice
  const adminDetails = await InvoiceService.getInvoiceDetails(draftInvId, {
    role: 'admin',
  });
  assert.strictEqual(adminDetails.id, draftInvId);
  console.log('✓ Admin/Staff access verified across customer boundaries.');

  // 5. Historical Price & Tax Snapshot Preservation
  console.log('[Invoice Test 5] Historical Snapshot Preservation vs Catalogue Changes...');
  const testProdId = uuidv4();
  await db.execute(
    `INSERT INTO products (id, name, sales_price, cost_price, is_active) VALUES (?, 'Snapshot Test Product', 250.00, 100.00, 1)`,
    [testProdId]
  );
  const testTaxId = uuidv4();
  await db.execute(
    `INSERT INTO taxes (id, name, rate_percentage, is_active) VALUES (?, 'Snapshot Test Tax', 18.00, 1)`,
    [testTaxId]
  );

  const historicalInvId = uuidv4();
  const historicalInvNum = await InvoiceService.generateInvoiceNumber();
  const originalUnitPrice = 250.00;
  const originalTaxAmount = 45.00;
  const originalTotal = 295.00;

  await db.execute(
    `INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, period_start, period_end, due_date, status, subtotal, tax_amount, total_amount, amount_paid, amount_due)
     VALUES (?, ?, ?, ?, '2026-05-01', '2026-06-01', '2026-06-01', 'confirmed', ?, ?, ?, 0.00, ?)`,
    [historicalInvId, historicalInvNum, subA_Id, custA_Id, originalUnitPrice, originalTaxAmount, originalTotal, originalTotal]
  );

  await db.execute(
    `INSERT INTO invoice_lines (id, invoice_id, product_id, description, quantity, unit_price, subtotal)
     VALUES (?, ?, ?, 'Cloud Infrastructure Node', 1, ?, ?)`,
    [uuidv4(), historicalInvId, testProdId, originalUnitPrice, originalUnitPrice]
  );

  // Now mutate catalogue product price and tax policies to drastic values
  await db.execute('UPDATE products SET sales_price = 9999.99 WHERE id = ?', [testProdId]);
  await db.execute('UPDATE taxes SET rate_percentage = 95.0 WHERE id = ?', [testTaxId]);

  // Restore seed values if previously mutated
  await db.execute("UPDATE products SET sales_price = 200.00 WHERE id = 'prod-01'");
  await db.execute("UPDATE taxes SET rate_percentage = 18.00 WHERE id = 'tax-gst-18'");

  // Retrieve invoice details after catalogue alterations
  const preservedDetails = await InvoiceService.getInvoiceDetails(historicalInvId, { role: 'admin' });
  assert.strictEqual(preservedDetails.subtotal, originalUnitPrice, 'Invoice subtotal remained unchanged');
  assert.strictEqual(preservedDetails.tax_amount, originalTaxAmount, 'Invoice tax remained unchanged');
  assert.strictEqual(preservedDetails.total_amount, originalTotal, 'Invoice total remained unchanged');
  assert.strictEqual(preservedDetails.lines[0].unit_price, originalUnitPrice, 'Line unit price preserved');
  assert.strictEqual(preservedDetails.lines[0].subtotal, originalUnitPrice, 'Line subtotal preserved');
  console.log('✓ Snapshot immutability verified: Catalogue price & tax alterations did not impact historical invoices.');

  // 6. Pagination and Multi-Attribute Filtering
  console.log('[Invoice Test 6] Pagination and Multi-Attribute Filtering...');
  // Seed 10 additional invoices for pagination testing with distinct period dates
  for (let i = 1; i <= 10; i++) {
    const month = String(i).padStart(2, '0');
    await db.execute(
      `INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, period_start, period_end, due_date, status, subtotal, total_amount, amount_paid, amount_due)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', 50.00, 50.00, 0.00, 50.00)`,
      [
        uuidv4(),
        `INV-PAG-${Date.now()}-${i}`,
        subB_Id,
        custB_Id,
        `2027-${month}-01`,
        `2027-${month}-28`,
        `2027-${month}-28`,
      ]
    );
  }

  // Test paginated list (page 1, limit 5)
  const page1 = await InvoiceService.listInvoices({ role: 'admin' }, { page: 1, limit: 5 });
  assert.strictEqual(page1.invoices.length, 5, 'Page 1 returns exactly 5 items');
  assert(page1.pagination.total >= 10, 'Total records count returned');
  assert(page1.pagination.totalPages >= 2, 'Total pages calculated accurately');

  // Test filter by status = 'cancelled'
  const cancelledFilter = await InvoiceService.listInvoices({ role: 'admin' }, { status: 'cancelled' });
  cancelledFilter.invoices.forEach((inv: any) => {
    assert.strictEqual(inv.status, 'cancelled', 'All returned invoices must match filtered status');
  });

  // Test customer self-isolation in listing
  const custB_List = await InvoiceService.listInvoices({ role: 'customer', customerId: custB_Id });
  custB_List.invoices.forEach((inv: any) => {
    assert.strictEqual(inv.customer_id, custB_Id, 'Customer only sees invoices belonging to their profile');
  });
  console.log(`✓ Pagination verified: ${page1.pagination.total} total records paginated correctly with strict filtering.`);

  // 7. Audit Log Verification
  console.log('[Invoice Test 7] Audit Logging on Invoice Transitions...');
  const confirmLog = await db.queryOne<{ payload: string }>(
    "SELECT payload FROM audit_logs WHERE action = 'INVOICE_CONFIRMED' ORDER BY created_at DESC LIMIT 1"
  );
  assert(confirmLog, 'Confirmation audit log exists');
  const cancelLog = await db.queryOne<{ payload: string }>(
    "SELECT payload FROM audit_logs WHERE action = 'INVOICE_CANCELLED' ORDER BY created_at DESC LIMIT 1"
  );
  assert(cancelLog, 'Cancellation audit log exists');
  console.log('✓ Audit trail verified: All invoice status transitions properly recorded in audit_logs.');

  console.log('\n====================================================');
  console.log('ALL INVOICE MANAGEMENT TESTS PASSED! (7/7)');
  console.log('====================================================');
}

runInvoiceTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Invoice test failed:', err);
    process.exit(1);
  });
