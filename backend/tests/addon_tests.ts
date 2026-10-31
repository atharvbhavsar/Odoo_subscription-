import assert from 'node:assert';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/config/database';
import { runMigrations } from '../src/config/migrate';
import { runSeeds } from '../src/config/seed';
import { SubscriptionAddonService } from '../src/modules/subscriptions/subscription-addons.service';

async function runAddonTests() {
  console.log('====================================================');
  console.log('STARTING SUBSCRIPTION ADD-ON MANAGEMENT TEST SUITE');
  console.log('====================================================\n');

  // Step 0: Initialize database
  console.log('[Addon Test 0] Migrating and Seeding Database...');
  await runMigrations();
  await runSeeds();
  console.log('✓ Database migrated and seeded successfully.\n');

  // Context setup
  const staffUser = { id: 'usr-staff-01', role: 'staff' };
  const custAUser = { id: 'usr-cust-01', role: 'customer', customerId: 'cust-01' };
  const custBUser = { id: 'usr-cust-02', role: 'customer', customerId: 'cust-02' };

  // Setup Subscription for Customer A (Active)
  const subAId = uuidv4();
  const subANumber = `SUB-ADDON-${uuidv4().slice(0, 8)}`;
  const nextBillingDate = '2026-11-30'; // next billing cycle in future

  await db.execute(
    `INSERT INTO subscriptions (
      id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency,
      subtotal, discount_amount, tax_amount, total_amount
    ) VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'active', '2026-10-31', ?, 'monthly', 200.00, 0.00, 0.00, 200.00)`,
    [subAId, subANumber, nextBillingDate]
  );

  // Setup Closed Subscription for Customer A
  const closedSubId = uuidv4();
  const closedSubNumber = `SUB-CLOSED-${uuidv4().slice(0, 8)}`;
  await db.execute(
    `INSERT INTO subscriptions (
      id, subscription_number, customer_id, plan_id, status, start_date, next_billing_date, billing_frequency,
      subtotal, discount_amount, tax_amount, total_amount
    ) VALUES (?, ?, 'cust-01', 'plan-monthly-01', 'closed', '2026-01-01', '2026-02-01', 'monthly', 200.00, 0.00, 0.00, 200.00)`,
    [closedSubId, closedSubNumber]
  );

  // 1. Adding an Add-on (Next Billing Period rule)
  console.log('[Addon Test 1] Testing Add-on Addition & Effective-Date Rule...');
  const addonA = await SubscriptionAddonService.addAddon(
    subAId,
    {
      productId: 'prod-02', // Storage Add-on ($50.00)
      quantity: 2,
    },
    custAUser
  );

  assert.strictEqual(addonA.subscription_id, subAId);
  assert.strictEqual(addonA.product_id, 'prod-02');
  assert.strictEqual(addonA.quantity, 2);
  assert.strictEqual(addonA.unit_price, 50.0);
  assert.strictEqual(addonA.effective_start_date, nextBillingDate, 'Must be effective from subscription next_billing_date');
  assert.strictEqual(addonA.status, 'pending_activation', 'Future effective date must be in pending_activation status');
  console.log(`✓ Add-on created with id: ${addonA.id}, effective: ${addonA.effective_start_date}, status: ${addonA.status}.`);

  // 2. Listing Subscription Add-ons
  console.log('\n[Addon Test 2] Testing Listing Subscription Add-ons...');
  const addonsList = await SubscriptionAddonService.getAddons(subAId, custAUser);
  assert.strictEqual(addonsList.length, 1);
  assert.strictEqual(addonsList[0].product_name, 'Storage Add-on (100GB)');
  console.log(`✓ Add-ons listing retrieved ${addonsList.length} item(s) with product details.`);

  // 3. Updating Quantity
  console.log('\n[Addon Test 3] Testing Add-on Quantity Update...');
  const updatedAddon = await SubscriptionAddonService.updateQuantity(subAId, addonA.id, 5, custAUser);
  assert.strictEqual(updatedAddon.quantity, 5);
  console.log(`✓ Add-on quantity updated to ${updatedAddon.quantity}.`);

  // 4. Scheduling Add-on Removal
  console.log('\n[Addon Test 4] Testing Scheduled Add-on Removal...');
  const scheduledRemoval = await SubscriptionAddonService.scheduleRemoval(subAId, addonA.id, custAUser);
  assert.strictEqual(scheduledRemoval.status, 'pending_removal');
  assert.strictEqual(scheduledRemoval.effective_end_date, nextBillingDate);
  console.log(`✓ Add-on removal scheduled for ${scheduledRemoval.effective_end_date} (status: ${scheduledRemoval.status}).`);

  // 5. Negative Test: Cannot update quantity of add-on scheduled for removal
  console.log('\n[Addon Test 5] Testing Negative: Update on Pending Removal Add-on...');
  try {
    await SubscriptionAddonService.updateQuantity(subAId, addonA.id, 10, custAUser);
    assert.fail('Should have failed to update quantity on pending_removal add-on');
  } catch (err: any) {
    assert.strictEqual(err.code, 'CANNOT_UPDATE_REMOVED_ADDON');
    console.log(`✓ Correctly rejected: ${err.message}`);
  }

  // 6. Negative Test: Cannot schedule removal twice
  console.log('\n[Addon Test 6] Testing Negative: Duplicate Removal Request...');
  try {
    await SubscriptionAddonService.scheduleRemoval(subAId, addonA.id, custAUser);
    assert.fail('Should have failed duplicate removal request');
  } catch (err: any) {
    assert.strictEqual(err.code, 'ALREADY_PENDING_REMOVAL');
    console.log(`✓ Correctly rejected duplicate removal request: ${err.message}`);
  }

  // 7. Negative Test: Invalid Product ID
  console.log('\n[Addon Test 7] Testing Negative: Invalid Product ID...');
  try {
    await SubscriptionAddonService.addAddon(
      subAId,
      {
        productId: 'prod-nonexistent',
        quantity: 1,
      },
      custAUser
    );
    assert.fail('Should have failed with invalid product ID');
  } catch (err: any) {
    assert.strictEqual(err.code, 'INVALID_PRODUCT');
    console.log(`✓ Correctly rejected invalid product ID: ${err.message}`);
  }

  // 8. Negative Test: Variant Belonging to Another Product
  console.log('\n[Addon Test 8] Testing Negative: Variant from Another Product...');
  try {
    // var-01 belongs to prod-01, passing it with prod-02
    await SubscriptionAddonService.addAddon(
      subAId,
      {
        productId: 'prod-02',
        variantId: 'var-01',
        quantity: 1,
      },
      custAUser
    );
    assert.fail('Should have rejected variant mismatch');
  } catch (err: any) {
    assert.strictEqual(err.code, 'INVALID_VARIANT');
    console.log(`✓ Correctly rejected variant mismatch: ${err.message}`);
  }

  // 9. Negative Test: Invalid Quantities (Zero and Negative)
  console.log('\n[Addon Test 9] Testing Negative: Invalid Quantities...');
  try {
    await SubscriptionAddonService.addAddon(
      subAId,
      {
        productId: 'prod-01',
        quantity: 0,
      },
      custAUser
    );
    assert.fail('Should have rejected quantity 0');
  } catch (err: any) {
    assert.strictEqual(err.code, 'INVALID_QUANTITY');
    console.log(`✓ Correctly rejected quantity 0.`);
  }

  try {
    await SubscriptionAddonService.addAddon(
      subAId,
      {
        productId: 'prod-01',
        quantity: -3,
      },
      custAUser
    );
    assert.fail('Should have rejected negative quantity');
  } catch (err: any) {
    assert.strictEqual(err.code, 'INVALID_QUANTITY');
    console.log(`✓ Correctly rejected negative quantity.`);
  }

  // 10. Negative Test: Inactive / Closed Subscription
  console.log('\n[Addon Test 10] Testing Negative: Closed Subscription...');
  try {
    await SubscriptionAddonService.addAddon(
      closedSubId,
      {
        productId: 'prod-02',
        quantity: 1,
      },
      custAUser
    );
    assert.fail('Should have rejected add-on for closed subscription');
  } catch (err: any) {
    assert.strictEqual(err.code, 'INVALID_STATUS');
    console.log(`✓ Correctly rejected add-on for closed subscription: ${err.message}`);
  }

  // 11. Customer Ownership Restrictions (Customer B accessing Customer A's subscription)
  console.log('\n[Addon Test 11] Testing Customer Ownership Enforcement...');
  try {
    await SubscriptionAddonService.getAddons(subAId, custBUser);
    assert.fail('Customer B must not access Customer A add-ons');
  } catch (err: any) {
    assert.strictEqual(err.code, 'FORBIDDEN');
    console.log(`✓ Cross-customer add-on viewing blocked: ${err.message}`);
  }

  try {
    await SubscriptionAddonService.addAddon(
      subAId,
      {
        productId: 'prod-01',
        quantity: 1,
      },
      custBUser
    );
    assert.fail('Customer B must not add add-ons to Customer A subscription');
  } catch (err: any) {
    assert.strictEqual(err.code, 'FORBIDDEN');
    console.log(`✓ Cross-customer add-on mutation blocked: ${err.message}`);
  }

  // Staff can access Customer A's subscription
  const staffView = await SubscriptionAddonService.getAddons(subAId, staffUser);
  assert.strictEqual(staffView.length, 1);
  console.log(`✓ Staff authorization verified across customer boundaries.`);

  // 12. Add-on with Valid Variant & Product
  console.log('\n[Addon Test 12] Testing Add-on with Valid Variant (Brand Edition)...');
  const variantAddon = await SubscriptionAddonService.addAddon(
    subAId,
    {
      productId: 'prod-01',
      variantId: 'var-01',
      quantity: 1,
    },
    staffUser
  );
  // prod-01 sales_price is 200, var-01 price_extra is 560 -> 760
  assert.strictEqual(variantAddon.unit_price, 760.0);
  console.log(`✓ Variant add-on created with calculated price $${variantAddon.unit_price}.`);

  // 13. Duplicate or Conflicting Add-on Request
  console.log('\n[Addon Test 13] Testing Negative: Duplicate Active Add-on Request...');
  try {
    await SubscriptionAddonService.addAddon(
      subAId,
      {
        productId: 'prod-01',
        variantId: 'var-01',
        quantity: 2,
      },
      staffUser
    );
    assert.fail('Should have rejected duplicate add-on request');
  } catch (err: any) {
    assert.strictEqual(err.code, 'DUPLICATE_ADDON');
    console.log(`✓ Correctly rejected duplicate active add-on request: ${err.message}`);
  }

  // 14. Billing Engine Integration Helper Query Test
  console.log('\n[Addon Test 14] Testing Billing Helper: getActiveAddonsForPeriod()...');
  // At nextBillingDate ('2026-11-30'):
  // variantAddon has effective_start_date '2026-11-30' and effective_end_date NULL -> included
  // addonA has effective_end_date '2026-11-30' -> effective_end_date > periodStart is FALSE -> excluded from 2026-11-30 cycle
  const activeForNov = await SubscriptionAddonService.getActiveAddonsForPeriod(subAId, nextBillingDate);
  assert.strictEqual(activeForNov.length, 1);
  assert.strictEqual(activeForNov[0].id, variantAddon.id);
  console.log(`✓ Billing integration query correctly returned only active non-removed add-ons for period '${nextBillingDate}'.`);

  console.log('\n====================================================');
  console.log('ALL 14 SUBSCRIPTION ADD-ON TESTS COMPLETED & PASSED!');
  console.log('====================================================\n');
}

runAddonTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Add-on test suite failed:', err);
    process.exit(1);
  });
