import React, { useEffect, useState } from 'react';
import { catalogService } from '../../services/product.service';
import { Product, ProductVariant } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import {
  RefreshCw,
  Package,
  Plus,
  Tag,
  Search,
  Filter,
  Edit2,
  Power,
  Eye,
  X,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
} from 'lucide-react';

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<Product | null>(null);
  const [editingVariant, setEditingVariant] = useState<{ product: Product; variant: ProductVariant } | null>(null);

  // Form States
  const [productForm, setProductForm] = useState({
    name: '',
    sales_price: 100,
    cost_price: 30,
    type: 'service',
    notes: '',
  });

  const [variantForm, setVariantForm] = useState({
    attribute_name: 'Brand',
    attribute_value: 'Odoo Brand Edition',
    price_extra: 560,
  });

  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'staff';

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await catalogService.getProducts({
        search: searchQuery || undefined,
        status: statusFilter,
      });
      setProducts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    const interval = setInterval(() => {
      fetchProducts();
    }, 15000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  // Debounced live search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProducts();
  };

  // 1. Create Product
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      await catalogService.createProduct({
        ...productForm,
        sales_price: Number(productForm.sales_price),
        cost_price: Number(productForm.cost_price),
      });
      setShowCreateModal(false);
      setProductForm({ name: '', sales_price: 100, cost_price: 30, type: 'service', notes: '' });
      setSuccess('Product created successfully');
      fetchProducts();
    } catch (err: any) {
      setError(err.message || 'Failed to create product');
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Edit Product
  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setActionLoading(true);
    setError(null);
    try {
      await catalogService.updateProduct(editingProduct.id, {
        name: editingProduct.name,
        type: editingProduct.type,
        sales_price: Number(editingProduct.sales_price),
        cost_price: Number(editingProduct.cost_price),
        notes: editingProduct.notes || '',
      });
      setEditingProduct(null);
      setSuccess('Product details updated successfully');
      fetchProducts();
    } catch (err: any) {
      setError(err.message || 'Failed to update product');
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Toggle Product Status
  const handleToggleProductStatus = async (product: Product) => {
    const action = product.is_active ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} product '${product.name}'?`)) {
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      if (product.is_active) {
        await catalogService.deactivateProduct(product.id);
        setSuccess(`Product '${product.name}' deactivated successfully.`);
      } else {
        await catalogService.activateProduct(product.id);
        setSuccess(`Product '${product.name}' activated successfully.`);
      }
      fetchProducts();
    } catch (err: any) {
      setError(err.message || `Failed to ${action} product`);
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Add Variant
  const handleAddVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForVariant) return;
    setActionLoading(true);
    setError(null);
    try {
      await catalogService.addVariant(selectedProductForVariant.id, {
        ...variantForm,
        price_extra: Number(variantForm.price_extra),
      });
      setSelectedProductForVariant(null);
      setVariantForm({ attribute_name: 'Brand', attribute_value: '', price_extra: 0 });
      setSuccess('Variant added successfully');
      fetchProducts();
    } catch (err: any) {
      setError(err.message || 'Failed to add variant');
    } finally {
      setActionLoading(false);
    }
  };

  // 5. Update Variant
  const handleUpdateVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVariant) return;
    setActionLoading(true);
    setError(null);
    try {
      await catalogService.updateVariant(
        editingVariant.product.id,
        editingVariant.variant.id,
        {
          attribute_name: editingVariant.variant.attribute_name,
          attribute_value: editingVariant.variant.attribute_value,
          price_extra: Number(editingVariant.variant.price_extra),
        }
      );
      setEditingVariant(null);
      setSuccess('Variant updated successfully');
      fetchProducts();
    } catch (err: any) {
      setError(err.message || 'Failed to update variant');
    } finally {
      setActionLoading(false);
    }
  };

  // 6. Toggle Variant Status
  const handleToggleVariantStatus = async (product: Product, variant: ProductVariant) => {
    const isCurrentlyActive = variant.is_active !== 0;
    const action = isCurrentlyActive ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} variant '${variant.attribute_value}'?`)) {
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      if (isCurrentlyActive) {
        await catalogService.deactivateVariant(product.id, variant.id);
        setSuccess(`Variant '${variant.attribute_value}' deactivated.`);
      } else {
        await catalogService.activateVariant(product.id, variant.id);
        setSuccess(`Variant '${variant.attribute_value}' activated.`);
      }
      fetchProducts();
    } catch (err: any) {
      setError(err.message || `Failed to ${action} variant`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Products & Variants</h1>
          <p className="text-sm text-slate-500">Manage base catalogue items, costs, and pricing variations</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => fetchProducts()}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition shadow-sm"
            title="Refresh products in real time"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          {canManage && (
            <button
              onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Product</span>
          </button>
        )}
        </div>
      </div>

      {/* Messages */}
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

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by name or notes..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
          >
            Search
          </button>
        </form>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500 font-medium">Status:</span>
          {(['all', 'active', 'inactive'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                statusFilter === filter
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Loading & Empty State */}
      {loading ? (
        <LoadingSpinner message="Loading products catalogue..." />
      ) : products.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-base font-semibold text-slate-700">No products found</p>
          <p className="text-xs text-slate-400 mt-1">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your search query or status filter.'
              : 'Get started by creating your first catalog product.'}
          </p>
        </div>
      ) : (
        /* Products Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((p) => {
            const isActive = Boolean(p.is_active);
            return (
              <div
                key={p.id}
                className={`bg-white rounded-2xl border p-5 shadow-sm flex flex-col justify-between transition ${
                  isActive ? 'border-slate-200' : 'border-slate-200 bg-slate-50/50 opacity-90'
                }`}
              >
                <div>
                  {/* Top Bar: Icon, Type, Status */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <div className={`p-2.5 rounded-xl ${isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Package className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                          {p.type}
                        </span>
                      </div>
                    </div>
                    <Badge status={isActive ? 'active' : 'inactive'} />
                  </div>

                  {/* Product Title and Notes */}
                  <h3 className="text-lg font-bold text-slate-900 mt-3">{p.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.notes || 'No description provided'}</p>

                  {/* Pricing Overview */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Sales Price</p>
                      <p className="text-xl font-extrabold text-slate-900">${Number(p.sales_price).toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400 font-medium">Cost Price</p>
                      <p className="text-sm font-semibold text-slate-500">${Number(p.cost_price).toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Product Variants List */}
                  {p.variants && p.variants.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center space-x-1">
                        <Tag className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Variants ({p.variants.length}):</span>
                      </p>
                      <div className="space-y-2">
                        {p.variants.map((v) => {
                          const isVariantActive = v.is_active !== 0;
                          const effectivePrice = v.effective_price !== undefined
                            ? Number(v.effective_price).toFixed(2)
                            : (Number(p.sales_price) + Number(v.price_extra)).toFixed(2);

                          return (
                            <div
                              key={v.id}
                              className={`text-xs p-2.5 rounded-xl border flex items-center justify-between transition ${
                                isVariantActive
                                  ? 'bg-slate-50 border-slate-100 text-slate-800'
                                  : 'bg-slate-100 border-slate-200 text-slate-400'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center space-x-1.5">
                                  <span className="font-bold">{v.attribute_value}</span>
                                  <span className="text-[10px] text-slate-400">({v.attribute_name})</span>
                                  {!isVariantActive && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 font-semibold">
                                      Inactive
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                                  <span>Extra: +${Number(v.price_extra).toFixed(2)}</span>
                                  <span>&bull;</span>
                                  <span className="font-semibold text-indigo-600">Total: ${effectivePrice}</span>
                                </div>
                              </div>

                              {/* Variant Actions */}
                              {canManage && (
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={() => setEditingVariant({ product: p, variant: v })}
                                    title="Edit Variant"
                                    className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-white rounded transition"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleToggleVariantStatus(p, v)}
                                    title={isVariantActive ? 'Deactivate Variant' : 'Activate Variant'}
                                    className={`p-1 rounded transition ${
                                      isVariantActive
                                        ? 'text-amber-600 hover:bg-amber-50'
                                        : 'text-emerald-600 hover:bg-emerald-50'
                                    }`}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => setViewingProduct(p)}
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-600 hover:text-slate-900 py-1 px-2 rounded-lg hover:bg-slate-100 transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Details</span>
                  </button>

                  {canManage && (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => setSelectedProductForVariant(p)}
                        className="py-1 px-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                      >
                        + Variant
                      </button>
                      <button
                        onClick={() => setEditingProduct(p)}
                        className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                        title="Edit Product"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleProductStatus(p)}
                        className={`p-1.5 rounded-lg transition ${
                          isActive
                            ? 'text-amber-600 hover:bg-amber-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={isActive ? 'Deactivate Product' : 'Activate Product'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 1. Modal: View Product Details */}
      {viewingProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Package className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-900">Product Details</h3>
              </div>
              <button
                onClick={() => setViewingProduct(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-xs text-slate-400 font-medium">Product Name</p>
                  <p className="font-bold text-slate-800">{viewingProduct.name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Status</p>
                  <Badge status={viewingProduct.is_active ? 'active' : 'inactive'} />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Sales Price</p>
                  <p className="font-extrabold text-slate-900">${Number(viewingProduct.sales_price).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Cost Price</p>
                  <p className="font-semibold text-slate-600">${Number(viewingProduct.cost_price).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Type</p>
                  <p className="font-medium text-slate-700 uppercase">{viewingProduct.type}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Created</p>
                  <p className="font-medium text-slate-700">{viewingProduct.created_at || 'Standard Seed'}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 font-medium mb-1">Notes / Description</p>
                <p className="p-3 bg-white border border-slate-200 rounded-xl text-slate-700 text-xs">
                  {viewingProduct.notes || 'No description notes recorded.'}
                </p>
              </div>

              {viewingProduct.variants && viewingProduct.variants.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-1">Variants ({viewingProduct.variants.length})</p>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {viewingProduct.variants.map((v) => (
                      <div key={v.id} className="p-2.5 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-800">{v.attribute_value}</span>
                          <span className="text-slate-400 ml-1">({v.attribute_name})</span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-indigo-600">
                            ${v.effective_price || (Number(viewingProduct.sales_price) + Number(v.price_extra)).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setViewingProduct(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal: Create Product */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Add New Product</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  placeholder="e.g. Enterprise Cloud ERP"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sales Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={productForm.sales_price}
                    onChange={(e) => setProductForm({ ...productForm, sales_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cost Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={productForm.cost_price}
                    onChange={(e) => setProductForm({ ...productForm, cost_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                <select
                  value={productForm.type}
                  onChange={(e) => setProductForm({ ...productForm, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="service">Service</option>
                  <option value="subscription">Subscription Item</option>
                  <option value="consumable">Consumable</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Description</label>
                <textarea
                  value={productForm.notes}
                  onChange={(e) => setProductForm({ ...productForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Enter details, licensing terms, or features..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Creating...' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal: Edit Product */}
      {editingProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Edit Product</h3>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sales Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editingProduct.sales_price}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sales_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cost Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editingProduct.cost_price}
                    onChange={(e) => setEditingProduct({ ...editingProduct, cost_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                <input
                  type="text"
                  value={editingProduct.type}
                  onChange={(e) => setEditingProduct({ ...editingProduct, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Description</label>
                <textarea
                  value={editingProduct.notes || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal: Add Variant */}
      {selectedProductForVariant && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-slate-900">Add Variant Option</h3>
              <button
                onClick={() => setSelectedProductForVariant(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Adding to: <strong className="text-slate-800">{selectedProductForVariant.name}</strong> (Base: ${Number(selectedProductForVariant.sales_price).toFixed(2)})
            </p>

            <form onSubmit={handleAddVariant} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Attribute Name</label>
                <input
                  type="text"
                  required
                  value={variantForm.attribute_name}
                  onChange={(e) => setVariantForm({ ...variantForm, attribute_name: e.target.value })}
                  placeholder="e.g. Brand, Tier, Region, Capacity"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Attribute Value</label>
                <input
                  type="text"
                  required
                  value={variantForm.attribute_value}
                  onChange={(e) => setVariantForm({ ...variantForm, attribute_value: e.target.value })}
                  placeholder="e.g. Enterprise Edition (+500)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Price Extra ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={variantForm.price_extra}
                  onChange={(e) => setVariantForm({ ...variantForm, price_extra: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Effective price: <strong>${(Number(selectedProductForVariant.sales_price) + Number(variantForm.price_extra)).toFixed(2)}</strong>
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setSelectedProductForVariant(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Add Variant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal: Edit Variant */}
      {editingVariant && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-slate-900">Edit Variant</h3>
              <button
                onClick={() => setEditingVariant(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Product: <strong className="text-slate-800">{editingVariant.product.name}</strong>
            </p>

            <form onSubmit={handleUpdateVariant} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Attribute Name</label>
                <input
                  type="text"
                  required
                  value={editingVariant.variant.attribute_name}
                  onChange={(e) =>
                    setEditingVariant({
                      ...editingVariant,
                      variant: { ...editingVariant.variant, attribute_name: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Attribute Value</label>
                <input
                  type="text"
                  required
                  value={editingVariant.variant.attribute_value}
                  onChange={(e) =>
                    setEditingVariant({
                      ...editingVariant,
                      variant: { ...editingVariant.variant, attribute_value: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Price Extra ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editingVariant.variant.price_extra}
                  onChange={(e) =>
                    setEditingVariant({
                      ...editingVariant,
                      variant: { ...editingVariant.variant, price_extra: parseFloat(e.target.value) || 0 },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Effective price: <strong>${(Number(editingVariant.product.sales_price) + Number(editingVariant.variant.price_extra)).toFixed(2)}</strong>
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingVariant(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Update Variant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
