const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const config = require('../config');
const { isValidUUID } = require('../middleware/security');
const logger = require('../services/logger');
const { handleDriverRefusal, handleRideAccepted, clearResponseTimer } = require('../services/rideManager');
const rideSyncService = require('../services/rideSyncService');

// Map userId → Set<socketId>
const userSockets = new Map();

// Throttle GPS — max 1 update/seconde par socket
const locationThrottle = new Map();

module.exports = (io) => {
  // ── Middleware d'authentification ─────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Auth token missing'));

      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { driver: { select: { id: true, status: true, availability: true } } },
      });

      if (!user || !user.isActive) return next(new Error('Unauthorized'));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.user;

    if (!userSockets.has(user.id)) userSockets.set(user.id, new Set());
    userSockets.get(user.id).add(socket.id);

    logger.info(`[Socket] Connected: ${user.id} (${user.role})`);

    // ── Détection de reconnexion chauffeur avec course active ──
    if (user.driver) {
      const wasReconnect = userSockets.get(user.id).size === 1; // premier socket après absence
      if (wasReconnect) {
        const activeRide = await prisma.ride.findFirst({
          where: {
            driverId: user.driver.id,
            status:   { in: ['accepted', 'driver_en_route', 'arrived', 'in_progress'] },
          },
          select: { id: true, clientId: true, status: true },
        }).catch(() => null);

        if (activeRide) {
          logger.info(`[Socket] Driver ${user.driver.id} reconnecté avec ride active ${activeRide.id}`);
          // Remettre le chauffeur en busy s'il avait été passé offline
          await prisma.driver.update({
            where: { id: user.driver.id },
            data:  { availability: 'busy' },
          }).catch(() => {});
          // Notifier le client et l'admin que le chauffeur est de retour
          rideSyncService.onDriverReconnected(activeRide.id, user.driver.id, io);
          // Renvoyer l'état de la course au chauffeur reconnecté
          socket.emit('ride:reconnected', { rideId: activeRide.id, status: activeRide.status });
        }
      }
    }

    socket.join(`user_${user.id}`);
    if (user.role === 'admin') socket.join('admin_room');
    if (user.driver) socket.join(`driver_${user.driver.id}`);

    // ── Restauration d'état pour le CLIENT à la reconnexion (P0.2) ───────────
    // Après un restart backend, fermeture/réouverture de l'app, ou perte réseau,
    // le client ne sait pas qu'il a une course active. On la pousse automatiquement.
    if (!user.driver && user.role !== 'admin') {
      const activeClientRide = await prisma.ride.findFirst({
        where: {
          clientId: user.id,
          status: { in: ['searching', 'accepted', 'driver_en_route', 'arrived', 'in_progress'] },
        },
        include: {
          driver: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } },
            },
          },
        },
      }).catch(() => null);

      if (activeClientRide) {
        // Rejoindre la room automatiquement
        socket.join(`ride_${activeClientRide.id}`);
        // S'abonner au tracking GPS du chauffeur si disponible
        if (activeClientRide.driverId) {
          socket.join(`tracking_driver_${activeClientRide.driverId}`);
        }
        // Pousser l'état courant au client
        socket.emit('ride:current_state', {
          ride:      activeClientRide,
          status:    activeClientRide.status,
          timestamp: Date.now(),
        });
        logger.info(`[Socket] Client ${user.id} reconnecté — ride active ${activeClientRide.id} (${activeClientRide.status}) poussée`);
      }
    }

    // ── Driver: mise à jour GPS ──────────────────────────────
    socket.on('driver:update_location', async ({ lat, lng, rideId, speed, heading }) => {
      if (!user.driver || user.driver.status !== 'approved') return;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

      // Throttle 1 update/sec
      const now = Date.now();
      if (now - (locationThrottle.get(socket.id) || 0) < 1000) return;
      locationThrottle.set(socket.id, now);

      try {
        await prisma.driver.update({
          where: { id: user.driver.id },
          data: { currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() },
        });

        // Enregistrer dans ride_tracking si une course est en cours
        if (rideId && isValidUUID(rideId)) {
          const activeRide = await prisma.ride.findFirst({
            where: {
              id:       rideId,
              driverId: user.driver.id,
              status:   { in: ['accepted', 'driver_en_route', 'arrived', 'in_progress'] },
            },
            select: { id: true },
          });

          if (activeRide) {
            await prisma.rideTracking.create({
              data: {
                rideId:     rideId,
                driverId:   user.driver.id,
                lat,
                lng,
                speed:      speed || null,
                heading:    heading || null,
                recordedAt: new Date(),
              },
            }).catch(() => {}); // non bloquant
          }
        }

        socket.to(`tracking_driver_${user.driver.id}`).emit('driver:location_updated', {
          driverId: user.driver.id,
          lat, lng, speed, heading,
          timestamp: Date.now(),
        });
      } catch (err) {
        logger.error('[Socket] Location update error', { error: err.message });
      }
    });

    // ── Client: rejoindre room course (avec vérif participant) ──
    socket.on('ride:join', async ({ rideId }) => {
      if (!rideId || !isValidUUID(rideId)) return;
      try {
        const ride = await prisma.ride.findUnique({
          where: { id: rideId },
          select: { clientId: true, driverId: true },
        });
        if (!ride) return;
        const isParticipant =
          ride.clientId === user.id ||
          (user.driver && ride.driverId === user.driver.id) ||
          user.role === 'admin';
        if (!isParticipant) return;
        socket.join(`ride_${rideId}`);
      } catch (err) {
        logger.error('[Socket] ride:join error', { error: err.message });
      }
    });

    socket.on('ride:leave', ({ rideId }) => {
      if (!rideId || !isValidUUID(rideId)) return;
      socket.leave(`ride_${rideId}`);
    });

    // ── Client: tracking chauffeur ───────────────────────────
    socket.on('tracking:subscribe', async ({ driverId }) => {
      if (!driverId || !isValidUUID(driverId)) return;
      if (user.role === 'admin') { socket.join(`tracking_driver_${driverId}`); return; }
      try {
        const activeRide = await prisma.ride.findFirst({
          where: {
            clientId: user.id,
            driverId,
            status: { in: ['accepted', 'driver_en_route', 'arrived', 'in_progress'] },
          },
          select: { id: true },
        });
        if (!activeRide) return;
        socket.join(`tracking_driver_${driverId}`);
      } catch (err) {
        logger.error('[Socket] tracking:subscribe error', { error: err.message });
      }
    });

    socket.on('tracking:unsubscribe', ({ driverId }) => {
      if (!driverId) return;
      socket.leave(`tracking_driver_${driverId}`);
    });

    // ── Driver: disponibilité ────────────────────────────────
    socket.on('driver:set_availability', async ({ availability }) => {
      if (!user.driver) return;
      if (!['online', 'offline'].includes(availability)) return;
      try {
        await prisma.driver.update({ where: { id: user.driver.id }, data: { availability } });
        user.driver.availability = availability;
        socket.emit('driver:availability_updated', { availability, timestamp: Date.now() });
      } catch (err) {
        socket.emit('driver:availability_error', { message: 'Impossible de changer la disponibilité' });
      }
    });

    // ── Driver: réponse à une course ─────────────────────────
    socket.on('driver:ride_response', async ({ rideId, accepted }) => {
      if (!rideId || !isValidUUID(rideId) || !user.driver) return;

      if (accepted) {
        // Acceptation — déléguer à rideManager (transaction atomique)
        try {
          const result = await handleRideAccepted(rideId, user.driver, io);
          if (result.success) {
            socket.emit('driver:ride_accepted_confirmed', { rideId, ride: result.ride });
          } else {
            socket.emit('driver:ride_no_longer_available', { rideId });
          }
        } catch (err) {
          logger.error('[Socket] Ride acceptance error', { rideId, error: err.message });
          socket.emit('driver:ride_no_longer_available', { rideId });
        }
      } else {
        // Refus — redistribuer au prochain chauffeur
        await handleDriverRefusal(rideId, user.driver.id, io);
      }
    });

    // ── Chat client ↔ chauffeur ──────────────────────────────
    socket.on('chat:message', async ({ rideId, message }) => {
      if (!rideId || !message || !isValidUUID(rideId)) return;
      if (typeof message !== 'string' || message.length > 500) return;
      try {
        const ride = await prisma.ride.findUnique({
          where: { id: rideId },
          select: { clientId: true, driverId: true, status: true },
        });
        if (!ride || !['accepted', 'driver_en_route', 'arrived', 'in_progress'].includes(ride.status)) return;
        const isParticipant =
          ride.clientId === user.id || (user.driver && ride.driverId === user.driver.id);
        if (!isParticipant) return;

        const sanitized = message.replace(/[<>]/g, '').trim();
        if (!sanitized) return;

        io.to(`ride_${rideId}`).emit('chat:message', {
          from:      user.id,
          fromName:  `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          message:   sanitized,
          timestamp: Date.now(),
        });
      } catch (err) {
        logger.error('[Socket] chat:message error', { error: err.message });
      }
    });

    // ── Ping ─────────────────────────────────────────────────
    socket.on('ping', () => socket.emit('pong'));

    // ── Déconnexion ──────────────────────────────────────────
    socket.on('disconnect', async () => {
      const set = userSockets.get(user.id);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) userSockets.delete(user.id);
      }
      locationThrottle.delete(socket.id);

      logger.info(`[Socket] Disconnected: ${user.id}`);

      if (user.driver) {
        setTimeout(async () => {
          // Vérifier si le chauffeur s'est reconnecté
          if (userSockets.has(user.id)) return;

          // Passer en offline
          await prisma.driver.update({
            where: { id: user.driver.id },
            data: { availability: 'offline' },
          }).catch(() => {});

          // Vérifier si le chauffeur avait une course active
          const activeRide = await prisma.ride.findFirst({
            where: {
              driverId: user.driver.id,
              status:   { in: ['accepted', 'driver_en_route', 'arrived', 'in_progress'] },
            },
          }).catch(() => null);

          if (activeRide) {
            logger.info(`[Socket] Driver ${user.driver.id} déconnecté avec ride active ${activeRide.id}`);

            // Notifier client + admin via rideSyncService (matrice complète)
            await rideSyncService.onDriverDisconnected(activeRide.id, activeRide.clientId, io);

            // Si la course était en searching/accepted et pas encore démarrée → annuler après 2min
            if (['accepted', 'driver_en_route', 'arrived'].includes(activeRide.status)) {
              // ── P2.4 — Timeout 5 minutes (justification) ────────────────────
              // Scénario réel taxi moto en zone urbaine africaine (cible Shifter) :
              //   - Tunnel / sous-terrain : 10-30s de coupure
              //   - Zone morte (banlieue, zone industrielle) : 1-3 min
              //   - Perte réseau prolongée en périphérie : jusqu'à 5 min
              // Le chauffeur qui a ACCEPTÉ est physiquement en route → il reviendra.
              // 2 minutes étaient trop agressifs : annulation fréquente pour des
              // coupures normales, frustration client ET driver.
              // 5 minutes = tolérance raisonnable avant de conclure que le driver
              // a eu un problème grave (accident, panne, abandon).
              // Pour 'in_progress' : jamais d'annulation automatique — admin only.
              setTimeout(async () => {
                if (userSockets.has(user.id)) return;

                const currentRide = await prisma.ride.findUnique({
                  where: { id: activeRide.id },
                  select: { status: true },
                }).catch(() => null);

                if (currentRide && ['accepted', 'driver_en_route', 'arrived'].includes(currentRide.status)) {
                  logger.info(`[Socket] Annulation ride ${activeRide.id} — driver toujours déconnecté après 5min`);
                  const { cancelRide } = require('../services/rideManager');
                  await cancelRide(
                    activeRide.id,
                    'Chauffeur déconnecté — course annulée automatiquement après 5 minutes',
                    null,
                    io
                  ).catch(() => {});
                }
              }, 5 * 60 * 1000); // 5 minutes (justifié ci-dessus)
            }
            // Si in_progress : jamais d'annulation automatique — admin only
          }
        }, 30_000); // 30s de grâce avant de considérer comme déconnecté
      }
    });
  });

  // ── Utilitaire envoyer à un user ──────────────────────────
  io.sendToUser = (userId, event, data) => {
    const set = userSockets.get(userId);
    if (!set || set.size === 0) return;
    for (const socketId of set) io.to(socketId).emit(event, data);
  };

  return { userSockets };
};
