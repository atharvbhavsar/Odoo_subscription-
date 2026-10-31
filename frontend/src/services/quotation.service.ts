import { apiRequest } from './api';
import { Quotation, Subscription, QuotationTemplate } from '../types';

export const quotationTemplateService = {
  async getTemplates(includeInactive: boolean = false) {
    const query = includeInactive ? '?include_inactive=true' : '';
    return apiRequest<QuotationTemplate[]>(`/quotation-templates${query}`);
  },

  async getTemplate(id: string) {
    return apiRequest<QuotationTemplate>(`/quotation-templates/${id}`);
  },

  async createTemplate(data: {
    name: string;
    description?: string | null;
    default_plan_id?: string | null;
    lines: Array<{
      product_id: string;
      variant_id?: string | null;
      quantity: number;
    }>;
  }) {
    return apiRequest<QuotationTemplate>('/quotation-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTemplate(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      default_plan_id?: string | null;
      is_active?: number;
      lines?: Array<{
        product_id: string;
        variant_id?: string | null;
        quantity: number;
      }>;
    }
  ) {
    return apiRequest<QuotationTemplate>(`/quotation-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deactivateTemplate(id: string) {
    return apiRequest<QuotationTemplate>(`/quotation-templates/${id}/deactivate`, {
      method: 'PATCH',
    });
  },
};

export const quotationService = {
  async getQuotations(params?: { search?: string; status?: string; customer_id?: string }) {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status && params.status !== 'all') query.append('status', params.status);
    if (params?.customer_id) query.append('customer_id', params.customer_id);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<Quotation[]>(`/quotations${queryString}`);
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
    status?: 'draft' | 'quotation' | 'sent';
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

  async cancelQuotation(id: string, reason?: string) {
    return apiRequest<{ id: string; status: string }>(`/quotations/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async sendQuotation(id: string) {
    return apiRequest<{ id: string; status: string }>(`/quotations/${id}/send`, {
      method: 'POST',
    });
  },
};

export const subscriptionService = {
  async getSubscriptions(params?: { search?: string; status?: string; customer_id?: string }) {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status && params.status !== 'all') query.append('status', params.status);
    if (params?.customer_id) query.append('customer_id', params.customer_id);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<Subscription[]>(`/subscriptions${queryString}`);
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

  async renew(id: string) {
    return apiRequest<any>(`/subscriptions/${id}/renew`, { method: 'POST' });
  },

  async close(id: string) {
    return apiRequest<any>(`/subscriptions/${id}/close`, { method: 'POST' });
  },

  async subscribe(data: { plan_id: string; discount_code?: string }) {
    return apiRequest<{
      subscription_id: string;
      subscription_number: string;
      invoice_id: string;
      invoice_number: string;
      plan_name: string;
      total_amount: number;
      status: string;
    }>('/subscriptions/subscribe', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

export { addonService, subscriptionAddonService } from './addon.service';
