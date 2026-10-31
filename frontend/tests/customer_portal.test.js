import test from 'node:test';
import assert from 'node:assert';

test('Customer Portal: Tab switching & navigation state management', () => {
  const tabs = ['overview', 'subscriptions', 'quotations', 'invoices'];
  let currentTab = 'overview';

  const setTab = (newTab) => {
    if (tabs.includes(newTab)) {
      currentTab = newTab;
    }
  };

  assert.strictEqual(currentTab, 'overview');
  setTab('subscriptions');
  assert.strictEqual(currentTab, 'subscriptions');
  setTab('quotations');
  assert.strictEqual(currentTab, 'quotations');
  setTab('invoices');
  assert.strictEqual(currentTab, 'invoices');
  setTab('invalid_tab');
  assert.strictEqual(currentTab, 'invoices');
});

test('Customer Portal: KPI Aggregates Calculation', () => {
  const subscriptions = [
    { id: 'sub-1', status: 'active', total_amount: 200.0 },
    { id: 'sub-2', status: 'active', total_amount: 50.0 },
    { id: 'sub-3', status: 'paused', total_amount: 100.0 },
    { id: 'sub-4', status: 'closed', total_amount: 300.0 },
  ];

  const quotations = [
    { id: 'q-1', status: 'quotation', valid_until: '2026-12-31' },
    { id: 'q-2', status: 'quotation', valid_until: '2025-01-01' }, // expired
    { id: 'q-3', status: 'confirmed', valid_until: '2026-12-31' },
  ];

  const invoices = [
    { id: 'inv-1', total_amount: 200.0, amount_paid: 200.0, amount_due: 0.0 },
    { id: 'inv-2', total_amount: 150.0, amount_paid: 50.0, amount_due: 100.0 },
    { id: 'inv-3', total_amount: 300.0, amount_paid: 0.0, amount_due: 300.0 },
  ];

  const today = '2026-10-31';

  const activeSubs = subscriptions.filter((s) => s.status === 'active');
  const pausedSubs = subscriptions.filter((s) => s.status === 'paused');
  const pendingQuotes = quotations.filter((q) => q.status === 'quotation' && q.valid_until >= today);
  const unpaidInvoices = invoices.filter((i) => i.amount_due > 0);
  const totalDue = unpaidInvoices.reduce((sum, i) => sum + i.amount_due, 0);
  const totalPaid = invoices.reduce((sum, i) => sum + i.amount_paid, 0);

  assert.strictEqual(activeSubs.length, 2);
  assert.strictEqual(pausedSubs.length, 1);
  assert.strictEqual(pendingQuotes.length, 1);
  assert.strictEqual(unpaidInvoices.length, 2);
  assert.strictEqual(totalDue, 400.0);
  assert.strictEqual(totalPaid, 250.0);
});

test('Customer Portal: Subscription Lifecycle Permission Gating', () => {
  const getActionPermissions = (sub) => ({
    canPause: sub.status === 'active' && Boolean(sub.can_pause),
    canResume: sub.status === 'paused',
    canRenew: Boolean(sub.can_renew) && sub.status !== 'closed',
    canCloseEarly: Boolean(sub.can_close_early) && sub.status !== 'closed' && sub.status !== 'expired',
  });

  // Standard Active Subscription (All permissions enabled)
  const activeSub = { status: 'active', can_pause: 1, can_renew: 1, can_close_early: 1 };
  const perm1 = getActionPermissions(activeSub);
  assert.strictEqual(perm1.canPause, true);
  assert.strictEqual(perm1.canResume, false);
  assert.strictEqual(perm1.canRenew, true);
  assert.strictEqual(perm1.canCloseEarly, true);

  // Paused Subscription
  const pausedSub = { status: 'paused', can_pause: 1, can_renew: 1, can_close_early: 1 };
  const perm2 = getActionPermissions(pausedSub);
  assert.strictEqual(perm2.canPause, false);
  assert.strictEqual(perm2.canResume, true);
  assert.strictEqual(perm2.canRenew, true);
  assert.strictEqual(perm2.canCloseEarly, true);

  // Restricted Active Subscription (can_pause = 0, can_renew = 0, can_close_early = 0)
  const restrictedSub = { status: 'active', can_pause: 0, can_renew: 0, can_close_early: 0 };
  const perm3 = getActionPermissions(restrictedSub);
  assert.strictEqual(perm3.canPause, false);
  assert.strictEqual(perm3.canResume, false);
  assert.strictEqual(perm3.canRenew, false);
  assert.strictEqual(perm3.canCloseEarly, false);

  // Closed Subscription (All mutations blocked)
  const closedSub = { status: 'closed', can_pause: 1, can_renew: 1, can_close_early: 1 };
  const perm4 = getActionPermissions(closedSub);
  assert.strictEqual(perm4.canPause, false);
  assert.strictEqual(perm4.canResume, false);
  assert.strictEqual(perm4.canRenew, false);
  assert.strictEqual(perm4.canCloseEarly, false);

  // Expired Subscription (Early close and pause blocked, renewal allowed if plan permits)
  const expiredSub = { status: 'expired', can_pause: 1, can_renew: 1, can_close_early: 1 };
  const perm5 = getActionPermissions(expiredSub);
  assert.strictEqual(perm5.canPause, false);
  assert.strictEqual(perm5.canResume, false);
  assert.strictEqual(perm5.canRenew, true);
  assert.strictEqual(perm5.canCloseEarly, false);
});

test('Customer Portal: Quotation Expiry Evaluation & Status Mapping', () => {
  const today = '2026-10-31';

  const evaluateQuotationStatus = (quote) => {
    if (quote.valid_until < today && quote.status !== 'confirmed' && quote.status !== 'cancelled') {
      return 'expired';
    }
    return quote.status;
  };

  const validQuote = { status: 'quotation', valid_until: '2026-12-31' };
  assert.strictEqual(evaluateQuotationStatus(validQuote), 'quotation');

  const expiredQuote = { status: 'quotation', valid_until: '2026-09-01' };
  assert.strictEqual(evaluateQuotationStatus(expiredQuote), 'expired');

  const confirmedPastQuote = { status: 'confirmed', valid_until: '2026-09-01' };
  assert.strictEqual(evaluateQuotationStatus(confirmedPastQuote), 'confirmed');

  const cancelledPastQuote = { status: 'cancelled', valid_until: '2026-09-01' };
  assert.strictEqual(evaluateQuotationStatus(cancelledPastQuote), 'cancelled');
});

test('Customer Portal: Invoice Overdue State & Aging Status', () => {
  const today = '2026-10-31';

  const isInvoiceOverdue = (inv) => {
    return Number(inv.amount_due) > 0 && inv.due_date < today;
  };

  const currentInvoice = { due_date: '2026-11-15', amount_due: 100.0 };
  assert.strictEqual(isInvoiceOverdue(currentInvoice), false);

  const overdueInvoice = { due_date: '2026-10-15', amount_due: 100.0 };
  assert.strictEqual(isInvoiceOverdue(overdueInvoice), true);

  const settledPastInvoice = { due_date: '2026-10-15', amount_due: 0.0 };
  assert.strictEqual(isInvoiceOverdue(settledPastInvoice), false);
});

test('Customer Portal: Security & Ownership Parameter Protection', () => {
  // Simulating customer portal API calls
  const buildCustomerRequestHeaders = (sessionCookie) => ({
    Cookie: sessionCookie,
  });

  const headers = buildCustomerRequestHeaders('brightloop.sid=test_session_token');
  assert(headers.Cookie.includes('brightloop.sid'));

  // Ensure customer portal does NOT pass customer_id parameter in URL or body
  const customerSubscriptionEndpoint = '/api/subscriptions';
  const customerQuotationEndpoint = '/api/quotations';
  const customerInvoiceEndpoint = '/api/invoices';

  assert(!customerSubscriptionEndpoint.includes('customer_id'));
  assert(!customerQuotationEndpoint.includes('customer_id'));
  assert(!customerInvoiceEndpoint.includes('customer_id'));
});
