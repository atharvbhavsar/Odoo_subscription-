import { apiRequest } from './api';
import { User } from '../types';

export const authService = {
  async register(data: { email: string; password: string; name: string; companyName?: string; phone?: string; address?: string }) {
    return apiRequest<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async login(data: { email: string; password: string }) {
    return apiRequest<{ user: User }>('/auth/login', {
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
    return apiRequest<{ user: User }>('/auth/me', {
      method: 'GET',
    });
  },
};

