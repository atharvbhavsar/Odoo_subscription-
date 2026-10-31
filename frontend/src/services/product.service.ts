import { apiRequest } from './api';
import { Product, Plan, Tax, Discount, CustomerProfile } from '../types';

export const catalogService = {
  async getProducts() {
    return apiRequest<Product[]>('/products');
  },

  async createProduct(data: { name: string; type?: string; sales_price: number; cost_price?: number; notes?: string }) {
    return apiRequest<Product>('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async addVariant(productId: string, data: { attribute_name: string; attribute_value: string; price_extra: number }) {
    return apiRequest<any>(`/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getPlans() {
    return apiRequest<Plan[]>('/plans');
  },

  async createPlan(data: Partial<Plan>) {
    return apiRequest<Plan>('/plans', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getTaxes() {
    return apiRequest<Tax[]>('/taxes');
  },

  async createTax(data: { name: string; rate_percentage: number }) {
    return apiRequest<Tax>('/taxes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getDiscounts() {
    return apiRequest<Discount[]>('/discounts');
  },

  async createDiscount(data: Partial<Discount>) {
    return apiRequest<Discount>('/discounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getCustomers() {
    return apiRequest<CustomerProfile[]>('/users/customers');
  },
};

