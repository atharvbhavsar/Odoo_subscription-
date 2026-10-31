import test from 'node:test';
import assert from 'node:assert';

// 1. Add-on Payload Creation and Validation
test('Add-on: Payload creation for product and optional variant', () => {
  const buildAddonPayload = ({ productId, variantId, quantity, unitPriceOverride, isCustomer }) => {
    if (!productId) {
      throw new Error('Product is required');
    }
    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty < 1) {
      throw new Error('Quantity must be at least 1');
    }

    const payload = {
      product_id: productId,
      variant_id: variantId || null,
      quantity: parsedQty,
    };

    // Staff can optionally provide unit price override, customers cannot
    if (!isCustomer && unitPriceOverride !== undefined && unitPriceOverride !== '') {
      const parsedPrice = parseFloat(unitPriceOverride);
      if (!isNaN(parsedPrice) && parsedPrice >= 0) {
        payload.unit_price = parsedPrice;
      }
    }

    return payload;
  };

  // Staff payload with variant and price override
  const staffPayload = buildAddonPayload({
    productId: 'prod-storage',
    variantId: 'var-100gb',
    quantity: 2,
    unitPriceOverride: '15.50',
    isCustomer: false,
  });
  assert.deepStrictEqual(staffPayload, {
    product_id: 'prod-storage',
    variant_id: 'var-100gb',
    quantity: 2,
    unit_price: 15.5,
  });

  // Customer payload cannot override price
  const customerPayload = buildAddonPayload({
    productId: 'prod-storage',
    variantId: null,
    quantity: 1,
    unitPriceOverride: '0.00',
    isCustomer: true,
  });
  assert.deepStrictEqual(customerPayload, {
    product_id: 'prod-storage',
    variant_id: null,
    quantity: 1,
  });
});

test('Add-on: Quantity validation rules (positive integers only)', () => {
  const isValidQuantity = (val) => {
    const num = Number(val);
    return Number.isInteger(num) && num > 0;
  };

  assert.strictEqual(isValidQuantity(1), true);
  assert.strictEqual(isValidQuantity(5), true);
  assert.strictEqual(isValidQuantity(0), false);
  assert.strictEqual(isValidQuantity(-1), false);
  assert.strictEqual(isValidQuantity(1.5), false);
  assert.strictEqual(isValidQuantity('abc'), false);
  assert.strictEqual(isValidQuantity(null), false);
});

// 2. Effective Date Display & Next Billing Period Rules
test('Add-on: Effective date determination follows next_billing_date rule', () => {
  const getEffectiveSchedule = (subscription, addonStatus) => {
    const nextBill = subscription.next_billing_date;
    if (!nextBill) {
      return { immediate: true, message: 'Effective immediately on current period' };
    }
    if (addonStatus === 'pending_activation') {
      return {
        effectiveDate: nextBill,
        message: `Takes effect on your next billing date: ${new Date(nextBill).toLocaleDateString()}`,
      };
    }
    if (addonStatus === 'pending_removal') {
      return {
        effectiveDate: nextBill,
        message: `Active until your next billing date: ${new Date(nextBill).toLocaleDateString()}`,
      };
    }
    return { effectiveDate: nextBill, message: 'Active in current billing cycle' };
  };

  const sub = { id: 'sub-1', next_billing_date: '2026-11-01T00:00:00.000Z' };

  const pendingActivationSchedule = getEffectiveSchedule(sub, 'pending_activation');
  assert.strictEqual(pendingActivationSchedule.effectiveDate, '2026-11-01T00:00:00.000Z');
  assert.ok(pendingActivationSchedule.message.includes('Takes effect on your next billing date'));

  const pendingRemovalSchedule = getEffectiveSchedule(sub, 'pending_removal');
  assert.strictEqual(pendingRemovalSchedule.effectiveDate, '2026-11-01T00:00:00.000Z');
  assert.ok(pendingRemovalSchedule.message.includes('Active until your next billing date'));
});

// 3. Status Mutability and Editing Restrictions
test('Add-on: Status mutability prevents editing when pending_removal or removed', () => {
  const canEditQuantity = (addonStatus, subscriptionStatus) => {
    if (subscriptionStatus === 'closed' || subscriptionStatus === 'expired') {
      return false;
    }
    return addonStatus === 'active' || addonStatus === 'pending_activation';
  };

  const canScheduleRemoval = (addonStatus, subscriptionStatus) => {
    if (subscriptionStatus === 'closed' || subscriptionStatus === 'expired') {
      return false;
    }
    return addonStatus === 'active' || addonStatus === 'pending_activation';
  };

  // Active or pending_activation can be edited
  assert.strictEqual(canEditQuantity('active', 'active'), true);
  assert.strictEqual(canEditQuantity('pending_activation', 'active'), true);

  // Pending removal and removed CANNOT be edited
  assert.strictEqual(canEditQuantity('pending_removal', 'active'), false);
  assert.strictEqual(canEditQuantity('removed', 'active'), false);

  // Closed/expired subscriptions lock out all edits
  assert.strictEqual(canEditQuantity('active', 'closed'), false);
  assert.strictEqual(canEditQuantity('active', 'expired'), false);
  assert.strictEqual(canScheduleRemoval('active', 'closed'), false);
});

// 4. Status Badge Variant Mapping
test('Add-on: Badge variant and label formatting', () => {
  const getBadgeConfig = (status) => {
    switch (status) {
      case 'active':
        return { variant: 'success', label: 'Active' };
      case 'pending_activation':
        return { variant: 'info', label: 'Pending Activation' };
      case 'pending_removal':
        return { variant: 'warning', label: 'Pending Removal' };
      case 'removed':
        return { variant: 'default', label: 'Removed' };
      default:
        return { variant: 'default', label: status };
    }
  };

  assert.deepStrictEqual(getBadgeConfig('active'), { variant: 'success', label: 'Active' });
  assert.deepStrictEqual(getBadgeConfig('pending_activation'), { variant: 'info', label: 'Pending Activation' });
  assert.deepStrictEqual(getBadgeConfig('pending_removal'), { variant: 'warning', label: 'Pending Removal' });
  assert.deepStrictEqual(getBadgeConfig('removed'), { variant: 'default', label: 'Removed' });
});

// 5. Staff vs Customer Permission Boundaries
test('Add-on: RBAC permission boundaries for Add-on operations', () => {
  const getAvailableActions = (role, subscription, addon) => {
    const isOwnerOrStaff = role === 'staff' || role === 'admin' || (role === 'customer' && subscription.isOwner);
    if (!isOwnerOrStaff) return [];

    const actions = ['view'];
    if (subscription.status === 'active' || subscription.status === 'paused') {
      if (addon.status === 'active' || addon.status === 'pending_activation') {
        actions.push('update_quantity');
        actions.push('schedule_removal');
      }
      if (role === 'staff' || role === 'admin') {
        actions.push('override_price');
      }
    }
    return actions;
  };

  const sub = { status: 'active', isOwner: true };
  const addon = { status: 'active' };

  const staffActions = getAvailableActions('staff', sub, addon);
  assert.ok(staffActions.includes('update_quantity'));
  assert.ok(staffActions.includes('schedule_removal'));
  assert.ok(staffActions.includes('override_price'));

  const customerActions = getAvailableActions('customer', sub, addon);
  assert.ok(customerActions.includes('update_quantity'));
  assert.ok(customerActions.includes('schedule_removal'));
  assert.ok(!customerActions.includes('override_price'), 'Customer must not have override_price');

  const nonOwnerActions = getAvailableActions('customer', { ...sub, isOwner: false }, addon);
  assert.strictEqual(nonOwnerActions.length, 0, 'Non-owner customer has no access');
});
