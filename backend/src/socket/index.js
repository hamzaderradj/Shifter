const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const config = require('../config');
const { isValidUUID } = require('../middleware/security');

// Map userId → Set<socketId> (multi-onglets / multi-devices)
const userSockets = new Map();

// Throttle de mise à jour GPS — max 1 fois/seconde par socket
const locationThrottle = new Map();

module.exports = (io) => {
  // ── Middleware d'authentification socket ─────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) return next(new Error('Auth token missing'));

      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { driver: { select: { id: true, status: true, availability: true } } }
      });

      if (!user || !user.isActive) return next(new Error('Unauthorized'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;

    // Enregistrer le socket (supporte plusieurs connexions simultanées)
    if (!userSockets.has(user.id)) userSockets.set(user.id, new Set());
    userSockets.get(user.id).add(socket.id);

    console.log(`[Socket] Connected: ${user.id} (${user.role}) — socketId=${socket.id}`);

    // Rooms automatiques par identité
    socket.join(`user_${user.id}`);
    if (user.role === 'admin') socket.join('admin_room');
    if (user.driver) socket.join(`driver_${user.driver.id}`);

    // ── Driver: mise à jour position GPS ────────────────────
    socket.on('driver:update_location', async ({ lat, lng, speed, heading }) => {
      if (!user.driver || user.driver.status !== 'approved') return;

      // Validation coordonnées
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

      // Throttle : max 1 update GPS / seconde
      const now = Date.now();
      const last = locationThrottle.get(socket.id) || 0;
      if (now - last < 1000) return;
      locationThrottle.set(socket.id, now);

      try {
        await prisma.driver.update({
          where: { id: user.driver.id },
          data: {
            currentLat: lat,
            currentLng: lng,
            locationUpdatedAt: new Date()
          }
        });

        socket.to(`tracking_driver_${user.driver.id}`).emit('driver:location_updated', {
          driverId:  user.driver.id,
          lat, lng, speed, heading,
          timestamp: Date.now()
        });
      } catch (err) {
        console.error('[Socket] Location update error:', err.message);
      }
    });

    // ── Client: rejoindre une room de course ─────────────────
    // SÉCURITÉ : vérification que le demandeur est bien participant de la course
    socket.on('ride:join', async ({ rideId }) => {
      if (!rideId || typeof rideId !== 'string' || !isValidUUID(rideId)) return;

      try {
        const ride = await prisma.ride.findUnique({
          where: { id: rideId },
          select: { clientId: true, driverId: true }
        });
        if (!ride) return;

        const isParticipant =
          ride.clientId === user.id ||
          (user.driver && ride.driverId === user.driver.id) ||
          user.role === 'admin';

        if (!isParticipant) {
          console.warn(
            `[SOCKET SECURITY] ride:join non autorisé — userId=${user.id} rideId=${rideId}`
          );
          return;
        }

        socket.join(`ride_${rideId}`);
      } catch (err) {
        console.error('[Socket] ride:join error:', err.message);
      }
    });

    socket.on('ride:leave', ({ rideId }) => {
      if (!rideId || typeof rideId !== 'string' || !isValidUUID(rideId)) return;
      socket.leave(`ride_${rideId}`);
    });

    // ── Client: suivre la position d'un chauffeur ────────────
    // SÉCURITÉ : vérification d'une course active entre ce client et ce chauffeur
    socket.on('tracking:subscribe', async ({ driverId }) => {
      if (!driverId || typeof driverId !== 'string' || !isValidUUID(driverId)) return;

      // Les admins peuvent tracker n'importe quel chauffeur
      if (user.role === 'admin') {
        socket.join(`tracking_driver_${driverId}`);
        return;
      }

      try {
        const activeRide = await prisma.ride.findFirst({
          where: {
            clientId: user.id,
            driverId,
            status: { in: ['accepted', 'driver_en_route', 'arrived', 'in_progress'] }
          },
          select: { id: true }
        });

        if (!activeRide) {
          console.warn(
            `[SOCKET SECURITY] tracking:subscribe non autorisé — userId=${user.id} driverId=${driverId}`
          );
          return;
        }

        socket.join(`tracking_driver_${driverId}`);
      } catch (err) {
        console.error('[Socket] tracking:subscribe error:', err.message);
      }
    });

    socket.on('tracking:unsubscribe', ({ driverId }) => {
      if (!driverId || typeof driverId !== 'string') return;
      socket.leave(`tracking_driver_${driverId}`);
    });

    // ── Driver: changer disponibilité ────────────────────────
    socket.on('driver:set_availability', async ({ availability }) => {
      if (!user.driver) return;
      if (!['online', 'offline'].includes(availability)) return;

      try {
        await prisma.driver.update({
          where: { id: user.driver.id },
          data: { availability }
        });

        user.driver.availability = availability;
        socket.emit('driver:availability_updated', { availability, timestamp: Date.now() });
        console.log(`[Socket] Driver ${user.driver.id} → ${availability}`);
      } catch (err) {
        console.error('[Socket] Availability update error:', err.message);
        socket.emit('driver:availability_error', {
          message: 'Impossible de changer la disponibilité'
        });
      }
    });

    // ── Driver: répondre à une course ────────────────────────
    socket.on('driver:ride_response', ({ rideId, accepted }) => {
      if (!rideId || !isValidUUID(rideId)) return;
      if (!accepted) {
        io.to(`ride_${rideId}`).emit('driver_declined', { rideId });
      }
    });

    // ── Chat client ↔ chauffeur ──────────────────────────────
    // SÉCURITÉ : uniquement les participants de la course, course active uniquement
    socket.on('chat:message', async ({ rideId, message }) => {
      if (!rideId || !message || typeof message !== 'string') return;
      if (!isValidUUID(rideId)) return;
      if (message.length > 500) return; // limite taille message

      try {
        const ride = await prisma.ride.findUnique({
          where: { id: rideId },
          select: { clientId: true, driverId: true, status: true }
        });

        if (!ride) return;
        if (!['accepted', 'driver_en_route', 'arrived', 'in_progress'].includes(ride.status)) return;

        const isParticipant =
          ride.clientId === user.id ||
          (user.driver && ride.driverId === user.driver.id);

        if (!isParticipant) {
          console.warn(
            `[SOCKET SECURITY] chat:message non autorisé — userId=${user.id} rideId=${rideId}`
          );
          return;
        }

        // Nettoyage basique du message (suppression balises HTML)
        const sanitized = message.replace(/[<>]/g, '').trim();
        if (!sanitized) return;

        io.to(`ride_${rideId}`).emit('chat:message', {
          from:      user.id,
          fromName:  `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          message:   sanitized,
          timestamp: Date.now()
        });
      } catch (err) {
        console.error('[Socket] chat:message error:', err.message);
      }
    });

    // ── Ping/Pong keep-alive ─────────────────────────────────
    socket.on('ping', () => socket.emit('pong'));

    // ── Déconnexion ──────────────────────────────────────────
    socket.on('disconnect', async () => {
      // Retirer ce socketId du Set de l'utilisateur
      const set = userSockets.get(user.id);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) userSockets.delete(user.id);
      }

      // Nettoyer le throttle GPS
      locationThrottle.delete(socket.id);

      console.log(`[Socket] Disconnected: ${user.id} (socketId=${socket.id})`);

      // Passer le chauffeur en offline si aucun autre socket actif
      if (user.driver) {
        setTimeout(async () => {
          const stillConnected = userSockets.has(user.id);
          if (!stillConnected) {
            await prisma.driver
              .update({ where: { id: user.driver.id }, data: { availability: 'offline' } })
              .catch(() => {});
          }
        }, 30000); // 30s de grâce
      }
    });
  });

  // ── Utilitaire : envoyer à tous les sockets d'un utilisateur ─
  io.sendToUser = (userId, event, data) => {
    const set = userSockets.get(userId);
    if (!set || set.size === 0) return;
    for (const socketId of set) {
      io.to(socketId).emit(event, data);
    }
  };

  return { userSockets };
};
