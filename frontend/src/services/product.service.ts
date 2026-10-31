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

  /**
   * Retrieve subscription plans with optional search and status filtering
   */
  async getPlans(params?: { search?: string; status?: 'all' | 'active' | 'inactive' }) {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<Plan[]>(`/plans${queryString}`);
  },

  /**
   * Retrieve single plan with detailed product/variant lines
   */
  async getPlan(id: string) {
    return apiRequest<Plan>(`/plans/${id}`);
  },

  /**
   * Create new subscription plan
   */
  async createPlan(data: Omit<Partial<Plan>, 'lines'> & { lines?: Array<{ product_id: string; variant_id?: string | null; quantity: number }> }) {
    return apiRequest<Plan>('/plans', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update existing subscription plan
   */
  async updatePlan(id: string, data: Omit<Partial<Plan>, 'lines'> & { lines?: Array<{ product_id: string; variant_id?: string | null; quantity: number }> }) {
    return apiRequest<Plan>(`/plans/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Activate subscription plan
   */
  async activatePlan(id: string) {
    return apiRequest<Plan>(`/plans/${id}/activate`, {
      method: 'PATCH',
    });
  },

  /**
   * Deactivate subscription plan (soft toggle)
   */
  async deactivatePlan(id: string) {
    return apiRequest<Plan>(`/plans/${id}/deactivate`, {
      method: 'PATCH',
    });
  },

  /**
   * Delete subscription plan (prohibited if referenced)
   */
  async deletePlan(id: string) {
    return apiRequest<{ id: string }>(`/plans/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Taxes API
   */
  async getTaxes(params?: { search?: string; status?: 'all' | 'active' | 'inactive' }) {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<Tax[]>(`/taxes${queryString}`);
  },

  async getTax(id: string) {
    return apiRequest<Tax>(`/taxes/${id}`);
  },

  async createTax(data: Partial<Tax>) {
    return apiRequest<Tax>('/taxes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTax(id: string, data: Partial<Tax>) {
    return apiRequest<Tax>(`/taxes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async activateTax(id: string) {
    return apiRequest<Tax>(`/taxes/${id}/activate`, {
      method: 'PATCH',
    });
  },

  async deactivateTax(id: string) {
    return apiRequest<Tax>(`/taxes/${id}/deactivate`, {
      method: 'PATCH',
    });
  },

  async deleteTax(id: string) {
    return apiRequest<{ id: string }>(`/taxes/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Discounts API
   */
  async getDiscounts(params?: { search?: string; status?: 'all' | 'active' | 'inactive'; type?: 'all' | 'percentage' | 'fixed' }) {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.type && params.type !== 'all') query.append('type', params.type);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<Discount[]>(`/discounts${queryString}`);
  },

  async getDiscount(id: string) {
    return apiRequest<Discount>(`/discounts/${id}`);
  },

  async createDiscount(data: Partial<Discount>) {
    return apiRequest<Discount>('/discounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateDiscount(id: string, data: Partial<Discount>) {
    return apiRequest<Discount>(`/discounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async activateDiscount(id: string) {
    return apiRequest<Discount>(`/discounts/${id}/activate`, {
      method: 'PATCH',
    });
  },

  async deactivateDiscount(id: string) {
    return apiRequest<Discount>(`/discounts/${id}/deactivate`, {
      method: 'PATCH',
    });
  },

  async deleteDiscount(id: string) {
    return apiRequest<{ id: string }>(`/discounts/${id}`, {
      method: 'DELETE',
    });
  },

  async getCustomers() {
    return apiRequest<CustomerProfile[]>('/users/customers');
  },
};
