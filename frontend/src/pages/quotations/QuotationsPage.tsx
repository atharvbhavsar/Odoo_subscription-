import React, { useEffect, useState } from 'react';
import { quotationService } from '../../services/quotation.service';
import { catalogService } from '../../services/product.service';
import { Quotation, Product, Plan, Tax, Discount, CustomerProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import { FileText, Plus, CheckCircle, ArrowRight } from 'lucide-react';

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

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedDiscountId, setSelectedDiscountId] = useState('');
  const [selectedTaxId, setSelectedTaxId] = useState('');
  const [validUntil, setValidUntil] = useState('2026-12-31');
  const [lines, setLines] = useState<Array<{ product_id: string; variant_id?: string; quantity: number }>>([
    { product_id: '', variant_id: '', quantity: 1 },
  ]);

  const { user } = useAuth();
  const isCustomer = user?.role === 'customer';

  const fetchData = async () => {
    try {
      const quotes = await quotationService.getQuotations();
      setQuotations(quotes);

      if (!isCustomer) {
        const [custs, prods, plns, txs, discs] = await Promise.all([
          catalogService.getCustomers(),
          catalogService.getProducts(),
          catalogService.getPlans(),
          catalogService.getTaxes(),
          catalogService.getDiscounts(),
        ]);
        setCustomers(custs);
        setProducts(prods);
        setPlans(plns);
        setTaxes(txs);
        setDiscounts(discs);

        if (custs.length > 0) setSelectedCustomerId(custs[0].id);
        if (plns.length > 0) setSelectedPlanId(plns[0].id);
        if (prods.length > 0) setLines([{ product_id: prods[0].id, variant_id: prods[0].variants?.[0]?.id || '', quantity: 1 }]);
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

  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
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
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quotations & Offers</h1>
          <p className="text-sm text-slate-500">Draft, configure pricing, and convert quotes to active subscriptions</p>
        </div>
        {!isCustomer && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Quotation</span>
          </button>
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
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Create Quotation</h3>
            <form onSubmit={handleCreateQuotation} className="space-y-4">
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
                        {p.name} (${p.price}/{p.billing_frequency})
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
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Product Line</label>
                {lines.map((line, idx) => {
                  const currentProduct = products.find((p) => p.id === line.product_id);
                  return (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mb-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">Product</label>
                          <select
                            value={line.product_id}
                            onChange={(e) => {
                              const newLines = [...lines];
                              newLines[idx].product_id = e.target.value;
                              newLines[idx].variant_id = '';
                              setLines(newLines);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                          >
                            {products.map((prod) => (
                              <option key={prod.id} value={prod.id}>
                                {prod.name} (${prod.sales_price})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">Variant (e.g. Brand)</label>
                          <select
                            value={line.variant_id || ''}
                            onChange={(e) => {
                              const newLines = [...lines];
                              newLines[idx].variant_id = e.target.value;
                              setLines(newLines);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                          >
                            <option value="">Standard Edition</option>
                            {currentProduct?.variants?.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.attribute_value} (+${v.price_extra})
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
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
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

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Create Quotation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

