import test from 'node:test';
import assert from 'node:assert';

// Step 10: Subscription Lifecycle Frontend Unit Tests

test('Subscription Lifecycle: State transitions and permissible action buttons', () => {
  const getAvailableActions = (sub, role = 'staff') => {
    const actions = [];
    const status = sub.status;
    const canPause = sub.can_pause ?? 1;
    const canRenew = sub.can_renew ?? 1;
    const canCloseEarly = sub.can_close_early ?? 1;

    // Pause action
    if (status === 'active' && canPause === 1) {
      actions.push('pause');
    }

    // Resume action
    if (status === 'paused') {
      actions.push('resume');
    }

    // Renew action
    if ((status === 'active' || status === 'expired') && canRenew === 1) {
      actions.push('renew');
    }

    // Close action
    if (status !== 'closed') {
      if (role === 'admin' || role === 'staff') {
        actions.push('close');
      } else if (role === 'customer' && canCloseEarly === 1) {
        actions.push('close');
      }
    }

    return actions;
  };

  // Active subscription with full policies enabled
  const activeSub = { status: 'active', can_pause: 1, can_renew: 1, can_close_early: 1 };
  assert.deepStrictEqual(getAvailableActions(activeSub, 'staff'), ['pause', 'renew', 'close']);

  // Paused subscription
  const pausedSub = { status: 'paused', can_pause: 1, can_renew: 1, can_close_early: 1 };
  assert.deepStrictEqual(getAvailableActions(pausedSub, 'staff'), ['resume', 'close']);

  // Expired subscription
  const expiredSub = { status: 'expired', can_pause: 1, can_renew: 1, can_close_early: 1 };
  assert.deepStrictEqual(getAvailableActions(expiredSub, 'staff'), ['renew', 'close']);

  // Closed subscription - strictly no further lifecycle actions permitted
  const closedSub = { status: 'closed', can_pause: 1, can_renew: 1, can_close_early: 1 };
  assert.deepStrictEqual(getAvailableActions(closedSub, 'staff'), []);
});

test('Subscription Lifecycle: Plan policy restrictions for pause, renew, and early close', () => {
  const getAvailableActions = (sub, role = 'staff') => {
    const actions = [];
    if (sub.status === 'active' && sub.can_pause === 1) actions.push('pause');
    if (sub.status === 'paused') actions.push('resume');
    if ((sub.status === 'active' || sub.status === 'expired') && sub.can_renew === 1) actions.push('renew');
    if (sub.status !== 'closed') {
      if (role !== 'customer' || sub.can_close_early === 1) actions.push('close');
    }
    return actions;
  };

  // Policy can_pause = 0 prohibits pausing
  const noPauseSub = { status: 'active', can_pause: 0, can_renew: 1, can_close_early: 1 };
  const actionsNoPause = getAvailableActions(noPauseSub, 'staff');
  assert(!actionsNoPause.includes('pause'), 'can_pause=0 must prevent pause action');
  assert(actionsNoPause.includes('renew'));

  // Policy can_renew = 0 prohibits renewing
  const noRenewSub = { status: 'active', can_pause: 1, can_renew: 0, can_close_early: 1 };
  const actionsNoRenew = getAvailableActions(noRenewSub, 'staff');
  assert(!actionsNoRenew.includes('renew'), 'can_renew=0 must prevent renew action');
  assert(actionsNoRenew.includes('pause'));

  // Policy can_close_early = 0 restricts customer self-service cancellation
  const lockInSub = { status: 'active', can_pause: 1, can_renew: 1, can_close_early: 0 };
  const custActions = getAvailableActions(lockInSub, 'customer');
  assert(!custActions.includes('close'), 'Customer cannot close early when can_close_early=0');

  // Staff/admin can still manage closure even for lock-in contracts
  const staffActions = getAvailableActions(lockInSub, 'staff');
  assert(staffActions.includes('close'), 'Staff/admin can manage closure on lock-in contracts');
});

test('Subscription Lifecycle: Calendar-safe date advancement engine', () => {
  const advanceDate = (dateStr, frequency, interval = 1) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));

    if (frequency === 'daily') {
      date.setUTCDate(date.getUTCDate() + interval);
    } else if (frequency === 'weekly') {
      date.setUTCDate(date.getUTCDate() + (7 * interval));
    } else if (frequency === 'monthly') {
      const targetMonth = date.getUTCMonth() + interval;
      const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
      const normalizedMonth = ((targetMonth % 12) + 12) % 12;
      const daysInTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
      const clampedDay = Math.min(d, daysInTargetMonth);
      return `${targetYear}-${String(normalizedMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
    } else if (frequency === 'yearly') {
      const targetYear = date.getUTCFullYear() + interval;
      const month = date.getUTCMonth();
      const daysInTargetMonth = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
      const clampedDay = Math.min(d, daysInTargetMonth);
      return `${targetYear}-${String(month + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
    }
    return date.toISOString().split('T')[0];
  };

  // Daily
  assert.strictEqual(advanceDate('2026-10-31', 'daily', 1), '2026-11-01');

  // Weekly
  assert.strictEqual(advanceDate('2026-10-24', 'weekly', 1), '2026-10-31');

  // Month-end clamping (Jan 31 -> Feb 28 in standard year 2026)
  assert.strictEqual(advanceDate('2026-01-31', 'monthly', 1), '2026-02-28');

  // Leap-year clamping (Jan 31 -> Feb 29 in leap year 2028)
  assert.strictEqual(advanceDate('2028-01-31', 'monthly', 1), '2028-02-29');

  // Month-end 31 to 30 (Mar 31 -> Apr 30)
  assert.strictEqual(advanceDate('2026-03-31', 'monthly', 1), '2026-04-30');

  // Yearly leap-year to non-leap year (Feb 29, 2028 -> Feb 28, 2029)
  assert.strictEqual(advanceDate('2028-02-29', 'yearly', 1), '2029-02-28');
});

test('Subscription Lifecycle: Subscriptions page search and status tab filtering', () => {
  const subscriptions = [
    { subscription_number: 'SUB-2026-001', customer_name: 'Acme Corp', company_name: 'Acme Inc', plan_name: 'Professional Monthly', status: 'active' },
    { subscription_number: 'SUB-2026-002', customer_name: 'Beta Global', company_name: 'Beta Corp', plan_name: 'Enterprise Annual', status: 'paused' },
    { subscription_number: 'SUB-2026-003', customer_name: 'Charlie Media', company_name: null, plan_name: 'Professional Monthly', status: 'expired' },
    { subscription_number: 'SUB-2026-004', customer_name: 'Delta Logistics', company_name: 'Delta Freight', plan_name: 'Starter Plan', status: 'closed' },
  ];

  const filterSubscriptions = (subs, statusFilter, searchTerm) => {
    return subs.filter(sub => {
      const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term ||
        sub.subscription_number.toLowerCase().includes(term) ||
        (sub.customer_name && sub.customer_name.toLowerCase().includes(term)) ||
        (sub.company_name && sub.company_name.toLowerCase().includes(term)) ||
        (sub.plan_name && sub.plan_name.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  };

  // Status Tab filtering
  assert.strictEqual(filterSubscriptions(subscriptions, 'all', '').length, 4);
  assert.strictEqual(filterSubscriptions(subscriptions, 'active', '').length, 1);
  assert.strictEqual(filterSubscriptions(subscriptions, 'paused', '').length, 1);
  assert.strictEqual(filterSubscriptions(subscriptions, 'expired', '').length, 1);
  assert.strictEqual(filterSubscriptions(subscriptions, 'closed', '').length, 1);

  // Search filtering
  assert.strictEqual(filterSubscriptions(subscriptions, 'all', 'Acme').length, 1);
  assert.strictEqual(filterSubscriptions(subscriptions, 'all', 'Professional').length, 2);
  assert.strictEqual(filterSubscriptions(subscriptions, 'active', 'Enterprise').length, 0); // Enterprise is paused
  assert.strictEqual(filterSubscriptions(subscriptions, 'paused', 'Beta').length, 1);
});
