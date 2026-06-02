import { create } from 'zustand';
import { authAPI, adminAPI } from '../services/api';

export const useAuthStore = create((set, get) => ({
  user:      null,
  adminRole: 'admin', // support | operations | finance | admin | superadmin
  isLoading: true,
  isAuthenticated: false,

  init: async () => {
    const token = sessionStorage.getItem('admin_token');
    if (!token) return set({ isLoading: false });
    try {
      const { data } = await authAPI.getMe();
      if (data.user.role !== 'admin') throw new Error('Not admin');
      // Récupérer le rôle admin granulaire
      const roleRes = await adminAPI.getMe().catch(() => ({ data: { adminRole: 'admin' } }));
      set({ user: data.user, adminRole: roleRes.data.adminRole || 'admin', isAuthenticated: true });
    } catch {
      sessionStorage.removeItem('admin_token');
    } finally {
      set({ isLoading: false });
    }
  },

  login: (token, user, adminRole = 'admin') => {
    sessionStorage.setItem('admin_token', token);
    set({ user, adminRole, isAuthenticated: true });
  },

  logout: () => {
    sessionStorage.removeItem('admin_token');
    set({ user: null, adminRole: 'admin', isAuthenticated: false });
  },

  // Vérifier si l'admin a le niveau requis
  hasRole: (minRole) => {
    const levels = { support: 1, operations: 2, finance: 3, admin: 4, superadmin: 5 };
    const current = levels[get().adminRole] || 4;
    const required = levels[minRole] || 0;
    return current >= required;
  },
}));
