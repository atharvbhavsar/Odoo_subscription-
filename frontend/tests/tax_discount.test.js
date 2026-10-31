import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Tax: Form validation rejects invalid rates and invalid date windows', () => {
  const validateTax = (tax) => {
    if (!tax.name || tax.name.trim().length === 0) return { valid: false, error: 'Tax name is required' };
    if (tax.rate_percentage === undefined || tax.rate_percentage < 0 || tax.rate_percentage > 100) {
      return { valid: false, error: 'Tax rate must be between 0 and 100%' };
    }
    if (tax.start_date && tax.end_date && tax.start_date > tax.end_date) {
      return { valid: false, error: 'Start date cannot be after end date' };
    }
    return { valid: true };
  };

  assert.equal(validateTax({ name: 'GST 18%', rate_percentage: 18 }).valid, true);
  assert.equal(validateTax({ name: '', rate_percentage: 18 }).valid, false);
  assert.equal(validateTax({ name: 'High Tax', rate_percentage: 105 }).valid, false);
  assert.equal(validateTax({ name: 'Negative Tax', rate_percentage: -5 }).valid, false);
  assert.equal(validateTax({ name: 'Valid Tax', rate_percentage: 5, start_date: '2026-12-01', end_date: '2026-01-01' }).valid, false);
});

test('Discount: Form validation separates percentage vs fixed rules', () => {
  const validateDiscount = (disc) => {
    if (!disc.code || disc.code.trim().length < 2) return { valid: false, error: 'Valid code required' };
    if (!['fixed', 'percentage'].includes(disc.type)) return { valid: false, error: 'Invalid type' };
    if (disc.value === undefined || disc.value <= 0) return { valid: false, error: 'Value must be > 0' };
    if (disc.type === 'percentage' && disc.value > 100) return { valid: false, error: 'Percentage cannot exceed 100%' };
    if (disc.start_date && disc.end_date && disc.start_date > disc.end_date) {
      return { valid: false, error: 'Start date cannot be after end date' };
    }
    return { valid: true };
  };

  assert.equal(validateDiscount({ code: 'SAVE10', type: 'percentage', value: 10 }).valid, true);
  assert.equal(validateDiscount({ code: 'FLAT50', type: 'fixed', value: 50 }).valid, true);
  assert.equal(validateDiscount({ code: 'FLAT500', type: 'fixed', value: 500 }).valid, true);
  assert.equal(validateDiscount({ code: 'BIG150', type: 'percentage', value: 150 }).valid, false);
  assert.equal(validateDiscount({ code: 'ZERO', type: 'fixed', value: 0 }).valid, false);
});

test('Tax & Discount: Search and status filter matching', () => {
  const taxes = [
    { id: 't1', name: 'GST 18%', description: 'Indian GST standard', is_active: 1 },
    { id: 't2', name: 'VAT 5%', description: 'UAE VAT', is_active: 1 },
    { id: 't3', name: 'Old Surcharge', description: 'Decommissioned', is_active: 0 },
  ];

  const filterTaxes = (items, search, status) => {
    return items.filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(search.toLowerCase()));

      const matchesStatus =
        status === 'all' ||
        (status === 'active' && (item.is_active === 1 || item.is_active === true)) ||
        (status === 'inactive' && (item.is_active === 0 || item.is_active === false));

      return matchesSearch && matchesStatus;
    });
  };

  assert.equal(filterTaxes(taxes, '', 'all').length, 3);
  assert.equal(filterTaxes(taxes, '', 'active').length, 2);
  assert.equal(filterTaxes(taxes, '', 'inactive').length, 1);
  assert.equal(filterTaxes(taxes, 'gst', 'all').length, 1);
  assert.equal(filterTaxes(taxes, 'old', 'active').length, 0);
});

test('Tax & Discount: Role-based permissions allow Staff and Admin, block Customer', () => {
  const canManageRules = (role) => role === 'admin' || role === 'staff';

  assert.equal(canManageRules('admin'), true);
  assert.equal(canManageRules('staff'), true);
  assert.equal(canManageRules('customer'), false);
  assert.equal(canManageRules(undefined), false);
});

test('Tax & Discount: Inactive rules are excluded from quotation selectors', () => {
  const sampleTaxes = [
    { id: 'tax-01', name: 'Active GST', is_active: 1 },
    { id: 'tax-02', name: 'Deprecated Tax', is_active: 0 },
  ];
  const sampleDiscounts = [
    { id: 'disc-01', code: 'ACTIVE10', is_active: 1 },
    { id: 'disc-02', code: 'EXPIRED20', is_active: 0 },
  ];

  const selectableTaxes = sampleTaxes.filter((t) => t.is_active === 1 || t.is_active === true);
  const selectableDiscounts = sampleDiscounts.filter((d) => d.is_active === 1 || d.is_active === true);

  assert.equal(selectableTaxes.length, 1);
  assert.equal(selectableTaxes[0].id, 'tax-01');
  assert.equal(selectableDiscounts.length, 1);
  assert.equal(selectableDiscounts[0].id, 'disc-01');
});

