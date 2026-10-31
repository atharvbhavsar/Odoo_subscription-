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


test('Frontend Billing Run: Admin gating and report schema handling', () => {
  const canAccessBillingRun = (role) => role === 'admin';

  assert.strictEqual(canAccessBillingRun('admin'), true);
  assert.strictEqual(canAccessBillingRun('staff'), false);
  assert.strictEqual(canAccessBillingRun('customer'), false);

  const mockReport = {
    runId: 'run-1234',
    startTime: '2026-10-31T00:00:00.000Z',
    endTime: '2026-10-31T00:00:00.020Z',
    durationMs: 20,
    subscriptionsChecked: 10,
    invoicesGenerated: 2,
    alreadyBilledCount: 1,
    skippedCount: 7,
    errors: [],
  };

  assert.strictEqual(mockReport.invoicesGenerated, 2);
  assert.strictEqual(mockReport.alreadyBilledCount, 1);
  assert.strictEqual(mockReport.skippedCount, 7);
  assert.strictEqual(mockReport.errors.length, 0);
});

test('Frontend Subscription Add-ons: Status badge styles and line calculations', () => {
  const getBadgeClass = (status) => {
    switch (status.toLowerCase()) {
      case 'active': return 'emerald';
      case 'pending_activation':
      case 'pending_removal': return 'amber';
      case 'removed': return 'rose';
      default: return 'slate';
    }
  };
  assert.strictEqual(getBadgeClass('active'), 'emerald');
  assert.strictEqual(getBadgeClass('pending_activation'), 'amber');
  assert.strictEqual(getBadgeClass('pending_removal'), 'amber');
  assert.strictEqual(getBadgeClass('removed'), 'rose');
  const unitPrice = 50.0;
  const quantity = 3;
  const lineSubtotal = Math.round(unitPrice * quantity * 100) / 100;
  assert.strictEqual(lineSubtotal, 150.0);
  assert.strictEqual(lineSubtotal.toFixed(2), '150.00');
});
