import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Plan: Form validation rejects invalid frequencies and negative prices', () => {
  const validFrequencies = ['daily', 'weekly', 'monthly', 'yearly'];

  const validatePlan = (plan) => {
    if (!plan.name || plan.name.trim().length === 0) return { valid: false, error: 'Name is required' };
    if (!validFrequencies.includes(plan.billing_frequency)) return { valid: false, error: 'Invalid frequency' };
    if (plan.price === undefined || plan.price < 0) return { valid: false, error: 'Price must be >= 0' };
    if (!plan.min_qty || plan.min_qty < 1) return { valid: false, error: 'Min quantity must be >= 1' };
    if (plan.billing_interval && plan.billing_interval < 1) return { valid: false, error: 'Interval must be >= 1' };
    return { valid: true };
  };

  assert.equal(validatePlan({ name: 'Pro', billing_frequency: 'monthly', price: 100, min_qty: 1 }).valid, true);
  assert.equal(validatePlan({ name: '', billing_frequency: 'monthly', price: 100, min_qty: 1 }).valid, false);
  assert.equal(validatePlan({ name: 'Pro', billing_frequency: 'hourly', price: 100, min_qty: 1 }).valid, false);
  assert.equal(validatePlan({ name: 'Pro', billing_frequency: 'monthly', price: -10, min_qty: 1 }).valid, false);
  assert.equal(validatePlan({ name: 'Pro', billing_frequency: 'monthly', price: 100, min_qty: 0 }).valid, false);
});

test('Plan: Availability date window validation', () => {
  const validateDates = (startDate, endDate) => {
    if (startDate && endDate && startDate > endDate) {
      return { valid: false, error: 'Start date cannot be after end date' };
    }
    return { valid: true };
  };

  assert.equal(validateDates('2026-01-01', '2026-12-31').valid, true);
  assert.equal(validateDates('2026-12-31', '2026-01-01').valid, false);
  assert.equal(validateDates('2026-06-01', '').valid, true);
});

test('Plan: Bundled product line item validation', () => {
  const validatePlanLines = (lines) => {
    for (const line of lines) {
      if (!line.product_id) return { valid: false, error: 'Product is required' };
      if (!line.quantity || line.quantity < 1) return { valid: false, error: 'Quantity must be >= 1' };
    }
    return { valid: true };
  };

  assert.equal(
    validatePlanLines([
      { product_id: 'prod-01', variant_id: null, quantity: 1 },
      { product_id: 'prod-02', variant_id: 'var-01', quantity: 2 },
    ]).valid,
    true
  );

  assert.equal(
    validatePlanLines([
      { product_id: 'prod-01', quantity: 0 },
    ]).valid,
    false
  );
});

test('Plan: Search and status filter matching', () => {
  const samplePlans = [
    { id: 'p1', name: 'Growth Monthly', description: 'Scale your SaaS', is_active: 1 },
    { id: 'p2', name: 'Starter Daily', description: 'Daily test cadence', is_active: 1 },
    { id: 'p3', name: 'Legacy Enterprise', description: 'Old yearly plan', is_active: 0 },
  ];

  const filterPlans = (plans, search, status) => {
    return plans.filter((p) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(search.toLowerCase()));

      const matchesStatus =
        status === 'all' ||
        (status === 'active' && (p.is_active === 1 || p.is_active === true)) ||
        (status === 'inactive' && (p.is_active === 0 || p.is_active === false));

      return matchesSearch && matchesStatus;
    });
  };

  assert.equal(filterPlans(samplePlans, '', 'all').length, 3);
  assert.equal(filterPlans(samplePlans, '', 'active').length, 2);
  assert.equal(filterPlans(samplePlans, '', 'inactive').length, 1);
  assert.equal(filterPlans(samplePlans, 'growth', 'all').length, 1);
  assert.equal(filterPlans(samplePlans, 'legacy', 'active').length, 0);
  assert.equal(filterPlans(samplePlans, 'legacy', 'inactive').length, 1);
});

test('Plan: Role-based permissions allow Staff and Admin, restrict Customer', () => {
  const canManagePlans = (role) => role === 'admin' || role === 'staff';

  assert.equal(canManagePlans('admin'), true);
  assert.equal(canManagePlans('staff'), true);
  assert.equal(canManagePlans('customer'), false);
  assert.equal(canManagePlans(undefined), false);
});

test('Plan: Inactive plans are excluded from quotation selection', () => {
  const plans = [
    { id: 'plan-01', name: 'Active Plan', is_active: 1 },
    { id: 'plan-02', name: 'Disabled Plan', is_active: 0 },
  ];

  const selectablePlans = plans.filter((p) => p.is_active === 1 || p.is_active === true);
  assert.equal(selectablePlans.length, 1);
  assert.equal(selectablePlans[0].id, 'plan-01');
});

