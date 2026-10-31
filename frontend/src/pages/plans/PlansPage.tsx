import React, { useEffect, useState } from 'react';
import { catalogService } from '../../services/product.service';
import { Plan } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/Loading';
import { Layers, Plus, Check } from 'lucide-react';

export const PlansPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const [newPlan, setNewPlan] = useState({
    name: '',
    billing_frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'yearly',
    price: 150,
    min_qty: 1,
    can_pause: true,
    can_renew: true,
    can_close_early: true,
    auto_close: false,
  });

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const fetchPlans = async () => {
    try {
      const data = await catalogService.getPlans();
      setPlans(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await catalogService.createPlan(newPlan);
      setShowAddModal(false);
      fetchPlans();
    } catch (err: any) {
      alert(err.message || 'Failed to create plan');
    }
  };

  if (loading) return <LoadingSpinner message="Loading subscription plans..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Subscription Plans</h1>
          <p className="text-sm text-slate-500">Configure recurring frequencies, minimum seats, and lifecycle behaviors</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Plan</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div key={plan.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                  {plan.billing_frequency}
                </span>
                <span className="text-xs text-slate-400">Min Qty: {plan.min_qty}</span>
              </div>
              <h3 className="text-xl font-bold text-slate-800">{plan.name}</h3>

              <div className="mt-4 flex items-baseline">
                <span className="text-3xl font-extrabold text-slate-900">${Number(plan.price).toFixed(2)}</span>
                <span className="text-sm text-slate-500 ml-1.5 font-medium">/{plan.billing_frequency}</span>
              </div>

              <div className="mt-6 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                <div className="flex items-center space-x-2">
                  <Check className={`w-4 h-4 ${plan.can_pause ? 'text-emerald-500' : 'text-slate-300'}`} />
                  <span>Pause/Resume Support: {plan.can_pause ? 'Allowed' : 'Disabled'}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className={`w-4 h-4 ${plan.can_renew ? 'text-emerald-500' : 'text-slate-300'}`} />
                  <span>Renewal Policy: {plan.can_renew ? 'Allowed' : 'Manual'}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className={`w-4 h-4 ${plan.can_close_early ? 'text-emerald-500' : 'text-slate-300'}`} />
                  <span>Early Customer Close: {plan.can_close_early ? 'Permitted' : 'Locked'}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Create Subscription Plan</h3>
            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Plan Name</label>
                <input
                  type="text"
                  required
                  value={newPlan.name}
                  onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                  placeholder="e.g. Growth Monthly"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Frequency</label>
                  <select
                    value={newPlan.billing_frequency}
                    onChange={(e) => setNewPlan({ ...newPlan, billing_frequency: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newPlan.price}
                    onChange={(e) => setNewPlan({ ...newPlan, price: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Minimum Quantity / Seats</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={newPlan.min_qty}
                  onChange={(e) => setNewPlan({ ...newPlan, min_qty: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-2 pt-2 border-t">
                <label className="flex items-center space-x-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={newPlan.can_pause}
                    onChange={(e) => setNewPlan({ ...newPlan, can_pause: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Allow customers to pause subscription</span>
                </label>
                <label className="flex items-center space-x-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={newPlan.can_close_early}
                    onChange={(e) => setNewPlan({ ...newPlan, can_close_early: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Allow customers to close subscription early</span>
                </label>
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
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

