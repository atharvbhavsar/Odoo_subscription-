import React, { useEffect, useState } from 'react';
import { invoiceService } from '../../services/invoice.service';
import { paymentService } from '../../services/payment.service';
import { Invoice } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import {
  Receipt,
  FileDown,
  CreditCard,
  CheckCircle,
  PlusCircle,
  DollarSign,
} from 'lucide-react';

export const InvoicesPage: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState<string | null>(null);

  // Manual payment modal state
  const [selectedInvoiceForManualPay, setSelectedInvoiceForManualPay] = useState<Invoice | null>(null);
  const [manualAmount, setManualAmount] = useState<number>(0);
  const [manualMethod, setManualMethod] = useState<string>('bank_transfer');

  const { user } = useAuth();
  const isCustomer = user?.role === 'customer';

  const fetchInvoices = async () => {
    try {
      const data = await invoiceService.getInvoices();
      setInvoices(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  // Razorpay Test Mode Checkout Flow
  const handleRazorpayPay = async (inv: Invoice) => {
    setActionLoading(true);
    setPaymentSuccessMsg(null);
    try {
      // 1. Create order on backend (backend calculates authoritative amount_due)
      const order = await paymentService.createRazorpayOrder(inv.id);

      // 2. In Test Mode / local dev, simulate Razorpay popup and signature verification
      const mockPaymentId = `pay_rzp_mock_${Date.now()}`;
      const mockSignature = `mock_sig_${Date.now()}`;

      // 3. Send signature to backend for verification & balance update
      const result = await paymentService.verifyPayment({
        invoice_id: inv.id,
        gateway_order_id: order.orderId,
        gateway_payment_id: mockPaymentId,
        gateway_signature: mockSignature,
      });

      setPaymentSuccessMsg(
        `Payment of $${order.amount.toFixed(2)} verified! Invoice status: ${result.invoice_status.toUpperCase()}.`
      );
      fetchInvoices();
    } catch (err: any) {
      alert(err.message || 'Razorpay payment verification failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Offline / Partial Payment Handler (Staff & Admin)
  const handleRecordManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForManualPay) return;
    setActionLoading(true);
    try {
      const res = await paymentService.recordOfflinePayment({
        invoice_id: selectedInvoiceForManualPay.id,
        amount: manualAmount,
        payment_method: manualMethod,
        notes: 'Operational manual settlement',
      });
      setSelectedInvoiceForManualPay(null);
      setPaymentSuccessMsg(`Payment of $${manualAmount.toFixed(2)} recorded! Status: ${res.invoice_status.toUpperCase()}`);
      fetchInvoices();
    } catch (err: any) {
      alert(err.message || 'Failed to record manual payment');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading invoices & financial records..." />;

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800">Invoices & Billing</h1>
        <p className="text-sm text-slate-500">Scheduled invoices, immutable price snapshots, and payment reconciliation</p>
      </div>

      {paymentSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <span>{paymentSuccessMsg}</span>
          </div>
          <button onClick={() => setPaymentSuccessMsg(null)} className="text-xs font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase">
            <tr>
              <th className="py-3 px-4">Invoice #</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Billing Period</th>
              <th className="py-3 px-4">Total</th>
              <th className="py-3 px-4">Paid</th>
              <th className="py-3 px-4">Balance Due</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.length > 0 ? (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4 font-mono font-medium text-slate-800">{inv.invoice_number}</td>
                  <td className="py-3 px-4 font-medium text-slate-900">{inv.customer_name}</td>
                  <td className="py-3 px-4 text-xs text-slate-500">
                    {inv.period_start} &rarr; {inv.period_end}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">${Number(inv.total_amount).toFixed(2)}</td>
                  <td className="py-3 px-4 font-medium text-emerald-600">${Number(inv.amount_paid).toFixed(2)}</td>
                  <td className="py-3 px-4 font-bold text-rose-600">${Number(inv.amount_due).toFixed(2)}</td>
                  <td className="py-3 px-4"><Badge status={inv.status} /></td>
                  <td className="py-3 px-4 text-right space-x-2">
                    {/* PDF Download */}
                    <a
                      href={invoiceService.getPdfUrl(inv.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Download PDF"
                      className="inline-flex items-center space-x-1 p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    >
                      <FileDown className="w-4 h-4" />
                    </a>

                    {/* Pay with Razorpay Test Mode */}
                    {inv.amount_due > 0 && (
                      <button
                        onClick={() => handleRazorpayPay(inv)}
                        disabled={actionLoading}
                        title="Pay via Razorpay Test Mode"
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Pay</span>
                      </button>
                    )}

                    {/* Staff/Admin Manual Record Payment */}
                    {inv.amount_due > 0 && !isCustomer && (
                      <button
                        onClick={() => {
                          setSelectedInvoiceForManualPay(inv);
                          setManualAmount(inv.amount_due);
                        }}
                        title="Record Offline / Partial Payment"
                        className="inline-flex items-center space-x-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Partial Pay</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400 text-sm">
                  No invoices generated yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Manual Payment Modal */}
      {selectedInvoiceForManualPay && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-1">
              Record Payment for {selectedInvoiceForManualPay.invoice_number}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Current Outstanding Balance: <strong>${selectedInvoiceForManualPay.amount_due.toFixed(2)}</strong>
            </p>

            <form onSubmit={handleRecordManualPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  max={selectedInvoiceForManualPay.amount_due}
                  min="0.01"
                  required
                  value={manualAmount}
                  onChange={(e) => setManualAmount(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Supports partial payments (e.g. paying $614.24 of $1,614.24).
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={manualMethod}
                  onChange={(e) => setManualMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="bank_transfer">Bank Transfer / Wire</option>
                  <option value="check">Company Check</option>
                  <option value="cash">Cash Settlement</option>
                  <option value="razorpay_direct">Razorpay Offline</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceForManualPay(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

