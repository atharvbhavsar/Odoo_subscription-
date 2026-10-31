import React, { useEffect, useState, useMemo } from 'react';
import { catalogService } from '../../services/product.service';
import { Tax } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import {
  Percent,
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
} from 'lucide-react';

export const TaxesPage: React.FC = () => {
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTax, setEditingTax] = useState<Tax | null>(null);
  const [viewingTax, setViewingTax] = useState<Tax | null>(null);
  const [togglingTax, setTogglingTax] = useState<Tax | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const initialFormState = {
    name: '',
    description: '',
    rate_percentage: 18,
    start_date: '',
    end_date: '',
  };
  const [formData, setFormData] = useState(initialFormState);

  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'staff';

  const fetchTaxes = async () => {
    try {
      setError(null);
      const data = await catalogService.getTaxes({ status: statusFilter, search: searchQuery });
      setTaxes(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve tax configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaxes();
    const interval = setInterval(() => {
      fetchTaxes();
    }, 15000);
    return () => clearInterval(interval);
  }, [statusFilter, searchQuery]);

  // Counts
  const counts = useMemo(() => {
    const total = taxes.length;
    const active = taxes.filter((t) => t.is_active === 1 || t.is_active === true).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [taxes]);

  const openCreateModal = () => {
    setFormData(initialFormState);
    setError(null);
    setShowCreateModal(true);
  };

  const openEditModal = (tax: Tax) => {
    setEditingTax(tax);
    setFormData({
      name: tax.name,
      description: tax.description || '',
      rate_percentage: Number(tax.rate_percentage),
      start_date: tax.start_date || '',
      end_date: tax.end_date || '',
    });
    setError(null);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (formData.rate_percentage < 0 || formData.rate_percentage > 100) {
      setError('Rate percentage must be between 0% and 100%');
      setSubmitting(false);
      return;
    }

    if (formData.start_date && formData.end_date && formData.start_date > formData.end_date) {
      setError('Effective start date cannot be after end date');
      setSubmitting(false);
      return;
    }

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      rate_percentage: Number(formData.rate_percentage),
      start_date: formData.start_date || undefined,
      end_date: formData.end_date || undefined,
    };

    try {
      if (editingTax) {
        await catalogService.updateTax(editingTax.id, payload);
        setSuccessMsg(`Tax rule "${payload.name}" updated successfully.`);
        setEditingTax(null);
      } else {
        await catalogService.createTax(payload);
        setSuccessMsg(`Tax rule "${payload.name}" created successfully.`);
        setShowCreateModal(false);
      }
      await fetchTaxes();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleTaxStatus = async () => {
    if (!togglingTax) return;
    setSubmitting(true);
    setError(null);

    try {
      const isCurrentlyActive = togglingTax.is_active === 1 || togglingTax.is_active === true;
      if (isCurrentlyActive) {
        await catalogService.deactivateTax(togglingTax.id);
        setSuccessMsg(`Tax rule "${togglingTax.name}" deactivated.`);
      } else {
        await catalogService.activateTax(togglingTax.id);
        setSuccessMsg(`Tax rule "${togglingTax.name}" activated.`);
      }
      setTogglingTax(null);
      await fetchTaxes();
    } catch (err: any) {
      setError(err.message || 'Failed to update tax status');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading tax rules..." />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center space-x-2">
            <Percent className="w-6 h-6 text-indigo-600" />
            <span>Tax Configurations</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure regional tax rules applied automatically to quotations and recurring billing invoices
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreateModal}
            className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Tax Rule</span>
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
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tax rules by name or description..."
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

      {/* Taxes Grid */}
      {taxes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <Percent className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No tax rules found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? 'Try modifying your search keywords or clear filters'
              : 'Configure regional tax rules to automatically apply to invoices.'}
          </p>
          {canManage && (
            <button
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Tax Rule</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {taxes.map((t) => {
            const isActive = t.is_active === 1 || t.is_active === true;
            return (
              <div
                key={t.id}
                className={`bg-white rounded-2xl border ${
                  isActive ? 'border-slate-200 shadow-sm' : 'border-slate-200 bg-slate-50/50 opacity-90'
                } p-6 flex flex-col justify-between transition hover:shadow-md`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Badge status={isActive ? 'active' : 'draft'} />
                    <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600">
                      <Percent className="w-5 h-5" />
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-slate-900">{t.name}</h3>
                  {t.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                  )}

                  <div className="mt-4 flex items-baseline">
                    <span className="text-3xl font-extrabold text-slate-900">
                      {Number(t.rate_percentage).toFixed(2)}%
                    </span>
                    <span className="text-xs text-slate-400 ml-2 font-medium">applied to subtotal</span>
                  </div>

                  {(t.start_date || t.end_date) && (
                    <div className="mt-3 flex items-center space-x-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>
                        Valid: {t.start_date || 'Start'} &rarr; {t.end_date || 'Forever'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setViewingTax(t)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Details</span>
                  </button>

                  {canManage && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => openEditModal(t)}
                        className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => setTogglingTax(t)}
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

      {/* Tax Details Modal */}
      {viewingTax && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-xl font-bold text-slate-800">{viewingTax.name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {viewingTax.id}</p>
              </div>
              <button
                onClick={() => setViewingTax(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-500 block">Status</span>
                  <Badge status={viewingTax.is_active ? 'active' : 'draft'} />
                </div>
                <div>
                  <span className="text-slate-500 block">Rate Percentage</span>
                  <span className="text-base font-bold text-slate-800">
                    {Number(viewingTax.rate_percentage).toFixed(2)}%
                  </span>
                </div>
              </div>

              {viewingTax.description && (
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">Description</span>
                  <p className="text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    {viewingTax.description}
                  </p>
                </div>
              )}

              <div>
                <span className="font-semibold text-slate-700 block mb-1">Effective Window</span>
                <div className="text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  <span>
                    Start: <strong>{viewingTax.start_date || 'Immediate'}</strong> | End:{' '}
                    <strong>{viewingTax.end_date || 'Ongoing'}</strong>
                  </span>
                </div>
              </div>

              <div className="pt-2 text-[11px] text-slate-400 flex justify-between border-t border-slate-100">
                <span>Created: {viewingTax.created_at ? new Date(viewingTax.created_at).toLocaleString() : 'N/A'}</span>
                {viewingTax.updated_at && (
                  <span>Updated: {new Date(viewingTax.updated_at).toLocaleString()}</span>
                )}
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setViewingTax(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Tax Modal */}
      {(showCreateModal || editingTax) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">
                {editingTax ? 'Edit Tax Rule' : 'Create Tax Rule'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingTax(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tax Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. GST 18%"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Rate Percentage (%) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  value={formData.rate_percentage}
                  onChange={(e) =>
                    setFormData({ ...formData, rate_percentage: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description of regional jurisdiction or applicability..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Effective Start</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Effective End</label>
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
                    setEditingTax(null);
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
                  {submitting ? 'Saving...' : editingTax ? 'Update Tax Rule' : 'Create Tax Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate / Activate Confirmation Modal */}
      {togglingTax && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center space-x-3 mb-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  togglingTax.is_active ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                <Power className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                {togglingTax.is_active ? 'Deactivate Tax Rule?' : 'Activate Tax Rule?'}
              </h3>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              {togglingTax.is_active ? (
                <>
                  Are you sure you want to deactivate <strong>{togglingTax.name}</strong>? It will no longer be
                  selectable for new quotations. All existing quotations, active subscriptions, and historical invoices
                  will remain unchanged.
                </>
              ) : (
                <>
                  Are you sure you want to activate <strong>{togglingTax.name}</strong>? It will immediately become
                  available for new quotations.
                </>
              )}
            </p>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setTogglingTax(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleToggleTaxStatus}
                className={`px-4 py-2 text-sm text-white font-semibold rounded-lg transition shadow-sm ${
                  togglingTax.is_active
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {submitting ? 'Updating...' : togglingTax.is_active ? 'Deactivate Rule' : 'Activate Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
