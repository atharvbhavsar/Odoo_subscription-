import { apiRequest } from './api';
import { Product, ProductVariant, Plan, Tax, Discount, CustomerProfile } from '../types';

export const catalogService = {
  /**
   * Retrieve products with optional search and status filtering
   */
  async getProducts(params?: { search?: string; status?: 'all' | 'active' | 'inactive' }) {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<Product[]>(`/products${queryString}`);
  },

  /**
   * Retrieve single product with details and variants
   */
  async getProduct(id: string) {
    return apiRequest<Product>(`/products/${id}`);
  },

  /**
   * Create new product
   */
  async createProduct(data: { name: string; type?: string; sales_price: number; cost_price?: number; notes?: string }) {
    return apiRequest<Product>('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update existing product
   */
  async updateProduct(
    id: string,
    data: Partial<{ name: string; type: string; sales_price: number; cost_price: number; notes: string; is_active: number }>
  ) {
    return apiRequest<Product>(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Activate a product
   */
  async activateProduct(id: string) {
    return apiRequest<Product>(`/products/${id}/activate`, {
      method: 'PATCH',
    });
  },

  /**
   * Soft deactivate a product
   */
  async deactivateProduct(id: string) {
    return apiRequest<Product>(`/products/${id}/deactivate`, {
      method: 'PATCH',
    });
  },

  /**
   * Retrieve variants for a product
   */
  async getVariants(productId: string) {
    return apiRequest<ProductVariant[]>(`/products/${productId}/variants`);
  },

  /**
   * Add variant to product
   */
  async addVariant(productId: string, data: { attribute_name: string; attribute_value: string; price_extra: number }) {
    return apiRequest<ProductVariant>(`/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a variant
   */
  async updateVariant(
    productId: string,
    variantId: string,
    data: Partial<{ attribute_name: string; attribute_value: string; price_extra: number; is_active: number }>
  ) {
    return apiRequest<ProductVariant>(`/products/${productId}/variants/${variantId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Activate variant
   */
  async activateVariant(productId: string, variantId: string) {
    return apiRequest<ProductVariant>(`/products/${productId}/variants/${variantId}/activate`, {
      method: 'PATCH',
    });
  },

  /**
   * Deactivate variant
   */
  async deactivateVariant(productId: string, variantId: string) {
    return apiRequest<ProductVariant>(`/products/${productId}/variants/${variantId}/deactivate`, {
      method: 'PATCH',
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
