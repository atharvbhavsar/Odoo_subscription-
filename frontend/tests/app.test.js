import test from 'node:test';
import assert from 'node:assert';

test('Frontend UI Helper: Badge color mapping logic', () => {
  const getBadgeClass = (status) => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'paid':
      case 'successful':
        return 'emerald';
      case 'partially_paid':
      case 'paused':
        return 'amber';
      case 'cancelled':
      case 'closed':
        return 'rose';
      default:
        return 'slate';
    }
  };

  assert.strictEqual(getBadgeClass('paid'), 'emerald');
  assert.strictEqual(getBadgeClass('partially_paid'), 'amber');
  assert.strictEqual(getBadgeClass('active'), 'emerald');
  assert.strictEqual(getBadgeClass('cancelled'), 'rose');
  assert.strictEqual(getBadgeClass('draft'), 'slate');
});

test('Frontend Financial Display: Decimal string rounding and balance due', () => {
  const totalAmount = 1614.24;
  const partialPayment = 614.24;
  const expectedRemaining = Math.max(0, Math.round((totalAmount - partialPayment) * 100) / 100);

  assert.strictEqual(expectedRemaining, 1000.00);
  assert.strictEqual(expectedRemaining.toFixed(2), '1000.00');
});

test('Frontend RBAC: Navigation item filtering by role', () => {
  const staffNavItems = ['Dashboard', 'Products', 'Plans', 'Quotations', 'Subscriptions', 'Invoices'];
  const customerNavItems = ['Customer Portal', 'My Invoices', 'My Subscriptions'];

  const getNavForRole = (role) => (role === 'customer' ? customerNavItems : staffNavItems);

  assert.deepStrictEqual(getNavForRole('customer'), customerNavItems);
  assert.deepStrictEqual(getNavForRole('staff'), staffNavItems);
  assert.deepStrictEqual(getNavForRole('admin'), staffNavItems);
});

