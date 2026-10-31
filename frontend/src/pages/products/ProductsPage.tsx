import React, { useEffect, useState } from 'react';
import { catalogService } from '../../services/product.service';
import { Product } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Package, Plus, Tag } from 'lucide-react';

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<Product | null>(null);

  const [newProduct, setNewProduct] = useState({
    name: '',
    sales_price: 100,
    cost_price: 30,
    type: 'service',
    notes: '',
  });

  const [newVariant, setNewVariant] = useState({
    attribute_name: 'Brand',
    attribute_value: 'Odoo Brand Edition',
    price_extra: 560,
  });

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const fetchProducts = async () => {
    try {
      const data = await catalogService.getProducts();
      setProducts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await catalogService.createProduct(newProduct);
      setShowAddModal(false);
      fetchProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to create product');
    }
  };

  const handleAddVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForVariant) return;
    try {
      await catalogService.addVariant(selectedProductForVariant.id, newVariant);
      setSelectedProductForVariant(null);
      fetchProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to add variant');
    }
  };

  if (loading) return <LoadingSpinner message="Loading products catalogue..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Products & Variants</h1>
          <p className="text-sm text-slate-500">Manage base catalogue items, costs, and pricing variations</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Product</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((p) => (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Package className="w-6 h-6" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                  {p.type}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mt-3">{p.name}</h3>
              <p className="text-xs text-slate-500 mt-1">{p.notes || 'No description provided'}</p>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Sales Price</p>
                  <p className="text-xl font-extrabold text-slate-900">${Number(p.sales_price).toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Cost Price</p>
                  <p className="text-sm font-semibold text-slate-500">${Number(p.cost_price).toFixed(2)}</p>
                </div>
              </div>

              {p.variants && p.variants.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center space-x-1">
                    <Tag className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Variants Available:</span>
                  </p>
                  <div className="space-y-1.5">
                    {p.variants.map((v) => (
                      <div key={v.id} className="flex justify-between items-center text-xs bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <span className="text-slate-700">{v.attribute_value}</span>
                        <span className="font-semibold text-indigo-600">+${Number(v.price_extra).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="mt-5 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setSelectedProductForVariant(p)}
                  className="w-full py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition"
                >
                  + Add Variant Option
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Add New Product</h3>
            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  placeholder="e.g. Brightloop ERP"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sales Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newProduct.sales_price}
                    onChange={(e) => setNewProduct({ ...newProduct, sales_price: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cost Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newProduct.cost_price}
                    onChange={(e) => setNewProduct({ ...newProduct, cost_price: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  value={newProduct.notes}
                  onChange={(e) => setNewProduct({ ...newProduct, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
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
                  Create Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Variant Modal */}
      {selectedProductForVariant && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Add Variant to {selectedProductForVariant.name}</h3>
            <p className="text-xs text-slate-500 mb-4">E.g., Brand Edition or Seat Tier add-ons</p>
            <form onSubmit={handleAddVariant} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Attribute Name</label>
                <input
                  type="text"
                  required
                  value={newVariant.attribute_name}
                  onChange={(e) => setNewVariant({ ...newVariant, attribute_name: e.target.value })}
                  placeholder="e.g. Brand, Edition, Region"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Attribute Value</label>
                <input
                  type="text"
                  required
                  value={newVariant.attribute_value}
                  onChange={(e) => setNewVariant({ ...newVariant, attribute_value: e.target.value })}
                  placeholder="e.g. Odoo Brand (+560)"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Price Extra ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newVariant.price_extra}
                  onChange={(e) => setNewVariant({ ...newVariant, price_extra: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setSelectedProductForVariant(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Save Variant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

