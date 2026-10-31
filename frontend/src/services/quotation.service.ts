import { apiRequest } from './api';
import { Quotation, Subscription } from '../types';

export const quotationService = {
  async getQuotations() {
    return apiRequest<Quotation[]>('/quotations');
  },

  async getQuotation(id: string) {
    return apiRequest<Quotation>(`/quotations/${id}`);
  },

  async createQuotation(data: {
    customer_id: string;
    plan_id: string;
    discount_id?: string | null;
    tax_id?: string | null;
    valid_until: string;
    lines: Array<{
      product_id: string;
      variant_id?: string | null;
      quantity: number;
      unit_price?: number;
    }>;
  }) {
    return apiRequest<any>('/quotations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async confirmQuotation(id: string) {
    return apiRequest<{ subscription_id: string; subscription_number: string; status: string }>(
      `/quotations/${id}/confirm`,
      { method: 'POST' }
    );
  },
};

export const subscriptionService = {
  async getSubscriptions() {
    return apiRequest<Subscription[]>('/subscriptions');
  },

  async getSubscription(id: string) {
    return apiRequest<Subscription>(`/subscriptions/${id}`);
  },

  async pause(id: string) {
    return apiRequest<any>(`/subscriptions/${id}/pause`, { method: 'POST' });
  },

  async resume(id: string) {
    return apiRequest<any>(`/subscriptions/${id}/resume`, { method: 'POST' });
  },

  async close(id: string) {
    return apiRequest<any>(`/subscriptions/${id}/close`, { method: 'POST' });
  },
};

