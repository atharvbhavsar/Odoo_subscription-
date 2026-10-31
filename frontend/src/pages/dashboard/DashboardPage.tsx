import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
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
  Calendar,
  Filter,
  RefreshCw,
  Users,
  Clock,
  Info,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
} from 'recharts';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === 'customer') {
    return <Navigate to="/portal" replace />;
  }

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [billingRunning, setBillingRunning] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  // Date range filter states
  const [preset, setPreset] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showDefinitions, setShowDefinitions] = useState<boolean>(false);

  const fetchSummary = async (customStart?: string, customEnd?: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await dashboardService.getSummary({
        startDate: customStart !== undefined ? customStart : startDate || undefined,
        endDate: customEnd !== undefined ? customEnd : endDate || undefined,
      });
      setSummary(data);
    } catch (err: any) {
      console.error('Failed to load dashboard summary', err);
      setErrorMsg(err.message || 'Failed to calculate financial metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleApplyPreset = (p: string) => {
    setPreset(p);
    const now = new Date();
    let start = '';
    let end = now.toISOString().split('T')[0];

    if (p === 'all') {
      start = '';
      end = '';
    } else if (p === '30days') {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      start = past.toISOString().split('T')[0];
    } else if (p === 'thisMonth') {
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    } else if (p === '90days') {
      const past = new Date();
      past.setDate(past.getDate() - 90);
      start = past.toISOString().split('T')[0];
    } else if (p === 'ytd') {
      start = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    }

    setStartDate(start);
    setEndDate(end);
    fetchSummary(start, end);
  };

  const handleCustomFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPreset('custom');
    fetchSummary(startDate, endDate);
  };

  const handleResetFilters = () => {
    setPreset('all');
    setStartDate('');
    setEndDate('');
    fetchSummary('', '');
  };

  const handleRunBilling = async () => {
    setBillingRunning(true);
    setBillingMessage(null);
    try {
      const res = await dashboardService.triggerBillingRun();
      setBillingMessage(
        res.message || `Billing run completed: generated ${res.data?.invoicesGenerated || 0} invoice(s).`
      );
      await fetchSummary(startDate, endDate);
    } catch (err: any) {
      setBillingMessage(err.message || 'Billing run failed');
    } finally {
      setBillingRunning(false);
    }
  };

  if (loading && !summary) {
    return <LoadingSpinner message="Calculating database financial metrics..." />;
  }

  // Overdue aging palette
  const agingColors: Record<string, string> = {
    '1-30 days': '#f59e0b', // Amber 500
    '31-60 days': '#f97316', // Orange 500
    '61-90 days': '#ef4444', // Red 500
    '90+ days': '#991b1b', // Red 800
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Executive Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-slate-800">Finance & Reporting Dashboard</h1>
            <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
              Live DB Aggregates
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time accounts receivable, cashflow reconciliation, and recurring billing performance
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowDefinitions(!showDefinitions)}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition"
          >
            <Info className="w-3.5 h-3.5 text-indigo-600" />
            <span>{showDefinitions ? 'Hide Metric Definitions' : 'Metric Definitions'}</span>
          </button>

          <button
            onClick={handleRunBilling}
            disabled={billingRunning}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{billingRunning ? 'Executing Engine...' : 'Run Billing Engine'}</span>
          </button>
        </div>
      </div>

      {/* Metric Definitions & Accounting Legend Banner */}
      {showDefinitions && (
        <div className="p-5 rounded-2xl bg-slate-900 text-slate-200 border border-slate-800 space-y-3 text-xs leading-relaxed animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-2">
              <Info className="w-4 h-4 text-indigo-400" />
              <h3 className="font-bold text-white text-sm">Authoritative Financial Metric Definitions</h3>
            </div>
            <span className="text-[11px] text-slate-400">Compliance & Accounting Standards</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
              <span className="font-bold text-indigo-300 block mb-1">Monthly Recurring Revenue (MRR)</span>
              <p className="text-slate-300">
                Normalized monthly contract rate of active subscriptions. Annual plans divided by 12, weekly multiplied by 4.333. A run-rate metric, not cash flow.
              </p>
            </div>

            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
              <span className="font-bold text-emerald-300 block mb-1">Invoiced Amount</span>
              <p className="text-slate-300">
                Gross billing face value issued to customers within the selected period. Measures Accounts Receivable generated, independent of payment timing.
              </p>
            </div>

            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
              <span className="font-bold text-sky-300 block mb-1">Payments Received (Cash)</span>
              <p className="text-slate-300">
                Actual cash settled via Razorpay Test Mode or recorded manual payments during the period. Represents true liquidity and cash collections.
              </p>
            </div>

            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
              <span className="font-bold text-rose-300 block mb-1">Outstanding & Overdue</span>
              <p className="text-slate-300">
                Outstanding reflects total balance awaiting payment. Overdue measures invoices past their due date, categorized into 1-30, 31-60, 61-90, 90+ days aging buckets.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Date Range Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Preset filter pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Calendar className="w-4 h-4 text-slate-400 mr-1" />
          {[
            { id: 'all', label: 'All Time' },
            { id: 'thisMonth', label: 'This Month' },
            { id: '30days', label: 'Last 30 Days' },
            { id: '90days', label: 'Last 90 Days' },
            { id: 'ytd', label: 'Year to Date' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => handleApplyPreset(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl transition ${
                preset === item.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Custom date range inputs */}
        <form onSubmit={handleCustomFilterSubmit} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Custom Range:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-lg shadow-sm transition"
          >
            Apply
          </button>
          {(startDate || endDate || preset !== 'all') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2.5 py-1.5 text-slate-500 hover:text-slate-800 font-medium transition"
            >
              Reset
            </button>
          )}
        </form>
      </div>

      {/* Notifications & Feedback */}
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

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 6 Executive KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Active Subscriptions */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Subs</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{summary?.activeSubscriptions || 0}</p>
          <span className="text-[11px] text-emerald-600 font-medium flex items-center mt-1">
            <ArrowUpRight className="w-3 h-3 mr-0.5" /> Recurring Accounts
          </span>
        </div>

        {/* Monthly Recurring Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">MRR</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2">
            ${Number(summary?.mrr || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Normalized Monthly Rate</span>
        </div>

        {/* Invoiced in Period */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Invoiced</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            ${Number(summary?.totalInvoiced || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Gross Billed in Period</span>
        </div>

        {/* Collected in Period */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cash Collected</span>
            <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-teal-600 mt-2">
            ${Number(summary?.totalCollected || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[11px] text-teal-600 font-medium mt-1 block">Settled Inflows</span>
        </div>

        {/* Outstanding Receivables */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outstanding</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 mt-2">
            ${Number(summary?.totalOutstanding || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Pending Settlement</span>
        </div>

        {/* Overdue Receivables */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overdue</span>
            <div className={`p-2 rounded-xl ${(summary?.overdueCount || 0) > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 mt-2">
            ${Number(summary?.overdueAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[11px] text-rose-600 font-medium mt-1 block">
            {summary?.overdueCount || 0} invoice(s) past due
          </span>
        </div>
      </div>

      {/* Visual Analytics & Breakdown Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Monthly Invoiced vs Cash Collections */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800">Monthly Invoices vs Cash Collections</h3>
              <p className="text-xs text-slate-500">Gross billing obligations compared to actual settled cash</p>
            </div>
            <span className="text-xs font-medium text-slate-400">Past 6 Months</span>
          </div>

          <div className="h-64 w-full">
            {summary?.monthlyCashflow && summary.monthlyCashflow.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.monthlyCashflow} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip
                    formatter={(val: number) => [`$${val.toFixed(2)}`, '']}
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Bar dataKey="invoiced" name="Invoiced ($)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" name="Cash Collected ($)" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                No monthly billing records in database.
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Overdue Receivables Aging Buckets */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800">Overdue Invoices Aging Risk</h3>
              <p className="text-xs text-slate-500">Unpaid balances categorised by days past contractual due date</p>
            </div>
            <span className="text-xs font-medium text-rose-600 font-bold">
              ${(summary?.overdueAmount || 0).toFixed(2)} Total
            </span>
          </div>

          <div className="h-64 w-full">
            {summary?.overdueAging && summary.overdueAging.some((b) => b.amount > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.overdueAging} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="bucket" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip
                    formatter={(val: number, name: string, item: any) => [
                      `$${val.toFixed(2)} (${item.payload.count} invoices)`,
                      'Overdue Balance',
                    ]}
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                  />
                  <Bar dataKey="amount" name="Overdue ($)" radius={[4, 4, 0, 0]}>
                    {summary.overdueAging.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={agingColors[entry.bucket] || '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
                <span className="text-sm font-medium text-slate-600">Zero Overdue Receivables</span>
                <p className="text-xs text-slate-400">All customer invoices are current or fully settled.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Breakdown: Subscriptions by Plan & Subscriptions by Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Active Subscriptions by Plan */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 text-sm mb-1">Active Subscriptions by Plan</h3>
          <p className="text-xs text-slate-500 mb-4">Subscriber density and contractual recurring value</p>

          <div className="space-y-3">
            {summary?.subscriptionsByPlan && summary.subscriptionsByPlan.length > 0 ? (
              summary.subscriptionsByPlan.map((plan) => (
                <div key={plan.planName} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div>
                    <span className="font-semibold text-sm text-slate-800">{plan.planName}</span>
                    <span className="text-xs text-slate-500 block">{plan.count} active subscriber(s)</span>
                  </div>
                  <span className="text-sm font-bold text-indigo-600">
                    ${plan.totalValue.toFixed(2)} / period
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">No active plan subscriptions found.</p>
            )}
          </div>
        </div>

        {/* Subscriptions by Status */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 text-sm mb-1">Subscription Lifecycle Distribution</h3>
          <p className="text-xs text-slate-500 mb-4">Total accounts across all lifecycle stages</p>

          <div className="space-y-3">
            {summary?.subscriptionsByStatus && summary.subscriptionsByStatus.length > 0 ? (
              summary.subscriptionsByStatus.map((st) => (
                <div key={st.status} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center space-x-2">
                    <Badge status={st.status} />
                    <span className="text-xs text-slate-500">({st.count} accounts)</span>
                  </div>
                  <span className="text-sm font-bold text-slate-700">
                    ${st.totalValue.toFixed(2)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">No subscriptions recorded.</p>
            )}
          </div>
        </div>
      </div>

      {/* Audit Reconciliation Tables: Recent Invoices & Recent Cash Settlements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Recent Invoices Generated</h3>
            <span className="text-xs text-slate-400">Latest 5</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Invoice #</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3">Total</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary?.recentInvoices && summary.recentInvoices.length > 0 ? (
                  summary.recentInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800">{inv.invoice_number}</td>
                      <td className="py-2.5 px-3 text-slate-700">{inv.customer_name}</td>
                      <td className="py-2.5 px-3 text-slate-500">{inv.due_date}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">${Number(inv.total_amount).toFixed(2)}</td>
                      <td className="py-2.5 px-3"><Badge status={inv.status} /></td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No invoices recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Cash Settlements */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Recent Cash Collections</h3>
            <span className="text-xs text-slate-400">Latest 5</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Invoice Ref</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary?.recentPayments && summary.recentPayments.length > 0 ? (
                  summary.recentPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800">{p.invoice_number}</td>
                      <td className="py-2.5 px-3 capitalize text-slate-700">{p.payment_method.replace('_', ' ')}</td>
                      <td className="py-2.5 px-3 text-slate-500">{p.recorded_at?.split('T')[0] || p.recorded_at}</td>
                      <td className="py-2.5 px-3 font-bold text-emerald-600">${Number(p.amount).toFixed(2)}</td>
                      <td className="py-2.5 px-3"><Badge status={p.status} /></td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No payments recorded yet.
                    </td>
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
