import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('driver_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('driver_refresh_token');
        const { data } = await axios.post(`${API_URL}/api/auth/refresh-token`, { refreshToken });
        await SecureStore.setItemAsync('driver_access_token', data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        await SecureStore.deleteItemAsync('driver_access_token');
        await SecureStore.deleteItemAsync('driver_refresh_token');
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  sendOtp: (phone) => api.post('/auth/send-otp', { phone }),
  verifyOtp: (phone, code) => api.post('/auth/verify-otp', { phone, code }),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
};

export const driverAPI = {
  register: (data) => api.post('/drivers/register', data),
  getMe: () => api.get('/drivers/me'),
  uploadDocument: (type, file) => {
    const form = new FormData();
    form.append('type', type);
    form.append('file', { uri: file.uri, name: file.name || `doc_${type}.jpg`, type: file.mimeType || 'image/jpeg' });
    return api.post('/drivers/documents', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  setAvailability: (availability) => api.put('/drivers/availability', { availability }),
  updateLocation: (lat, lng, speed, heading) => api.put('/drivers/location', { lat, lng, speed, heading }),
  getRequests: () => api.get('/drivers/requests'),
  getEarnings: (period = 'week') => api.get(`/drivers/earnings?period=${period}`),
};

export const ridesAPI = {
  getById: (id) => api.get(`/rides/${id}`),
  accept: (id) => api.post(`/rides/${id}/accept`),
  updateStatus: (id, status) => api.post(`/rides/${id}/status`, { status }),
  getHistory: (page = 1) => api.get(`/rides/history?page=${page}`),
  getActive: () => api.get('/rides/active'),
};

export default api;
