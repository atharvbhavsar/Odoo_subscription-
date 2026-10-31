import React, { useEffect, useState } from 'react';
import { subscriptionService, quotationService } from '../../services/quotation.service';
import { catalogService } from '../../services/product.service';
import { invoiceService } from '../../services/invoice.service';
import { paymentService } from '../../services/payment.service';
import { Subscription, Quotation, Invoice } from '../../types';
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
  FileText,
  Calendar,
  AlertTriangle,
  Clock,
  Eye,
  RefreshCw,
  X,
  ShieldCheck,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Plus,
  Check,
} from 'lucide-react';

export const CustomerPortalPage: React.FC = () => {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<'overview' | 'subscriptions' | 'quotations' | 'invoices'>('overview');

  // Modals state
  const [selectedSubForAddons, setSelectedSubForAddons] = useState<Subscription | null>(null);
  const [selectedSubDetails, setSelectedSubDetails] = useState<Subscription | null>(null);
  const [subDetailsLoading, setSubDetailsLoading] = useState(false);
  const [selectedQuoteDetails, setSelectedQuoteDetails] = useState<Quotation | null>(null);
  const [quoteDetailsLoading, setQuoteDetailsLoading] = useState(false);
  const [isSubscribeModalOpen, setIsSubscribeModalOpen] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState('');
  const [subscribing, setSubscribing] = useState(false);

  // Confirmation dialog state
  const [confirmModal, setConfirmModal] = useState<{
    action: 'pause' | 'resume' | 'renew' | 'close';
    subscription: Subscription;
  } | null>(null);

  const handleOpenSubscribeModal = async () => {
    setIsSubscribeModalOpen(true);
    try {
      setLoadingPlans(true);
      const plansData = await catalogService.getPlans();
      const active = (plansData || []).filter((p: any) => p.is_active === 1 || p.is_active === true);
      setAvailablePlans(active);
      if (active.length > 0) {
        setSelectedPlanId(active[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load plans:', err);
      setAlertMsg({ type: 'error', text: 'Failed to load available plans.' });
    } finally {
      setLoadingPlans(false);
    }
  };

  const handleConfirmSubscribe = async () => {
    if (!selectedPlanId) return;
    try {
      setSubscribing(true);
      const res = await subscriptionService.subscribe({
        plan_id: selectedPlanId,
        discount_code: discountCode.trim() || undefined,
      });
      setAlertMsg({
        type: 'success',
        text: (res as any).message || 'Subscription activated successfully! Initial invoice generated.',
      });
      setIsSubscribeModalOpen(false);
      setDiscountCode('');
      await loadCustomerData();
      setActiveTab('subscriptions');
    } catch (err: any) {
      console.error('Subscription purchase failed:', err);
      setAlertMsg({
        type: 'error',
        text: err.message || 'Failed to complete subscription purchase.',
      });
    } finally {
      setSubscribing(false);
    }
  };

  const loadCustomerData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [subs, quotes, invs] = await Promise.all([
        subscriptionService.getSubscriptions(),
        quotationService.getQuotations(),
        invoiceService.getInvoices(),
      ]);
      setSubscriptions(subs);
      setQuotations(quotes);
      setInvoices(invs);
    } catch (err: any) {
      console.error('Failed to load customer data:', err);
      setError(err.message || 'Unable to load customer portal data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomerData();
    const interval = setInterval(() => {
      loadCustomerData();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Open Subscription Details Modal
  const handleOpenSubDetails = async (sub: Subscription) => {
    setSubDetailsLoading(true);
    setSelectedSubDetails(sub);
    try {
      const details = await subscriptionService.getSubscription(sub.id);
      setSelectedSubDetails(details);
    } catch (err: any) {
      console.error('Failed to load subscription details:', err);
      setAlertMsg({ type: 'error', text: err.message || 'Failed to load subscription details.' });
    } finally {
      setSubDetailsLoading(false);
    }
  };

  // Open Quotation Details Modal
  const handleOpenQuoteDetails = async (quote: Quotation) => {
    setQuoteDetailsLoading(true);
    setSelectedQuoteDetails(quote);
    try {
      const details = await quotationService.getQuotation(quote.id);
      setSelectedQuoteDetails(details);
    } catch (err: any) {
      console.error('Failed to load quotation details:', err);
      setAlertMsg({ type: 'error', text: err.message || 'Failed to load quotation details.' });
    } finally {
      setQuoteDetailsLoading(false);
    }
  };

  // Lifecycle Action Execution
  const executeLifecycleAction = async () => {
    if (!confirmModal) return;
    const { action, subscription } = confirmModal;
    setActionLoading(true);
    setAlertMsg(null);

    try {
      if (action === 'pause') {
        await subscriptionService.pause(subscription.id);
        setAlertMsg({
          type: 'success',
          text: `Subscription ${subscription.subscription_number} paused. Scheduled billing will be skipped while paused.`,
        });
      } else if (action === 'resume') {
        await subscriptionService.resume(subscription.id);
        setAlertMsg({
          type: 'success',
          text: `Subscription ${subscription.subscription_number} resumed. Active recurring billing restored.`,
        });
      } else if (action === 'renew') {
        await subscriptionService.renew(subscription.id);
        setAlertMsg({
          type: 'success',
          text: `Subscription ${subscription.subscription_number} renewed successfully for the next billing cycle.`,
        });
      } else if (action === 'close') {
        await subscriptionService.close(subscription.id);
        setAlertMsg({
          type: 'success',
          text: `Subscription ${subscription.subscription_number} closed early. Future renewal billing is discontinued.`,
        });
      }

      setConfirmModal(null);
      await loadCustomerData();
    } catch (err: any) {
      setAlertMsg({
        type: 'error',
        text: err.message || `Failed to ${action} subscription. Action not permitted by plan policy.`,
      });
      setConfirmModal(null);
    } finally {
      setActionLoading(false);
    }
  };

  // Invoice Payment via Razorpay Test Mode
  const handlePayInvoice = async (inv: Invoice) => {
    setActionLoading(true);
    setAlertMsg(null);
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
              setAlertMsg({ type: 'success', text: `Payment of $${order.amount.toFixed(2)} verified successfully!` });
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

      setAlertMsg({
        type: 'success',
        text: `Payment of $${order.amount.toFixed(2)} for ${inv.invoice_number} verified and settled successfully!`,
      });
      await loadCustomerData();
    } catch (err: any) {
      setAlertMsg({
        type: 'error',
        text: err.message || 'Payment processing failed. Please try again.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading customer portal and subscriptions..." />;
  }

  // Dashboard Aggregates
  const activeSubs = subscriptions.filter((s) => s.status === 'active');
  const pausedSubs = subscriptions.filter((s) => s.status === 'paused');
  const unpaidInvoices = invoices.filter((i) => i.amount_due > 0);
  const totalAmountDue = unpaidInvoices.reduce((acc, i) => acc + Number(i.amount_due || 0), 0);
  const totalPaid = invoices.reduce((acc, i) => acc + Number(i.amount_paid || 0), 0);
  const today = new Date().toISOString().split('T')[0];
  const pendingQuotations = quotations.filter(
    (q) => q.status === 'quotation' && q.valid_until >= today
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-100 border border-indigo-400/30">
                Customer Self-Service
              </span>
              <span className="text-indigo-200 text-xs font-mono">{user?.email}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-2">
              Welcome, {user?.name || 'Valued Customer'}
            </h1>
            <p className="text-indigo-200 mt-1 text-sm max-w-2xl">
              Monitor active subscriptions, customize recurring add-ons, review quotations, download tax invoices, and settle balances securely.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={loadCustomerData}
              disabled={loading}
              className="flex items-center space-x-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold backdrop-blur transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {alertMsg && (
        <div
          className={`p-4 rounded-2xl border text-sm flex items-center justify-between shadow-sm ${
            alertMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center space-x-2">
            {alertMsg.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            )}
            <span className="font-medium">{alertMsg.text}</span>
          </div>
          <button
            onClick={() => setAlertMsg(null)}
            className="text-xs font-bold hover:underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadCustomerData}
            className="px-3 py-1 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Key Metric Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>ACTIVE SUBSCRIPTIONS</span>
            <Repeat className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{activeSubs.length}</p>
          <p className="text-xs text-slate-500 mt-1">
            {pausedSubs.length > 0 ? `${pausedSubs.length} paused` : 'All healthy'} &bull; {subscriptions.length} total contracts
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>PENDING QUOTATIONS</span>
            <FileText className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{pendingQuotations.length}</p>
          <p className="text-xs text-slate-500 mt-1">
            {quotations.length} total quotations issued
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>OUTSTANDING BALANCE</span>
            <CreditCard className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-rose-600 mt-2">${totalAmountDue.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">
            {unpaidInvoices.length} unpaid statement(s)
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>TOTAL SETTLED</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-2">${totalPaid.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1">{invoices.length} total invoices issued</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 space-x-8 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 transition flex items-center space-x-2 ${
            activeTab === 'overview'
              ? 'border-b-2 border-indigo-600 text-indigo-600 font-bold'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Dashboard Overview</span>
        </button>
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`pb-3 transition flex items-center space-x-2 ${
            activeTab === 'subscriptions'
              ? 'border-b-2 border-indigo-600 text-indigo-600 font-bold'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Repeat className="w-4 h-4" />
          <span>Subscriptions ({subscriptions.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('quotations')}
          className={`pb-3 transition flex items-center space-x-2 ${
            activeTab === 'quotations'
              ? 'border-b-2 border-indigo-600 text-indigo-600 font-bold'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Quotations ({quotations.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('invoices')}
          className={`pb-3 transition flex items-center space-x-2 ${
            activeTab === 'invoices'
              ? 'border-b-2 border-indigo-600 text-indigo-600 font-bold'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Invoices & Payments ({invoices.length})</span>
          {unpaidInvoices.length > 0 && (
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
              {unpaidInvoices.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB CONTENT: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Outstanding Payment Notice */}
          {unpaidInvoices.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-amber-900">
                    You have {unpaidInvoices.length} outstanding invoice(s) totalling ${totalAmountDue.toFixed(2)}
                  </h4>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Please settle your balances before due dates to prevent interruption of subscription services.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('invoices')}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1"
              >
                <span>Pay Outstanding</span>
              </button>
            </div>
          )}

          {/* Quick Subscriptions Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Repeat className="w-4 h-4 text-indigo-600" />
                <span>Current Subscriptions</span>
              </h3>
              <button
                onClick={() => setActiveTab('subscriptions')}
                className="text-xs text-indigo-600 font-bold hover:underline"
              >
                View all ({subscriptions.length})
              </button>
            </div>

            {subscriptions.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
                No active subscriptions found.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {subscriptions.slice(0, 4).map((s) => (
                  <div key={s.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex justify-between items-center hover:bg-slate-50 transition">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono font-bold text-indigo-600">{s.subscription_number}</span>
                        <Badge status={s.status} />
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 mt-1">{s.plan_name}</h4>
                      <p className="text-xs text-slate-500">
                        Renewal: <span className="font-semibold">{s.next_billing_date}</span> &bull; ${Number(s.total_amount).toFixed(2)}/{s.billing_frequency}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleOpenSubDetails(s)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Quotations Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Recent Quotations</span>
              </h3>
              <button
                onClick={() => setActiveTab('quotations')}
                className="text-xs text-indigo-600 font-bold hover:underline"
              >
                View all ({quotations.length})
              </button>
            </div>

            {quotations.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
                No quotations found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-white">
                {quotations.slice(0, 3).map((q) => {
                  const isExpired = q.valid_until < today && q.status !== 'confirmed' && q.status !== 'cancelled';
                  return (
                    <div key={q.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-mono font-bold text-slate-800">{q.quotation_number}</span>
                          <Badge status={isExpired ? 'expired' : q.status} />
                        </div>
                        <p className="text-xs text-slate-600">
                          {q.plan_name} &bull; Valid Until: <span className="font-semibold">{q.valid_until}</span>
                        </p>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-sm font-bold text-slate-900">${Number(q.total_amount).toFixed(2)}</span>
                        <button
                          onClick={() => handleOpenQuoteDetails(q)}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg transition"
                        >
                          Review
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: SUBSCRIPTIONS */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
                <Repeat className="w-5 h-5 text-indigo-600" />
                <span>My Subscriptions</span>
              </h2>
              <p className="text-xs text-slate-500">
                Manage your contracts, schedule add-ons, or adjust lifecycle states according to plan permissions.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-400">{subscriptions.length} active records</span>
          </div>

          {subscriptions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-400">
              <Repeat className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="font-medium text-slate-600">No subscriptions found</p>
              <p className="text-xs text-slate-400 mt-1">Confirmed quotations will activate subscriptions here automatically.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {subscriptions.map((s) => {
                const canPause = s.status === 'active' && Boolean(s.can_pause);
                const canResume = s.status === 'paused';
                const canRenew = Boolean(s.can_renew) && s.status !== 'closed';
                const canClose = Boolean(s.can_close_early) && s.status !== 'closed' && s.status !== 'expired';
                const isClosedOrExpired = s.status === 'closed' || s.status === 'expired';

                return (
                  <div
                    key={s.id}
                    className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between hover:border-indigo-200 transition"
                  >
                    <div>
                      {/* Subscription Header */}
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-mono font-semibold text-indigo-600">
                            {s.subscription_number}
                          </span>
                          <h3 className="text-lg font-bold text-slate-900 mt-0.5">{s.plan_name}</h3>
                          <p className="text-xs text-slate-400">Started on: {s.start_date}</p>
                        </div>
                        <Badge status={s.status} />
                      </div>

                      {/* Pricing Snapshot */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                        <div>
                          <span className="text-2xl font-extrabold text-slate-900">
                            ${Number(s.total_amount).toFixed(2)}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">/{s.billing_frequency}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-400 flex items-center space-x-1 justify-end">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>Next Billing Date</span>
                          </p>
                          <p className="text-xs font-bold text-indigo-600">{s.next_billing_date}</p>
                        </div>
                      </div>

                      {/* Plan Policy Capabilities */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            s.can_pause ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {s.can_pause ? '✓ Pausing allowed' : '✕ No pause'}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            s.can_renew ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {s.can_renew ? '✓ Renewal allowed' : '✕ No renewal'}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            s.can_close_early ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {s.can_close_early ? '✓ Early close allowed' : '✕ Fixed commitment'}
                        </span>
                      </div>

                      {/* Closed/Expired Notice */}
                      {isClosedOrExpired && (
                        <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs">
                          {s.status === 'closed'
                            ? 'Subscription is permanently closed. Recurring billing is discontinued.'
                            : 'Subscription has expired. You may renew if plan permits.'}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenSubDetails(s)}
                        className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Details</span>
                      </button>

                      {s.status !== 'closed' && (
                        <button
                          onClick={() => setSelectedSubForAddons(s)}
                          className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>Add-ons</span>
                        </button>
                      )}

                      {canPause && (
                        <button
                          onClick={() => setConfirmModal({ action: 'pause', subscription: s })}
                          disabled={actionLoading}
                          className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition disabled:opacity-50"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>Pause</span>
                        </button>
                      )}

                      {canResume && (
                        <button
                          onClick={() => setConfirmModal({ action: 'resume', subscription: s })}
                          disabled={actionLoading}
                          className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Resume</span>
                        </button>
                      )}

                      {canRenew && (
                        <button
                          onClick={() => setConfirmModal({ action: 'renew', subscription: s })}
                          disabled={actionLoading}
                          className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition disabled:opacity-50"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Renew</span>
                        </button>
                      )}

                      {canClose && (
                        <button
                          onClick={() => setConfirmModal({ action: 'close', subscription: s })}
                          disabled={actionLoading}
                          className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Close Early</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: QUOTATIONS */}
      {activeTab === 'quotations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <span>My Quotations</span>
              </h2>
              <p className="text-xs text-slate-500">
                Review tailored proposals, itemized lines, discounts, taxes, and expiration dates.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-400">{quotations.length} records</span>
          </div>

          {quotations.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-400">
              <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="font-medium text-slate-600">No quotations found</p>
              <p className="text-xs text-slate-400 mt-1">Quotations prepared for your organization will appear here.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase">
                    <tr>
                      <th className="py-3 px-4">Quotation #</th>
                      <th className="py-3 px-4">Plan & Cadence</th>
                      <th className="py-3 px-4">Valid Until</th>
                      <th className="py-3 px-4">Subtotal</th>
                      <th className="py-3 px-4">Discount</th>
                      <th className="py-3 px-4">Tax</th>
                      <th className="py-3 px-4">Total</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quotations.map((q) => {
                      const isExpired = q.valid_until < today && q.status !== 'confirmed' && q.status !== 'cancelled';
                      return (
                        <tr key={q.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-mono font-bold text-indigo-600">{q.quotation_number}</td>
                          <td className="py-3 px-4 font-semibold text-slate-800">
                            {q.plan_name}
                            <span className="text-xs text-slate-500 block font-normal capitalize">
                              {q.billing_frequency}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold">
                            <span className={isExpired ? 'text-rose-600' : 'text-slate-700'}>
                              {q.valid_until}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600">${Number(q.subtotal).toFixed(2)}</td>
                          <td className="py-3 px-4 text-emerald-600 font-medium">
                            {Number(q.discount_amount) > 0 ? `-$${Number(q.discount_amount).toFixed(2)}` : '$0.00'}
                          </td>
                          <td className="py-3 px-4 text-slate-600">${Number(q.tax_amount).toFixed(2)}</td>
                          <td className="py-3 px-4 font-black text-slate-900">${Number(q.total_amount).toFixed(2)}</td>
                          <td className="py-3 px-4">
                            <Badge status={isExpired ? 'expired' : q.status} />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleOpenQuoteDetails(q)}
                              className="inline-flex items-center space-x-1 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Proposal</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: INVOICES & PAYMENTS */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-indigo-600" />
                <span>My Invoices & Payment Ledger</span>
              </h2>
              <p className="text-xs text-slate-500">
                View periodic statements, download signed PDFs, or pay balances via Razorpay Test Mode.
              </p>
            </div>
            {unpaidInvoices.length > 0 && (
              <span className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
                {unpaidInvoices.length} Outstanding Payment(s)
              </span>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase">
                  <tr>
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Billing Period</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Total</th>
                    <th className="py-3 px-4">Paid</th>
                    <th className="py-3 px-4">Balance Due</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.length > 0 ? (
                    invoices.map((inv) => {
                      const isOverdue = inv.amount_due > 0 && inv.due_date < today;
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-mono font-medium text-slate-800">
                            {inv.invoice_number}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500">
                            {inv.period_start} &rarr; {inv.period_end}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <span className={isOverdue ? 'font-bold text-rose-600' : 'text-slate-600'}>
                              {inv.due_date} {isOverdue && '(Overdue)'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">${Number(inv.total_amount).toFixed(2)}</td>
                          <td className="py-3 px-4 text-emerald-600 font-semibold">${Number(inv.amount_paid).toFixed(2)}</td>
                          <td className="py-3 px-4 font-black text-rose-600">${Number(inv.amount_due).toFixed(2)}</td>
                          <td className="py-3 px-4">
                            <Badge status={inv.status} />
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <a
                              href={invoiceService.getPdfUrl(inv.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Download PDF"
                              className="inline-flex items-center space-x-1 p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            >
                              <FileDown className="w-4 h-4" />
                            </a>
                            {inv.amount_due > 0 && (
                              <button
                                onClick={() => handlePayInvoice(inv)}
                                disabled={actionLoading}
                                className="inline-flex items-center space-x-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>Pay Now</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                        No invoices generated yet. Invoices appear automatically on recurring billing cycle dates.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBSCRIPTION DETAILS MODAL */}
      {selectedSubDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700">
                  <Repeat className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{selectedSubDetails.plan_name}</h2>
                  <p className="text-xs font-mono text-slate-500">
                    {selectedSubDetails.subscription_number} &bull; Started {selectedSubDetails.start_date}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSubDetails(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {subDetailsLoading ? (
                <LoadingSpinner message="Loading subscription lines..." />
              ) : (
                <>
                  {/* Status & Timing Overview */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 block font-semibold">STATUS</span>
                      <div className="mt-1"><Badge status={selectedSubDetails.status} /></div>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-semibold">FREQUENCY</span>
                      <span className="text-slate-800 font-bold capitalize mt-1 block">
                        {selectedSubDetails.billing_frequency}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-semibold">NEXT RENEWAL</span>
                      <span className="text-indigo-600 font-bold mt-1 block">
                        {selectedSubDetails.next_billing_date}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-semibold">TOTAL CYCLE FEE</span>
                      <span className="text-slate-900 font-bold mt-1 block">
                        ${Number(selectedSubDetails.total_amount).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Bundled Lines */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-800">Bundled Subscription Products</h3>
                    {selectedSubDetails.lines && selectedSubDetails.lines.length > 0 ? (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white text-xs">
                        {selectedSubDetails.lines.map((l) => (
                          <div key={l.id} className="p-3.5 flex justify-between items-center">
                            <div>
                              <span className="font-bold text-slate-800">{l.product_name}</span>
                              {l.attribute_value && (
                                <span className="ml-2 px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {l.attribute_value}
                                </span>
                              )}
                              <p className="text-slate-400 text-[11px] mt-0.5">
                                Qty: {l.quantity} &bull; ${Number(l.unit_price).toFixed(2)} each
                              </p>
                            </div>
                            <span className="font-bold text-slate-900">${Number(l.subtotal).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No itemized lines recorded.</p>
                    )}
                  </div>

                  {/* Active Add-ons Section */}
                  {selectedSubDetails.addons && selectedSubDetails.addons.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-800">Scheduled & Active Add-ons</h3>
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white text-xs">
                        {selectedSubDetails.addons.map((a) => (
                          <div key={a.id} className="p-3.5 flex justify-between items-center">
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-800">{a.product_name}</span>
                                {a.attribute_value && (
                                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                    {a.attribute_value}
                                  </span>
                                )}
                                <Badge status={a.status} />
                              </div>
                              <p className="text-slate-400 text-[11px] mt-0.5">
                                Qty: {a.quantity} &bull; ${Number(a.unit_price).toFixed(2)} &bull; Effective: {a.effective_start_date}
                              </p>
                            </div>
                            <span className="font-bold text-slate-900">
                              ${(Number(a.unit_price) * a.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Financial Breakdown */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal</span>
                      <span>${Number(selectedSubDetails.subtotal).toFixed(2)}</span>
                    </div>
                    {Number(selectedSubDetails.discount_amount) > 0 && (
                      <div className="flex justify-between text-emerald-600 font-medium">
                        <span>Discount Applied</span>
                        <span>-${Number(selectedSubDetails.discount_amount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600">
                      <span>Estimated Tax</span>
                      <span>${Number(selectedSubDetails.tax_amount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-900 font-bold pt-2 border-t border-slate-200 text-sm">
                      <span>Total Recurring Fee</span>
                      <span>${Number(selectedSubDetails.total_amount).toFixed(2)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <button
                onClick={() => {
                  setSelectedSubForAddons(selectedSubDetails);
                  setSelectedSubDetails(null);
                }}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition"
              >
                Manage Add-ons
              </button>
              <button
                onClick={() => setSelectedSubDetails(null)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUOTATION DETAILS MODAL */}
      {selectedQuoteDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{selectedQuoteDetails.quotation_number}</h2>
                  <p className="text-xs text-slate-500 font-mono">
                    Plan: {selectedQuoteDetails.plan_name} &bull; Valid Until: {selectedQuoteDetails.valid_until}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedQuoteDetails(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {quoteDetailsLoading ? (
                <LoadingSpinner message="Loading quotation line items..." />
              ) : (
                <>
                  {/* Status Banner */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-500">Proposal Status:</span>
                      <Badge
                        status={
                          selectedQuoteDetails.valid_until < today &&
                          selectedQuoteDetails.status !== 'confirmed' &&
                          selectedQuoteDetails.status !== 'cancelled'
                            ? 'expired'
                            : selectedQuoteDetails.status
                        }
                      />
                    </div>
                    {selectedQuoteDetails.status === 'confirmed' ? (
                      <span className="text-emerald-700 font-semibold flex items-center space-x-1">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Confirmed into Active Subscription</span>
                      </span>
                    ) : selectedQuoteDetails.valid_until < today ? (
                      <span className="text-rose-600 font-semibold">Proposal Expired</span>
                    ) : (
                      <span className="text-blue-700 font-semibold">Active Proposal</span>
                    )}
                  </div>

                  {/* Line Items */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-800">Quotation Line Items</h3>
                    {selectedQuoteDetails.lines && selectedQuoteDetails.lines.length > 0 ? (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white text-xs">
                        {selectedQuoteDetails.lines.map((l) => (
                          <div key={l.id} className="p-3.5 flex justify-between items-center">
                            <div>
                              <span className="font-bold text-slate-800">{l.product_name}</span>
                              {l.attribute_value && (
                                <span className="ml-2 px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {l.attribute_value}
                                </span>
                              )}
                              <p className="text-slate-400 text-[11px] mt-0.5">
                                Qty: {l.quantity} &bull; ${Number(l.unit_price).toFixed(2)} each
                              </p>
                            </div>
                            <span className="font-bold text-slate-900">${Number(l.subtotal).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No line items detailed.</p>
                    )}
                  </div>

                  {/* Financial Summary */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal</span>
                      <span>${Number(selectedQuoteDetails.subtotal).toFixed(2)}</span>
                    </div>
                    {Number(selectedQuoteDetails.discount_amount) > 0 && (
                      <div className="flex justify-between text-emerald-600 font-medium">
                        <span>Discount</span>
                        <span>-${Number(selectedQuoteDetails.discount_amount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600">
                      <span>Tax Amount</span>
                      <span>${Number(selectedQuoteDetails.tax_amount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-900 font-black pt-2 border-t border-slate-200 text-sm">
                      <span>Grand Total</span>
                      <span>${Number(selectedQuoteDetails.total_amount).toFixed(2)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedQuoteDetails(null)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTION CONFIRMATION DIALOG */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center space-x-3 text-slate-900">
              <div
                className={`p-2.5 rounded-xl ${
                  confirmModal.action === 'close'
                    ? 'bg-rose-100 text-rose-700'
                    : confirmModal.action === 'pause'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                {confirmModal.action === 'close' ? (
                  <XCircle className="w-5 h-5" />
                ) : confirmModal.action === 'pause' ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <RefreshCw className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-lg capitalize">{confirmModal.action} Subscription</h3>
                <p className="text-xs text-slate-500 font-mono">
                  {confirmModal.subscription.subscription_number}
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              {confirmModal.action === 'pause' && (
                <p>
                  Pausing this subscription will skip upcoming recurring billing cycles until resumed. Your plan services will remain temporarily suspended.
                </p>
              )}
              {confirmModal.action === 'resume' && (
                <p>
                  Resuming this subscription will restore active status and recurring billing cycles as scheduled.
                </p>
              )}
              {confirmModal.action === 'renew' && (
                <p>
                  Renewing this subscription will advance your next billing renewal cycle to today ({today}).
                </p>
              )}
              {confirmModal.action === 'close' && (
                <p>
                  Closing early cancels future recurring renewals permanently. You will not be billed for subsequent periods.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={actionLoading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeLifecycleAction}
                disabled={actionLoading}
                className={`px-4 py-2 text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50 ${
                  confirmModal.action === 'close'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : confirmModal.action === 'pause'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {actionLoading ? 'Processing...' : `Confirm ${confirmModal.action}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Choose Subscription Plan Modal */}
      {isSubscribeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-xl text-slate-900">Choose a Subscription Plan</h3>
                  <p className="text-xs text-slate-500">Select a tier to activate recurring software access</p>
                </div>
              </div>
              <button
                onClick={() => setIsSubscribeModalOpen(false)}
                className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingPlans ? (
              <div className="py-12">
                <LoadingSpinner message="Loading available subscription plans..." />
              </div>
            ) : availablePlans.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                No active plans currently available. Please contact sales or staff.
              </div>
            ) : (
              <div className="space-y-6 pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availablePlans.map((plan: any) => {
                    const isSelected = selectedPlanId === plan.id;
                    return (
                      <div
                        key={plan.id}
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`p-5 rounded-2xl border-2 cursor-pointer transition relative flex flex-col justify-between ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/40 shadow-md shadow-indigo-100'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-3 right-3 w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                            {plan.billing_frequency}
                          </span>
                          <h4 className="text-base font-bold text-slate-900 mt-2">{plan.name}</h4>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {plan.description || 'Standard subscription access'}
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                          <div>
                            <span className="text-2xl font-extrabold text-slate-900">
                              ${Number(plan.price || 0).toFixed(2)}
                            </span>
                            <span className="text-xs text-slate-500 font-medium ml-1">
                              / {plan.billing_frequency}
                            </span>
                          </div>
                          {plan.lines && plan.lines.length > 0 && (
                            <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                              {plan.lines.length} bundled item{plan.lines.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Optional Discount Code */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Have a promo / discount code? (Optional)
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="e.g. EARLY10 or FLAT50"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                      className="w-full text-xs font-mono uppercase bg-white border border-slate-300 rounded-xl px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Valid codes: <span className="font-mono text-indigo-600">EARLY10</span> (10% off) or{' '}
                    <span className="font-mono text-indigo-600">FLAT50</span> ($50 off).
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsSubscribeModalOpen(false)}
                    disabled={subscribing}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSubscribe}
                    disabled={subscribing || !selectedPlanId}
                    className="flex items-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-200 transition disabled:opacity-50"
                  >
                    {subscribing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Activating Subscription...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                        <span>Confirm & Subscribe</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subscription Add-ons Modal */}
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
