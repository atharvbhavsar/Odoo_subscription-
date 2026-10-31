import { apiRequest } from './api';
import { Invoice } from '../types';

export const invoiceService = {
  async getInvoices(params?: {
    page?: number;
    limit?: number;
    status?: string;
    customerId?: string;
    subscriptionId?: string;
    search?: string;
  }) {
    let query = '';
    if (params) {
      const q = new URLSearchParams();
      if (params.page) q.append('page', params.page.toString());
      if (params.limit) q.append('limit', params.limit.toString());
      if (params.status) q.append('status', params.status);
      if (params.customerId) q.append('customerId', params.customerId);
      if (params.subscriptionId) q.append('subscriptionId', params.subscriptionId);
      if (params.search) q.append('search', params.search);
      const str = q.toString();
      if (str) query = `?${str}`;
    }
    return apiRequest<Invoice[]>(`/invoices${query}`);
  },

  async getInvoice(id: string) {
    return apiRequest<Invoice>(`/invoices/${id}`);
  },

  async confirmDraft(id: string) {
    return apiRequest<Invoice>(`/invoices/${id}/confirm`, {
      method: 'POST',
    });
  },

  async cancelInvoice(id: string, reason?: string) {
    return apiRequest<Invoice>(`/invoices/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  getPdfUrl(id: string, download = false) {
    const base = import.meta.env.VITE_API_BASE_URL || '/api';
    return `${base}/invoices/${id}/pdf${download ? '?download=true' : ''}`;
  },
};
