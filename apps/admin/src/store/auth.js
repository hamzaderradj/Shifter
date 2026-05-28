import { create } from 'zustand';
import { authAPI } from '../services/api';

export const useAuthStore = create((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  init: async () => {
    const token = localStorage.getItem('admin_token');
    if (!token) return set({ isLoading: false });
    try {
      const { data } = await authAPI.getMe();
      if (data.user.role !== 'admin') throw new Error('Not admin');
      set({ user: data.user, isAuthenticated: true });
    } catch {
      localStorage.removeItem('admin_token');
    } finally {
      set({ isLoading: false });
    }
  },

  login: (token, user) => {
    localStorage.setItem('admin_token', token);
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('admin_token');
    set({ user: null, isAuthenticated: false });
  },
}));
