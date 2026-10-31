import React, { useEffect, useState } from 'react';
import { subscriptionService } from '../../services/quotation.service';
import { Subscription } from '../../types';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import { Repeat, Pause, Play, XCircle } from 'lucide-react';

export const SubscriptionsPage: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchSubscriptions = async () => {
    try {
      const data = await subscriptionService.getSubscriptions();
      setSubscriptions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const handlePause = async (id: string) => {
    if (!window.confirm('Pause this subscription?')) return;
    setActionLoading(true);
    try {
      await subscriptionService.pause(id);
      fetchSubscriptions();
    } catch (err: any) {
      alert(err.message || 'Failed to pause');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async (id: string) => {
    setActionLoading(true);
    try {
      await subscriptionService.resume(id);
      fetchSubscriptions();
    } catch (err: any) {
      alert(err.message || 'Failed to resume');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async (id: string) => {
    if (!window.confirm('Are you sure you want to close this subscription?')) return;
    setActionLoading(true);
    try {
      await subscriptionService.close(id);
      fetchSubscriptions();
    } catch (err: any) {
      alert(err.message || 'Failed to close');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading subscriptions..." />;

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800">Subscriptions</h1>
        <p className="text-sm text-slate-500">Live active recurring contracts, schedules, and lifecycle status</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase">
            <tr>
              <th className="py-3 px-4">Subscription #</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Plan & Cadence</th>
              <th className="py-3 px-4">Next Billing Date</th>
              <th className="py-3 px-4">Amount</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Lifecycle Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subscriptions.length > 0 ? (
              subscriptions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4 font-mono font-medium text-slate-800">{s.subscription_number}</td>
                  <td className="py-3 px-4 font-medium text-slate-900">{s.customer_name}</td>
                  <td className="py-3 px-4 text-slate-600">
                    <span>{s.plan_name}</span>{' '}
                    <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-slate-100 font-semibold text-slate-600">
                      {s.billing_frequency}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium text-indigo-600">{s.next_billing_date}</td>
                  <td className="py-3 px-4 font-bold text-slate-900">${Number(s.total_amount).toFixed(2)}</td>
                  <td className="py-3 px-4"><Badge status={s.status} /></td>
                  <td className="py-3 px-4 text-right space-x-2">
                    {s.status === 'active' && Boolean(s.can_pause) && (
                      <button
                        onClick={() => handlePause(s.id)}
                        disabled={actionLoading}
                        title="Pause Subscription"
                        className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                    )}
                    {s.status === 'paused' && (
                      <button
                        onClick={() => handleResume(s.id)}
                        disabled={actionLoading}
                        title="Resume Subscription"
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {s.status !== 'closed' && (
                      <button
                        onClick={() => handleClose(s.id)}
                        disabled={actionLoading}
                        title="Close Subscription"
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">
                  No subscriptions active yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

