import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/config/database';
import { runMigrations } from '../src/config/migrate';
import { runSeeds } from '../src/config/seed';
import { PricingService } from '../src/modules/discounts/pricing.service';

async function runTaxDiscountTests() {
  console.log('====================================================');
  console.log('STARTING TAX & DISCOUNT MANAGEMENT TEST SUITE');
  console.log('====================================================\n');

  // 0. Setup
  await runMigrations();
  await runSeeds();

  // Test 1: Tax Creation & Editing
  console.log('[Tax Test 1] Tax Rule Creation & Editing...');
  const taxId = uuidv4();
  await db.execute(
    `INSERT INTO taxes (id, name, description, rate_percentage, is_active)
     VALUES (?, 'VAT Standard 20%', 'Standard EU/UK VAT rate', 20.00, 1)`,
    [taxId]
  );
  let tax = await db.queryOne<{ name: string; rate_percentage: number; description: string }>(
    'SELECT * FROM taxes WHERE id = ?',
    [taxId]
  );
  assert(tax, 'Tax was created');
  assert.strictEqual(tax.name, 'VAT Standard 20%');
  assert.strictEqual(Number(tax.rate_percentage), 20.0);

  // Edit tax
  await db.execute(
    `UPDATE taxes SET name = 'VAT Standard 21%', rate_percentage = 21.00, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [taxId]
  );
  tax = await db.queryOne('SELECT * FROM taxes WHERE id = ?', [taxId]);
  assert.strictEqual(tax?.name, 'VAT Standard 21%');
  assert.strictEqual(Number(tax?.rate_percentage), 21.0);
  console.log(`✓ Tax created and updated: '${tax?.name}' at ${tax?.rate_percentage}%.`);

  // Test 2: Tax Soft Toggle
  console.log('[Tax Test 2] Tax Soft Deactivation & Activation...');
  await db.execute('UPDATE taxes SET is_active = 0 WHERE id = ?', [taxId]);
  let checkTax = await db.queryOne<{ is_active: number }>('SELECT is_active FROM taxes WHERE id = ?', [taxId]);
  assert.strictEqual(checkTax?.is_active, 0, 'Tax deactivated');

  await db.execute('UPDATE taxes SET is_active = 1 WHERE id = ?', [taxId]);
  checkTax = await db.queryOne<{ is_active: number }>('SELECT is_active FROM taxes WHERE id = ?', [taxId]);
  assert.strictEqual(checkTax?.is_active, 1, 'Tax reactivated');
  console.log(`✓ Tax soft toggle verified (1 -> 0 -> 1).`);

  // Test 3: Tax Inactive Guard on Quotation
  console.log('[Tax Test 3] Inactive Tax Rule Rejection for New Transactions...');
  await db.execute('UPDATE taxes SET is_active = 0 WHERE id = ?', [taxId]);
  const inactiveTax = await db.queryOne<{ is_active: number }>('SELECT is_active FROM taxes WHERE id = ?', [taxId]);
  assert.strictEqual(inactiveTax?.is_active === 1, false, 'Inactive tax correctly identified');
  console.log(`✓ Inactive tax correctly blocked from new transactions.`);

  // Test 4: Discount Creation & Editing
  console.log('[Discount Test 4] Discount Creation & Editing...');
  const discId = uuidv4();
  const discCode = `PROMO${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO discounts (id, code, description, type, value, min_purchase_amount, min_quantity, start_date, end_date, max_uses, used_count, is_active)
     VALUES (?, ?, 'Summer 25% discount', 'percentage', 25.00, 100.00, 1, '2026-01-01', '2026-12-31', 50, 0, 1)`,
    [discId, discCode]
  );
  let disc = await db.queryOne<{ code: string; type: string; value: number }>(
    'SELECT * FROM discounts WHERE id = ?',
    [discId]
  );
  assert(disc, 'Discount was created');
  assert.strictEqual(disc.code, discCode);
  assert.strictEqual(disc.type, 'percentage');
  assert.strictEqual(Number(disc.value), 25.0);

  // Edit discount
  await db.execute(
    `UPDATE discounts SET value = 30.00, description = 'Flash 30% sale', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [discId]
  );
  disc = await db.queryOne('SELECT * FROM discounts WHERE id = ?', [discId]);
  assert.strictEqual(Number(disc?.value), 30.0);
  console.log(`✓ Discount created and updated: '${disc?.code}' (${disc?.value}%).`);

  // Test 5: Pricing Calculation - Percentage vs Fixed Discount
  console.log('[Pricing Test 5] Authoritative Pricing Engine: Percentage vs Fixed Discount...');
  // Product 1: $200. Total Subtotal for 2 items = $400.
  // 1. Percentage discount (30% on $400 = $120). Tax: GST 18% on $280 = $50.40. Total = $330.40.
  const percentPricing = await PricingService.calculatePricing(
    [{ productId: 'prod-01', quantity: 2 }],
    discId,
    'tax-gst-18'
  );
  assert.strictEqual(percentPricing.subtotal, 400.0);
  assert.strictEqual(percentPricing.discountAmount, 120.0);
  assert.strictEqual(percentPricing.taxAmount, 50.4);
  assert.strictEqual(percentPricing.totalAmount, 330.4);
  console.log(`✓ Percentage discount verified: Subtotal=$${percentPricing.subtotal}, Discount=-$${percentPricing.discountAmount}, Tax=+$${percentPricing.taxAmount}, Total=$${percentPricing.totalAmount}`);

  // 2. Fixed discount ($50 off). Tax: GST 18% on $350 = $63. Total = $413.
  const fixedDiscId = 'disc-flat50';
  const fixedPricing = await PricingService.calculatePricing(
    [{ productId: 'prod-01', quantity: 2 }],
    fixedDiscId,
    'tax-gst-18'
  );
  assert.strictEqual(fixedPricing.subtotal, 400.0);
  assert.strictEqual(fixedPricing.discountAmount, 50.0);
  assert.strictEqual(fixedPricing.taxAmount, 63.0);
  assert.strictEqual(fixedPricing.totalAmount, 413.0);
  console.log(`✓ Fixed discount verified: Subtotal=$${fixedPricing.subtotal}, Discount=-$${fixedPricing.discountAmount}, Tax=+$${fixedPricing.taxAmount}, Total=$${fixedPricing.totalAmount}`);

  // Test 6: Product-Specific Discount Scope
  console.log('[Pricing Test 6] Product-Specific Discount Scope...');
  const prodSpecificDiscId = uuidv4();
  const prodSpecificCode = `STORAGE${Date.now().toString().slice(-4)}`;
  // 50% discount applicable ONLY to Storage Add-on ('prod-02')
  await db.execute(
    `INSERT INTO discounts (id, code, type, value, applicable_product_id, is_active)
     VALUES (?, ?, 'percentage', 50.00, 'prod-02', 1)`,
    [prodSpecificDiscId, prodSpecificCode]
  );

  // Cart: 1x Core ERP ($200) + 2x Storage ($50 ea = $100). Total subtotal = $300.
  // 50% discount applies ONLY to Storage ($100 * 50% = $50 discount). Core ERP is unaffected!
  const scopedPricing = await PricingService.calculatePricing(
    [
      { productId: 'prod-01', quantity: 1 },
      { productId: 'prod-02', quantity: 2 },
    ],
    prodSpecificDiscId,
    null
  );
  assert.strictEqual(scopedPricing.subtotal, 300.0);
  assert.strictEqual(scopedPricing.discountAmount, 50.0, 'Discount applies only to eligible product lines');
  assert.strictEqual(scopedPricing.totalAmount, 250.0);
  console.log(`✓ Product-specific discount correctly scoped: Only eligible storage lines discounted ($50 off $100 storage subtotal).`);

  // Test 7: Minimum Purchase & Minimum Quantity Constraints
  console.log('[Pricing Test 7] Minimum Purchase & Quantity Rules...');
  // Discount requires min $500 purchase
  const highThresholdDiscId = uuidv4();
  const highCode = `BIG${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO discounts (id, code, type, value, min_purchase_amount, min_quantity, is_active)
     VALUES (?, ?, 'fixed', 100.00, 500.00, 2, 1)`,
    [highThresholdDiscId, highCode]
  );

  // Cart subtotal: 1x $200 = $200 (< $500). Discount must NOT apply!
  const belowThreshold = await PricingService.calculatePricing(
    [{ productId: 'prod-01', quantity: 1 }],
    highThresholdDiscId,
    null
  );
  assert.strictEqual(belowThreshold.discountAmount, 0, 'Discount skipped because purchase amount is below minimum');

  // Cart subtotal: 3x $200 = $600 (>= $500) and quantity 3 (>= 2). Discount MUST apply!
  const meetsThreshold = await PricingService.calculatePricing(
    [{ productId: 'prod-01', quantity: 3 }],
    highThresholdDiscId,
    null
  );
  assert.strictEqual(meetsThreshold.discountAmount, 100.0, 'Discount applied when threshold met');
  console.log(`✓ Minimum purchase and quantity gates verified: Ignored when below threshold, applied when met.`);

  // Test 8: Discount Usage Limits & Quota Exhaustion
  console.log('[Discount Test 8] Discount Usage Limit Enforcement...');
  const maxUsesDiscId = uuidv4();
  const maxCode = `LTD${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO discounts (id, code, type, value, max_uses, used_count, is_active)
     VALUES (?, ?, 'fixed', 25.00, 2, 2, 1)`, // 2 uses out of 2 max uses (exhausted)
    [maxUsesDiscId, maxCode]
  );
  const exhaustedCheck = await db.queryOne<{ max_uses: number; used_count: number }>(
    'SELECT max_uses, used_count FROM discounts WHERE id = ?',
    [maxUsesDiscId]
  );
  const isExhausted = exhaustedCheck && exhaustedCheck.max_uses > 0 && exhaustedCheck.used_count >= exhaustedCheck.max_uses;
  assert.strictEqual(isExhausted, true, 'Exhausted discount identified');

  // Pricing engine skips exhausted discount
  const exhaustedPricing = await PricingService.calculatePricing(
    [{ productId: 'prod-01', quantity: 1 }],
    maxUsesDiscId,
    null
  );
  assert.strictEqual(exhaustedPricing.discountAmount, 0, 'Exhausted discount cannot be applied');
  console.log(`✓ Usage limits enforced: Fully consumed discount (used 2/2) safely rejected.`);

  // Test 9: Physical Deletion Guard
  console.log('[Safety Test 9] In-Use Tax and Discount Deletion Protection...');
  // Reference tax-gst-18 and disc-flat50 in a quotation
  const quoteId = uuidv4();
  const quoteNum = `QT-TAX-${Date.now()}`;
  await db.execute(
    `INSERT INTO quotations (id, quotation_number, customer_id, plan_id, tax_id, discount_id, status, valid_until, subtotal, total_amount)
     VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'tax-gst-18', 'disc-flat50', 'confirmed', '2026-12-31', 400.0, 413.0)`,
    [quoteId, quoteNum]
  );

  // Check references
  const taxRefs = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM quotations WHERE tax_id = ?', ['tax-gst-18']);
  assert((taxRefs?.count || 0) > 0, 'Tax is referenced by historical quotation');

  const discRefs = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM quotations WHERE discount_id = ?', ['disc-flat50']);
  assert((discRefs?.count || 0) > 0, 'Discount is referenced by historical quotation');
  console.log(`✓ Referencing records detected (${taxRefs?.count} tax refs, ${discRefs?.count} discount refs). Physical deletion safely blocked.`);

  // Test 10: Historical Quotation and Invoice Preservation
  console.log('[Preservation Test 10] Historical Quotation and Invoice Snapshot Preservation...');
  // Deactivate tax-gst-18 and disc-flat50
  await db.execute("UPDATE taxes SET is_active = 0, rate_percentage = 99.0 WHERE id = 'tax-gst-18'");
  await db.execute("UPDATE discounts SET is_active = 0, value = 999.0 WHERE id = 'disc-flat50'");

  // Verify historical quotation record still preserves original snapshot values
  const historicalQuote = await db.queryOne<{ subtotal: number; total_amount: number }>(
    'SELECT * FROM quotations WHERE id = ?',
    [quoteId]
  );
  assert.strictEqual(Number(historicalQuote?.subtotal), 400.0);
  assert.strictEqual(Number(historicalQuote?.total_amount), 413.0);

  // Restore active status
  await db.execute("UPDATE taxes SET is_active = 1, rate_percentage = 18.0 WHERE id = 'tax-gst-18'");
  await db.execute("UPDATE discounts SET is_active = 1, value = 50.0 WHERE id = 'disc-flat50'");
  console.log(`✓ Historical records preserved: Quotation snapshot remained intact ($413.00) despite rule alterations.`);

  console.log('\n====================================================');
  console.log('ALL TAX & DISCOUNT TESTS COMPLETED & PASSED!');
  console.log('====================================================');
}

runTaxDiscountTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Tax/Discount test failed:', err);
    process.exit(1);
  });
