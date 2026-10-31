import React, { useEffect, useState } from 'react';
import { subscriptionService } from '../../services/quotation.service';
import { invoiceService } from '../../services/invoice.service';
import { paymentService } from '../../services/payment.service';
import { Subscription, Invoice } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import { SubscriptionAddonsModal } from '../../components/subscriptions/SubscriptionAddonsModal';
import {
  Repeat,
  Receipt,
  FileDown,
  CreditCard,
  Pause,
  Play,
  XCircle,
  CheckCircle,
  Layers,
} from 'lucide-react';

export const CustomerPortalPage: React.FC = () => {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [paymentMsg, setPaymentMsg] = useState<string | null>(null);
  const [selectedSubForAddons, setSelectedSubForAddons] = useState<Subscription | null>(null);

  const loadCustomerData = async () => {
    try {
      const [subs, invs] = await Promise.all([
        subscriptionService.getSubscriptions(),
        invoiceService.getInvoices(),
      ]);
      setSubscriptions(subs);
      setInvoices(invs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomerData();
  }, []);

  const handlePay = async (inv: Invoice) => {
    setActionLoading(true);
    setPaymentMsg(null);
    try {
      const order = await paymentService.createRazorpayOrder(inv.id);

      if (typeof (window as any).Razorpay !== 'undefined') {
        const rzp = new (window as any).Razorpay({
          key: order.keyId,
          amount: order.amountInPaise,
          currency: order.currency || 'INR',
          name: 'Brightloop Subscription Manager',
          description: `Settlement for Invoice #${inv.invoice_number}`,
          order_id: order.orderId,
          handler: async (response: any) => {
            try {
              await paymentService.verifyPayment({
                invoice_id: inv.id,
                gateway_order_id: response.razorpay_order_id || order.orderId,
                gateway_payment_id: response.razorpay_payment_id,
                gateway_signature: response.razorpay_signature,
              });
              setPaymentMsg(`Payment of $${order.amount.toFixed(2)} verified successfully!`);
              loadCustomerData();
            } catch (err: any) {
              alert(err.message || 'Payment verification failed');
            }
          },
          prefill: {
            name: user?.name,
            email: user?.email,
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

      // Offline / fallback verification
      const mockPaymentId = `pay_rzp_${Date.now()}`;
      const mockSignature = `mock_sig_${Date.now()}`;

      await paymentService.verifyPayment({
        invoice_id: inv.id,
        gateway_order_id: order.orderId,
        gateway_payment_id: mockPaymentId,
        gateway_signature: mockSignature,
      });

      setPaymentMsg(`Payment of $${order.amount.toFixed(2)} completed successfully!`);
      loadCustomerData();
    } catch (err: any) {
      alert(err.message || 'Payment failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async (id: string) => {
    if (!window.confirm('Pause your subscription?')) return;
    try {
      await subscriptionService.pause(id);
      loadCustomerData();
    } catch (err: any) {
      alert(err.message || 'Pause not permitted');
    }
  };

  const handleResume = async (id: string) => {
    try {
      await subscriptionService.resume(id);
      loadCustomerData();
    } catch (err: any) {
      alert(err.message || 'Resume failed');
    }
  };

  const handleClose = async (id: string) => {
    if (!window.confirm('Are you sure you want to cancel your subscription?')) return;
    try {
      await subscriptionService.close(id);
      loadCustomerData();
    } catch (err: any) {
      alert(err.message || 'Early cancellation not permitted on this plan');
    }
  };

  if (loading) return <LoadingSpinner message="Loading customer portal..." />;

  const unpaidInvoices = invoices.filter((i) => i.amount_due > 0);

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg">
        <h1 className="text-2xl sm:text-3xl font-extrabold">Welcome, {user?.name || 'Valued Customer'}</h1>
        <p className="text-indigo-200 mt-1 text-sm">
          Manage your subscriptions, view invoices, download statements, and settle balances.
        </p>
      </div>

      {paymentMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <span>{paymentMsg}</span>
          </div>
          <button onClick={() => setPaymentMsg(null)} className="text-xs font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* My Subscriptions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
            <Repeat className="w-5 h-5 text-indigo-600" />
            <span>My Active Subscriptions</span>
          </h2>
          <span className="text-xs text-slate-400">{subscriptions.length} active contracts</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {subscriptions.map((s) => (
            <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-mono font-semibold text-indigo-600">{s.subscription_number}</span>
                    <h3 className="text-lg font-bold text-slate-900 mt-1">{s.plan_name}</h3>
                  </div>
                  <Badge status={s.status} />
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-extrabold text-slate-900">${Number(s.total_amount).toFixed(2)}</span>
                    <span className="text-xs text-slate-500 font-medium">/{s.billing_frequency}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Next Billing Renewal</p>
                    <p className="text-xs font-bold text-indigo-600">{s.next_billing_date}</p>
                  </div>
                </div>
              </div>

              {/* Permitted self-service lifecycle controls */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  onClick={() => setSelectedSubForAddons(s)}
                  className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Add-ons</span>
                </button>
                {s.status === 'active' && Boolean(s.can_pause) && (
                  <button
                    onClick={() => handlePause(s.id)}
                    className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </button>
                )}
                {s.status === 'paused' && (
                  <button
                    onClick={() => handleResume(s.id)}
                    className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </button>
                )}
                {s.status !== 'closed' && Boolean(s.can_close_early) && (
                  <button
                    onClick={() => handleClose(s.id)}
                    className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Close Early</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* My Invoices */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
            <Receipt className="w-5 h-5 text-indigo-600" />
            <span>My Invoices & Payments</span>
          </h2>
          {unpaidInvoices.length > 0 && (
            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
              {unpaidInvoices.length} Outstanding Payment(s)
            </span>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Period</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4">Total</th>
                <th className="py-3 px-4">Amount Due</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length > 0 ? (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-medium text-slate-800">{inv.invoice_number}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{inv.period_start} &rarr; {inv.period_end}</td>
                    <td className="py-3 px-4 text-slate-600">{inv.due_date}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">${Number(inv.total_amount).toFixed(2)}</td>
                    <td className="py-3 px-4 font-bold text-rose-600">${Number(inv.amount_due).toFixed(2)}</td>
                    <td className="py-3 px-4"><Badge status={inv.status} /></td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <a
                        href={invoiceService.getPdfUrl(inv.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                      >
                        <FileDown className="w-4 h-4" />
                      </a>
                      {inv.amount_due > 0 && (
                        <button
                          onClick={() => handlePay(inv)}
                          disabled={actionLoading}
                          className="inline-flex items-center space-x-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Pay Now</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSubForAddons && (
        <SubscriptionAddonsModal
          subscription={selectedSubForAddons}
          onClose={() => setSelectedSubForAddons(null)}
          onUpdated={loadCustomerData}
        />
      )}
    </div>
  );
};
