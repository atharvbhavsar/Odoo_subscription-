import { apiRequest } from './api';
import { Invoice } from '../types';

export const invoiceService = {
  async getInvoices() {
    return apiRequest<Invoice[]>('/invoices');
  },

  async getInvoice(id: string) {
    return apiRequest<Invoice>(`/invoices/${id}`);
  },

  getPdfUrl(id: string) {
    const base = import.meta.env.VITE_API_BASE_URL || '/api';
    return `${base}/invoices/${id}/pdf`;
  },
};

