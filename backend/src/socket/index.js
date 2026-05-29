const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const config = require('../config');

const prisma = new PrismaClient();

// Map: userId → socketId
const userSockets = new Map();

module.exports = (io) => {
  // ── Middleware d'authentification socket ─────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
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
    userSockets.set(user.id, socket.id);
    console.log(`[Socket] Connected: ${user.id} (${user.role})`);

    // Rejoindre les rooms selon le rôle
    socket.join(`user_${user.id}`);
    if (user.role === 'admin') socket.join('admin_room');
    if (user.driver) socket.join(`driver_${user.driver.id}`);

    // ── Driver: mise à jour position ─────────────────────
    socket.on('driver:update_location', async ({ lat, lng, speed, heading }) => {
      if (!user.driver || user.driver.status !== 'approved') return;

      try {
        await prisma.driver.update({
          where: { id: user.driver.id },
          data: { currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() }
        });

        // Diffuser aux clients qui suivent ce chauffeur
        socket.to(`tracking_driver_${user.driver.id}`).emit('driver:location_updated', {
          driverId: user.driver.id,
          lat, lng, speed, heading,
          timestamp: Date.now()
        });
      } catch (err) {
        console.error('Location update error:', err.message);
      }
    });

    // ── Client: rejoindre une course ─────────────────────
    socket.on('ride:join', ({ rideId }) => {
      socket.join(`ride_${rideId}`);
    });

    socket.on('ride:leave', ({ rideId }) => {
      socket.leave(`ride_${rideId}`);
    });

    // ── Client: suivre un chauffeur ──────────────────────
    socket.on('tracking:subscribe', ({ driverId }) => {
      socket.join(`tracking_driver_${driverId}`);
    });

    socket.on('tracking:unsubscribe', ({ driverId }) => {
      socket.leave(`tracking_driver_${driverId}`);
    });

    // ── Driver: changer disponibilité (online/offline) ──
    socket.on('driver:set_availability', async ({ availability }) => {
      if (!user.driver) return;
      if (!['online', 'offline'].includes(availability)) return;

      try {
        await prisma.driver.update({
          where: { id: user.driver.id },
          data: { availability }
        });

        // Mettre à jour le cache en mémoire
        user.driver.availability = availability;

        socket.emit('driver:availability_updated', { availability, timestamp: Date.now() });
        console.log(`[Socket] Driver ${user.driver.id} → ${availability}`);
      } catch (err) {
        console.error('Availability update error:', err.message);
        socket.emit('driver:availability_error', { message: 'Impossible de changer la disponibilité' });
      }
    });

    // ── Driver: répondre à une course ────────────────────
    socket.on('driver:ride_response', ({ rideId, accepted }) => {
      if (!accepted) {
        io.to(`ride_${rideId}`).emit('driver_declined', { rideId });
      }
    });

    // ── Chat simple entre client et chauffeur ────────────
    socket.on('chat:message', ({ rideId, message }) => {
      const chatMessage = {
        from: user.id,
        fromName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        message,
        timestamp: Date.now()
      };
      io.to(`ride_${rideId}`).emit('chat:message', chatMessage);
    });

    // ── Ping/Pong (keep-alive) ───────────────────────────
    socket.on('ping', () => socket.emit('pong'));

    // ── Déconnexion ──────────────────────────────────────
    socket.on('disconnect', async () => {
      userSockets.delete(user.id);
      console.log(`[Socket] Disconnected: ${user.id}`);

      // Passer le chauffeur en offline après déconnexion
      if (user.driver) {
        setTimeout(async () => {
          const stillConnected = userSockets.has(user.id);
          if (!stillConnected) {
            await prisma.driver.update({
              where: { id: user.driver.id },
              data: { availability: 'offline' }
            }).catch(() => {});
          }
        }, 30000); // 30s de grâce
      }
    });
  });

  // Fonction utilitaire pour envoyer à un user spécifique
  io.sendToUser = (userId, event, data) => {
    const socketId = userSockets.get(userId);
    if (socketId) io.to(socketId).emit(event, data);
  };

  return { userSockets };
};
