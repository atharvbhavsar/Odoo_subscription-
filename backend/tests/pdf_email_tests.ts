import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/config/database';
import { runMigrations } from '../src/config/migrate';
import { runSeeds } from '../src/config/seed';
import { PdfService } from '../src/modules/invoices/pdf.service';
import { EmailService } from '../src/modules/invoices/email.service';
import { InvoiceService } from '../src/modules/invoices/invoices.service';

async function runPdfEmailTests() {
  console.log('====================================================');
  console.log('STARTING INVOICE PDF & EMAIL DELIVERY TEST SUITE');
  console.log('====================================================\n');

  await runMigrations();
  await runSeeds();

  // Create two test customers
  const custA_UserId = uuidv4();
  const custA_Id = uuidv4();
  await db.execute(
    'INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [custA_UserId, `pdf.cust.a.${Date.now()}@example.com`, 'hash', 'customer']
  );
  await db.execute(
    'INSERT OR IGNORE INTO customer_profiles (id, user_id, name, company_name, address) VALUES (?, ?, ?, ?, ?)',
    [custA_Id, custA_UserId, 'Alice Corp', 'Alice Technologies Inc', '789 Silicon Blvd']
  );

  const custB_UserId = uuidv4();
  const custB_Id = uuidv4();
  await db.execute(
    'INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [custB_UserId, `pdf.cust.b.${Date.now()}@example.com`, 'hash', 'customer']
  );
  await db.execute(
    'INSERT OR IGNORE INTO customer_profiles (id, user_id, name, company_name, address) VALUES (?, ?, ?, ?, ?)',
    [custB_Id, custB_UserId, 'Bob Ventures', 'Bob Holdings LLC', '456 Market St']
  );

  // Create subscription & invoice for Customer A
  const subA_Id = uuidv4();
  await db.execute(
    `INSERT INTO subscriptions (id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency, subtotal, total_amount)
     VALUES (?, ?, ?, 'plan-monthly-01', 'active', '2026-10-01', '2026-11-01', 'monthly', 500.00, 500.00)`,
    [subA_Id, `SUB-PDF-${Date.now().toString().slice(-4)}`, custA_Id]
  );

  const invA_Id = uuidv4();
  const invA_Number = await InvoiceService.generateInvoiceNumber();
  await db.execute(
    `INSERT INTO invoices (id, invoice_number, subscription_id, customer_id, period_start, period_end, due_date, status, subtotal, discount_amount, tax_amount, total_amount, amount_paid, amount_due)
     VALUES (?, ?, ?, ?, '2026-10-01', '2026-11-01', '2026-11-01', 'confirmed', 500.00, 50.00, 45.00, 495.00, 100.00, 395.00)`,
    [invA_Id, invA_Number, subA_Id, custA_Id]
  );
  await db.execute(
    `INSERT INTO invoice_lines (id, invoice_id, product_id, description, quantity, unit_price, subtotal)
     VALUES (?, ?, 'prod-01', 'Enterprise Cloud Tier', 1, 500.00, 500.00)`,
    [uuidv4(), invA_Id]
  );

  // 1. PDF Access Control & RBAC
  console.log('[PDF/Email Test 1] PDF Access Control & Customer Isolation...');
  // Customer A accesses own invoice
  const custA_Details = await InvoiceService.getInvoiceDetails(invA_Id, { role: 'customer', customerId: custA_Id });
  assert.strictEqual(custA_Details.id, invA_Id, 'Customer A can access own invoice');

  // Customer B attempts to access Customer A's invoice -> FORBIDDEN
  try {
    await InvoiceService.getInvoiceDetails(invA_Id, { role: 'customer', customerId: custB_Id });
    assert.fail('Customer B must be rejected when attempting to access Customer A invoice');
  } catch (err: any) {
    assert.strictEqual(err.code, 'FORBIDDEN', 'Access rejected with 403 FORBIDDEN');
    console.log('✓ Cross-customer PDF access strictly blocked with 403 FORBIDDEN.');
  }

  // Admin access succeeds
  const adminDetails = await InvoiceService.getInvoiceDetails(invA_Id, { role: 'admin' });
  assert.strictEqual(adminDetails.id, invA_Id, 'Admin can access invoice across customers');
  console.log('✓ Admin access verified across customer boundaries.');

  // 2. Authoritative PDFKit Document Generation
  console.log('[PDF/Email Test 2] PDFKit Binary Document Generation...');
  const pdfBuffer = await PdfService.generateInvoicePdf(adminDetails, {
    name: 'Alice Corp',
    company_name: 'Alice Technologies Inc',
    address: '789 Silicon Blvd',
    email: 'alice@example.com',
  });
  assert(Buffer.isBuffer(pdfBuffer), 'Returns a binary Buffer');
  assert(pdfBuffer.length > 1000, `PDF buffer length (${pdfBuffer.length} bytes) is non-empty`);
  // Check standard PDF file header (%PDF-)
  const magicHeader = pdfBuffer.subarray(0, 5).toString('ascii');
  assert.strictEqual(magicHeader, '%PDF-', 'Buffer contains valid PDF magic header %PDF-');
  console.log(`✓ Generated valid PDF binary (${pdfBuffer.length} bytes) with authoritative invoice snapshots.`);

  // 3. Missing Customer Data Tolerance
  console.log('[PDF/Email Test 3] Handling Missing / Incomplete Customer Data...');
  const missingDataPdf = await PdfService.generateInvoicePdf(adminDetails, null);
  assert(Buffer.isBuffer(missingDataPdf), 'Generates valid buffer even when customer data is null');
  assert(missingDataPdf.length > 1000, 'Non-empty PDF generated with fallback customer text');
  assert.strictEqual(missingDataPdf.subarray(0, 5).toString('ascii'), '%PDF-');
  console.log('✓ Missing customer profile handled gracefully without crashing or throwing.');

  // 4. Email Delivery Success & Decoupled Recording
  console.log('[PDF/Email Test 4] Email Delivery Dispatch & Separate Recording...');
  EmailService.setSimulateFailure(false);
  const sentResult = await EmailService.sendInvoiceEmail(invA_Id, {
    recipientEmail: 'billing@alicecorp.com',
    userId: custA_UserId,
  });
  assert.strictEqual(sentResult.status, 'sent', 'Email successfully dispatched');
  assert.strictEqual(sentResult.attempts, 1, 'Initial attempt count is 1');

  // Verify record in invoice_emails table
  const emailRecord = await db.queryOne<{ id: string; status: string; recipient_email: string; attempts: number }>(
    'SELECT * FROM invoice_emails WHERE id = ?',
    [sentResult.emailId]
  );
  assert(emailRecord, 'Email record exists in invoice_emails table');
  assert.strictEqual(emailRecord.status, 'sent');
  assert.strictEqual(emailRecord.recipient_email, 'billing@alicecorp.com');
  console.log(`✓ Email delivery recorded separately in invoice_emails table with status 'sent'.`);

  // 5. Email Failure Isolation (Invoice / Payment Immutability)
  console.log('[PDF/Email Test 5] Email Failure Isolation (Preserving Invoice & Payment State)...');
  // Snapshot invoice state prior to simulated failure
  const preInv = await db.queryOne<{ status: string; amount_paid: number; amount_due: number }>(
    'SELECT status, amount_paid, amount_due FROM invoices WHERE id = ?',
    [invA_Id]
  );

  // Enable simulated transient transport failure
  EmailService.setSimulateFailure(true);
  const failResult = await EmailService.sendInvoiceEmail(invA_Id, {
    recipientEmail: 'billing@alicecorp.com',
    userId: custA_UserId,
  });

  assert.strictEqual(failResult.status, 'failed', 'Delivery returns failed status');
  assert(failResult.errorMessage, 'Failure error message captured');

  // Verify email delivery record captured failure
  const failedRecord = await db.queryOne<{ id: string; status: string; error_message: string }>(
    'SELECT * FROM invoice_emails WHERE id = ?',
    [failResult.emailId]
  );
  assert.strictEqual(failedRecord?.status, 'failed', 'invoice_emails records status = failed');
  assert(failedRecord?.error_message?.includes('Simulated transient SMTP'), 'Detailed safe error recorded');

  // Verify invoice state was NOT mutated or rolled back
  const postInv = await db.queryOne<{ status: string; amount_paid: number; amount_due: number }>(
    'SELECT status, amount_paid, amount_due FROM invoices WHERE id = ?',
    [invA_Id]
  );
  assert.strictEqual(postInv?.status, preInv?.status, 'Invoice status was not altered by email failure');
  assert.strictEqual(postInv?.amount_paid, preInv?.amount_paid, 'Invoice amount_paid preserved');
  assert.strictEqual(postInv?.amount_due, preInv?.amount_due, 'Invoice amount_due preserved');
  console.log('✓ Failure isolation verified: Email failure recorded without rolling back or altering invoice.');

  // 6. Retry Behavior for Failed Delivery
  console.log('[PDF/Email Test 6] Retry Delivery for Failed Invoice Emails...');
  // Restore healthy transport
  EmailService.setSimulateFailure(false);

  const retryResult = await EmailService.retryInvoiceEmail(failResult.emailId, custA_UserId);
  assert.strictEqual(retryResult.status, 'sent', 'Retried email transitions to sent');
  assert.strictEqual(retryResult.attempts, 2, 'Attempts counter incremented to 2');

  const updatedRecord = await db.queryOne<{ status: string; attempts: number; error_message: string | null }>(
    'SELECT status, attempts, error_message FROM invoice_emails WHERE id = ?',
    [failResult.emailId]
  );
  assert.strictEqual(updatedRecord?.status, 'sent', 'Database status updated to sent');
  assert.strictEqual(updatedRecord?.attempts, 2, 'Database attempts updated to 2');
  assert.strictEqual(updatedRecord?.error_message, null, 'Error message cleared upon successful retry');
  console.log('✓ Retry verified: Delivery re-attempted, attempts incremented to 2, and status updated to sent.');

  console.log('\n====================================================');
  console.log('ALL INVOICE PDF & EMAIL TESTS PASSED! (6/6)');
  console.log('====================================================');
}

runPdfEmailTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('PDF/Email test failed:', err);
    process.exit(1);
  });
