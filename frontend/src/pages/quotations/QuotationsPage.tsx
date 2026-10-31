import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { quotationService, quotationTemplateService } from '../../services/quotation.service';
import { catalogService } from '../../services/product.service';
import { Quotation, Product, Plan, Tax, Discount, CustomerProfile, QuotationTemplate } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import {
  FileText,
  Plus,
  CheckCircle,
  FileStack,
  Trash2,
  Sparkles,
  X,
  Info,
  Search,
  Eye,
  Ban,
  AlertTriangle,
  Send,
  Calendar,
  DollarSign,
  Clock,
} from 'lucide-react';

export const QuotationsPage: React.FC = () => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'quotation' | 'sent' | 'confirmed' | 'expired' | 'cancelled'>('all');

  // Details Modal
  const [selectedQuote, setSelectedQuote] = useState<Quotation | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Cancellation Modal
  const [quoteToCancel, setQuoteToCancel] = useState<Quotation | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Form reference data
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [templates, setTemplates] = useState<QuotationTemplate[]>([]);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedDiscountId, setSelectedDiscountId] = useState('');
  const [selectedTaxId, setSelectedTaxId] = useState('');
  const [initialStatus, setInitialStatus] = useState<'quotation' | 'draft'>('quotation');
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [lines, setLines] = useState<Array<{ product_id: string; variant_id?: string; quantity: number }>>([
    { product_id: '', variant_id: '', quantity: 1 },
  ]);

  // Template pre-fill state
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);
  const [appliedTemplateName, setAppliedTemplateName] = useState<string | null>(null);

  const { user } = useAuth();
  const isCustomer = user?.role === 'customer';
  const today = new Date().toISOString().split('T')[0];

  const fetchData = async () => {
    try {
      const quotes = await quotationService.getQuotations({
        search: searchQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setQuotations(quotes);

      if (!isCustomer) {
        const [custs, prods, plns, txs, discs, tpls] = await Promise.all([
          catalogService.getCustomers(),
          catalogService.getProducts(),
          catalogService.getPlans({ status: 'active' }),
          catalogService.getTaxes({ status: 'active' }),
          catalogService.getDiscounts({ status: 'active' }),
          quotationTemplateService.getTemplates(false), // only active templates
        ]);
        setCustomers(custs);
        setProducts(prods);
        setPlans(plns);
        setTaxes(txs);
        setDiscounts(discs);
        setTemplates(tpls);

        if (custs.length > 0 && !selectedCustomerId) setSelectedCustomerId(custs[0].id);
        if (plns.length > 0 && !selectedPlanId) setSelectedPlanId(plns[0].id);
        if (prods.length > 0 && (!lines[0] || !lines[0].product_id)) {
          setLines([{ product_id: prods[0].id, variant_id: prods[0].variants?.[0]?.id || '', quantity: 1 }]);
        }
      }
    } catch (err) {
      console.error('Error fetching quotations data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  // Handle search with slight debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleOpenCreateModal = () => {
    setSelectedTemplateId('');
    setAppliedTemplateName(null);
    if (customers.length > 0) setSelectedCustomerId(customers[0].id);
    if (plans.length > 0) setSelectedPlanId(plans[0].id);
    setSelectedDiscountId('');
    setSelectedTaxId('');
    setInitialStatus('quotation');
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setValidUntil(d.toISOString().split('T')[0]);
    if (products.length > 0) {
      setLines([
        {
          product_id: products[0].id,
          variant_id: products[0].variants?.[0]?.id || '',
          quantity: 1,
        },
      ]);
    }
    setShowCreateModal(true);
  };

  // When a template is selected from dropdown
  const handleSelectTemplate = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setAppliedTemplateName(null);
      return;
    }

    setTemplateLoading(true);
    try {
      const template = await quotationTemplateService.getTemplate(templateId);

      // Pre-select default plan if defined on template
      if (template.default_plan_id) {
        setSelectedPlanId(template.default_plan_id);
      }

      // Pre-fill lines if available
      if (template.lines && template.lines.length > 0) {
        setLines(
          template.lines.map((l) => ({
            product_id: l.product_id,
            variant_id: l.variant_id || '',
            quantity: l.quantity,
          }))
        );
      }

      setAppliedTemplateName(template.name);
    } catch (err: any) {
      alert(err.message || 'Failed to load quotation template details');
    } finally {
      setTemplateLoading(false);
    }
  };

  // Add line item
  const handleAddLine = () => {
    const firstProd = products[0];
    setLines([
      ...lines,
      {
        product_id: firstProd?.id || '',
        variant_id: firstProd?.variants?.[0]?.id || '',
        quantity: 1,
      },
    ]);
  };

  // Remove line item
  const handleRemoveLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) {
      alert('Please add at least one product line.');
      return;
    }

    if (validUntil < today) {
      alert('Valid Until date cannot be in the past.');
      return;
    }

    setActionLoading(true);
    try {
      await quotationService.createQuotation({
        customer_id: selectedCustomerId,
        plan_id: selectedPlanId,
        discount_id: selectedDiscountId || null,
        tax_id: selectedTaxId || null,
        valid_until: validUntil,
        status: initialStatus,
        lines: lines.map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id || null,
          quantity: l.quantity,
        })),
      });
      setShowCreateModal(false);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to create quotation');
    } finally {
      setActionLoading(false);
    }
  };

  // View Details Modal Handler
  const handleOpenDetails = async (quote: Quotation) => {
    setDetailsLoading(true);
    setSelectedQuote(quote);
    try {
      const fullQuote = await quotationService.getQuotation(quote.id);
      setSelectedQuote(fullQuote);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch quotation details');
    } finally {
      setDetailsLoading(false);
    }
  };

  // Confirm quotation with duplicate and expiry protection
  const handleConfirmQuotation = async (quote: Quotation) => {
    const isExpired = quote.status === 'expired' || quote.valid_until < today;
    if (isExpired) {
      alert(`Cannot confirm quotation: this offer expired on ${quote.valid_until}.`);
      return;
    }

    if (!window.confirm(`Confirm quotation ${quote.quotation_number} and activate subscription?`)) return;

    setConfirmingId(quote.id);
    setActionLoading(true);
    try {
      const res = await quotationService.confirmQuotation(quote.id);
      alert(`Quotation confirmed! Subscription ${res.subscription_number} is now active.`);
      if (selectedQuote?.id === quote.id) {
        setSelectedQuote(null);
      }
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to confirm quotation');
    } finally {
      setActionLoading(false);
      setConfirmingId(null);
    }
  };

  // Mark draft quotation as Sent
  const handleSendQuotation = async (quoteId: string) => {
    setActionLoading(true);
    try {
      await quotationService.sendQuotation(quoteId);
      alert('Quotation marked as sent to customer!');
      if (selectedQuote?.id === quoteId) {
        const updated = await quotationService.getQuotation(quoteId);
        setSelectedQuote(updated);
      }
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to send quotation');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Cancel Modal
  const handleOpenCancelModal = (quote: Quotation) => {
    setQuoteToCancel(quote);
    setCancelReason('');
  };

  // Submit Cancellation
  const handleCancelQuotation = async () => {
    if (!quoteToCancel) return;
    setActionLoading(true);
    try {
      await quotationService.cancelQuotation(quoteToCancel.id, cancelReason || undefined);
      alert(`Quotation ${quoteToCancel.quotation_number} has been cancelled.`);
      setQuoteToCancel(null);
      if (selectedQuote?.id === quoteToCancel.id) {
        setSelectedQuote(null);
      }
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel quotation');
    } finally {
      setActionLoading(false);
    }
  };

  // Status counts for tab badges
  const statusCounts = quotations.reduce(
    (acc, q) => {
      acc.all++;
      const isExp = q.status === 'expired' || (q.valid_until < today && q.status !== 'confirmed' && q.status !== 'cancelled');
      const effStatus = isExp ? 'expired' : q.status;
      if (effStatus in acc) {
        (acc as any)[effStatus]++;
      }
      return acc;
    },
    { all: 0, draft: 0, quotation: 0, sent: 0, confirmed: 0, expired: 0, cancelled: 0 }
  );

  if (loading && quotations.length === 0) return <LoadingSpinner message="Loading quotations..." />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quotations & Offers</h1>
          <p className="text-sm text-slate-500">Draft, configure pricing, manage validity lifecycles, and activate subscriptions</p>
        </div>
        {!isCustomer && (
          <div className="flex items-center space-x-3">
            <Link
              to="/quotation-templates"
              className="flex items-center space-x-1.5 px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium text-sm transition shadow-sm"
            >
              <FileStack className="w-4 h-4 text-indigo-600" />
              <span>Quotation Templates</span>
            </Link>
            <button
              onClick={handleOpenCreateModal}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>New Quotation</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'draft', label: 'Draft' },
              { key: 'quotation', label: 'Quotation' },
              { key: 'sent', label: 'Sent' },
              { key: 'confirmed', label: 'Confirmed' },
              { key: 'expired', label: 'Expired' },
              { key: 'cancelled', label: 'Cancelled' },
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
            placeholder="Search quote #, customer, plan..."
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

      {/* Quotations Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase">
            <tr>
              <th className="py-3 px-4">Quote #</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Plan & Terms</th>
              <th className="py-3 px-4">Valid Until</th>
              <th className="py-3 px-4">Total Amount</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotations.length > 0 ? (
              quotations.map((q) => {
                const isExpired = q.status === 'expired' || (q.valid_until < today && q.status !== 'confirmed' && q.status !== 'cancelled');
                const canConfirm = !isCustomer && !isExpired && ['draft', 'quotation', 'sent'].includes(q.status);
                const canCancel = !isCustomer && q.status !== 'confirmed' && q.status !== 'cancelled';
                const isConfirmingThis = confirmingId === q.id;

                return (
                  <tr key={q.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleOpenDetails(q)}
                        className="font-mono font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center space-x-1"
                        title="View Quotation Details"
                      >
                        <span>{q.quotation_number}</span>
                      </button>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {q.line_count || 1} line item(s)
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{q.customer_name}</div>
                      {q.company_name && <div className="text-xs text-slate-400">{q.company_name}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-800">{q.plan_name}</span>
                      <span className="text-xs text-slate-400 block capitalize">{q.billing_frequency}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className={`flex items-center space-x-1 text-xs font-medium ${isExpired ? 'text-rose-600' : 'text-slate-600'}`}>
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{q.valid_until}</span>
                      </div>
                      {isExpired && (
                        <span className="text-[10px] text-rose-500 font-semibold flex items-center space-x-0.5 mt-0.5">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Expired</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">${Number(q.total_amount).toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <Badge status={isExpired ? 'expired' : q.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {/* View Details Button */}
                        <button
                          onClick={() => handleOpenDetails(q)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Confirm Button */}
                        {canConfirm && (
                          <button
                            onClick={() => handleConfirmQuotation(q)}
                            disabled={actionLoading || isConfirmingThis}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 shadow-sm"
                            title="Confirm Quotation & Activate Subscription"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>{isConfirmingThis ? 'Confirming...' : 'Confirm'}</span>
                          </button>
                        )}

                        {/* Send button for draft */}
                        {!isCustomer && q.status === 'draft' && !isExpired && (
                          <button
                            onClick={() => handleSendQuotation(q.id)}
                            disabled={actionLoading}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 shadow-sm"
                            title="Mark as Sent to Customer"
                          >
                            <Send className="w-3 h-3" />
                            <span>Send</span>
                          </button>
                        )}

                        {/* Cancel Button */}
                        {canCancel && (
                          <button
                            onClick={() => handleOpenCancelModal(q)}
                            disabled={actionLoading}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Cancel Quotation"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}

                        {/* Status indicators for non-actionable rows */}
                        {q.status === 'confirmed' && (
                          <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            Activated &rarr; {q.subscription_number || 'Sub'}
                          </span>
                        )}
                        {q.status === 'cancelled' && (
                          <span className="text-xs text-slate-400 font-medium">Cancelled</span>
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
                    <FileText className="w-8 h-8 text-slate-300" />
                    <span>No quotations found matching the selected filters.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Quotation Details Modal */}
      {selectedQuote && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-bold text-slate-800">{selectedQuote.quotation_number}</h3>
                    <Badge status={selectedQuote.valid_until < today && !['confirmed', 'cancelled'].includes(selectedQuote.status) ? 'expired' : selectedQuote.status} />
                  </div>
                  <p className="text-xs text-slate-500">Created on {new Date(selectedQuote.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQuote(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alert Banners */}
            {selectedQuote.status === 'confirmed' && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>This quotation has been confirmed and activated as Subscription <strong>{selectedQuote.subscription_number || 'Active'}</strong>.</span>
                </div>
                <Link to="/subscriptions" className="font-semibold text-emerald-700 hover:underline">
                  View Subscription &rarr;
                </Link>
              </div>
            )}

            {selectedQuote.status === 'cancelled' && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start space-x-2">
                <Ban className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Quotation Cancelled</p>
                  {selectedQuote.cancelled_at && (
                    <p className="text-[11px] text-rose-700">Timestamp: {selectedQuote.cancelled_at}</p>
                  )}
                  {selectedQuote.cancel_reason && (
                    <p className="text-[11px] text-rose-700 mt-0.5">Reason: {selectedQuote.cancel_reason}</p>
                  )}
                </div>
              </div>
            )}

            {(selectedQuote.status === 'expired' || (selectedQuote.valid_until < today && !['confirmed', 'cancelled'].includes(selectedQuote.status))) && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>This offer expired on <strong>{selectedQuote.valid_until}</strong> and cannot be confirmed.</span>
              </div>
            )}

            {/* Customer & Plan Details Card */}
            <div className="grid grid-cols-2 gap-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl mb-4 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Customer Information</span>
                <span className="font-semibold text-slate-800 text-sm">{selectedQuote.customer_name}</span>
                {selectedQuote.company_name && <span className="text-slate-500 block">{selectedQuote.company_name}</span>}
                {selectedQuote.customer_email && <span className="text-slate-500 block">{selectedQuote.customer_email}</span>}
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Plan & Validity</span>
                <span className="font-semibold text-slate-800 text-sm">{selectedQuote.plan_name}</span>
                <span className="text-slate-500 block capitalize">Frequency: {selectedQuote.billing_frequency}</span>
                <span className="text-slate-500 block">Offer Valid Until: <strong>{selectedQuote.valid_until}</strong></span>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="mb-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">Quotation Line Items</h4>
              {detailsLoading ? (
                <div className="py-6 text-center text-slate-400 text-xs">Loading line items...</div>
              ) : selectedQuote.lines && selectedQuote.lines.length > 0 ? (
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
                      {selectedQuote.lines.map((l) => (
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
                <div className="py-4 text-center text-slate-400 text-xs">No lines recorded.</div>
              )}
            </div>

            {/* Financial Summary */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs mb-6">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono font-medium">${Number(selectedQuote.subtotal).toFixed(2)}</span>
              </div>
              {Number(selectedQuote.discount_amount) > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>
                    Discount {selectedQuote.discount_code ? `(${selectedQuote.discount_code})` : ''}:
                  </span>
                  <span className="font-mono">-${Number(selectedQuote.discount_amount).toFixed(2)}</span>
                </div>
              )}
              {Number(selectedQuote.tax_amount) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax {selectedQuote.tax_name ? `(${selectedQuote.tax_name})` : ''}:</span>
                  <span className="font-mono">+${Number(selectedQuote.tax_amount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-900 font-bold text-sm pt-2 border-t border-slate-200">
                <span>Total Amount:</span>
                <span className="font-mono text-indigo-700">${Number(selectedQuote.total_amount).toFixed(2)}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div>
                {!isCustomer && selectedQuote.status !== 'confirmed' && selectedQuote.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => handleOpenCancelModal(selectedQuote)}
                    disabled={actionLoading}
                    className="px-3.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition font-semibold"
                  >
                    Cancel Quotation
                  </button>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedQuote(null)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Close
                </button>
                {!isCustomer &&
                  selectedQuote.valid_until >= today &&
                  ['draft', 'quotation', 'sent'].includes(selectedQuote.status) && (
                    <button
                      type="button"
                      onClick={() => handleConfirmQuotation(selectedQuote)}
                      disabled={actionLoading}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition shadow-sm disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Confirm & Activate Subscription</span>
                    </button>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {quoteToCancel && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-100 mb-4">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Cancel Quotation</h3>
                <p className="text-xs text-slate-500">{quoteToCancel.quotation_number}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4">
              Are you sure you want to cancel this quotation? This offer will be marked as cancelled and cannot be activated into a subscription.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for cancellation (optional)</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g., Customer requested changes, price negotiation, obsolete..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setQuoteToCancel(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCancelQuotation}
                disabled={actionLoading}
                className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg transition shadow-sm disabled:opacity-50"
              >
                {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Quotation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-800">Create Quotation</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuotation} className="space-y-4">
              {/* Template Selector Card */}
              <div className="p-3.5 bg-gradient-to-r from-indigo-50/70 to-slate-50 border border-indigo-100 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-900 flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>Load from Quotation Template (Optional)</span>
                  </label>
                  {templateLoading && (
                    <span className="text-[11px] text-indigo-600 animate-pulse">Loading template items...</span>
                  )}
                </div>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleSelectTemplate(e.target.value)}
                  disabled={templateLoading}
                  className="w-full px-3 py-2 rounded-lg border border-indigo-200 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  <option value="">-- Choose a template to pre-fill products & plan --</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.line_count || 0} items{tpl.default_plan_name ? ` • Plan: ${tpl.default_plan_name}` : ''})
                    </option>
                  ))}
                </select>

                {appliedTemplateName && (
                  <div className="flex items-center space-x-1.5 text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>
                      Template <strong>"{appliedTemplateName}"</strong> applied. Product lines and default plan populated. You can edit before saving.
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Customer</label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.company_name || c.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Select Plan</label>
                  <select
                    required
                    value={selectedPlanId}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    {plans.filter((p) => p.is_active === 1 || Boolean(p.is_active)).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (${Number(p.price).toFixed(2)}/{p.billing_frequency})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Valid Until</label>
                  <input
                    type="date"
                    required
                    min={today}
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Initial Status selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Status</label>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="initialStatus"
                      value="quotation"
                      checked={initialStatus === 'quotation'}
                      onChange={() => setInitialStatus('quotation')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Quotation (Official Offer)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="initialStatus"
                      value="draft"
                      checked={initialStatus === 'draft'}
                      onChange={() => setInitialStatus('draft')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Draft (Work-in-progress)</span>
                  </label>
                </div>
              </div>

              {/* Product Lines */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-700">Product Lines</label>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Line Item</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {lines.map((line, idx) => {
                    const currentProduct = products.find((p) => p.id === line.product_id);
                    return (
                      <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-200/50">
                          <span className="text-[11px] font-semibold text-slate-500">Item #{idx + 1}</span>
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              className="text-rose-500 hover:text-rose-700 p-0.5 rounded"
                              title="Remove Line"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">Product</label>
                            <select
                              value={line.product_id}
                              onChange={(e) => {
                                const newLines = [...lines];
                                const prod = products.find((p) => p.id === e.target.value);
                                newLines[idx].product_id = e.target.value;
                                newLines[idx].variant_id = prod?.variants?.[0]?.id || '';
                                setLines(newLines);
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                            >
                              {products.filter((p) => p.is_active === 1 || Boolean(p.is_active)).map((prod) => (
                                <option key={prod.id} value={prod.id}>
                                  {prod.name} (${Number(prod.sales_price).toFixed(2)})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">Variant (Optional)</label>
                            <select
                              value={line.variant_id || ''}
                              onChange={(e) => {
                                const newLines = [...lines];
                                newLines[idx].variant_id = e.target.value;
                                setLines(newLines);
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                            >
                              <option value="">Standard Edition</option>
                              {currentProduct?.variants?.filter((v) => v.is_active === 1 || Boolean(v.is_active)).map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.attribute_value} (+${Number(v.price_extra).toFixed(2)})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">Quantity / Seats</label>
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) => {
                              const newLines = [...lines];
                              newLines[idx].quantity = parseInt(e.target.value, 10) || 1;
                              setLines(newLines);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Discount Code (Optional)</label>
                  <select
                    value={selectedDiscountId}
                    onChange={(e) => setSelectedDiscountId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">No Discount</option>
                    {discounts.filter((d) => d.is_active === 1 || Boolean(d.is_active)).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} ({d.type === 'percentage' ? `${d.value}% off` : `$${d.value} off`})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tax Rule (Optional)</label>
                  <select
                    value={selectedTaxId}
                    onChange={(e) => setSelectedTaxId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">No Tax</option>
                    {taxes.filter((t) => t.is_active === 1 || Boolean(t.is_active)).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.rate_percentage}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
                >
                  {actionLoading ? 'Creating...' : 'Create Quotation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
