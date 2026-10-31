import React from 'react';

interface BadgeProps {
  status: string;
}

export const Badge: React.FC<BadgeProps> = ({ status }) => {
  const getStyles = () => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'paid':
      case 'successful':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'confirmed':
      case 'quotation':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'partially_paid':
      case 'paused':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'cancelled':
      case 'closed':
      case 'failed':
      case 'expired':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'draft':
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStyles()}`}>
      {status.replace('_', ' ').toUpperCase()}
    </span>
  );
};

