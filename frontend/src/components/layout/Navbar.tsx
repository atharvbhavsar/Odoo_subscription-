import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { LogOut, User as UserIcon, Shield, Briefcase, UserCheck } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'admin':
        return (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
            <Shield className="w-3 h-3" />
            <span>ADMIN</span>
          </span>
        );
      case 'staff':
        return (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
            <Briefcase className="w-3 h-3" />
            <span>STAFF</span>
          </span>
        );
      case 'customer':
      default:
        return (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
            <UserCheck className="w-3 h-3" />
            <span>CUSTOMER</span>
          </span>
        );
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center space-x-3">
        <img
          src="/logo.png"
          alt="Brightloop Subscription Manager"
          className="h-9 w-auto object-contain hidden sm:block"
        />
        <div className="flex items-center space-x-2.5 sm:hidden">
          <img
            src="/icon.png"
            alt="Brightloop"
            className="w-8 h-8 object-contain"
          />
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight">Brightloop</h1>
            <p className="text-[10px] text-slate-400 font-medium">Subscription Manager</p>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {user && (
          <div className="flex items-center space-x-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-800">{user.name || user.email}</p>
              <div className="flex justify-end">{getRoleBadge(user.role)}</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
              <UserIcon className="w-5 h-5" />
            </div>
            <button
              onClick={() => logout()}
              title="Logout"
              className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
