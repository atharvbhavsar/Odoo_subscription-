import React, { useEffect, useState } from 'react';
import { subscriptionService } from '../../services/quotation.service';
import { Subscription } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import { SubscriptionAddonsModal } from '../../components/subscriptions/SubscriptionAddonsModal';
import {
  Repeat,
  Pause,
  Play,
  XCircle,
  Layers,
  Search,
  Eye,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  X,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

export const SubscriptionsPage: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'expired' | 'closed'>('all');

  // Modal States
  const [selectedSubForAddons, setSelectedSubForAddons] = useState<Subscription | null>(null);
  const [selectedSubForDetails, setSelectedSubForDetails] = useState<Subscription | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Lifecycle Action Confirmation Dialogs
  const [actionConfirm, setActionConfirm] = useState<{
    type: 'pause' | 'resume' | 'renew' | 'close';
    sub: Subscription;
  } | null>(null);

  const { user } = useAuth();
  const isCustomer = user?.role === 'customer';
  const today = new Date().toISOString().split('T')[0];

  const fetchSubscriptions = async () => {
    try {
      const data = await subscriptionService.getSubscriptions({
        search: searchQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setSubscriptions(data);
    } catch (err) {
      console.error('Error fetching subscriptions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [statusFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSubscriptions();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // View Subscription Details
  const handleOpenDetails = async (sub: Subscription) => {
    setDetailsLoading(true);
    setSelectedSubForDetails(sub);
    try {
      const fullSub = await subscriptionService.getSubscription(sub.id);
      setSelectedSubForDetails(fullSub);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch subscription details');
    } finally {
      setDetailsLoading(false);
    }
  };

  // Execute Lifecycle Actions
  const handleExecuteAction = async () => {
    if (!actionConfirm) return;
    const { type, sub } = actionConfirm;

    setActionLoading(true);
    setActingId(sub.id);
    try {
      if (type === 'pause') {
        await subscriptionService.pause(sub.id);
        alert(`Subscription ${sub.subscription_number} has been paused. Recurring billing is suspended.`);
      } else if (type === 'resume') {
        await subscriptionService.resume(sub.id);
        alert(`Subscription ${sub.subscription_number} is now active. Billing schedule resumed.`);
      } else if (type === 'renew') {
        const res = await subscriptionService.renew(sub.id);
        alert(`Subscription ${sub.subscription_number} successfully renewed until ${res.data?.end_date || 'next period'}!`);
      } else if (type === 'close') {
        await subscriptionService.close(sub.id);
        alert(`Subscription ${sub.subscription_number} has been closed.`);
      }

      setActionConfirm(null);
      if (selectedSubForDetails?.id === sub.id) {
        setSelectedSubForDetails(null);
      }
      fetchSubscriptions();
    } catch (err: any) {
      alert(err.message || `Failed to ${type} subscription`);
    } finally {
      setActionLoading(false);
      setActingId(null);
    }
  };

  // Status counts for tabs
  const statusCounts = subscriptions.reduce(
    (acc, s) => {
      acc.all++;
      const isExp = s.status === 'expired' || (Boolean(s.end_date) && s.end_date! < today && s.status !== 'closed');
      const eff = isExp ? 'expired' : s.status;
      if (eff in acc) {
        (acc as any)[eff]++;
      }
      return acc;
    },
    { all: 0, active: 0, paused: 0, expired: 0, closed: 0 }
  );

  if (loading && subscriptions.length === 0) return <LoadingSpinner message="Loading subscriptions..." />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800">Subscriptions</h1>
        <p className="text-sm text-slate-500">Live active recurring contracts, schedules, add-ons, and lifecycle management</p>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'active', label: 'Active' },
              { key: 'paused', label: 'Paused' },
              { key: 'expired', label: 'Expired' },
              { key: 'closed', label: 'Closed' },
            ] as const
          ).map((tab) => {
            const isActive = statusFilter === tab.key;
            const count = statusCounts[tab.key] || 0;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isActive ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search sub #, customer, plan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase">
            <tr>
              <th className="py-3 px-4">Subscription #</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Plan & Cadence</th>
              <th className="py-3 px-4">Next Billing Date</th>
              <th className="py-3 px-4">Total Amount</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Lifecycle Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subscriptions.length > 0 ? (
              subscriptions.map((s) => {
                const isExp = s.status === 'expired' || (Boolean(s.end_date) && s.end_date! < today && s.status !== 'closed');
                const canPause = s.status === 'active' && Boolean(s.can_pause);
                const canResume = s.status === 'paused';
                const canRenew = s.status !== 'closed' && Boolean(s.can_renew);
                const canClose = s.status !== 'closed' && (!isCustomer || Boolean(s.can_close_early));
                const isActing = actingId === s.id;

                return (
                  <tr key={s.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleOpenDetails(s)}
                        className="font-mono font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center space-x-1"
                        title="View Subscription Details"
                      >
                        <span>{s.subscription_number}</span>
                      </button>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {s.line_count || 1} line item(s){s.active_addon_count ? ` • ${s.active_addon_count} add-on(s)` : ''}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{s.customer_name}</div>
                      {s.company_name && <div className="text-xs text-slate-400">{s.company_name}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-800">{s.plan_name}</span>{' '}
                      <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-slate-100 font-semibold text-slate-600">
                        {s.billing_frequency}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-1 text-xs font-medium text-indigo-600">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{s.next_billing_date}</span>
                      </div>
                      {s.end_date && (
                        <span className={`text-[10px] block mt-0.5 font-medium ${s.end_date < today ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
                          Ends: {s.end_date}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 font-mono">${Number(s.total_amount).toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <Badge status={isExp ? 'expired' : s.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {/* View Details Button */}
                        <button
                          onClick={() => handleOpenDetails(s)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                          title="View Subscription Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Add-ons Button */}
                        {s.status !== 'closed' && (
                          <button
                            onClick={() => setSelectedSubForAddons(s)}
                            title="Manage Add-ons"
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition inline-flex items-center space-x-1"
                          >
                            <Layers className="w-4 h-4" />
                            <span className="text-xs font-semibold hidden sm:inline">Add-ons</span>
                          </button>
                        )}

                        {/* Pause Button */}
                        {canPause && (
                          <button
                            onClick={() => setActionConfirm({ type: 'pause', sub: s })}
                            disabled={actionLoading || isActing}
                            title="Pause Subscription"
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        )}

                        {/* Resume Button */}
                        {canResume && (
                          <button
                            onClick={() => setActionConfirm({ type: 'resume', sub: s })}
                            disabled={actionLoading || isActing}
                            title="Resume Subscription"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}

                        {/* Renew Button */}
                        {canRenew && (
                          <button
                            onClick={() => setActionConfirm({ type: 'renew', sub: s })}
                            disabled={actionLoading || isActing}
                            title="Renew Subscription"
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          >
                            <Repeat className="w-4 h-4" />
                          </button>
                        )}

                        {/* Close Button */}
                        {canClose && (
                          <button
                            onClick={() => setActionConfirm({ type: 'close', sub: s })}
                            disabled={actionLoading || isActing}
                            title="Close Subscription"
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}

                        {s.status === 'closed' && (
                          <span className="text-xs text-slate-400 font-medium">Closed</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Clock className="w-8 h-8 text-slate-300" />
                    <span>No subscriptions found matching the selected filters.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Subscription Details Modal */}
      {selectedSubForDetails && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-bold text-slate-800">{selectedSubForDetails.subscription_number}</h3>
                    <Badge status={selectedSubForDetails.end_date && selectedSubForDetails.end_date < today && selectedSubForDetails.status !== 'closed' ? 'expired' : selectedSubForDetails.status} />
                  </div>
                  <p className="text-xs text-slate-500">Contract started on {selectedSubForDetails.start_date}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubForDetails(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status Alert Banners */}
            {selectedSubForDetails.status === 'paused' && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center space-x-2">
                <Pause className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>This subscription is currently <strong>paused</strong>. Automated recurring billing and invoice generation are suspended.</span>
              </div>
            )}

            {selectedSubForDetails.status === 'closed' && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start space-x-2">
                <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Subscription Closed</p>
                  <p className="text-[11px] text-rose-700">Contract ended on {selectedSubForDetails.end_date || 'N/A'}. No future billing will occur.</p>
                </div>
              </div>
            )}

            {selectedSubForDetails.status === 'expired' && (
              <div className="mb-4 p-3 bg-slate-100 border border-slate-300 text-slate-800 rounded-xl text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-slate-600 flex-shrink-0" />
                <span>Subscription contract expired on <strong>{selectedSubForDetails.end_date}</strong>. Renew to resume active billing.</span>
              </div>
            )}

            {/* Overview Card */}
            <div className="grid grid-cols-2 gap-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl mb-4 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Customer Profile</span>
                <span className="font-semibold text-slate-800 text-sm">{selectedSubForDetails.customer_name}</span>
                {selectedSubForDetails.company_name && <span className="text-slate-500 block">{selectedSubForDetails.company_name}</span>}
                {selectedSubForDetails.customer_email && <span className="text-slate-500 block">{selectedSubForDetails.customer_email}</span>}
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Plan & Billing Terms</span>
                <span className="font-semibold text-slate-800 text-sm">{selectedSubForDetails.plan_name}</span>
                <span className="text-slate-500 block capitalize">Frequency: {selectedSubForDetails.billing_frequency}</span>
                <span className="text-slate-500 block">Next Billing: <strong>{selectedSubForDetails.next_billing_date}</strong></span>
                {selectedSubForDetails.end_date && <span className="text-slate-500 block">Contract End Date: <strong>{selectedSubForDetails.end_date}</strong></span>}
              </div>
            </div>

            {/* Plan Lifecycle Policy Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-4 p-2.5 bg-slate-50/50 rounded-xl border border-slate-100 text-[11px]">
              <span className="font-semibold text-slate-500">Plan Policy Rules:</span>
              <span className={`px-2 py-0.5 rounded-md font-medium ${selectedSubForDetails.can_pause ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                {selectedSubForDetails.can_pause ? '✓ Pausing Allowed' : '✗ Pausing Prohibited'}
              </span>
              <span className={`px-2 py-0.5 rounded-md font-medium ${selectedSubForDetails.can_renew ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                {selectedSubForDetails.can_renew ? '✓ Renewal Allowed' : '✗ Renewal Prohibited'}
              </span>
              <span className={`px-2 py-0.5 rounded-md font-medium ${selectedSubForDetails.can_close_early ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                {selectedSubForDetails.can_close_early ? '✓ Early Closure Allowed' : '✗ Early Closure Prohibited for Customer'}
              </span>
            </div>

            {/* Contract Lines */}
            <div className="mb-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">Base Contract Line Items</h4>
              {detailsLoading ? (
                <div className="py-4 text-center text-slate-400 text-xs">Loading items...</div>
              ) : selectedSubForDetails.lines && selectedSubForDetails.lines.length > 0 ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Product / Specification</th>
                        <th className="py-2.5 px-3 text-center">Qty</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedSubForDetails.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-800 block">{l.product_name}</span>
                            {l.attribute_value && (
                              <span className="text-[11px] text-slate-500">
                                Variant: {l.attribute_value} {l.variant_price_extra ? `(+${Number(l.variant_price_extra).toFixed(2)})` : ''}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-medium text-slate-700">{l.quantity}</td>
                          <td className="py-2.5 px-3 text-right text-slate-700 font-mono">${Number(l.unit_price).toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono">${Number(l.subtotal).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-3 text-center text-slate-400 text-xs">No lines recorded.</div>
              )}
            </div>

            {/* Attached Add-ons Section */}
            {selectedSubForDetails.addons && selectedSubForDetails.addons.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase">Attached Add-ons ({selectedSubForDetails.addons.length})</h4>
                  {selectedSubForDetails.status !== 'closed' && (
                    <button
                      onClick={() => {
                        setSelectedSubForAddons(selectedSubForDetails);
                      }}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      Manage Add-ons &rarr;
                    </button>
                  )}
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Add-on Product</th>
                        <th className="py-2.5 px-3 text-center">Qty</th>
                        <th className="py-2.5 px-3">Effective Range</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedSubForDetails.addons.map((a) => (
                        <tr key={a.id}>
                          <td className="py-2.5 px-3 font-medium text-slate-800">
                            {a.product_name}
                            {a.attribute_value && <span className="text-[11px] text-slate-400 block">{a.attribute_value}</span>}
                          </td>
                          <td className="py-2.5 px-3 text-center font-medium text-slate-700">{a.quantity}</td>
                          <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                            {a.effective_start_date} {a.effective_end_date ? `to ${a.effective_end_date}` : '(Indefinite)'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge status={a.status} />
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">${Number(a.unit_price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Invoices History */}
            {selectedSubForDetails.invoices && selectedSubForDetails.invoices.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">Recent Invoices Generated</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <tr>
                        <th className="py-2 px-3">Invoice #</th>
                        <th className="py-2 px-3">Period</th>
                        <th className="py-2 px-3 text-center">Status</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedSubForDetails.invoices.map((inv) => (
                        <tr key={inv.id}>
                          <td className="py-2 px-3 font-mono font-medium text-slate-800">{inv.invoice_number}</td>
                          <td className="py-2 px-3 text-slate-500 text-[11px] font-mono">{inv.period_start} &rarr; {inv.period_end}</td>
                          <td className="py-2 px-3 text-center"><Badge status={inv.status} /></td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">${Number(inv.total_amount).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Financial Totals */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs mb-6">
              <div className="flex justify-between text-slate-600">
                <span>Base Subtotal:</span>
                <span className="font-mono font-medium">${Number(selectedSubForDetails.subtotal).toFixed(2)}</span>
              </div>
              {Number(selectedSubForDetails.discount_amount) > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Discount {selectedSubForDetails.discount_code ? `(${selectedSubForDetails.discount_code})` : ''}:</span>
                  <span className="font-mono">-${Number(selectedSubForDetails.discount_amount).toFixed(2)}</span>
                </div>
              )}
              {Number(selectedSubForDetails.tax_amount) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax {selectedSubForDetails.tax_name ? `(${selectedSubForDetails.tax_name})` : ''}:</span>
                  <span className="font-mono">+${Number(selectedSubForDetails.tax_amount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-900 font-bold text-sm pt-2 border-t border-slate-200">
                <span>Per-Period Total:</span>
                <span className="font-mono text-indigo-700">${Number(selectedSubForDetails.total_amount).toFixed(2)}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex items-center space-x-2">
                {selectedSubForDetails.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSubForAddons(selectedSubForDetails);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition inline-flex items-center space-x-1"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Manage Add-ons</span>
                  </button>
                )}
                {selectedSubForDetails.status !== 'closed' && (!isCustomer || Boolean(selectedSubForDetails.can_close_early)) && (
                  <button
                    type="button"
                    onClick={() => setActionConfirm({ type: 'close', sub: selectedSubForDetails })}
                    className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition inline-flex items-center space-x-1"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Close Subscription</span>
                  </button>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedSubForDetails(null)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Close
                </button>
                {selectedSubForDetails.status === 'active' && Boolean(selectedSubForDetails.can_pause) && (
                  <button
                    type="button"
                    onClick={() => setActionConfirm({ type: 'pause', sub: selectedSubForDetails })}
                    className="px-3.5 py-2 text-xs bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition inline-flex items-center space-x-1"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </button>
                )}
                {selectedSubForDetails.status === 'paused' && (
                  <button
                    type="button"
                    onClick={() => setActionConfirm({ type: 'resume', sub: selectedSubForDetails })}
                    className="px-3.5 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition inline-flex items-center space-x-1"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </button>
                )}
                {selectedSubForDetails.status !== 'closed' && Boolean(selectedSubForDetails.can_renew) && (
                  <button
                    type="button"
                    onClick={() => setActionConfirm({ type: 'renew', sub: selectedSubForDetails })}
                    className="px-3.5 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition inline-flex items-center space-x-1"
                  >
                    <Repeat className="w-3.5 h-3.5" />
                    <span>Renew Contract</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation Modal */}
      {actionConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-100 mb-4">
              <div
                className={`p-2 rounded-xl ${
                  actionConfirm.type === 'pause'
                    ? 'bg-amber-50 text-amber-600'
                    : actionConfirm.type === 'resume'
                    ? 'bg-emerald-50 text-emerald-600'
                    : actionConfirm.type === 'renew'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-rose-50 text-rose-600'
                }`}
              >
                {actionConfirm.type === 'pause' && <Pause className="w-5 h-5" />}
                {actionConfirm.type === 'resume' && <Play className="w-5 h-5" />}
                {actionConfirm.type === 'renew' && <Repeat className="w-5 h-5" />}
                {actionConfirm.type === 'close' && <AlertTriangle className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 capitalize">{actionConfirm.type} Subscription</h3>
                <p className="text-xs text-slate-500">{actionConfirm.sub.subscription_number}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              {actionConfirm.type === 'pause' &&
                'Are you sure you want to pause this subscription? Recurring billing and automatic invoice generation will be suspended until the subscription is resumed.'}
              {actionConfirm.type === 'resume' &&
                'Are you sure you want to resume this subscription? The contract will return to active status and recurring billing will resume starting today.'}
              {actionConfirm.type === 'renew' &&
                `Are you sure you want to renew this subscription? The contract period will be extended by 1 billing cycle (${actionConfirm.sub.billing_frequency}) and past history will be preserved.`}
              {actionConfirm.type === 'close' &&
                'Are you sure you want to close this subscription? The contract will be terminated immediately, active add-ons will be removed, and no further invoices will be generated.'}
            </p>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setActionConfirm(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                disabled={actionLoading}
                className={`px-4 py-1.5 text-xs text-white font-semibold rounded-lg transition shadow-sm disabled:opacity-50 ${
                  actionConfirm.type === 'pause'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : actionConfirm.type === 'resume'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : actionConfirm.type === 'renew'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {actionLoading ? 'Processing...' : `Confirm ${actionConfirm.type.charAt(0).toUpperCase() + actionConfirm.type.slice(1)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-ons Management Modal */}
      {selectedSubForAddons && (
        <SubscriptionAddonsModal
          subscription={selectedSubForAddons}
          onClose={() => {
            setSelectedSubForAddons(null);
            fetchSubscriptions();
          }}
          onUpdated={() => {
            fetchSubscriptions();
          }}
        />
      )}
    </div>
  );
};
