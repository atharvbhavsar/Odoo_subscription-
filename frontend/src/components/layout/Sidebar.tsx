import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Package,
  Layers,
  FileText,
  FileStack,
  Repeat,
  Receipt,
  Percent,
  Tag,
  CreditCard,
  User,
  Play,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const isCustomer = user?.role === 'customer';
  const isAdmin = user?.role === 'admin';

  const staffNavItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...(isAdmin ? [{ to: '/billing-run', label: 'Billing Run (Admin)', icon: Play }] : []),
    { to: '/products', label: 'Products & Variants', icon: Package },
    { to: '/plans', label: 'Subscription Plans', icon: Layers },
    { to: '/taxes', label: 'Tax Rules', icon: Percent },
    { to: '/discounts', label: 'Discounts & Vouchers', icon: Tag },
    { to: '/quotations', label: 'Quotations', icon: FileText },
    { to: '/quotation-templates', label: 'Quotation Templates', icon: FileStack },
    { to: '/subscriptions', label: 'Subscriptions', icon: Repeat },
    { to: '/invoices', label: 'Invoices & Billing', icon: Receipt },
    { to: '/payments', label: 'Payment Ledger', icon: CreditCard },
  ];

  const customerNavItems = [
    { to: '/portal', label: 'Customer Portal', icon: User },
    { to: '/plans', label: 'All Subscriptions', icon: Layers },
    { to: '/subscriptions', label: 'My Subscriptions', icon: Repeat },
    { to: '/invoices', label: 'My Invoices', icon: Receipt },
  ];

  const items = isCustomer ? customerNavItems : staffNavItems;

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 min-h-[calc(100vh-4rem)] flex flex-col p-4">
      <nav className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
};
