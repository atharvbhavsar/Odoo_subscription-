import { apiRequest } from './api';
import { User } from '../types';

export const authService = {
  async register(data: { email: string; password: string; name: string; companyName?: string; phone?: string; address?: string }) {
    return apiRequest<{ user: User; token?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async login(data: { email: string; password: string }) {
    return apiRequest<{ user: User; token?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async logout() {
    return apiRequest<void>('/auth/logout', {
      method: 'POST',
    });
  },

  async me() {
    return apiRequest<{ user: User; token?: string }>('/auth/me', {
      method: 'GET',
    });
  },

  async forgotPassword(email: string) {
    return apiRequest<{ devResetToken?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string) {
    return apiRequest<void>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },
};
