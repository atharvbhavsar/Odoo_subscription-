import { apiRequest } from './api';
import { SubscriptionAddon } from '../types';

export const addonService = {
  async getAddons(subscriptionId: string): Promise<SubscriptionAddon[]> {
    return apiRequest<SubscriptionAddon[]>(`/subscriptions/${subscriptionId}/addons`);
  },

  async addAddon(
    subscriptionId: string,
    data: {
      product_id: string;
      variant_id?: string | null;
      quantity: number;
      unit_price?: number;
    }
  ): Promise<SubscriptionAddon> {
    return apiRequest<SubscriptionAddon>(`/subscriptions/${subscriptionId}/addons`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateQuantity(
    subscriptionId: string,
    addonId: string,
    quantity: number
  ): Promise<SubscriptionAddon> {
    return apiRequest<SubscriptionAddon>(`/subscriptions/${subscriptionId}/addons/${addonId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
  },

  async removeAddon(subscriptionId: string, addonId: string): Promise<SubscriptionAddon> {
    return apiRequest<SubscriptionAddon>(
      `/subscriptions/${subscriptionId}/addons/${addonId}/remove`,
      {
        method: 'PATCH',
      }
    );
  },

  async scheduleRemoval(subscriptionId: string, addonId: string): Promise<SubscriptionAddon> {
    return this.removeAddon(subscriptionId, addonId);
  },
};

export const subscriptionAddonService = addonService;
