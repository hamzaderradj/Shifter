import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { authAPI } from '../services/api';

export const useAuthStore = create((set) => ({
  user: null,
  driver: null,
  isLoading: true,
  isAuthenticated: false,

  init: async () => {
    try {
      const token = await SecureStore.getItemAsync('driver_access_token');
      if (!token) return set({ isLoading: false });
      const { data } = await authAPI.getMe();
      set({ user: data.user, driver: data.user.driver, isAuthenticated: true });
    } catch {
      await SecureStore.deleteItemAsync('driver_access_token');
    } finally {
      set({ isLoading: false });
    }
  },

  login: async (accessToken, refreshToken, user) => {
    await SecureStore.setItemAsync('driver_access_token', accessToken);
    await SecureStore.setItemAsync('driver_refresh_token', refreshToken);
    set({ user, driver: user.driver, isAuthenticated: true });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('driver_access_token');
    await SecureStore.deleteItemAsync('driver_refresh_token');
    set({ user: null, driver: null, isAuthenticated: false });
  },

  updateDriver: (driverData) => set((state) => ({ driver: { ...state.driver, ...driverData } })),
  updateUser: (updates) => set((state) => ({ user: { ...state.user, ...updates } })),
}));

export const useRideStore = create((set) => ({
  currentRide: null,
  rideRequests: [],
  isOnline: false,

  setCurrentRide: (ride) => set({ currentRide: ride }),
  clearCurrentRide: () => set({ currentRide: null }),
  setRideRequests: (requests) => set({ rideRequests: requests }),
  addRideRequest: (ride) => set((state) => ({
    rideRequests: [ride, ...state.rideRequests.filter(r => r.id !== ride.id)]
  })),
  removeRideRequest: (rideId) => set((state) => ({
    rideRequests: state.rideRequests.filter(r => r.id !== rideId)
  })),
  setIsOnline: (online) => set({ isOnline: online }),
}));
