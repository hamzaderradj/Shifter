/**
 * Shifter Rider — Socket.io Service
 * Gère la connexion temps réel du chauffeur : disponibilité, position, courses
 */

import { io } from 'socket.io-client';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || 'https://shifter-bmbf.onrender.com';

let socket = null;
let locationInterval = null;
let _getLocation = null; // Injecté depuis HomeScreen

// ────────────────────────────────────────────────────────────────
// Connexion / déconnexion
// ────────────────────────────────────────────────────────────────

export function connectSocket(token) {
  if (socket?.connected) return socket;

  socket = io(API_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connecté :', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Déconnecté :', reason);
    stopLocationTracking();
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Erreur connexion :', err.message);
  });

  // Pong keep-alive
  socket.on('pong', () => {});

  return socket;
}

export function disconnectSocket() {
  stopLocationTracking();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}

// ────────────────────────────────────────────────────────────────
// Disponibilité
// ────────────────────────────────────────────────────────────────

/**
 * Met le chauffeur en ligne ou hors ligne.
 * @param {boolean} online
 * @param {function} getLocation — fonction async qui retourne { lat, lng, speed, heading }
 * @returns {Promise<string>} — 'online' | 'offline'
 */
export function setAvailability(online, getLocation = null) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Socket non connecté'));
      return;
    }

    const availability = online ? 'online' : 'offline';
    socket.emit('driver:set_availability', { availability });

    const timeout = setTimeout(() => reject(new Error('Timeout disponibilité')), 5000);

    socket.once('driver:availability_updated', ({ availability: updated }) => {
      clearTimeout(timeout);
      if (online && getLocation) {
        _getLocation = getLocation;
        startLocationTracking();
      } else {
        stopLocationTracking();
        _getLocation = null;
      }
      resolve(updated);
    });

    socket.once('driver:availability_error', ({ message }) => {
      clearTimeout(timeout);
      reject(new Error(message));
    });
  });
}

// ────────────────────────────────────────────────────────────────
// Tracking position
// ────────────────────────────────────────────────────────────────

function startLocationTracking() {
  stopLocationTracking(); // reset
  locationInterval = setInterval(async () => {
    if (!socket?.connected || !_getLocation) return;
    try {
      const loc = await _getLocation();
      if (loc) {
        socket.emit('driver:update_location', {
          lat: loc.lat,
          lng: loc.lng,
          speed: loc.speed || 0,
          heading: loc.heading || 0,
        });
      }
    } catch (e) {
      // Silencieux — pas de localisation disponible
    }
  }, 10000); // toutes les 10 secondes
}

function stopLocationTracking() {
  if (locationInterval) {
    clearInterval(locationInterval);
    locationInterval = null;
  }
}

// ────────────────────────────────────────────────────────────────
// Écoute des courses
// ────────────────────────────────────────────────────────────────

/**
 * S'abonner aux nouvelles demandes de course.
 * @param {function} callback — appelé avec { ride }
 * @returns {function} — unsubscribe
 */
export function onRideRequest(callback) {
  if (!socket) return () => {};
  socket.on('new_ride_request', callback);
  return () => socket?.off('new_ride_request', callback);
}

/**
 * Envoyer une réponse de course via Socket (refus uniquement — acceptation via HTTP).
 */
export function sendRideResponse(rideId, accepted) {
  socket?.emit('driver:ride_response', { rideId, accepted });
}

// ────────────────────────────────────────────────────────────────
// Rejoindre la room d'une course active
// ────────────────────────────────────────────────────────────────

export function joinRide(rideId) {
  socket?.emit('ride:join', { rideId });
}

export function leaveRide(rideId) {
  socket?.emit('ride:leave', { rideId });
}

// ────────────────────────────────────────────────────────────────
// Écoutes génériques
// ────────────────────────────────────────────────────────────────

export function on(event, callback) {
  socket?.on(event, callback);
  return () => socket?.off(event, callback);
}

export function off(event, callback) {
  socket?.off(event, callback);
}

export function emit(event, data) {
  socket?.emit(event, data);
}
