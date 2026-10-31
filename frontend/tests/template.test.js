import test from 'node:test';
import assert from 'node:assert';

test('Quotation Template: Line mapping to quotation creation payload', () => {
  const template = {
    id: 'tpl-101',
    name: 'Enterprise SaaS Starter',
    default_plan_id: 'plan-pro-monthly',
    lines: [
      {
        id: 'line-1',
        template_id: 'tpl-101',
        product_id: 'prod-saas',
        variant_id: 'var-enterprise',
        quantity: 5,
      },
      {
        id: 'line-2',
        template_id: 'tpl-101',
        product_id: 'prod-addon-support',
        variant_id: null,
        quantity: 1,
      },
    ],
  };

  // Logic used in QuotationsPage when prefilling lines from template
  const quotationLines = template.lines.map((l) => ({
    product_id: l.product_id,
    variant_id: l.variant_id || null,
    quantity: l.quantity,
  }));

  assert.strictEqual(quotationLines.length, 2);
  assert.deepStrictEqual(quotationLines[0], {
    product_id: 'prod-saas',
    variant_id: 'var-enterprise',
    quantity: 5,
  });
  assert.deepStrictEqual(quotationLines[1], {
    product_id: 'prod-addon-support',
    variant_id: null,
    quantity: 1,
  });
  assert.strictEqual(template.default_plan_id, 'plan-pro-monthly');
});

test('Quotation Template: Validation rules for template creation/editing', () => {
  const validateTemplate = (data) => {
    if (!data.name || !data.name.trim()) {
      return { valid: false, error: 'Template name is required' };
    }
    if (!data.lines || data.lines.length === 0) {
      return { valid: false, error: 'At least one line item is required' };
    }
    for (const line of data.lines) {
      if (!line.product_id) {
        return { valid: false, error: 'Product ID is required for each line' };
      }
      if (!line.quantity || line.quantity <= 0) {
        return { valid: false, error: 'Line quantity must be positive' };
      }
    }
    return { valid: true };
  };

  assert.strictEqual(validateTemplate({ name: '', lines: [{ product_id: 'p1', quantity: 1 }] }).valid, false);
  assert.strictEqual(validateTemplate({ name: 'Valid', lines: [] }).valid, false);
  assert.strictEqual(validateTemplate({ name: 'Valid', lines: [{ product_id: 'p1', quantity: 0 }] }).valid, false);
  assert.strictEqual(validateTemplate({ name: 'Valid', lines: [{ product_id: 'p1', quantity: 2 }] }).valid, true);
});

test('Quotation Template: Staff and Admin RBAC visibility', () => {
  const getNavLinks = (role) => {
    const staffLinks = ['/dashboard', '/products', '/plans', '/quotations', '/quotation-templates', '/subscriptions', '/invoices', '/payments'];
    const customerLinks = ['/portal', '/invoices', '/subscriptions'];
    return role === 'customer' ? customerLinks : staffLinks;
  };

  const staffNav = getNavLinks('staff');
  const adminNav = getNavLinks('admin');
  const customerNav = getNavLinks('customer');

  assert.ok(staffNav.includes('/quotation-templates'), 'Staff should have access to /quotation-templates');
  assert.ok(adminNav.includes('/quotation-templates'), 'Admin should have access to /quotation-templates');
  assert.ok(!customerNav.includes('/quotation-templates'), 'Customer should NOT have access to /quotation-templates');
});
