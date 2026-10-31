import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { quotationService, quotationTemplateService } from '../../services/quotation.service';
import { catalogService } from '../../services/product.service';
import { Quotation, Product, Plan, Tax, Discount, CustomerProfile, QuotationTemplate } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import { FileText, Plus, CheckCircle, FileStack, Trash2, Sparkles, X, Info } from 'lucide-react';

export const QuotationsPage: React.FC = () => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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
  const [validUntil, setValidUntil] = useState('2026-12-31');
  const [lines, setLines] = useState<Array<{ product_id: string; variant_id?: string; quantity: number }>>([
    { product_id: '', variant_id: '', quantity: 1 },
  ]);

  // Template pre-fill state
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);
  const [appliedTemplateName, setAppliedTemplateName] = useState<string | null>(null);

  const { user } = useAuth();
  const isCustomer = user?.role === 'customer';

  const fetchData = async () => {
    try {
      const quotes = await quotationService.getQuotations();
      setQuotations(quotes);

      if (!isCustomer) {
        const [custs, prods, plns, txs, discs, tpls] = await Promise.all([
          catalogService.getCustomers(),
          catalogService.getProducts(),
          catalogService.getPlans(),
          catalogService.getTaxes(),
          catalogService.getDiscounts(),
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
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenCreateModal = () => {
    setSelectedTemplateId('');
    setAppliedTemplateName(null);
    if (customers.length > 0) setSelectedCustomerId(customers[0].id);
    if (plans.length > 0) setSelectedPlanId(plans[0].id);
    setSelectedDiscountId('');
    setSelectedTaxId('');
    setValidUntil('2026-12-31');
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

    setActionLoading(true);
    try {
      await quotationService.createQuotation({
        customer_id: selectedCustomerId,
        plan_id: selectedPlanId,
        discount_id: selectedDiscountId || null,
        tax_id: selectedTaxId || null,
        valid_until: validUntil,
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

  const handleConfirmQuotation = async (quoteId: string) => {
    if (!window.confirm('Confirm this quotation and activate subscription?')) return;
    setActionLoading(true);
    try {
      await quotationService.confirmQuotation(quoteId);
      alert('Quotation confirmed and Subscription activated!');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to confirm quotation');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading quotations..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quotations & Offers</h1>
          <p className="text-sm text-slate-500">Draft, configure pricing, and convert quotes to active subscriptions</p>
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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase">
            <tr>
              <th className="py-3 px-4">Quote #</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Plan</th>
              <th className="py-3 px-4">Valid Until</th>
              <th className="py-3 px-4">Total Amount</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotations.length > 0 ? (
              quotations.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4 font-mono font-medium text-slate-800">{q.quotation_number}</td>
                  <td className="py-3 px-4 font-medium text-slate-900">{q.customer_name}</td>
                  <td className="py-3 px-4 text-slate-600">{q.plan_name}</td>
                  <td className="py-3 px-4 text-slate-500">{q.valid_until}</td>
                  <td className="py-3 px-4 font-bold text-slate-900">${Number(q.total_amount).toFixed(2)}</td>
                  <td className="py-3 px-4"><Badge status={q.status} /></td>
                  <td className="py-3 px-4 text-right">
                    {q.status === 'quotation' && !isCustomer && (
                      <button
                        onClick={() => handleConfirmQuotation(q.id)}
                        disabled={actionLoading}
                        className="inline-flex items-center space-x-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Confirm & Activate</span>
                      </button>
                    )}
                    {q.status === 'confirmed' && (
                      <span className="text-xs text-slate-400 font-medium">Activated &rarr; Subscription</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">
                  No quotations created yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
                    {plans.map((p) => (
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
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
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
                              {products.map((prod) => (
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
                              {currentProduct?.variants?.map((v) => (
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
                    {discounts.map((d) => (
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
                    {taxes.map((t) => (
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
