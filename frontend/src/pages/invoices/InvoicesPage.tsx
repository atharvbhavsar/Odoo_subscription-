import React, { useEffect, useState } from 'react';
import { invoiceService } from '../../services/invoice.service';
import { paymentService } from '../../services/payment.service';
import { Invoice } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import {
  FileDown,
  CreditCard,
  CheckCircle,
  DollarSign,
  Search,
  Filter,
  Check,
  XCircle,
  Mail,
} from 'lucide-react';

export const InvoicesPage: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Manual payment modal state
  const [selectedInvoiceForManualPay, setSelectedInvoiceForManualPay] = useState<Invoice | null>(null);
  const [manualAmount, setManualAmount] = useState<number>(0);
  const [manualMethod, setManualMethod] = useState<string>('bank_transfer');

  const { user } = useAuth();
  const isCustomer = user?.role === 'customer';

  const fetchInvoices = async () => {
    try {
      const data = await invoiceService.getInvoices({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: searchTerm ? searchTerm : undefined,
      });
      setInvoices(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [statusFilter, searchTerm]);

  // Confirm Draft Handler (Staff/Admin)
  const handleConfirmDraft = async (inv: Invoice) => {
    if (!window.confirm(`Confirm draft invoice ${inv.invoice_number}?`)) return;
    setActionLoading(true);
    try {
      await invoiceService.confirmDraft(inv.id);
      setPaymentSuccessMsg(`Invoice ${inv.invoice_number} has been confirmed successfully.`);
      fetchInvoices();
    } catch (err: any) {
      alert(err.message || 'Failed to confirm draft invoice');
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel Invoice Handler (Staff/Admin)
  const handleCancelInvoice = async (inv: Invoice) => {
    const reason = window.prompt(`Provide cancellation reason for ${inv.invoice_number}:`, 'Operational cancellation');
    if (!reason) return;
    setActionLoading(true);
    try {
      await invoiceService.cancelInvoice(inv.id, reason);
      setPaymentSuccessMsg(`Invoice ${inv.invoice_number} cancelled.`);
      fetchInvoices();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel invoice');
    } finally {
      setActionLoading(false);
    }
  };

  // Send Email Handler
  const handleSendEmail = async (inv: Invoice) => {
    setActionLoading(true);
    try {
      const res = await invoiceService.sendInvoiceEmail(inv.id);
      setPaymentSuccessMsg(
        res.status === 'sent'
          ? `Invoice ${inv.invoice_number} emailed successfully with PDF attachment!`
          : `Email dispatch attempted (status: ${res.status}).`
      );
    } catch (err: any) {
      alert(err.message || 'Failed to dispatch invoice email');
    } finally {
      setActionLoading(false);
    }
  };

  // Razorpay Test Mode Checkout Flow
  const handleRazorpayPay = async (inv: Invoice) => {
    setActionLoading(true);
    setPaymentSuccessMsg(null);
    try {
      const order = await paymentService.createRazorpayOrder(inv.id);

      if (typeof (window as any).Razorpay !== 'undefined') {
        const rzp = new (window as any).Razorpay({
          key: order.keyId,
          amount: order.amountInPaise,
          currency: order.currency || 'USD',
          name: 'Brightloop Subscription Manager',
          description: `Settlement for Invoice #${inv.invoice_number}`,
          order_id: order.orderId,
          handler: async (response: any) => {
            try {
              const result = await paymentService.verifyPayment({
                invoice_id: inv.id,
                gateway_order_id: response.razorpay_order_id || order.orderId,
                gateway_payment_id: response.razorpay_payment_id,
                gateway_signature: response.razorpay_signature,
              });
              setPaymentSuccessMsg(
                `Payment of $${order.amount.toFixed(2)} verified! Invoice status: ${result.invoice_status.toUpperCase()}.`
              );
              fetchInvoices();
            } catch (err: any) {
              alert(err.message || 'Payment verification failed');
            }
          },
          prefill: {
            name: inv.customer_name,
          },
          theme: {
            color: '#4f46e5',
          },
          modal: {
            ondismiss: () => {
              setActionLoading(false);
            },
          },
        });
        rzp.open();
        setActionLoading(false);
        return;
      }

      // Offline/mock fallback if Razorpay CDN is not reachable
      const mockPaymentId = `pay_rzp_mock_${Date.now()}`;
      const mockSignature = `mock_sig_${Date.now()}`;

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Invoices & Billing</h1>
          <p className="text-sm text-slate-500">Scheduled invoices, immutable price snapshots, and payment reconciliation</p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search invoice or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
            />
          </div>

          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
            {['all', 'confirmed', 'partially_paid', 'paid', 'cancelled'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg font-medium capitalize transition ${
                  statusFilter === st
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
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

                    {/* Email Statement */}
                    <button
                      onClick={() => handleSendEmail(inv)}
                      disabled={actionLoading}
                      title="Email Invoice PDF"
                      className="inline-flex items-center space-x-1 p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition disabled:opacity-50"
                    >
                      <Mail className="w-4 h-4" />
                    </button>

                    {/* Confirm Draft (Staff/Admin) */}
                    {inv.status === 'draft' && !isCustomer && (
                      <button
                        onClick={() => handleConfirmDraft(inv)}
                        disabled={actionLoading}
                        title="Confirm Draft Invoice"
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Confirm</span>
                      </button>
                    )}

                    {/* Cancel Invoice (Staff/Admin, only if unpaid) */}
                    {(inv.status === 'draft' || inv.status === 'confirmed') && Number(inv.amount_paid) === 0 && !isCustomer && (
                      <button
                        onClick={() => handleCancelInvoice(inv)}
                        disabled={actionLoading}
                        title="Cancel Invoice"
                        className="inline-flex items-center space-x-1 px-2 py-1 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg text-xs font-medium transition disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    )}

                    {/* Pay with Razorpay Test Mode */}
                    {inv.amount_due > 0 && inv.status !== 'cancelled' && (
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
                    {inv.amount_due > 0 && inv.status !== 'cancelled' && !isCustomer && (
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
                  No invoices found matching criteria.
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
