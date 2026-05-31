import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://shifter-bmbf.onrender.com';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  adminLogin: (email, password) => api.post('/auth/admin-login', { email, password }),
  getMe: () => api.get('/auth/me'),
};

export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getDrivers: (params) => api.get('/admin/drivers', { params }),
  approveDriver: (id) => api.put(`/admin/drivers/${id}/approve`),
  rejectDriver: (id, reason) => api.put(`/admin/drivers/${id}/reject`, { reason }),
  suspendDriver: (id) => api.put(`/admin/drivers/${id}/suspend`),
  rehabilitateDriver: (id) => api.put(`/admin/drivers/${id}/rehabilitate`),
  getUsers: (params) => api.get('/admin/users', { params }),
  toggleUser: (id) => api.put(`/admin/users/${id}/toggle`),
  getRides: (params) => api.get('/admin/rides', { params }),
  getAnalytics: (days) => api.get(`/admin/analytics?days=${days}`),
  getSosAlerts: (resolved = false) => api.get(`/admin/sos?resolved=${resolved}`),
  resolveSos: (id) => api.put(`/admin/sos/${id}/resolve`),
  getReports: (params) => api.get('/admin/reports', { params }),
  updateReport: (id, data) => api.put(`/admin/reports/${id}`, data),
  suspendUser: (id, suspend) => api.put(`/admin/users/${id}/suspend`, { suspend }),
  getSuspiciousRatings: () => api.get('/admin/ratings/suspicious'),
  getTickets: (params) => api.get('/admin/support', { params }),
  updateTicket: (id, data) => api.put(`/admin/support/${id}`, data),
  resetTestData: () => api.post('/admin/reset-test-data'),
};

export default api;
