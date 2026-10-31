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

  async sendInvoiceEmail(id: string, recipientEmail?: string) {
    return apiRequest<{ emailId: string; status: string }>(`/invoices/${id}/send-email`, {
      method: 'POST',
      body: JSON.stringify({ recipientEmail }),
    });
  },

  getPdfUrl(id: string, download = false) {
    const base = import.meta.env.VITE_API_BASE_URL || '/api';
    const token = typeof window !== 'undefined' ? localStorage.getItem('brightloop_token') : null;
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${base}/invoices/${id}/pdf?download=${download}${tokenParam}`;
  },

  async viewPdf(id: string) {
    const url = this.getPdfUrl(id, false);
    window.open(url, '_blank');
  },

  async downloadPdf(id: string, invoiceNumber?: string) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('brightloop_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const base = import.meta.env.VITE_API_BASE_URL || '/api';
    const url = `${base}/invoices/${id}/pdf?download=true`;

    try {
      const res = await fetch(url, { headers, credentials: 'include' });
      if (!res.ok) {
        window.open(this.getPdfUrl(id, true), '_blank');
        return;
      }
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `Invoice-${invoiceNumber || id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(this.getPdfUrl(id, true), '_blank');
    }
  },
};
