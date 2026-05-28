import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000';

let socket = null;

export const initSocket = async () => {
  if (socket?.connected) return socket;

  const token = await SecureStore.getItemAsync('access_token');
  if (!token) return null;

  socket = io(API_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 10000,
  });

  socket.on('connect', () => console.log('[Socket] Connected:', socket.id));
  socket.on('disconnect', (reason) => console.log('[Socket] Disconnected:', reason));
  socket.on('connect_error', (err) => console.error('[Socket] Error:', err.message));

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

// ── Helpers pour émettre des événements ──────────────────────
export const joinRide = (rideId) => socket?.emit('ride:join', { rideId });
export const leaveRide = (rideId) => socket?.emit('ride:leave', { rideId });
export const subscribeToDriver = (driverId) => socket?.emit('tracking:subscribe', { driverId });
export const unsubscribeFromDriver = (driverId) => socket?.emit('tracking:unsubscribe', { driverId });
export const sendChatMessage = (rideId, message) => socket?.emit('chat:message', { rideId, message });
