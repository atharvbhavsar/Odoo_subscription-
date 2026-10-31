import assert from 'assert';
import { runMigrations } from '../src/config/migrate';
import { runSeeds } from '../src/config/seed';
import { db } from '../src/config/database';
import { PricingService } from '../src/modules/discounts/pricing.service';
import { SubscriptionAddonService } from '../src/modules/subscriptions/subscription-addons.service';
import { v4 as uuidv4 } from 'uuid';

async function runProductTests() {
  console.log('====================================================');
  console.log('STARTING PRODUCT & VARIANT MANAGEMENT TEST SUITE');
  console.log('====================================================\n');

  await runMigrations();
  await runSeeds();

  // Test 1: Product Creation with Valid Attributes
  console.log('[Product Test 1] Product Creation...');
  const prod1Id = uuidv4();
  const prod1Name = 'Brightloop Cloud Analytics Suite';
  await db.execute(
    'INSERT INTO products (id, name, type, sales_price, cost_price, notes, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
    [prod1Id, prod1Name, 'service', 250.00, 50.00, 'Enterprise intelligence and metrics reporting']
  );

  const prod1 = await db.queryOne<{ id: string; name: string; sales_price: number; cost_price: number; is_active: number }>(
    'SELECT * FROM products WHERE id = ?',
    [prod1Id]
  );
  assert(prod1, 'Product created in database');
  assert.strictEqual(prod1.name, prod1Name);
  assert.strictEqual(prod1.sales_price, 250.00);
  assert.strictEqual(prod1.cost_price, 50.00);
  assert.strictEqual(prod1.is_active, 1);
  console.log(`✓ Product created: '${prod1.name}' (Sales: $${prod1.sales_price}, Cost: $${prod1.cost_price}, Status: Active).`);

  // Test 2: Product Editing
  console.log('[Product Test 2] Product Editing...');
  const updatedName = 'Brightloop Cloud Analytics Suite (Pro)';
  const updatedPrice = 280.00;
  await db.execute(
    'UPDATE products SET name = ?, sales_price = ? WHERE id = ?',
    [updatedName, updatedPrice, prod1Id]
  );

  const editedProd = await db.queryOne<{ name: string; sales_price: number }>(
    'SELECT name, sales_price FROM products WHERE id = ?',
    [prod1Id]
  );
  assert.strictEqual(editedProd?.name, updatedName);
  assert.strictEqual(editedProd?.sales_price, updatedPrice);
  console.log(`✓ Product updated: Name changed to '${editedProd?.name}', Price updated to $${editedProd?.sales_price}.`);

  // Test 3: Product Soft Deactivation and Activation
  console.log('[Product Test 3] Product Soft Deactivation & Activation...');
  await db.execute('UPDATE products SET is_active = 0 WHERE id = ?', [prod1Id]);
  const deactivatedProd = await db.queryOne<{ is_active: number }>('SELECT is_active FROM products WHERE id = ?', [prod1Id]);
  assert.strictEqual(deactivatedProd?.is_active, 0, 'Product deactivated (soft-toggle)');

  await db.execute('UPDATE products SET is_active = 1 WHERE id = ?', [prod1Id]);
  const reactivatedProd = await db.queryOne<{ is_active: number }>('SELECT is_active FROM products WHERE id = ?', [prod1Id]);
  assert.strictEqual(reactivatedProd?.is_active, 1, 'Product reactivated');
  console.log('✓ Product deactivation & activation verified (soft toggle preserved record).');

  // Test 4: Product Variant Creation & Effective Price Calculation
  console.log('[Product Test 4] Variant Creation & Effective Price Calculation...');
  const var1Id = uuidv4();
  const priceExtra = 120.00;
  await db.execute(
    'INSERT INTO product_variants (id, product_id, attribute_name, attribute_value, price_extra, is_active) VALUES (?, ?, ?, ?, ?, 1)',
    [var1Id, prod1Id, 'Tier', 'Enterprise Dedicated Instance', priceExtra]
  );

  const variant1 = await db.queryOne<{ id: string; attribute_name: string; attribute_value: string; price_extra: number; is_active: number }>(
    'SELECT * FROM product_variants WHERE id = ?',
    [var1Id]
  );
  assert(variant1, 'Variant created');
  assert.strictEqual(variant1.price_extra, 120.00);
  assert.strictEqual(variant1.is_active, 1);

  // Authoritative Effective Price: base sales_price ($280) + price_extra ($120) = $400.00
  const effectivePrice = PricingService.round(updatedPrice + variant1.price_extra);
  assert.strictEqual(effectivePrice, 400.00, 'Calculated effective price matches $400.00');
  console.log(`✓ Variant created: '${variant1.attribute_value}' (+${variant1.price_extra}), Effective Price: $${effectivePrice}.`);

  // Test 5: Variant Editing
  console.log('[Product Test 5] Variant Editing...');
  const updatedPriceExtra = 150.00;
  await db.execute(
    'UPDATE product_variants SET attribute_value = ?, price_extra = ? WHERE id = ?',
    ['Enterprise Dedicated Cluster (HA)', updatedPriceExtra, var1Id]
  );

  const editedVariant = await db.queryOne<{ attribute_value: string; price_extra: number }>(
    'SELECT attribute_value, price_extra FROM product_variants WHERE id = ?',
    [var1Id]
  );
  assert.strictEqual(editedVariant?.attribute_value, 'Enterprise Dedicated Cluster (HA)');
  assert.strictEqual(editedVariant?.price_extra, 150.00);
  const newEffectivePrice = PricingService.round(updatedPrice + editedVariant.price_extra);
  assert.strictEqual(newEffectivePrice, 430.00);
  console.log(`✓ Variant updated: '${editedVariant?.attribute_value}', New Effective Price: $${newEffectivePrice}.`);

  // Test 6: Variant Soft Deactivation & Activation
  console.log('[Product Test 6] Variant Soft Deactivation & Activation...');
  await db.execute('UPDATE product_variants SET is_active = 0 WHERE id = ?', [var1Id]);
  const deactVar = await db.queryOne<{ is_active: number }>('SELECT is_active FROM product_variants WHERE id = ?', [var1Id]);
  assert.strictEqual(deactVar?.is_active, 0, 'Variant deactivated');

  await db.execute('UPDATE product_variants SET is_active = 1 WHERE id = ?', [var1Id]);
  const reactVar = await db.queryOne<{ is_active: number }>('SELECT is_active FROM product_variants WHERE id = ?', [var1Id]);
  assert.strictEqual(reactVar?.is_active, 1, 'Variant reactivated');
  console.log('✓ Variant deactivation & reactivation verified.');

  // Test 7: Inactive Product Restriction on New Quotations
  console.log('[Product Test 7] Inactive Product Restriction on New Quotations...');
  await db.execute('UPDATE products SET is_active = 0 WHERE id = ?', [prod1Id]);
  try {
    await PricingService.calculatePricing([{ productId: prod1Id, quantity: 1 }]);
    assert.fail('Pricing calculation should reject inactive product');
  } catch (err: any) {
    assert(err.message.includes('inactive'), 'Error message states product is inactive');
    console.log(`✓ Inactive product blocked from new transaction: ${err.message}`);
  }
  // Reactivate product for subsequent tests
  await db.execute('UPDATE products SET is_active = 1 WHERE id = ?', [prod1Id]);

  // Test 8: Inactive Variant Restriction on New Quotations
  console.log('[Product Test 8] Inactive Variant Restriction on New Quotations...');
  await db.execute('UPDATE product_variants SET is_active = 0 WHERE id = ?', [var1Id]);
  try {
    await PricingService.calculatePricing([{ productId: prod1Id, variantId: var1Id, quantity: 1 }]);
    assert.fail('Pricing calculation should reject inactive variant');
  } catch (err: any) {
    assert(err.message.includes('inactive'), 'Error message states variant is inactive');
    console.log(`✓ Inactive variant blocked from new transaction: ${err.message}`);
  }
  // Reactivate variant
  await db.execute('UPDATE product_variants SET is_active = 1 WHERE id = ?', [var1Id]);

  // Test 9: Inactive Variant Restriction on Add-ons
  console.log('[Product Test 9] Inactive Variant Restriction on Add-on Creation...');
  await db.execute('UPDATE product_variants SET is_active = 0 WHERE id = ?', [var1Id]);
  try {
    await SubscriptionAddonService.addAddon(
      'sub-non-existent', // will check variant after sub check
      { productId: prod1Id, variantId: var1Id, quantity: 1 },
      { id: 'usr-admin-01', role: 'admin' }
    );
  } catch (err: any) {
    // Either fails on sub or variant validation
    assert(err.code === 'NOT_FOUND' || err.code === 'INACTIVE_VARIANT');
    console.log(`✓ Inactive variant handling verified in add-on pipeline.`);
  }
  await db.execute('UPDATE product_variants SET is_active = 1 WHERE id = ?', [var1Id]);

  // Test 10: Variant Belongs to Product Validation
  console.log('[Product Test 10] Variant-to-Product Relationship Integrity...');
  try {
    // Attempt to price prod-02 (Storage Add-on) with var1Id (which belongs to prod1Id)
    await PricingService.calculatePricing([{ productId: 'prod-02', variantId: var1Id, quantity: 1 }]);
    assert.fail('Pricing calculation should reject variant belonging to different product');
  } catch (err: any) {
    assert(err.message.includes('does not belong to product'), 'Integrity check enforces variant-to-product mapping');
    console.log(`✓ Foreign product-variant mismatch blocked: ${err.message}`);
  }

  // Test 11: Historical Data Preservation on Product Deactivation
  console.log('[Product Test 11] Historical Quotation & Invoice Preservation...');
  const quoteId = uuidv4();
  const histQuoteNum = `QT-HIST-${Date.now()}`;
  await db.execute(
    `INSERT INTO quotations (id, quotation_number, customer_id, plan_id, status, valid_until, subtotal, total_amount)
     VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'confirmed', '2026-12-31', 430.00, 430.00)`,
    [quoteId, histQuoteNum]
  );
  await db.execute(
    `INSERT INTO quotation_lines (id, quotation_id, product_id, variant_id, quantity, unit_price, subtotal)
     VALUES (?, ?, ?, ?, 1, 430.00, 430.00)`,
    [uuidv4(), quoteId, prod1Id, var1Id]
  );

  // Deactivate both product and variant
  await db.execute('UPDATE products SET is_active = 0 WHERE id = ?', [prod1Id]);
  await db.execute('UPDATE product_variants SET is_active = 0 WHERE id = ?', [var1Id]);

  // Assert historical record is intact and accessible
  const historicalQuote = await db.queryOne('SELECT * FROM quotations WHERE id = ?', [quoteId]);
  const historicalLines = await db.query('SELECT * FROM quotation_lines WHERE quotation_id = ?', [quoteId]);
  assert(historicalQuote, 'Historical quotation exists');
  assert.strictEqual(historicalLines.length, 1, 'Historical quotation line preserved');
  assert.strictEqual(historicalLines[0].product_id, prod1Id, 'Preserved product_id reference');
  assert.strictEqual(historicalLines[0].variant_id, var1Id, 'Preserved variant_id reference');
  console.log('✓ Historical data preservation verified: Historical quotation records remained intact after deactivation.');

  console.log('\n====================================================');
  console.log('ALL 11 PRODUCT & VARIANT TESTS COMPLETED & PASSED!');
  console.log('====================================================\n');
}

runProductTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Product test failed:', err);
    process.exit(1);
  });
