import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://shifter-bmbf.onrender.com';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('admin_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  adminLogin: (email, password) => api.post('/auth/admin-login', { email, password }),
  getMe:      () => api.get('/auth/me'),
};

export const adminAPI = {
  // Stats + métriques
  getStats:   () => api.get('/admin/stats'),
  getMetrics: () => api.get('/admin/metrics'),
  getMe:      () => api.get('/admin/me'),

  // Santé
  getHealth:  () => api.get('/admin/health'),

  // Chauffeurs
  getDrivers:       (params) => api.get('/admin/drivers', { params }),
  approveDriver:    (id)        => api.put(`/admin/drivers/${id}/approve`),
  rejectDriver:     (id, reason) => api.put(`/admin/drivers/${id}/reject`, { reason }),
  suspendDriver:    (id)        => api.put(`/admin/drivers/${id}/suspend`),
  rehabilitateDriver: (id)      => api.put(`/admin/drivers/${id}/rehabilitate`),

  // Utilisateurs
  getUsers:   (params) => api.get('/admin/users', { params }),
  suspendUser: (id, suspend) => api.put(`/admin/users/${id}/suspend`, { suspend }),
  setUserRole: (id, adminRole) => api.put(`/admin/users/${id}/set-role`, { adminRole }),

  // Courses
  getRides:         (params) => api.get('/admin/rides', { params }),
  forceCancel:      (id, reason) => api.put(`/admin/rides/${id}/force-cancel`, { reason }),
  cleanupStuck:     () => api.post('/admin/rides/cleanup-stuck'),

  // Analytics
  getAnalytics:  (days) => api.get(`/admin/analytics?days=${days}`),

  // Notifications
  getNotifications: (params) => api.get('/admin/notifications', { params }),
  sendNotification: (data)   => api.post('/admin/notifications/send', data),

  // SOS
  getSosAlerts: (resolved = false) => api.get(`/admin/sos?resolved=${resolved}`),
  resolveSos:   (id) => api.put(`/admin/sos/${id}/resolve`),

  // Modération
  getReports:    (params) => api.get('/admin/reports', { params }),
  updateReport:  (id, data) => api.put(`/admin/reports/${id}`, data),
  getSuspiciousRatings: () => api.get('/admin/ratings/suspicious'),

  // Support
  getTickets:   (params) => api.get('/admin/support', { params }),
  updateTicket: (id, data) => api.put(`/admin/support/${id}`, data),

  // Audit log
  getAuditLog: (params) => api.get('/admin/audit-log', { params }),

  // Reset (dev uniquement)
  resetTestData: () => api.post('/admin/reset-test-data'),
};

export default api;
