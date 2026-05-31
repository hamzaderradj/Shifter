import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

// ── Intercepteur: ajout du token ──────────────────────────────
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Intercepteur: refresh token automatique ───────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true;

      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${API_URL}/api/auth/refresh-token`, { refreshToken });
        await SecureStore.setItemAsync('access_token', data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        // L'app gérera la déconnexion via le store
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────
export const authAPI = {
  sendOtp: (phone) => api.post('/auth/send-otp', { phone }),
  verifyOtp: (phone, code) => api.post('/auth/verify-otp', { phone, code }),
  refreshToken: (refreshToken) => api.post('/auth/refresh-token', { refreshToken }),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
};

// ── Courses ───────────────────────────────────────────────────
export const ridesAPI = {
  estimate: (data) => api.post('/rides/estimate', data),
  create: (data) => api.post('/rides', data),
  getActive: () => api.get('/rides/active'),
  getHistory: (page = 1) => api.get(`/rides/history?page=${page}`),
  getUnrated: () => api.get('/rides/unrated'),
  getById: (id) => api.get(`/rides/${id}`),
  updateStatus: (id, status, reason) => api.post(`/rides/${id}/status`, { status, reason }),
  rate: (id, score, comment) => api.post(`/rides/${id}/rate`, { score, comment }),
  nearbyDrivers: (lat, lng) => api.get(`/rides/nearby-drivers?lat=${lat}&lng=${lng}`),
  autocomplete: (q, lat, lng) => api.get(`/rides/geocode/autocomplete?q=${encodeURIComponent(q)}&lat=${lat}&lng=${lng}`),
  reverseGeocode: (lat, lng) => api.get(`/rides/geocode/reverse?lat=${lat}&lng=${lng}`),
  sos: (id) => api.post(`/rides/${id}/sos`),
};

// ── Utilisateurs ──────────────────────────────────────────────
export const usersAPI = {
  getFavorites: () => api.get('/users/favorites'),
  addFavorite: (data) => api.post('/users/favorites', data),
  deleteFavorite: (id) => api.delete(`/users/favorites/${id}`),
  getNotifications: () => api.get('/users/notifications'),
  markNotificationsRead: () => api.put('/users/notifications/read-all'),
  submitSupport: (data) => api.post('/users/support', data),
  sendSOS: (data) => api.post('/users/sos', data),
};

export default api;
