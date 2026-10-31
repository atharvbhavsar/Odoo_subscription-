import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { quotationTemplateService } from '../../services/quotation.service';
import { catalogService } from '../../services/product.service';
import { QuotationTemplate, QuotationTemplateLine, Product, Plan } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import {
  FileStack,
  Plus,
  ArrowLeft,
  Trash2,
  Edit3,
  Eye,
  PowerOff,
  CheckCircle,
  AlertCircle,
  X,
  Layers,
  Package,
} from 'lucide-react';

interface FormLine {
  product_id: string;
  variant_id: string;
  quantity: number;
}

export const QuotationTemplatesPage: React.FC = () => {
  const { user } = useAuth();
  const isCustomer = user?.role === 'customer';

  const [templates, setTemplates] = useState<QuotationTemplate[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  // Modals state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTemplate, setDetailTemplate] = useState<QuotationTemplate | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    default_plan_id: '',
  });
  const [formLines, setFormLines] = useState<FormLine[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchTemplates = async () => {
    try {
      const data = await quotationTemplateService.getTemplates(includeInactive);
      setTemplates(data);
    } catch (err: any) {
      console.error('Failed to load templates:', err);
    }
  };

  const fetchDependencies = async () => {
    try {
      const [fetchedPlans, fetchedProducts] = await Promise.all([
        catalogService.getPlans({ status: 'active' }),
        catalogService.getProducts(),
      ]);
      setPlans(fetchedPlans);
      setProducts(fetchedProducts);
    } catch (err) {
      console.error('Failed to load plans or products:', err);
    }
  };

  useEffect(() => {
    if (isCustomer) return;
    setLoading(true);
    Promise.all([fetchTemplates(), fetchDependencies()]).finally(() => {
      setLoading(false);
    });
  }, [includeInactive, isCustomer]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingTemplateId(null);
    setFormData({
      name: '',
      description: '',
      default_plan_id: plans.length > 0 ? plans[0].id : '',
    });
    const initialProduct = products[0];
    const initialVariant = initialProduct?.variants?.[0]?.id || '';
    setFormLines([
      {
        product_id: initialProduct?.id || '',
        variant_id: initialVariant,
        quantity: 1,
      },
    ]);
    setFormError(null);
    setShowFormModal(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = async (templateId: string) => {
    setFormSubmitting(true);
    setFormError(null);
    try {
      const fullTemplate = await quotationTemplateService.getTemplate(templateId);
      setEditingTemplateId(fullTemplate.id);
      setFormData({
        name: fullTemplate.name,
        description: fullTemplate.description || '',
        default_plan_id: fullTemplate.default_plan_id || '',
      });
      if (fullTemplate.lines && fullTemplate.lines.length > 0) {
        setFormLines(
          fullTemplate.lines.map((l) => ({
            product_id: l.product_id,
            variant_id: l.variant_id || '',
            quantity: l.quantity,
          }))
        );
      } else {
        const initialProduct = products[0];
        setFormLines([
          {
            product_id: initialProduct?.id || '',
            variant_id: initialProduct?.variants?.[0]?.id || '',
            quantity: 1,
          },
        ]);
      }
      setShowFormModal(true);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch template details');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Detail Modal
  const handleOpenDetailModal = async (templateId: string) => {
    setShowDetailModal(true);
    setDetailLoading(true);
    try {
      const template = await quotationTemplateService.getTemplate(templateId);
      setDetailTemplate(template);
    } catch (err: any) {
      alert(err.message || 'Failed to load template details');
      setShowDetailModal(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // Handle Deactivation
  const handleDeactivate = async (template: QuotationTemplate) => {
    const confirmed = window.confirm(
      `Are you sure you want to deactivate template "${template.name}"? It will no longer appear when creating new quotations.`
    );
    if (!confirmed) return;

    try {
      await quotationTemplateService.deactivateTemplate(template.id);
      setSuccessMessage(`Template "${template.name}" deactivated successfully.`);
      fetchTemplates();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate template');
    }
  };

  // Form line modifications
  const handleAddLine = () => {
    const initialProduct = products[0];
    setFormLines([
      ...formLines,
      {
        product_id: initialProduct?.id || '',
        variant_id: initialProduct?.variants?.[0]?.id || '',
        quantity: 1,
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (formLines.length === 1) {
      setFormError('A template must have at least one product line.');
      return;
    }
    setFormLines(formLines.filter((_, idx) => idx !== index));
  };

  const handleLineProductChange = (index: number, productId: string) => {
    const selectedProd = products.find((p) => p.id === productId);
    const newLines = [...formLines];
    newLines[index] = {
      product_id: productId,
      variant_id: selectedProd?.variants?.[0]?.id || '',
      quantity: newLines[index].quantity || 1,
    };
    setFormLines(newLines);
  };

  const handleLineVariantChange = (index: number, variantId: string) => {
    const newLines = [...formLines];
    newLines[index].variant_id = variantId;
    setFormLines(newLines);
  };

  const handleLineQuantityChange = (index: number, quantity: number) => {
    const newLines = [...formLines];
    newLines[index].quantity = Math.max(1, quantity);
    setFormLines(newLines);
  };

  // Submit create or edit
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError('Template name is required.');
      return;
    }

    if (formLines.length === 0) {
      setFormError('Please add at least one product line to the template.');
      return;
    }

    for (const line of formLines) {
      if (!line.product_id) {
        setFormError('All lines must have a valid product selected.');
        return;
      }
      if (!line.quantity || line.quantity < 1) {
        setFormError('All line quantities must be at least 1.');
        return;
      }
    }

    setFormSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        default_plan_id: formData.default_plan_id || null,
        lines: formLines.map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id || null,
          quantity: Number(l.quantity),
        })),
      };

      if (editingTemplateId) {
        await quotationTemplateService.updateTemplate(editingTemplateId, payload);
        setSuccessMessage('Quotation template updated successfully!');
      } else {
        await quotationTemplateService.createTemplate(payload);
        setSuccessMessage('Quotation template created successfully!');
      }

      setShowFormModal(false);
      fetchTemplates();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save template.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // RBAC guard
  if (isCustomer) {
    return <Navigate to="/portal" replace />;
  }

  if (loading) {
    return <LoadingSpinner message="Loading quotation templates..." />;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <Link
              to="/quotations"
              className="text-slate-400 hover:text-indigo-600 transition p-1 -ml-1 rounded-lg"
              title="Back to Quotations"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold text-slate-800">Quotation Templates</h1>
          </div>
          <p className="text-sm text-slate-500 mt-0.5 ml-7">
            Standardize and fast-track quotation creation with reusable product bundles and default plans
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 text-xs text-slate-600 font-medium cursor-pointer bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 transition">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Include Inactive</span>
          </label>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Template</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 text-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Templates List / Grid */}
      {templates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileStack className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">No quotation templates found</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
            Create reusable templates with pre-configured products, variants, and quantities to accelerate quotation workflows for your team.
          </p>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Template</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className={`bg-white rounded-2xl border ${
                tpl.is_active ? 'border-slate-200' : 'border-slate-300 bg-slate-50/50 opacity-80'
              } p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-slate-800 text-lg leading-snug">{tpl.name}</h3>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      tpl.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {tpl.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 mb-4 line-clamp-2 min-h-[32px]">
                  {tpl.description || 'No description provided.'}
                </p>

                <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center space-x-1.5 text-slate-400">
                      <Layers className="w-3.5 h-3.5" />
                      <span>Default Plan:</span>
                    </span>
                    <span className="font-medium text-slate-800">
                      {tpl.default_plan_name
                        ? `${tpl.default_plan_name} ($${Number(tpl.default_plan_price || 0).toFixed(2)})`
                        : 'None'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center space-x-1.5 text-slate-400">
                      <Package className="w-3.5 h-3.5" />
                      <span>Package Items:</span>
                    </span>
                    <span className="font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">
                      {tpl.line_count || 0} line{tpl.line_count === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleOpenDetailModal(tpl.id)}
                  className="inline-flex items-center space-x-1 text-xs font-medium text-slate-600 hover:text-indigo-600 transition"
                  title="View Products & Details"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Details</span>
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleOpenEditModal(tpl.id)}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
                    title="Edit Template"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>

                  {tpl.is_active === 1 && (
                    <button
                      onClick={() => handleDeactivate(tpl)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                      title="Deactivate Template"
                    >
                      <PowerOff className="w-3.5 h-3.5" />
                      <span>Deactivate</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Template Modal */}
      {showFormModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {editingTemplateId ? 'Edit Quotation Template' : 'Create Quotation Template'}
              </h3>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Template Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Enterprise Starter Bundle"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Description of target customer segment or included products"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Default Subscription Plan (Optional)
                </label>
                <select
                  value={formData.default_plan_id}
                  onChange={(e) => setFormData({ ...formData, default_plan_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">No Default Plan</option>
                  {plans.filter((p) => p.is_active === 1 || p.is_active === true).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (${Number(p.price).toFixed(2)} / {p.billing_frequency})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  When a quotation is created using this template, this plan will automatically be preselected.
                </p>
              </div>

              {/* Template Items / Lines */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Product Lines <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Line Item</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {formLines.map((line, idx) => {
                    const currentProduct = products.find((p) => p.id === line.product_id);
                    const variants = currentProduct?.variants || [];

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 relative"
                      >
                        <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                          <span className="text-[11px] font-semibold text-slate-600">Line #{idx + 1}</span>
                          {formLines.length > 1 && (
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

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          {/* Product Selection */}
                          <div className="md:col-span-5">
                            <label className="block text-[11px] text-slate-500 mb-1">Product</label>
                            <select
                              value={line.product_id}
                              onChange={(e) => handleLineProductChange(idx, e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                            >
                              {products.map((prod) => (
                                <option key={prod.id} value={prod.id}>
                                  {prod.name} (${Number(prod.sales_price).toFixed(2)})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Variant Selection */}
                          <div className="md:col-span-4">
                            <label className="block text-[11px] text-slate-500 mb-1">Variant (Optional)</label>
                            <select
                              value={line.variant_id}
                              onChange={(e) => handleLineVariantChange(idx, e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">Standard Edition</option>
                              {variants.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.attribute_value} (+${Number(v.price_extra).toFixed(2)})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Quantity */}
                          <div className="md:col-span-3">
                            <label className="block text-[11px] text-slate-500 mb-1">Quantity</label>
                            <input
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(e) => handleLineQuantityChange(idx, parseInt(e.target.value, 10) || 1)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50 transition shadow-sm"
                >
                  {formSubmitting ? 'Saving...' : editingTemplateId ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Template Details Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            {detailLoading || !detailTemplate ? (
              <LoadingSpinner message="Loading template details..." />
            ) : (
              <div>
                <div className="flex items-start justify-between pb-3 border-b border-slate-100 mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">{detailTemplate.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {detailTemplate.description || 'No description provided.'}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      detailTemplate.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {detailTemplate.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 mb-4 text-xs space-y-1.5 border border-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Default Plan:</span>
                    <span className="font-semibold text-slate-800">
                      {detailTemplate.default_plan_name
                        ? `${detailTemplate.default_plan_name} ($${Number(detailTemplate.default_plan_price || 0).toFixed(2)}/${detailTemplate.default_plan_frequency})`
                        : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Created At:</span>
                    <span className="text-slate-700">{detailTemplate.created_at}</span>
                  </div>
                </div>

                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Configured Product Lines ({detailTemplate.lines?.length || 0})
                </h4>

                <div className="border border-slate-200 rounded-xl overflow-hidden mb-5">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Product</th>
                        <th className="py-2 px-3">Variant</th>
                        <th className="py-2 px-3 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Unit Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailTemplate.lines && detailTemplate.lines.length > 0 ? (
                        detailTemplate.lines.map((l: QuotationTemplateLine) => (
                          <tr key={l.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-medium text-slate-800">
                              {l.product_name}
                              <span className="block text-[10px] text-slate-400 capitalize">{l.product_type}</span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {l.attribute_value ? (
                                <span>
                                  {l.attribute_value}
                                  {Number(l.price_extra) > 0 && (
                                    <span className="text-[10px] text-slate-400 ml-1">
                                      (+${Number(l.price_extra).toFixed(2)})
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-slate-400">Standard</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-800">{l.quantity}</td>
                            <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                              ${Number(l.product_sales_price || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-400">
                            No product lines in this template.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-lg transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
