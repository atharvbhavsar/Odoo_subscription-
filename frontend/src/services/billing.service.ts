import { apiRequest } from './api';
import { BillingRunResult } from '../types';

export const billingService = {
  /**
   * Executes recurring billing engine via Admin-only POST /api/billing/run
   */
  async runBilling(targetDate?: string) {
    return apiRequest<BillingRunResult>('/billing/run', {
      method: 'POST',
      body: JSON.stringify({ targetDate }),
    });
  },

  /**
   * Retrieves past billing execution audit logs
   */
  async getHistory() {
    return apiRequest<any[]>('/billing/history');
  },
};

