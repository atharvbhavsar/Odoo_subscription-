import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../services/api';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import { DollarSign, ShieldCheck, Calendar, ArrowUpRight } from 'lucide-react';

import { DashboardSummary } from '../../types';

interface PaymentRecord {
  id: string;
  invoice_id: string;
  invoice_number: string;
  customer_name?: string;
  amount: number;
  payment_method: string;
  gateway_payment_id?: string;
  status: string;
  notes?: string;
  recorded_at: string;
}

export const PaymentsHistoryPage: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPayments = async () => {
    try {
      const data = await apiRequest<DashboardSummary>('/dashboard/summary');
      setPayments(data.recentPayments || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  if (loading) return <LoadingSpinner message="Loading payments ledger..." />;

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800">Payments & Transactions</h1>
        <p className="text-sm text-slate-500">Audit trail of verified Razorpay and manual settlements</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase">
            <tr>
              <th className="py-3 px-4">Payment Ref / ID</th>
              <th className="py-3 px-4">Invoice #</th>
              <th className="py-3 px-4">Amount</th>
              <th className="py-3 px-4">Method</th>
              <th className="py-3 px-4">Date Recorded</th>
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.length > 0 ? (
              payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4 font-mono text-xs text-slate-800">{p.id.slice(0, 13)}...</td>
                  <td className="py-3 px-4 font-mono font-medium text-indigo-600">{p.invoice_number}</td>
                  <td className="py-3 px-4 font-bold text-emerald-600">+${Number(p.amount).toFixed(2)}</td>
                  <td className="py-3 px-4 text-xs font-semibold uppercase text-slate-600">{p.payment_method}</td>
                  <td className="py-3 px-4 text-xs text-slate-500">{p.recorded_at}</td>
                  <td className="py-3 px-4"><Badge status={p.status} /></td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                  No payment transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
