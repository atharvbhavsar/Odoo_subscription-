import React, { useEffect, useState } from 'react';
import { addonService } from '../../services/addon.service';
import { catalogService } from '../../services/product.service';
import { Subscription, SubscriptionAddon, Product } from '../../types';
import { Badge } from '../common/Badge';
import { LoadingSpinner } from '../common/Loading';
import { Plus, Trash2, X, AlertCircle, CheckCircle2, Layers } from 'lucide-react';

interface SubscriptionAddonsModalProps {
  subscription: Subscription;
  onClose: () => void;
  onUpdated?: () => void;
}

export const SubscriptionAddonsModal: React.FC<SubscriptionAddonsModalProps> = ({
  subscription,
  onClose,
  onUpdated,
}) => {
  const [addons, setAddons] = useState<SubscriptionAddon[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [addonList, productList] = await Promise.all([
        addonService.getAddons(subscription.id),
        catalogService.getProducts(),
      ]);
      setAddons(addonList);
      setProducts(productList.filter((p) => p.is_active));
      if (productList.length > 0 && !selectedProductId) {
        setSelectedProductId(productList[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load add-ons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [subscription.id]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const handleAddAddon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return;

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await addonService.addAddon(subscription.id, {
        product_id: selectedProductId,
        variant_id: selectedVariantId || null,
        quantity: Number(quantity),
      });

      setSuccess('Add-on scheduled successfully! It will take effect on the next billing date.');
      setQuantity(1);
      setSelectedVariantId('');
      await loadData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to schedule add-on');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateQuantity = async (addonId: string, currentQty: number, delta: number) => {
    const newQty = currentQty + delta;
    if (newQty <= 0) return;

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await addonService.updateQuantity(subscription.id, addonId, newQty);
      setSuccess('Add-on quantity updated successfully.');
      await loadData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to update quantity');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveAddon = async (addonId: string) => {
    if (!window.confirm('Remove this add-on from the next billing period?')) return;

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await addonService.removeAddon(subscription.id, addonId);
      setSuccess('Add-on removal scheduled for next billing cycle.');
      await loadData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to remove add-on');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Subscription Add-ons</h2>
              <p className="text-xs text-slate-500 font-mono">
                {subscription.subscription_number} &bull; Next Renewal: {subscription.next_billing_date}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
            <strong>Policy:</strong> Add-ons and removals take effect on the next recurring billing cycle (
            <strong>{subscription.next_billing_date}</strong>). Current invoices remain snapshot-immutable.
          </div>

          {/* Add Add-on Form */}
          {subscription.status !== 'closed' && (
            <form onSubmit={handleAddAddon} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-1">
                <Plus className="w-4 h-4 text-indigo-600" />
                <span>Schedule New Add-on</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Product</label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      setSelectedVariantId('');
                    }}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (${Number(p.sales_price).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedProduct && selectedProduct.variants && selectedProduct.variants.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Variant (Optional)</label>
                    <select
                      value={selectedVariantId}
                      onChange={(e) => setSelectedVariantId(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Base Product</option>
                      {selectedProduct.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.attribute_value} (+${Number(v.price_extra).toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={actionLoading || !selectedProductId}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
                >
                  {actionLoading ? 'Scheduling...' : 'Add to Next Cycle'}
                </button>
              </div>
            </form>
          )}

          {/* Add-ons List */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Current & Scheduled Add-ons</h3>

            {loading ? (
              <LoadingSpinner message="Loading add-ons..." />
            ) : addons.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                No active or scheduled add-ons for this subscription.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {addons.map((addon) => {
                  const lineTotal = Number(addon.unit_price) * addon.quantity;
                  const canEdit =
                    addon.status === 'active' || addon.status === 'pending_activation';

                  return (
                    <div key={addon.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-sm">{addon.product_name}</span>
                          {addon.attribute_value && (
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                              {addon.attribute_value}
                            </span>
                          )}
                          <Badge status={addon.status} />
                        </div>
                        <p className="text-xs text-slate-500">
                          ${Number(addon.unit_price).toFixed(2)} each &bull; Effective Start:{' '}
                          <span className="font-semibold">{addon.effective_start_date}</span>
                          {addon.effective_end_date && (
                            <span> &bull; Removal Date: <span className="text-rose-600 font-semibold">{addon.effective_end_date}</span></span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <span className="text-sm font-bold text-slate-900">${lineTotal.toFixed(2)}</span>
                          <div className="flex items-center space-x-1 mt-1 justify-end">
                            {canEdit && (
                              <button
                                type="button"
                                disabled={actionLoading || addon.quantity <= 1}
                                onClick={() => handleUpdateQuantity(addon.id, addon.quantity, -1)}
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center disabled:opacity-40"
                              >
                                -
                              </button>
                            )}
                            <span className="text-xs font-bold text-slate-700 px-1.5">{addon.quantity}</span>
                            {canEdit && (
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handleUpdateQuantity(addon.id, addon.quantity, 1)}
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center disabled:opacity-40"
                              >
                                +
                              </button>
                            )}
                          </div>
                        </div>

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAddon(addon.id)}
                            disabled={actionLoading}
                            title="Schedule removal for next cycle"
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
