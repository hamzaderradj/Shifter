import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Auth Store ─────────────────────────────────────────────────
const _authStore = create(
  persist(
    (set) => ({
      user: null,
      driver: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,

      // Méthodes compatibles avec tous les écrans
      setUser: (user) => set({ user }),
      setDriver: (driver) => set({ driver, isAuthenticated: true }),
      setToken: (token) => set({ token }),
      updateDriver: (driver) => set({ driver }),
      updateUser: (data) => set((state) => ({ user: { ...state.user, ...data } })),

      login: ({ user, driver, token, refreshToken }) =>
        set({ user, driver, token, refreshToken, isAuthenticated: true }),

      logout: () =>
        set({ user: null, driver: null, token: null, refreshToken: null, isAuthenticated: false }),

      setLoading: (isLoading) => set({ isLoading }),
      finishLoading: () => set({ isLoading: false }),
    }),
    {
      name: 'driver-auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) state.setLoading(false);
      },
    }
  )
);

// Exporté sous 2 noms pour compatibilité avec tous les écrans
export const useAuthStore = _authStore;
export const useDriverAuthStore = _authStore;

// ── Status Store ───────────────────────────────────────────────
export const useDriverStatusStore = create((set, get) => ({
  isOnline: false,
  currentRide: null,
  rideRequest: null,

  setOnline: (online) => set({ isOnline: online }),
  setCurrentRide: (ride) => set({ currentRide: ride }),
  setRideRequest: (req) => set({ rideRequest: req }),
  clearRide: () => set({ currentRide: null, rideRequest: null }),
}));

// ── Earnings Store ─────────────────────────────────────────────
export const useEarningsStore = create((set) => ({
  today: 0,
  week: 0,
  trips: 0,
  history: [],

  setEarnings: ({ today, week, trips }) => set({ today, week, trips }),
  setHistory: (history) => set({ history }),
  addTrip: (trip) =>
    set((state) => ({
      history: [trip, ...state.history],
      today: state.today + parseFloat(trip.amount || 0),
      trips: state.trips + 1,
    })),
}));
