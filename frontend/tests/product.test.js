import test from 'node:test';
import assert from 'node:assert';

// 1. Product Form Input Validation
test('Product: Form validation rejects invalid inputs and negative pricing', () => {
  const validateProductForm = (form) => {
    if (!form.name || !form.name.trim()) {
      return { valid: false, error: 'Product name is required' };
    }
    const salesPrice = Number(form.sales_price);
    if (isNaN(salesPrice) || salesPrice < 0) {
      return { valid: false, error: 'Sales price must be a non-negative number' };
    }
    const costPrice = Number(form.cost_price);
    if (isNaN(costPrice) || costPrice < 0) {
      return { valid: false, error: 'Cost price must be a non-negative number' };
    }
    return { valid: true };
  };

  assert.strictEqual(validateProductForm({ name: '', sales_price: 100, cost_price: 20 }).valid, false);
  assert.strictEqual(validateProductForm({ name: 'Valid Product', sales_price: -10, cost_price: 0 }).valid, false);
  assert.strictEqual(validateProductForm({ name: 'Valid Product', sales_price: 100, cost_price: -5 }).valid, false);
  assert.strictEqual(validateProductForm({ name: 'Valid Product', sales_price: 150.50, cost_price: 30.00 }).valid, true);
});

// 2. Variant Form Validation & Effective Price Calculation
test('Product Variant: Form validation and authoritative effective price calculation', () => {
  const calculateEffectivePrice = (basePrice, priceExtra) => {
    const base = Number(basePrice) || 0;
    const extra = Number(priceExtra) || 0;
    const total = Math.round((base + extra + Number.EPSILON) * 100) / 100;
    return total;
  };

  const validateVariant = (basePrice, variant) => {
    if (!variant.attribute_name || !variant.attribute_name.trim()) {
      return { valid: false, error: 'Attribute name is required' };
    }
    if (!variant.attribute_value || !variant.attribute_value.trim()) {
      return { valid: false, error: 'Attribute value is required' };
    }
    const effective = calculateEffectivePrice(basePrice, variant.price_extra);
    if (effective < 0) {
      return { valid: false, error: 'Effective price cannot be negative' };
    }
    return { valid: true, effectivePrice: effective };
  };

  // Base price $200 + variant extra $560 = $760.00
  const validResult = validateVariant(200, {
    attribute_name: 'Brand',
    attribute_value: 'Odoo Brand Edition',
    price_extra: 560,
  });
  assert.strictEqual(validResult.valid, true);
  assert.strictEqual(validResult.effectivePrice, 760.00);

  // Discount variant: base $100 + extra -$20 = $80.00
  const discountVariant = validateVariant(100, {
    attribute_name: 'Tier',
    attribute_value: 'Starter Discount',
    price_extra: -20,
  });
  assert.strictEqual(discountVariant.valid, true);
  assert.strictEqual(discountVariant.effectivePrice, 80.00);

  // Excessive negative extra leading to negative effective price
  const invalidResult = validateVariant(50, {
    attribute_name: 'Tier',
    attribute_value: 'Illegal Discount',
    price_extra: -60,
  });
  assert.strictEqual(invalidResult.valid, false);
  assert.strictEqual(invalidResult.error, 'Effective price cannot be negative');
});

// 3. Search and Filtering Logic
test('Product: Client-side search and status filter matching', () => {
  const products = [
    { id: 'p1', name: 'Brightloop ERP Core', notes: 'Complete ERP suite', is_active: 1 },
    { id: 'p2', name: 'Cloud Storage 100GB', notes: 'Add-on storage', is_active: 1 },
    { id: 'p3', name: 'Legacy Accounting Module', notes: 'Deprecated software', is_active: 0 },
  ];

  const filterProducts = (list, query, status) => {
    return list.filter((p) => {
      const matchesSearch =
        !query ||
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        (p.notes && p.notes.toLowerCase().includes(query.toLowerCase()));
      const matchesStatus =
        status === 'all' ||
        (status === 'active' && p.is_active === 1) ||
        (status === 'inactive' && p.is_active === 0);
      return matchesSearch && matchesStatus;
    });
  };

  // Status filtering
  assert.strictEqual(filterProducts(products, '', 'all').length, 3);
  assert.strictEqual(filterProducts(products, '', 'active').length, 2);
  assert.strictEqual(filterProducts(products, '', 'inactive').length, 1);
  assert.strictEqual(filterProducts(products, '', 'inactive')[0].id, 'p3');

  // Search filtering
  assert.strictEqual(filterProducts(products, 'storage', 'all').length, 1);
  assert.strictEqual(filterProducts(products, 'storage', 'all')[0].id, 'p2');
  assert.strictEqual(filterProducts(products, 'deprecated', 'all').length, 1);
  assert.strictEqual(filterProducts(products, 'nonexistent', 'all').length, 0);
});

// 4. Role-Based Access for Product & Variant Management
test('Product: Role-based permissions allow Staff and Admin, block Customer', () => {
  const canManageProducts = (role) => {
    return role === 'admin' || role === 'staff';
  };

  assert.strictEqual(canManageProducts('admin'), true);
  assert.strictEqual(canManageProducts('staff'), true);
  assert.strictEqual(canManageProducts('customer'), false);
  assert.strictEqual(canManageProducts('viewer'), false);
});

// 5. Inactive Product/Variant Transaction Restriction
test('Product: Inactive products and variants are blocked from new selection', () => {
  const isSelectableForNewTransaction = (product, variant) => {
    if (!product || product.is_active !== 1) {
      return { selectable: false, reason: 'Product is inactive' };
    }
    if (variant && variant.is_active === 0) {
      return { selectable: false, reason: 'Variant is inactive' };
    }
    return { selectable: true };
  };

  const activeProduct = { id: 'p1', name: 'Active Core', is_active: 1 };
  const inactiveProduct = { id: 'p2', name: 'Inactive Core', is_active: 0 };
  const activeVariant = { id: 'v1', attribute_value: 'Active Edition', is_active: 1 };
  const inactiveVariant = { id: 'v2', attribute_value: 'Retired Edition', is_active: 0 };

  assert.strictEqual(isSelectableForNewTransaction(activeProduct, activeVariant).selectable, true);
  assert.strictEqual(isSelectableForNewTransaction(activeProduct, null).selectable, true);
  assert.strictEqual(isSelectableForNewTransaction(inactiveProduct, null).selectable, false);
  assert.strictEqual(isSelectableForNewTransaction(activeProduct, inactiveVariant).selectable, false);
});

