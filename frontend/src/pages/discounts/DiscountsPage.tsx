import React, { useEffect, useState } from 'react';
import { catalogService } from '../../services/product.service';
import { Discount } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Tag, Plus, CheckCircle, Calendar, Hash } from 'lucide-react';

export const DiscountsPage: React.FC = () => {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    code: '',
    type: 'percentage' as 'percentage' | 'fixed',
    value: 10,
    min_purchase_amount: 100,
    min_quantity: 1,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    max_uses: 100,
  });

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const fetchDiscounts = async () => {
    try {
      const data = await catalogService.getDiscounts();
      setDiscounts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscounts();
  }, []);

  const handleCreateDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await catalogService.createDiscount({
        ...formData,
        code: formData.code.toUpperCase(),
      });
      setShowAddModal(false);
      setSuccessMsg(`Discount code "${formData.code.toUpperCase()}" created.`);
      fetchDiscounts();
    } catch (err: any) {
      alert(err.message || 'Failed to create discount');
    }
  };

  if (loading) return <LoadingSpinner message="Loading discount policies..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Discounts & Promotions</h1>
          <p className="text-sm text-slate-500">Configure promotional vouchers, percentage cuts, and volume discounts</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Discount Rule</span>
          </button>
        )}
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-xs font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {discounts.map((d) => (
          <div key={d.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold font-mono tracking-wider px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                  {d.code}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 uppercase">
                  {d.type}
                </span>
              </div>

              <div className="mt-2 flex items-baseline">
                <span className="text-3xl font-extrabold text-slate-900">
                  {d.type === 'percentage' ? `${d.value}% OFF` : `$${d.value} OFF`}
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>Min Purchase / Qty:</span>
                  <span className="font-semibold text-slate-700">
                    ${Number(d.min_purchase_amount).toFixed(2)} / {d.min_quantity} seat(s)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Usage Count:</span>
                  <span className="font-semibold text-indigo-600">
                    {d.used_count} / {d.max_uses ? d.max_uses : 'Unlimited'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-400">
                  <span className="flex items-center space-x-1">
                    <Calendar className="w-3 h-3" />
                    <span>Valid:</span>
                  </span>
                  <span>{d.start_date || 'Start'} &rarr; {d.end_date || 'Forever'}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Create Discount Code</h3>
            <form onSubmit={handleCreateDiscount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Coupon Code</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. SUMMER25"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Discount Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Value</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Min Purchase ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.min_purchase_amount}
                    onChange={(e) => setFormData({ ...formData, min_purchase_amount: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max Uses</label>
                  <input
                    type="number"
                    value={formData.max_uses}
                    onChange={(e) => setFormData({ ...formData, max_uses: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Create Discount
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
