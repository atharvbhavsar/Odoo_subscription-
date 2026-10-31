import React, { useEffect, useState, useMemo } from 'react';
import { catalogService } from '../../services/product.service';
import { Plan, Product } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import {
  Layers,
  Plus,
  Check,
  Search,
  Filter,
  Edit2,
  Power,
  Eye,
  X,
  AlertCircle,
  Calendar,
  Package,
  Trash2,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface FormLine {
  product_id: string;
  variant_id: string;
  quantity: number;
}

export const PlansPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [viewingPlan, setViewingPlan] = useState<Plan | null>(null);
  const [togglingPlan, setTogglingPlan] = useState<Plan | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const initialFormState = {
    name: '',
    description: '',
    billing_frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'yearly',
    billing_interval: 1,
    price: 150,
    min_qty: 1,
    start_date: '',
    end_date: '',
    can_pause: true,
    can_renew: true,
    can_close_early: true,
    auto_close: false,
    lines: [] as FormLine[],
  };
  const [formData, setFormData] = useState(initialFormState);

  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'staff';

  const fetchPlans = async () => {
    try {
      setError(null);
      const data = await catalogService.getPlans({ status: statusFilter, search: searchQuery });
      setPlans(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve subscription plans');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const prods = await catalogService.getProducts({ status: 'active' });
      setAvailableProducts(prods);
    } catch (err) {
      console.error('Failed to load active products for plan builder', err);
    }
  };

  useEffect(() => {
    fetchPlans();
    const interval = setInterval(() => {
      fetchPlans();
    }, 15000);
    return () => clearInterval(interval);
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    if (canManage) {
      fetchProducts();
    }
  }, [canManage]);

  // Filtered counts
  const counts = useMemo(() => {
    const total = plans.length;
    const active = plans.filter((p) => p.is_active === 1 || p.is_active === true).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [plans]);

  const openCreateModal = () => {
    setFormData(initialFormState);
    setError(null);
    setShowCreateModal(true);
  };

  const openEditModal = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || '',
      billing_frequency: plan.billing_frequency,
      billing_interval: plan.billing_interval || 1,
      price: Number(plan.price),
      min_qty: Number(plan.min_qty),
      start_date: plan.start_date || '',
      end_date: plan.end_date || '',
      can_pause: Boolean(plan.can_pause),
      can_renew: Boolean(plan.can_renew),
      can_close_early: Boolean(plan.can_close_early),
      auto_close: Boolean(plan.auto_close),
      lines:
        plan.lines?.map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id || '',
          quantity: l.quantity,
        })) || [],
    });
    setError(null);
  };

  const handleAddLine = () => {
    if (availableProducts.length === 0) return;
    const firstProd = availableProducts[0];
    setFormData({
      ...formData,
      lines: [
        ...formData.lines,
        {
          product_id: firstProd.id,
          variant_id: firstProd.variants && firstProd.variants.length > 0 ? firstProd.variants[0].id : '',
          quantity: 1,
        },
      ],
    });
  };

  const handleRemoveLine = (index: number) => {
    setFormData({
      ...formData,
      lines: formData.lines.filter((_, idx) => idx !== index),
    });
  };

  const handleLineChange = (index: number, field: keyof FormLine, value: any) => {
    const updated = [...formData.lines];
    if (field === 'product_id') {
      const prod = availableProducts.find((p) => p.id === value);
      updated[index] = {
        product_id: value,
        variant_id: prod?.variants && prod.variants.length > 0 ? prod.variants[0].id : '',
        quantity: updated[index].quantity || 1,
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setFormData({ ...formData, lines: updated });
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (formData.start_date && formData.end_date && formData.start_date > formData.end_date) {
      setError('Start date cannot be after end date');
      setSubmitting(false);
      return;
    }

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      billing_frequency: formData.billing_frequency,
      billing_interval: Number(formData.billing_interval) || 1,
      price: Number(formData.price),
      min_qty: Number(formData.min_qty),
      start_date: formData.start_date || undefined,
      end_date: formData.end_date || undefined,
      can_pause: formData.can_pause,
      can_renew: formData.can_renew,
      can_close_early: formData.can_close_early,
      auto_close: formData.auto_close,
      lines: formData.lines.map((l) => ({
        product_id: l.product_id,
        variant_id: l.variant_id ? l.variant_id : undefined,
        quantity: Number(l.quantity),
      })),
    };

    try {
      if (editingPlan) {
        await catalogService.updatePlan(editingPlan.id, payload);
        setEditingPlan(null);
      } else {
        await catalogService.createPlan(payload);
        setShowCreateModal(false);
      }
      await fetchPlans();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePlanStatus = async () => {
    if (!togglingPlan) return;
    setSubmitting(true);
    setError(null);
    try {
      const isCurrentlyActive = togglingPlan.is_active === 1 || togglingPlan.is_active === true;
      if (isCurrentlyActive) {
        await catalogService.deactivatePlan(togglingPlan.id);
      } else {
        await catalogService.activatePlan(togglingPlan.id);
      }
      setTogglingPlan(null);
      await fetchPlans();
    } catch (err: any) {
      setError(err.message || 'Failed to update plan status');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading subscription plans..." />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center space-x-2">
            <Layers className="w-6 h-6 text-indigo-600" />
            <span>Subscription Plans</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure recurring frequencies, minimum seats, bundled products, and customer lifecycle permissions
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreateModal}
            className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Plan</span>
          </button>
        )}
      </div>

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
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search plans by name or description..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg w-full md:w-auto">
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

      {/* Plans Grid */}
      {plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No subscription plans found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? 'Try modifying your search keywords or clear filters'
              : 'Get started by creating your first subscription plan.'}
          </p>
          {canManage && (
            <button
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Plan</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isActive = plan.is_active === 1 || plan.is_active === true;
            return (
              <div
                key={plan.id}
                className={`bg-white rounded-2xl border ${
                  isActive ? 'border-slate-200 shadow-sm' : 'border-slate-200 bg-slate-50/50 opacity-90'
                } p-6 flex flex-col justify-between transition hover:shadow-md`}
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                        {plan.billing_frequency}
                        {plan.billing_interval && plan.billing_interval > 1 ? ` (every ${plan.billing_interval})` : ''}
                      </span>
                      <Badge status={isActive ? 'active' : 'draft'} />
                    </div>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      Min Qty: {plan.min_qty}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  {plan.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{plan.description}</p>
                  )}

                  {/* Pricing Display */}
                  <div className="mt-4 flex items-baseline">
                    <span className="text-3xl font-extrabold text-slate-900">${Number(plan.price).toFixed(2)}</span>
                    <span className="text-sm text-slate-500 ml-1.5 font-medium">/{plan.billing_frequency}</span>
                  </div>

                  {/* Availability Dates */}
                  {(plan.start_date || plan.end_date) && (
                    <div className="mt-3 flex items-center space-x-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>
                        Valid: {plan.start_date || 'Immediate'} to {plan.end_date || 'Ongoing'}
                      </span>
                    </div>
                  )}

                  {/* Bundled Products Preview */}
                  {plan.lines && plan.lines.length > 0 && (
                    <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                      <div className="flex items-center space-x-1.5 font-semibold text-slate-700 mb-1.5">
                        <Package className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Included Products ({plan.lines.length})</span>
                      </div>
                      <div className="space-y-1">
                        {plan.lines.slice(0, 2).map((line) => (
                          <div key={line.id} className="flex justify-between text-slate-600">
                            <span className="truncate max-w-[180px]">
                              {line.product_name} {line.attribute_value ? `(${line.attribute_value})` : ''}
                            </span>
                            <span className="font-medium text-slate-800">x{line.quantity}</span>
                          </div>
                        ))}
                        {plan.lines.length > 2 && (
                          <div className="text-[11px] text-indigo-600 font-medium">
                            +{plan.lines.length - 2} more product(s)
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Policy Checklist */}
                  <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                    <div className="flex items-center space-x-2">
                      <Check className={`w-4 h-4 ${plan.can_pause ? 'text-emerald-500' : 'text-slate-300'}`} />
                      <span>Pause/Resume: {plan.can_pause ? 'Allowed' : 'Disabled'}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Check className={`w-4 h-4 ${plan.can_renew ? 'text-emerald-500' : 'text-slate-300'}`} />
                      <span>Renewal: {plan.can_renew ? 'Allowed' : 'Manual'}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Check className={`w-4 h-4 ${plan.can_close_early ? 'text-emerald-500' : 'text-slate-300'}`} />
                      <span>Early Close: {plan.can_close_early ? 'Permitted' : 'Locked'}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setViewingPlan(plan)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Details</span>
                  </button>

                  {canManage && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => openEditModal(plan)}
                        className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => setTogglingPlan(plan)}
                        title={isActive ? 'Deactivate Plan' : 'Activate Plan'}
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

      {/* Plan Details Modal */}
      {viewingPlan && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-xl font-bold text-slate-800">{viewingPlan.name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {viewingPlan.id}</p>
              </div>
              <button
                onClick={() => setViewingPlan(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Status & Pricing */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                <div>
                  <span className="text-slate-500 block">Status</span>
                  <Badge status={viewingPlan.is_active ? 'active' : 'draft'} />
                </div>
                <div>
                  <span className="text-slate-500 block">Price</span>
                  <span className="font-bold text-slate-800 text-sm">
                    ${Number(viewingPlan.price).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Cadence</span>
                  <span className="font-semibold text-slate-700 capitalize">
                    {viewingPlan.billing_frequency}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Min Qty</span>
                  <span className="font-semibold text-slate-700">{viewingPlan.min_qty}</span>
                </div>
              </div>

              {/* Description */}
              {viewingPlan.description && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 mb-1">Description</h4>
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    {viewingPlan.description}
                  </p>
                </div>
              )}

              {/* Availability Dates */}
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-1">Availability Window</h4>
                <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  <span>
                    Start: <strong>{viewingPlan.start_date || 'Immediate'}</strong> | End:{' '}
                    <strong>{viewingPlan.end_date || 'No Expiry'}</strong>
                  </span>
                </div>
              </div>

              {/* Policy Settings */}
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-2">Customer Lifecycle Policies</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <span className="text-slate-600">Pause / Resume:</span>
                    <span className={`font-semibold ${viewingPlan.can_pause ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {viewingPlan.can_pause ? 'Allowed' : 'Disabled'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <span className="text-slate-600">Renewal Policy:</span>
                    <span className={`font-semibold ${viewingPlan.can_renew ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {viewingPlan.can_renew ? 'Auto-Renew' : 'Manual'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <span className="text-slate-600">Early Termination:</span>
                    <span className={`font-semibold ${viewingPlan.can_close_early ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {viewingPlan.can_close_early ? 'Permitted' : 'Locked'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <span className="text-slate-600">Auto-Close on Expiry:</span>
                    <span className={`font-semibold ${viewingPlan.auto_close ? 'text-amber-600' : 'text-slate-400'}`}>
                      {viewingPlan.auto_close ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bundled Products */}
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-2 flex items-center justify-between">
                  <span>Bundled Products & Quantities</span>
                  <span className="text-slate-400 font-normal">
                    {viewingPlan.lines?.length || 0} product(s)
                  </span>
                </h4>
                {viewingPlan.lines && viewingPlan.lines.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                        <tr>
                          <th className="py-2 px-3">Product / Variant</th>
                          <th className="py-2 px-3 text-center">Qty</th>
                          <th className="py-2 px-3 text-right">Unit Price</th>
                          <th className="py-2 px-3 text-right">Effective</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewingPlan.lines.map((line) => (
                          <tr key={line.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-800">{line.product_name}</div>
                              {line.attribute_value && (
                                <div className="text-[11px] text-indigo-600">
                                  {line.attribute_name}: {line.attribute_value}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                              {line.quantity}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-600">
                              ${Number(line.sales_price || 0).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                              ${Number(line.effective_price || line.sales_price || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500 text-center">
                    No bundled products configured for this plan.
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <div className="pt-2 text-[11px] text-slate-400 flex justify-between border-t border-slate-100">
                <span>Created: {viewingPlan.created_at ? new Date(viewingPlan.created_at).toLocaleString() : 'N/A'}</span>
                {viewingPlan.updated_at && (
                  <span>Updated: {new Date(viewingPlan.updated_at).toLocaleString()}</span>
                )}
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setViewingPlan(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Plan Modal */}
      {(showCreateModal || editingPlan) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">
                {editingPlan ? 'Edit Subscription Plan' : 'Create Subscription Plan'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingPlan(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4 mt-4">
              {/* Plan Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Plan Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Enterprise Monthly"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this plan tier..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Frequency, Interval, Price, Min Qty */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Frequency *</label>
                  <select
                    value={formData.billing_frequency}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        billing_frequency: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Interval Multiplier</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.billing_interval}
                    onChange={(e) => setFormData({ ...formData, billing_interval: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Min Quantity / Seats *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.min_qty}
                    onChange={(e) => setFormData({ ...formData, min_qty: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Availability Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Availability Start Date</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Availability End Date</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Policy Permissions */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h4 className="text-xs font-semibold text-slate-700">Customer Lifecycle Policies</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.can_pause}
                      onChange={(e) => setFormData({ ...formData, can_pause: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Allow customer pause & resume</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.can_renew}
                      onChange={(e) => setFormData({ ...formData, can_renew: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Allow subscription renewal</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.can_close_early}
                      onChange={(e) => setFormData({ ...formData, can_close_early: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Allow early cancellation</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.auto_close}
                      onChange={(e) => setFormData({ ...formData, auto_close: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Auto-close upon term expiration</span>
                  </label>
                </div>
              </div>

              {/* Bundled Products Section */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-700">Bundled Products</h4>
                    <p className="text-[11px] text-slate-500">Products automatically included in this subscription plan</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Product</span>
                  </button>
                </div>

                {formData.lines.length === 0 ? (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 text-center">
                    No bundled products added yet. Click &quot;Add Product&quot; to configure.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {formData.lines.map((line, idx) => {
                      const selectedProduct = availableProducts.find((p) => p.id === line.product_id);
                      const variants = selectedProduct?.variants?.filter((v) => v.is_active !== 0) || [];

                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                        >
                          <div className="flex-1">
                            <select
                              value={line.product_id}
                              onChange={(e) => handleLineChange(idx, 'product_id', e.target.value)}
                              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                            >
                              {availableProducts.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} (${Number(p.sales_price).toFixed(2)})
                                </option>
                              ))}
                            </select>
                          </div>

                          {variants.length > 0 && (
                            <div className="w-40">
                              <select
                                value={line.variant_id}
                                onChange={(e) => handleLineChange(idx, 'variant_id', e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                              >
                                <option value="">No Variant (Base)</option>
                                {variants.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.attribute_value} (+${Number(v.price_extra).toFixed(2)})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div className="w-20">
                            <input
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(e) =>
                                handleLineChange(idx, 'quantity', parseInt(e.target.value, 10) || 1)
                              }
                              placeholder="Qty"
                              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-center"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingPlan(null);
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
                  {submitting ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activate / Deactivate Confirmation Modal */}
      {togglingPlan && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center space-x-3 mb-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  togglingPlan.is_active ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                <Power className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                {togglingPlan.is_active ? 'Deactivate Subscription Plan?' : 'Activate Subscription Plan?'}
              </h3>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              {togglingPlan.is_active ? (
                <>
                  Are you sure you want to deactivate <strong>{togglingPlan.name}</strong>? This will prevent it from
                  being selected for new quotations or subscriptions. All existing active subscriptions and historical
                  invoices will remain unaffected.
                </>
              ) : (
                <>
                  Are you sure you want to reactivate <strong>{togglingPlan.name}</strong>? It will immediately become
                  available for new quotations and customer subscriptions.
                </>
              )}
            </p>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setTogglingPlan(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleTogglePlanStatus}
                className={`px-4 py-2 text-sm text-white font-semibold rounded-lg transition shadow-sm ${
                  togglingPlan.is_active
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {submitting ? 'Updating...' : togglingPlan.is_active ? 'Deactivate Plan' : 'Activate Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
