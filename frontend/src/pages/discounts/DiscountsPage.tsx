import React, { useEffect, useState, useMemo } from 'react';
import { catalogService } from '../../services/product.service';
import { Discount, Product } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import {
  Tag,
  Plus,
  CheckCircle,
  Search,
  Filter,
  Edit2,
  Power,
  Eye,
  X,
  AlertCircle,
  Calendar,
  Layers,
  Package,
} from 'lucide-react';

export const DiscountsPage: React.FC = () => {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'percentage' | 'fixed'>('all');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [viewingDiscount, setViewingDiscount] = useState<Discount | null>(null);
  const [togglingDiscount, setTogglingDiscount] = useState<Discount | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const initialFormState = {
    code: '',
    description: '',
    type: 'percentage' as 'percentage' | 'fixed',
    value: 10,
    min_purchase_amount: 0,
    min_quantity: 0,
    start_date: '',
    end_date: '',
    max_uses: 100,
    applicable_product_id: '',
  };
  const [formData, setFormData] = useState(initialFormState);

  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'staff';

  const fetchDiscounts = async () => {
    try {
      setError(null);
      const data = await catalogService.getDiscounts({
        status: statusFilter,
        search: searchQuery,
        type: typeFilter,
      });
      setDiscounts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve discounts');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const prods = await catalogService.getProducts({ status: 'active' });
      setProducts(prods);
    } catch (err) {
      console.error('Failed to load active products for discount selector', err);
    }
  };

  useEffect(() => {
    fetchDiscounts();
    const interval = setInterval(() => {
      fetchDiscounts();
    }, 15000);
    return () => clearInterval(interval);
  }, [statusFilter, typeFilter, searchQuery]);

  useEffect(() => {
    if (canManage) {
      fetchProducts();
    }
  }, [canManage]);

  // Counts
  const counts = useMemo(() => {
    const total = discounts.length;
    const active = discounts.filter((d) => d.is_active === 1 || d.is_active === true).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [discounts]);

  const openCreateModal = () => {
    setFormData(initialFormState);
    setError(null);
    setShowCreateModal(true);
  };

  const openEditModal = (discount: Discount) => {
    setEditingDiscount(discount);
    setFormData({
      code: discount.code,
      description: discount.description || '',
      type: discount.type,
      value: Number(discount.value),
      min_purchase_amount: Number(discount.min_purchase_amount || 0),
      min_quantity: Number(discount.min_quantity || 0),
      start_date: discount.start_date || '',
      end_date: discount.end_date || '',
      max_uses: Number(discount.max_uses || 0),
      applicable_product_id: discount.applicable_product_id || '',
    });
    setError(null);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (formData.value <= 0) {
      setError('Discount value must be greater than 0');
      setSubmitting(false);
      return;
    }

    if (formData.type === 'percentage' && formData.value > 100) {
      setError('Percentage discount cannot exceed 100%');
      setSubmitting(false);
      return;
    }

    if (formData.start_date && formData.end_date && formData.start_date > formData.end_date) {
      setError('Start date cannot be after end date');
      setSubmitting(false);
      return;
    }

    const payload = {
      code: formData.code.trim().toUpperCase(),
      description: formData.description.trim() || undefined,
      type: formData.type,
      value: Number(formData.value),
      min_purchase_amount: Number(formData.min_purchase_amount) || 0,
      min_quantity: Number(formData.min_quantity) || 0,
      start_date: formData.start_date || undefined,
      end_date: formData.end_date || undefined,
      max_uses: Number(formData.max_uses) || 0,
      applicable_product_id: formData.applicable_product_id || undefined,
    };

    try {
      if (editingDiscount) {
        await catalogService.updateDiscount(editingDiscount.id, payload);
        setSuccessMsg(`Discount code "${payload.code}" updated successfully.`);
        setEditingDiscount(null);
      } else {
        await catalogService.createDiscount(payload);
        setSuccessMsg(`Discount code "${payload.code}" created successfully.`);
        setShowCreateModal(false);
      }
      await fetchDiscounts();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleDiscountStatus = async () => {
    if (!togglingDiscount) return;
    setSubmitting(true);
    setError(null);

    try {
      const isCurrentlyActive = togglingDiscount.is_active === 1 || togglingDiscount.is_active === true;
      if (isCurrentlyActive) {
        await catalogService.deactivateDiscount(togglingDiscount.id);
        setSuccessMsg(`Discount code "${togglingDiscount.code}" deactivated.`);
      } else {
        await catalogService.activateDiscount(togglingDiscount.id);
        setSuccessMsg(`Discount code "${togglingDiscount.code}" activated.`);
      }
      setTogglingDiscount(null);
      await fetchDiscounts();
    } catch (err: any) {
      setError(err.message || 'Failed to update discount status');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading discount policies..." />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center space-x-2">
            <Tag className="w-6 h-6 text-indigo-600" />
            <span>Discounts & Promotions</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure promotional voucher codes, percentage discounts, volume thresholds, and seat quotas
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreateModal}
            className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Discount Rule</span>
          </button>
        )}
      </div>

      {/* Success notification */}
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

      {/* Error alert */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search and Filters Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by code or description..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition"
          />
        </div>

        {/* Type Filter & Status Filter */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Type filter */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg text-xs font-medium">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 py-1 rounded-md transition ${
                typeFilter === 'all' ? 'bg-white text-slate-800 shadow-sm font-semibold' : 'text-slate-500'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => setTypeFilter('percentage')}
              className={`px-2.5 py-1 rounded-md transition ${
                typeFilter === 'percentage' ? 'bg-white text-indigo-700 shadow-sm font-semibold' : 'text-slate-500'
              }`}
            >
              % Percentage
            </button>
            <button
              onClick={() => setTypeFilter('fixed')}
              className={`px-2.5 py-1 rounded-md transition ${
                typeFilter === 'fixed' ? 'bg-white text-indigo-700 shadow-sm font-semibold' : 'text-slate-500'
              }`}
            >
              $ Fixed
            </button>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center space-x-1.5 ${
                statusFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>All</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700">
                {counts.total}
              </span>
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center space-x-1.5 ${
                statusFilter === 'active' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Active</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-700">
                {counts.active}
              </span>
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center space-x-1.5 ${
                statusFilter === 'inactive' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Inactive</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-600">
                {counts.inactive}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Discounts Grid */}
      {discounts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <Tag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No discount rules found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? 'Try modifying your search keywords or clear filters'
              : 'Create promotional vouchers or volume discount policies.'}
          </p>
          {canManage && (
            <button
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Discount Rule</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {discounts.map((d) => {
            const isActive = d.is_active === 1 || d.is_active === true;
            return (
              <div
                key={d.id}
                className={`bg-white rounded-2xl border ${
                  isActive ? 'border-slate-200 shadow-sm' : 'border-slate-200 bg-slate-50/50 opacity-90'
                } p-6 flex flex-col justify-between transition hover:shadow-md`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold font-mono tracking-wider px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                      {d.code}
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 uppercase">
                        {d.type}
                      </span>
                      <Badge status={isActive ? 'active' : 'draft'} />
                    </div>
                  </div>

                  <div className="mt-2 flex items-baseline">
                    <span className="text-3xl font-extrabold text-slate-900">
                      {d.type === 'percentage' ? `${d.value}% OFF` : `$${Number(d.value).toFixed(2)} OFF`}
                    </span>
                  </div>

                  {d.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{d.description}</p>
                  )}

                  {d.applicable_product_name && (
                    <div className="mt-2.5 flex items-center space-x-1.5 text-xs text-indigo-700 bg-indigo-50/70 px-2 py-1 rounded-lg">
                      <Package className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                      <span className="truncate">Applies only to: {d.applicable_product_name}</span>
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-500">
                    <div className="flex justify-between">
                      <span>Min Purchase / Qty:</span>
                      <span className="font-semibold text-slate-700">
                        ${Number(d.min_purchase_amount || 0).toFixed(2)} / {d.min_quantity || 0} seat(s)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Usage Count:</span>
                      <span className="font-semibold text-indigo-600">
                        {d.used_count || 0} / {d.max_uses ? d.max_uses : 'Unlimited'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-slate-400">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>Valid:</span>
                      </span>
                      <span>
                        {d.start_date || 'Start'} &rarr; {d.end_date || 'Forever'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setViewingDiscount(d)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Details</span>
                  </button>

                  {canManage && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => openEditModal(d)}
                        className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => setTogglingDiscount(d)}
                        className={`flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                          isActive
                            ? 'text-rose-600 hover:bg-rose-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{isActive ? 'Deactivate' : 'Activate'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Discount Details Modal */}
      {viewingDiscount && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold font-mono tracking-wider px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700">
                  {viewingDiscount.code}
                </span>
                <Badge status={viewingDiscount.is_active ? 'active' : 'draft'} />
              </div>
              <button
                onClick={() => setViewingDiscount(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-500 block">Type</span>
                  <span className="font-bold text-slate-800 capitalize">{viewingDiscount.type}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Discount Value</span>
                  <span className="text-base font-extrabold text-indigo-600">
                    {viewingDiscount.type === 'percentage'
                      ? `${viewingDiscount.value}%`
                      : `$${Number(viewingDiscount.value).toFixed(2)}`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Min Purchase / Seats</span>
                  <span className="font-semibold text-slate-700">
                    ${Number(viewingDiscount.min_purchase_amount || 0).toFixed(2)} / {viewingDiscount.min_quantity || 0}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Usage (Used / Max)</span>
                  <span className="font-semibold text-slate-700">
                    {viewingDiscount.used_count || 0} /{' '}
                    {viewingDiscount.max_uses ? viewingDiscount.max_uses : 'Unlimited'}
                  </span>
                </div>
              </div>

              {viewingDiscount.description && (
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">Description</span>
                  <p className="text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    {viewingDiscount.description}
                  </p>
                </div>
              )}

              {viewingDiscount.applicable_product_name && (
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">Product Scope</span>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-slate-700 flex items-center space-x-2">
                    <Package className="w-4 h-4 text-indigo-600" />
                    <span>Applies exclusively to: <strong>{viewingDiscount.applicable_product_name}</strong></span>
                  </div>
                </div>
              )}

              <div>
                <span className="font-semibold text-slate-700 block mb-1">Validity Window</span>
                <div className="text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  <span>
                    Start: <strong>{viewingDiscount.start_date || 'Immediate'}</strong> | End:{' '}
                    <strong>{viewingDiscount.end_date || 'No Expiry'}</strong>
                  </span>
                </div>
              </div>

              <div className="pt-2 text-[11px] text-slate-400 flex justify-between border-t border-slate-100">
                <span>Created: {viewingDiscount.created_at ? new Date(viewingDiscount.created_at).toLocaleString() : 'N/A'}</span>
                {viewingDiscount.updated_at && (
                  <span>Updated: {new Date(viewingDiscount.updated_at).toLocaleString()}</span>
                )}
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setViewingDiscount(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Discount Modal */}
      {(showCreateModal || editingDiscount) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">
                {editingDiscount ? 'Edit Discount Rule' : 'Create Discount Rule'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingDiscount(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Coupon Code *</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. SUMMER25"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 font-mono font-bold uppercase outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Promotional context or campaign tag..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Discount Type *</label>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {formData.type === 'percentage' ? 'Percentage (%) *' : 'Amount ($) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={formData.type === 'percentage' ? 100 : undefined}
                    required
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Min Purchase ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.min_purchase_amount}
                    onChange={(e) =>
                      setFormData({ ...formData, min_purchase_amount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Min Seats / Qty</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.min_quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, min_quantity: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max Uses (0 = unlimited)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.max_uses}
                    onChange={(e) =>
                      setFormData({ ...formData, max_uses: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Applicable Product (Optional)</label>
                <select
                  value={formData.applicable_product_id}
                  onChange={(e) => setFormData({ ...formData, applicable_product_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All Products (Entire Quotation Subtotal)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (${Number(p.sales_price).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Valid From</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Valid Until</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingDiscount(null);
                  }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingDiscount ? 'Update Discount' : 'Create Discount'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate / Activate Confirmation Modal */}
      {togglingDiscount && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center space-x-3 mb-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  togglingDiscount.is_active ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                <Power className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                {togglingDiscount.is_active ? 'Deactivate Discount Code?' : 'Activate Discount Code?'}
              </h3>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              {togglingDiscount.is_active ? (
                <>
                  Are you sure you want to deactivate code <strong>{togglingDiscount.code}</strong>? It will no longer be
                  eligible for new quotations. All existing quotations, confirmed subscriptions, and historical invoices
                  will remain unchanged.
                </>
              ) : (
                <>
                  Are you sure you want to reactivate code <strong>{togglingDiscount.code}</strong>? It will immediately
                  become eligible for qualifying quotations.
                </>
              )}
            </p>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setTogglingDiscount(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleToggleDiscountStatus}
                className={`px-4 py-2 text-sm text-white font-semibold rounded-lg transition shadow-sm ${
                  togglingDiscount.is_active
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {submitting ? 'Updating...' : togglingDiscount.is_active ? 'Deactivate Code' : 'Activate Code'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
