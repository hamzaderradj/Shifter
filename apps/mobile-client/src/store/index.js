import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { authAPI } from '../services/api';
import { initSocket, disconnectSocket } from '../services/socket';

// ── Store Auth ────────────────────────────────────────────────
export const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  init: async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token');
      if (!token) return set({ isLoading: false });

      const { data } = await authAPI.getMe();
      set({ user: data.user, isAuthenticated: true });
      await initSocket();
    } catch {
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('refresh_token');
    } finally {
      set({ isLoading: false });
    }
  },

  login: async (accessToken, refreshToken, user) => {
    await SecureStore.setItemAsync('access_token', accessToken);
    await SecureStore.setItemAsync('refresh_token', refreshToken);
    set({ user, isAuthenticated: true });
    await initSocket();
  },

  logout: async () => {
    const refreshToken = await SecureStore.getItemAsync('refresh_token');
    try { await authAPI.logout(refreshToken); } catch {}
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    disconnectSocket();
    set({ user: null, isAuthenticated: false });
  },

  updateUser: (updates) => set((state) => ({ user: { ...state.user, ...updates } })),
}));

// ── Store Ride ────────────────────────────────────────────────
export const useRideStore = create((set) => ({
  activeRide: null,
  rideStatus: null,
  driverLocation: null,
  isSearching: false,
  nearbyDrivers: [],
  chatMessages: [],

  setActiveRide: (ride) => set({ activeRide: ride, rideStatus: ride?.status }),
  updateRideStatus: (status) => set((state) => ({
    rideStatus: status,
    activeRide: state.activeRide ? { ...state.activeRide, status } : null
  })),
  setDriverLocation: (location) => set({ driverLocation: location }),
  setIsSearching: (searching) => set({ isSearching: searching }),
  setNearbyDrivers: (drivers) => set({ nearbyDrivers: drivers }),
  addChatMessage: (msg) => set((state) => ({ chatMessages: [...state.chatMessages, msg] })),
  clearRide: () => set({ activeRide: null, rideStatus: null, driverLocation: null, isSearching: false, chatMessages: [] }),
}));

// ── Store Map ─────────────────────────────────────────────────
export const useMapStore = create((set) => ({
  userLocation: null,
  pickup: null,
  dropoff: null,
  searchResults: [],
  isSearchingAddress: false,

  setUserLocation: (loc) => set({ userLocation: loc }),
  setPickup: (pickup) => set({ pickup }),
  setDropoff: (dropoff) => set({ dropoff }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsSearchingAddress: (v) => set({ isSearchingAddress: v }),
  clearDestination: () => set({ dropoff: null, searchResults: [] }),
}));
