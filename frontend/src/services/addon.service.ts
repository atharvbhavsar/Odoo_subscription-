import { apiRequest } from './api';
import { SubscriptionAddon } from '../types';

export const addonService = {
  /**
   * Retrieve all add-ons for a subscription
   */
  async getAddons(subscriptionId: string): Promise<SubscriptionAddon[]> {
    return apiRequest<SubscriptionAddon[]>(`/subscriptions/${subscriptionId}/addons`);
  },

  /**
   * Schedule adding a new add-on (takes effect from next billing period).
   * Note: Authoritative pricing is determined on the backend from products/variants catalog.
   */
  async addAddon(
    subscriptionId: string,
    data: {
      product_id: string;
      variant_id?: string | null;
      quantity: number;
    }
  ): Promise<SubscriptionAddon> {
    return apiRequest<SubscriptionAddon>(`/subscriptions/${subscriptionId}/addons`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update quantity of an eligible add-on
   */
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

  /**
   * Schedule removal of an add-on (effective from next billing period)
   */
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
