import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
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
  sendOtp: (phone) => api.post('/auth/send-otp', { phone }),
  verifyOtp: (phone, code) => api.post('/auth/verify-otp', { phone, code }),
  getMe: () => api.get('/auth/me'),
};

export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getDrivers: (params) => api.get('/admin/drivers', { params }),
  approveDriver: (id) => api.put(`/admin/drivers/${id}/approve`),
  rejectDriver: (id, reason) => api.put(`/admin/drivers/${id}/reject`, { reason }),
  suspendDriver: (id) => api.put(`/admin/drivers/${id}/suspend`),
  getUsers: (params) => api.get('/admin/users', { params }),
  toggleUser: (id) => api.put(`/admin/users/${id}/toggle`),
  getRides: (params) => api.get('/admin/rides', { params }),
  getAnalytics: (days) => api.get(`/admin/analytics?days=${days}`),
  getSosAlerts: () => api.get('/admin/sos-alerts'),
};

export default api;
