import React, { useEffect, useState } from 'react';
import { catalogService } from '../../services/product.service';
import { Tax } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Percent, Plus, CheckCircle } from 'lucide-react';

export const TaxesPage: React.FC = () => {
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [ratePercentage, setRatePercentage] = useState(18);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const fetchTaxes = async () => {
    try {
      const data = await catalogService.getTaxes();
      setTaxes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaxes();
  }, []);

  const handleCreateTax = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await catalogService.createTax({ name, rate_percentage: ratePercentage });
      setName('');
      setShowAddModal(false);
      setSuccessMsg(`Tax rule "${name}" created successfully.`);
      fetchTaxes();
    } catch (err: any) {
      alert(err.message || 'Failed to create tax rule');
    }
  };

  if (loading) return <LoadingSpinner message="Loading tax rules..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tax Configurations</h1>
          <p className="text-sm text-slate-500">Configure regional tax rules applied automatically to invoices</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Tax Rule</span>
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
        {taxes.map((t) => (
          <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 uppercase">
                Active Rule
              </span>
              <h3 className="text-lg font-bold text-slate-800 mt-2">{t.name}</h3>
              <p className="text-2xl font-extrabold text-slate-900 mt-2">{t.rate_percentage}%</p>
              <p className="text-xs text-slate-400 mt-1">Applied to eligible line subtotals</p>
            </div>
            <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
              <Percent className="w-6 h-6" />
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Create Tax Rule</h3>
            <form onSubmit={handleCreateTax} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tax Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Standard GST 18%"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Rate Percentage (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  value={ratePercentage}
                  onChange={(e) => setRatePercentage(parseFloat(e.target.value))}
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
                  Create Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
