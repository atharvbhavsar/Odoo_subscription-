import React, { useEffect, useState } from 'react';
import { dashboardService } from '../../services/payment.service';
import { DashboardSummary } from '../../types';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  AlertTriangle,
  Play,
  CheckCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';

export const DashboardPage: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingRunning, setBillingRunning] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  const fetchSummary = async () => {
    try {
      const data = await dashboardService.getSummary();
      setSummary(data);
    } catch (err: any) {
      console.error('Failed to load dashboard summary', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleRunBilling = async () => {
    setBillingRunning(true);
    setBillingMessage(null);
    try {
      const res = await dashboardService.triggerBillingRun();
      setBillingMessage(res.message);
      await fetchSummary();
    } catch (err: any) {
      setBillingMessage(err.message || 'Billing run failed');
    } finally {
      setBillingRunning(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Calculating financial metrics..." />;
  }

  const chartData = [
    {
      name: 'Revenue Metrics',
      Invoiced: summary?.totalInvoiced || 0,
      Collected: summary?.totalCollected || 0,
      Outstanding: summary?.totalOutstanding || 0,
      Overdue: summary?.overdueAmount || 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Executive Financial Dashboard</h1>
          <p className="text-sm text-slate-500">Real-time subscription revenue & billing analytics</p>
        </div>
        <button
          onClick={handleRunBilling}
          disabled={billingRunning}
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shadow-sm transition disabled:opacity-50"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>{billingRunning ? 'Running Billing Engine...' : 'Run Billing Engine Now'}</span>
        </button>
      </div>

      {billingMessage && (
        <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-indigo-600" />
            <span>{billingMessage}</span>
          </div>
          <button onClick={() => setBillingMessage(null)} className="text-xs font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Recurring Revenue</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">${summary?.mrr.toFixed(2)}</h3>
            <span className="inline-block mt-2 text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded">
              MRR Normalized
            </span>
          </div>
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Payments Collected</p>
            <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">${summary?.totalCollected.toFixed(2)}</h3>
            <span className="inline-block mt-2 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
              Verified Cash In
            </span>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Outstanding Balance</p>
            <h3 className="text-2xl font-extrabold text-slate-800 mt-1">${summary?.totalOutstanding.toFixed(2)}</h3>
            <span className="inline-block mt-2 text-xs text-slate-600 font-semibold bg-slate-100 px-2 py-0.5 rounded">
              Invoiced: ${summary?.totalInvoiced.toFixed(2)}
            </span>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <Receipt className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Overdue Invoices</p>
            <h3 className="text-2xl font-extrabold text-rose-600 mt-1">${summary?.overdueAmount.toFixed(2)}</h3>
            <span className="inline-block mt-2 text-xs text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded">
              {summary?.overdueCount} Unpaid & Past Due
            </span>
          </div>
          <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Visual Analytics Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-4">Financial Overview Breakdown</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
              <Legend />
              <Bar dataKey="Invoiced" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Collected" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Outstanding" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Overdue" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center space-x-2">
              <Receipt className="w-5 h-5 text-indigo-600" />
              <span>Recent Invoices</span>
            </h3>
            <span className="text-xs text-slate-400">Last 5 generated</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-xs">
                  <th className="pb-2">Invoice #</th>
                  <th className="pb-2">Customer</th>
                  <th className="pb-2">Total</th>
                  <th className="pb-2">Due</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary?.recentInvoices && summary.recentInvoices.length > 0 ? (
                  summary.recentInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="py-2.5 font-mono text-xs text-slate-700">{inv.invoice_number}</td>
                      <td className="py-2.5 text-slate-800">{inv.customer_name}</td>
                      <td className="py-2.5 font-semibold text-slate-800">${Number(inv.total_amount).toFixed(2)}</td>
                      <td className="py-2.5 text-rose-600 font-medium">${Number(inv.amount_due).toFixed(2)}</td>
                      <td className="py-2.5"><Badge status={inv.status} /></td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 text-xs">No invoices generated yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Payments */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              <span>Recent Verified Payments</span>
            </h3>
            <span className="text-xs text-slate-400">Last 5 recorded</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-xs">
                  <th className="pb-2">Invoice #</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Method</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary?.recentPayments && summary.recentPayments.length > 0 ? (
                  summary.recentPayments.map((pay) => (
                    <tr key={pay.id} className="hover:bg-slate-50">
                      <td className="py-2.5 font-mono text-xs text-slate-700">{pay.invoice_number}</td>
                      <td className="py-2.5 font-semibold text-emerald-600">+${Number(pay.amount).toFixed(2)}</td>
                      <td className="py-2.5 uppercase text-xs font-semibold text-slate-500">{pay.payment_method}</td>
                      <td className="py-2.5"><Badge status={pay.status} /></td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400 text-xs">No payments recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
