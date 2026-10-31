import test from 'node:test';
import assert from 'node:assert';

test('Quotation: Form validation enforces customer, plan, line items and non-past validity date', () => {
  const validateQuotationForm = (data, today) => {
    if (!data.customer_id) {
      return { valid: false, error: 'Customer is required' };
    }
    if (!data.plan_id) {
      return { valid: false, error: 'Subscription plan is required' };
    }
    if (!data.valid_until || data.valid_until < today) {
      return { valid: false, error: 'Valid Until date cannot be in the past' };
    }
    if (!data.lines || data.lines.length === 0) {
      return { valid: false, error: 'At least one product line is required' };
    }
    for (const line of data.lines) {
      if (!line.product_id) {
        return { valid: false, error: 'Product is required for each line' };
      }
      if (!line.quantity || line.quantity < 1) {
        return { valid: false, error: 'Quantity must be at least 1' };
      }
    }
    return { valid: true };
  };

  const today = '2026-10-31';

  // Valid quotation
  const valid = validateQuotationForm(
    {
      customer_id: 'cust-01',
      plan_id: 'plan-01',
      valid_until: '2026-12-31',
      lines: [{ product_id: 'prod-01', quantity: 2 }],
    },
    today
  );
  assert.strictEqual(valid.valid, true);

  // Past validity date rejection
  const past = validateQuotationForm(
    {
      customer_id: 'cust-01',
      plan_id: 'plan-01',
      valid_until: '2026-09-01',
      lines: [{ product_id: 'prod-01', quantity: 1 }],
    },
    today
  );
  assert.strictEqual(past.valid, false);
  assert.strictEqual(past.error, 'Valid Until date cannot be in the past');

  // Missing lines rejection
  const noLines = validateQuotationForm(
    { customer_id: 'cust-01', plan_id: 'plan-01', valid_until: '2026-12-31', lines: [] },
    today
  );
  assert.strictEqual(noLines.valid, false);

  // Invalid quantity rejection
  const zeroQty = validateQuotationForm(
    {
      customer_id: 'cust-01',
      plan_id: 'plan-01',
      valid_until: '2026-12-31',
      lines: [{ product_id: 'prod-01', quantity: 0 }],
    },
    today
  );
  assert.strictEqual(zeroQty.valid, false);
  assert.strictEqual(zeroQty.error, 'Quantity must be at least 1');
});

test('Quotation: Expiry status determination logic evaluates validity date vs current date', () => {
  const evaluateExpiry = (quote, today) => {
    if (quote.status === 'confirmed' || quote.status === 'cancelled') {
      return quote.status;
    }
    if (quote.valid_until < today || quote.status === 'expired') {
      return 'expired';
    }
    return quote.status;
  };

  const today = '2026-10-31';

  // Active quote within validity window
  assert.strictEqual(
    evaluateExpiry({ status: 'quotation', valid_until: '2026-11-15' }, today),
    'quotation'
  );

  // Quote past validity date
  assert.strictEqual(
    evaluateExpiry({ status: 'quotation', valid_until: '2026-10-15' }, today),
    'expired'
  );

  // Draft past validity date
  assert.strictEqual(
    evaluateExpiry({ status: 'draft', valid_until: '2026-09-01' }, today),
    'expired'
  );

  // Confirmed quote past validity date remains confirmed
  assert.strictEqual(
    evaluateExpiry({ status: 'confirmed', valid_until: '2026-09-01' }, today),
    'confirmed'
  );

  // Cancelled quote past validity date remains cancelled
  assert.strictEqual(
    evaluateExpiry({ status: 'cancelled', valid_until: '2026-09-01' }, today),
    'cancelled'
  );
});

test('Quotation: Lifecycle status mutability matrix', () => {
  const canConfirm = (quote, today, isCustomer) => {
    if (isCustomer) return false;
    if (quote.status === 'confirmed' || quote.status === 'cancelled') return false;
    if (quote.status === 'expired' || quote.valid_until < today) return false;
    return ['draft', 'quotation', 'sent'].includes(quote.status);
  };

  const canCancel = (quote, isCustomer) => {
    if (isCustomer) return false;
    if (quote.status === 'confirmed' || quote.status === 'cancelled') return false;
    return true;
  };

  const today = '2026-10-31';

  // Active quotation can be confirmed and cancelled by staff
  const activeQuote = { status: 'quotation', valid_until: '2026-12-31' };
  assert.strictEqual(canConfirm(activeQuote, today, false), true);
  assert.strictEqual(canCancel(activeQuote, false), true);

  // Customer cannot confirm or cancel
  assert.strictEqual(canConfirm(activeQuote, today, true), false);
  assert.strictEqual(canCancel(activeQuote, true), false);

  // Expired quote cannot be confirmed, but can be cancelled
  const expiredQuote = { status: 'expired', valid_until: '2026-09-01' };
  assert.strictEqual(canConfirm(expiredQuote, today, false), false);
  assert.strictEqual(canCancel(expiredQuote, false), true);

  // Confirmed quote cannot be confirmed again and cannot be cancelled
  const confirmedQuote = { status: 'confirmed', valid_until: '2026-12-31' };
  assert.strictEqual(canConfirm(confirmedQuote, today, false), false);
  assert.strictEqual(canCancel(confirmedQuote, false), false);

  // Cancelled quote cannot be confirmed and cannot be cancelled again
  const cancelledQuote = { status: 'cancelled', valid_until: '2026-12-31' };
  assert.strictEqual(canConfirm(cancelledQuote, today, false), false);
  assert.strictEqual(canCancel(cancelledQuote, false), false);
});

test('Quotation: Search and status filter matching', () => {
  const quotes = [
    { id: 'q1', quotation_number: 'QT-1001', customer_name: 'Acme Corp', company_name: 'Acme Global', plan_name: 'Enterprise Plan', status: 'quotation', valid_until: '2026-12-31' },
    { id: 'q2', quotation_number: 'QT-1002', customer_name: 'Beta LLC', company_name: null, plan_name: 'Starter Plan', status: 'draft', valid_until: '2026-12-31' },
    { id: 'q3', quotation_number: 'QT-1003', customer_name: 'Gamma Inc', company_name: 'Gamma Tech', plan_name: 'Pro Suite', status: 'confirmed', valid_until: '2026-12-31' },
    { id: 'q4', quotation_number: 'QT-1004', customer_name: 'Delta Co', company_name: 'Delta Systems', plan_name: 'Enterprise Plan', status: 'cancelled', valid_until: '2026-12-31' },
  ];

  const filterQuotes = (list, query, status) => {
    return list.filter((q) => {
      const matchesStatus = status === 'all' || q.status === status;
      const qLower = query.toLowerCase().trim();
      const matchesSearch =
        !qLower ||
        q.quotation_number.toLowerCase().includes(qLower) ||
        q.customer_name.toLowerCase().includes(qLower) ||
        (q.company_name && q.company_name.toLowerCase().includes(qLower)) ||
        q.plan_name.toLowerCase().includes(qLower);
      return matchesStatus && matchesSearch;
    });
  };

  // Status filtering
  assert.strictEqual(filterQuotes(quotes, '', 'all').length, 4);
  assert.strictEqual(filterQuotes(quotes, '', 'quotation').length, 1);
  assert.strictEqual(filterQuotes(quotes, '', 'confirmed').length, 1);
  assert.strictEqual(filterQuotes(quotes, '', 'cancelled').length, 1);

  // Search filtering
  assert.strictEqual(filterQuotes(quotes, 'acme', 'all').length, 1);
  assert.strictEqual(filterQuotes(quotes, 'enterprise', 'all').length, 2);
  assert.strictEqual(filterQuotes(quotes, 'QT-1003', 'all').length, 1);
  assert.strictEqual(filterQuotes(quotes, 'non-existent', 'all').length, 0);

  // Combined search and status
  assert.strictEqual(filterQuotes(quotes, 'enterprise', 'quotation').length, 1);
  assert.strictEqual(filterQuotes(quotes, 'enterprise', 'cancelled').length, 1);
});

test('Quotation: Customer vs Staff RBAC action permissions', () => {
  const getPermittedActions = (role) => {
    return {
      canCreateQuotation: ['admin', 'staff'].includes(role),
      canConfirmQuotation: ['admin', 'staff'].includes(role),
      canCancelQuotation: ['admin', 'staff'].includes(role),
      canViewTemplates: ['admin', 'staff'].includes(role),
      canViewAllQuotations: ['admin', 'staff'].includes(role),
    };
  };

  const adminActions = getPermittedActions('admin');
  assert.strictEqual(adminActions.canCreateQuotation, true);
  assert.strictEqual(adminActions.canConfirmQuotation, true);
  assert.strictEqual(adminActions.canCancelQuotation, true);

  const staffActions = getPermittedActions('staff');
  assert.strictEqual(staffActions.canCreateQuotation, true);
  assert.strictEqual(staffActions.canConfirmQuotation, true);
  assert.strictEqual(staffActions.canCancelQuotation, true);

  const customerActions = getPermittedActions('customer');
  assert.strictEqual(customerActions.canCreateQuotation, false);
  assert.strictEqual(customerActions.canConfirmQuotation, false);
  assert.strictEqual(customerActions.canCancelQuotation, false);
  assert.strictEqual(customerActions.canViewTemplates, false);
  assert.strictEqual(customerActions.canViewAllQuotations, false);
});
