import React, { useState, useEffect } from 'react';
import { billingService } from '../../services/billing.service';
import { useAuth } from '../../context/AuthContext';
import { BillingRunResult } from '../../types';
import { LoadingSpinner } from '../../components/common/Loading';
import {
  Play,
  CheckCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  FileText,
  RotateCcw,
  Calendar,
  Layers,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const BillingRunPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [latestResult, setLatestResult] = useState<BillingRunResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);

  const fetchHistory = async () => {
    try {
      const data = await billingService.getHistory();
      setHistory(data || []);
    } catch (err) {
      console.error('Failed to load billing history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleStartRun = () => {
    if (!isAdmin) return;
    setShowConfirmModal(true);
  };

  const executeBillingRun = async () => {
    setShowConfirmModal(false);
    setIsRunning(true);
    setErrorMessage(null);

    try {
      // Calls Admin-only POST /api/billing/run
      const res = await billingService.runBilling(targetDate || undefined);
      setLatestResult(res);
      await fetchHistory();
    } catch (err: any) {
      setErrorMessage(err.message || 'Billing run request failed on server');
    } finally {
      setIsRunning(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-3">
          <ShieldAlert className="w-12 h-12 text-rose-600 mx-auto" />
          <h2 className="text-xl font-bold text-rose-900">Administrator Access Required</h2>
          <p className="text-sm text-rose-700">
            Manual recurring billing engine runs are strictly restricted to system administrators.
            Your current role is <strong>{user?.role?.toUpperCase() || 'ANONYMOUS'}</strong>.
          </p>
          <div className="pt-2">
            <Link
              to="/dashboard"
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl inline-block"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-slate-800">Recurring Billing Engine Console</h1>
            <span className="px-2.5 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-700 rounded-full border border-indigo-200">
              Admin Only
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Manual execution, period advance, idempotency verification, and diagnostic reports
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            to="/invoices"
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition"
          >
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>View Invoices</span>
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition"
          >
            <ExternalLink className="w-4 h-4 text-indigo-600" />
            <span>Dashboard</span>
          </Link>
        </div>
      </div>

      {/* Trigger Control Panel Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              <Play className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Execute Billing Cycle</h2>
              <p className="text-xs text-slate-500">
                Invoices all active subscriptions with next billing date on or before target date
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <label className="text-xs font-semibold text-slate-600">Target Billing Date:</label>
              <input
                type="date"
                value={targetDate}
                disabled={isRunning}
                onChange={(e) => setTargetDate(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 disabled:opacity-50"
              />
            </div>

            <button
              onClick={handleStartRun}
              disabled={isRunning}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  <span>Executing Billing Run...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Execute Billing Run</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              <strong>Idempotency Protection Active:</strong> Database constraint{' '}
              <code className="text-indigo-600 font-mono bg-indigo-50 px-1 py-0.5 rounded">
                (subscription_id, period_start)
              </code>{' '}
              guarantees zero duplicate invoices even on concurrent runs.
            </span>
          </div>
          <span className="text-[11px] text-slate-400">Scheduled cron: 00:00 Daily</span>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-xs font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm Billing Run Execution</h3>
                <p className="text-xs text-slate-500">Target Date: {targetDate}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will evaluate all active subscriptions in the system, generate period invoice snapshots, and
              atomically advance subscription billing schedules. Duplicate billing is prevented by database uniqueness.
            </p>

            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeBillingRun}
                className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
              >
                Confirm & Run Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Result Report Display (Actual Backend Response) */}
      {latestResult && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-800 text-base">Billing Run Diagnostic Report</h3>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">Run ID: {latestResult.runId}</p>
            </div>

            <div className="flex items-center space-x-3 text-xs text-slate-500">
              <span>Duration: <strong>{latestResult.durationMs}ms</strong></span>
              <span>•</span>
              <span>Started: <strong>{latestResult.startTime.split('T')[1].slice(0, 8)}</strong></span>
              <span>•</span>
              <span>Ended: <strong>{latestResult.endTime.split('T')[1].slice(0, 8)}</strong></span>
            </div>
          </div>

          {/* KPI Summary Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Checked</span>
              <p className="text-xl font-black text-slate-800 mt-1">{latestResult.subscriptionsChecked}</p>
            </div>

            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-semibold text-emerald-700 uppercase">Invoices Created</span>
              <p className="text-xl font-black text-emerald-700 mt-1">{latestResult.invoicesGenerated}</p>
            </div>

            <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
              <span className="text-[11px] font-semibold text-amber-700 uppercase">Already Billed</span>
              <p className="text-xl font-black text-amber-700 mt-1">{latestResult.alreadyBilledCount || 0}</p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Skipped / Paused</span>
              <p className="text-xl font-black text-slate-800 mt-1">{latestResult.skippedCount}</p>
            </div>
          </div>

          {/* Generated Invoices List */}
          {latestResult.invoices && latestResult.invoices.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Generated Invoices ({latestResult.invoices.length})
              </h4>
              <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 text-xs">
                {latestResult.invoices.map((inv) => (
                  <div key={inv.id} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-slate-800">{inv.invoiceNumber}</span>
                      <span className="text-slate-400">({inv.periodStart} &rarr; {inv.periodEnd})</span>
                    </div>
                    <span className="font-bold text-emerald-600">${Number(inv.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Already-Billed Records (Idempotency Protection) */}
          {latestResult.alreadyBilledRecords && latestResult.alreadyBilledRecords.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                Already-Billed Periods ({latestResult.alreadyBilledRecords.length})
              </h4>
              <div className="max-h-40 overflow-y-auto border border-amber-100 rounded-xl divide-y divide-amber-100 text-xs bg-amber-50/30">
                {latestResult.alreadyBilledRecords.map((item, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between">
                    <span className="font-mono text-slate-700">{item.subscriptionNumber || item.subscriptionId}</span>
                    <span className="text-amber-800 font-medium">{item.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skipped Subscriptions & Diagnostic Reasons */}
          {latestResult.skippedReasons && latestResult.skippedReasons.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Skipped Subscriptions & Reasons ({latestResult.skippedReasons.length})
              </h4>
              <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 text-xs">
                {latestResult.skippedReasons.map((item, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between">
                    <span className="font-mono text-slate-700">{item.subscriptionNumber || item.subscriptionId}</span>
                    <span className="text-slate-500">{item.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failures & Errors */}
          {latestResult.errors && latestResult.errors.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider">
                Failures & Errors ({latestResult.errors.length})
              </h4>
              <div className="border border-rose-200 rounded-xl divide-y divide-rose-100 text-xs bg-rose-50/50">
                {latestResult.errors.map((err, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between">
                    <span className="font-mono text-rose-900">{err.subscriptionId}</span>
                    <span className="text-rose-700 font-medium">{err.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Past Billing Runs History Ledger */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h3 className="font-bold text-slate-800 text-sm">Past Billing Executions Ledger</h3>
          </div>
          <button
            onClick={fetchHistory}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-100">
              <tr>
                <th className="py-2.5 px-3">Run ID</th>
                <th className="py-2.5 px-3">Executed At</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">Checked</th>
                <th className="py-2.5 px-3">Invoiced</th>
                <th className="py-2.5 px-3">Skipped</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.length > 0 ? (
                history.map((h) => {
                  let payload: any = {};
                  try {
                    payload = typeof h.payload === 'string' ? JSON.parse(h.payload) : h.payload;
                  } catch (e) {
                    payload = {};
                  }
                  return (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {payload.runId ? payload.runId.slice(0, 8) + '...' : h.id.slice(0, 8) + '...'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{h.created_at}</td>
                      <td className="py-2.5 px-3 text-slate-600">{payload.durationMs || 0}ms</td>
                      <td className="py-2.5 px-3 text-slate-600">{payload.checked || 0}</td>
                      <td className="py-2.5 px-3 font-bold text-emerald-600">{payload.generated || 0}</td>
                      <td className="py-2.5 px-3 text-slate-600">{payload.skippedCount || 0}</td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          SUCCESS
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No billing execution audit records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

