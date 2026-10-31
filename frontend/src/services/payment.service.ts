import { apiRequest } from './api';
import { DashboardSummary } from '../types';

export const paymentService = {
  async createRazorpayOrder(invoiceId: string) {
    return apiRequest<{
      orderId: string;
      amount: number;
      amountInPaise: number;
      currency: string;
      keyId: string;
    }>('/payments/create-order', {
      method: 'POST',
      body: JSON.stringify({ invoice_id: invoiceId }),
    });
  },

  async verifyPayment(data: {
    invoice_id: string;
    gateway_order_id: string;
    gateway_payment_id: string;
    gateway_signature: string;
    amount?: number;
  }) {
    return apiRequest<any>('/payments/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async recordOfflinePayment(data: {
    invoice_id: string;
    amount: number;
    payment_method?: string;
    notes?: string;
  }) {
    return apiRequest<any>('/payments/record-offline', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

export const dashboardService = {
  async getSummary() {
    return apiRequest<DashboardSummary>('/dashboard/summary');
  },

  async triggerBillingRun(targetDate?: string) {
    return apiRequest<any>('/billing/run', {
      method: 'POST',
      body: JSON.stringify({ targetDate }),
    });
  },
};

