import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { authService } from '../services/auth.service';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (data: { email: string; password: string }) => Promise<User>;
  register: (data: { email: string; password: string; name: string; companyName?: string; phone?: string; address?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem('brightloop_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    try {
      const res = await authService.me();
      setUser(res.user);
      if (res.token) {
        localStorage.setItem('brightloop_token', res.token);
      }
      localStorage.setItem('brightloop_user', JSON.stringify(res.user));
    } catch {
      if (!localStorage.getItem('brightloop_token')) {
        setUser(null);
        localStorage.removeItem('brightloop_user');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (data: { email: string; password: string }): Promise<User> => {
    const res = await authService.login(data);
    setUser(res.user);
    if (res.token) {
      localStorage.setItem('brightloop_token', res.token);
    }
    localStorage.setItem('brightloop_user', JSON.stringify(res.user));
    return res.user;
  };

  const register = async (data: { email: string; password: string; name: string; companyName?: string; phone?: string; address?: string }) => {
    const res = await authService.register(data);
    setUser(res.user);
    if (res.token) {
      localStorage.setItem('brightloop_token', res.token);
    }
    localStorage.setItem('brightloop_user', JSON.stringify(res.user));
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      localStorage.removeItem('brightloop_token');
      localStorage.removeItem('brightloop_user');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
