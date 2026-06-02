const router = require('express').Router();
const { body, query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireDriver } = require('../middleware/auth');
const { estimateRide } = require('../services/pricing');
const { autocomplete, getPlaceDetails, reverseGeocode } = require('../services/geocoding');
const {
  notifyRideRequest, notifyRideAccepted, notifyDriverArrived,
  notifyRideStarted, notifyRideCompleted, notifyRideCancelled
} = require('../services/notifications');
const { haversineDistance } = require('../services/pricing');

const prisma = new PrismaClient();

// ── POST /rides/estimate ─────────────────────────────────────
router.post('/estimate', authenticate,
  body('pickupLat').isFloat(),
  body('pickupLng').isFloat(),
  body('dropoffLat').isFloat(),
  body('dropoffLng').isFloat(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { pickupLat, pickupLng, dropoffLat, dropoffLng } = req.body;
      const estimate = await estimateRide(pickupLat, pickupLng, dropoffLat, dropoffLng);
      res.json({ success: true, estimate });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Erreur estimation' });
    }
  }
);

// ── GET /rides/nearby-drivers ────────────────────────────────
router.get('/nearby-drivers', authenticate, async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.query;
    if (!lat || !lng) return res.status(400).json({ success: false, message: 'Coordonnées requises' });

    const drivers = await prisma.$queryRaw`
      SELECT d.id, d.user_id, d.rating, d.vehicle_make, d.vehicle_model, d.vehicle_color,
             d.current_lat, d.current_lng, u.first_name, u.last_name, u.avatar_url,
             ROUND(CAST(
               6371 * acos(
                 cos(radians(${parseFloat(lat)})) * cos(radians(d.current_lat)) *
                 cos(radians(d.current_lng) - radians(${parseFloat(lng)})) +
                 sin(radians(${parseFloat(lat)})) * sin(radians(d.current_lat))
               ) AS DECIMAL
             ), 2) AS distance_km
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      WHERE d.status = 'approved'
        AND d.availability = 'online'
        AND d.current_lat IS NOT NULL
        AND d.current_lng IS NOT NULL
        AND (
          6371 * acos(
            cos(radians(${parseFloat(lat)})) * cos(radians(d.current_lat)) *
            cos(radians(d.current_lng) - radians(${parseFloat(lng)})) +
            sin(radians(${parseFloat(lat)})) * sin(radians(d.current_lat))
          )
        ) <= ${parseFloat(radius)}
      ORDER BY distance_km ASC
      LIMIT 20
    `;

    res.json({ success: true, drivers, count: drivers.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /rides ──────────────────────────────────────────────
router.post('/', authenticate,
  body('pickupAddress').notEmpty(),
  body('pickupLat').isFloat(),
  body('pickupLng').isFloat(),
  body('dropoffAddress').notEmpty(),
  body('dropoffLat').isFloat(),
  body('dropoffLng').isFloat(),
  body('paymentMethod').optional().isIn(['cash', 'mobile_money', 'card']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { pickupAddress, pickupLat, pickupLng, dropoffAddress, dropoffLat, dropoffLng, paymentMethod, notes } = req.body;

      // Vérifier pas de course active
      const activeRide = await prisma.ride.findFirst({
        where: {
          clientId: req.user.id,
          status: { in: ['searching', 'accepted', 'driver_en_route', 'arrived', 'in_progress'] }
        }
      });

      if (activeRide) {
        return res.status(409).json({ success: false, message: 'Course déjà en cours', rideId: activeRide.id });
      }

      const estimate = await estimateRide(pickupLat, pickupLng, dropoffLat, dropoffLng);

      const ride = await prisma.ride.create({
        data: {
          clientId: req.user.id,
          pickupAddress,
          pickupLat,
          pickupLng,
          dropoffAddress,
          dropoffLat,
          dropoffLng,
          estimatedPrice: estimate.estimatedPrice,
          distanceKm: estimate.distanceKm,
          durationMinutes: estimate.durationMinutes,
          paymentMethod: paymentMethod || 'cash',
          notes,
          status: 'searching'
        },
        include: { client: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } } }
      });

      // Trouver les chauffeurs proches — rayon personnalisé par chauffeur (défaut 5km, max 20km)
      const nearbyDrivers = await prisma.$queryRaw`
        SELECT d.id as driver_id, d.user_id FROM drivers d
        WHERE d.status = 'approved' AND d.availability = 'online'
          AND d.current_lat IS NOT NULL
          AND (6371 * acos(
            cos(radians(${pickupLat})) * cos(radians(d.current_lat)) *
            cos(radians(d.current_lng) - radians(${pickupLng})) +
            sin(radians(${pickupLat})) * sin(radians(d.current_lat))
          )) <= LEAST(COALESCE(d.search_radius, 5), 20)
      `;

      const io = req.app.get('io');
      const clientName = `${ride.client.firstName || 'Client'} ${ride.client.lastName || ''}`.trim();

      for (const d of nearbyDrivers) {
        // Émettre uniquement aux chauffeurs connectés et proches
        if (io) {
          io.sendToUser(d.user_id, 'new_ride_request', {
            ride: {
              id: ride.id,
              pickupAddress: ride.pickupAddress,
              pickupLat: ride.pickupLat,
              pickupLng: ride.pickupLng,
              dropoffAddress: ride.dropoffAddress,
              dropoffLat: ride.dropoffLat,
              dropoffLng: ride.dropoffLng,
              estimatedPrice: ride.estimatedPrice,
              distanceKm: ride.distanceKm,
              durationMinutes: ride.durationMinutes,
              paymentMethod: ride.paymentMethod,
              client: ride.client,
              createdAt: ride.createdAt,
            }
          });
        }
        notifyRideRequest(d.user_id, ride.id, clientName, ride.pickupAddress);
      }

      res.status(201).json({ success: true, ride });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Erreur création course' });
    }
  }
);

// ── GET /rides/active ────────────────────────────────────────
router.get('/active', authenticate, async (req, res) => {
  try {
    const statusFilter = req.user.driver
      ? { driverId: req.user.driver.id, status: { in: ['accepted', 'driver_en_route', 'arrived', 'in_progress'] } }
      : { clientId: req.user.id, status: { in: ['searching', 'accepted', 'driver_en_route', 'arrived', 'in_progress'] } };

    const ride = await prisma.ride.findFirst({
      where: statusFilter,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } },
        driver: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } }
          }
        }
      }
    });

    res.json({ success: true, ride });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /rides/unrated ───────────────────────────────────────
// Retourne la course la plus récente terminée et non notée par le client (dans les 24h)
router.get('/unrated', authenticate, async (req, res) => {
  try {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h

    const ride = await prisma.ride.findFirst({
      where: {
        clientId: req.user.id,
        status: 'completed',
        completedAt: { gte: since },
        // Pas de rating fait par le client sur cette course
        ratings: { none: { fromUser: req.user.id } }
      },
      orderBy: { completedAt: 'desc' },
      include: {
        driver: {
          include: {
            user: { select: { firstName: true, lastName: true, avatarUrl: true } }
          }
        }
      }
    });

    res.json({ success: true, ride: ride || null });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /rides/history ───────────────────────────────────────
router.get('/history', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = req.user.driver
      ? { driverId: req.user.driver.id, status: { in: ['completed', 'cancelled'] } }
      : { clientId: req.user.id, status: { in: ['completed', 'cancelled'] } };

    const [rides, total] = await Promise.all([
      prisma.ride.findMany({
        where,
        include: {
          driver: { include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
          client: { select: { firstName: true, lastName: true, avatarUrl: true } },
          ratings: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.ride.count({ where })
    ]);

    res.json({ success: true, rides, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /rides/:id ───────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const ride = await prisma.ride.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } },
        driver: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } }
          }
        },
        ratings: true
      }
    });

    if (!ride) return res.status(404).json({ success: false, message: 'Course introuvable' });

    // Accès autorisé seulement au client ou au chauffeur
    const isClient = ride.clientId === req.user.id;
    const isDriver = ride.driver?.userId === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isClient && !isDriver && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    res.json({ success: true, ride });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /rides/:id/accept (chauffeur) ───────────────────────
router.post('/:id/accept', authenticate, requireDriver, async (req, res) => {
  try {
    const ride = await prisma.ride.findUnique({ where: { id: req.params.id } });
    if (!ride || ride.status !== 'searching') {
      return res.status(409).json({ success: false, message: 'Course non disponible' });
    }

    const updatedRide = await prisma.ride.update({
      where: { id: req.params.id },
      data: { driverId: req.user.driver.id, status: 'accepted', acceptedAt: new Date() },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } },
        driver: { include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } } }
      }
    });

    // Marquer le chauffeur comme occupé
    await prisma.driver.update({
      where: { id: req.user.driver.id },
      data: { availability: 'busy' }
    });

    const io = req.app.get('io');
    if (io) io.to(`ride_${req.params.id}`).emit('ride_accepted', { ride: updatedRide });

    notifyRideAccepted(
      ride.clientId,
      ride.id,
      `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim()
    );

    res.json({ success: true, ride: updatedRide });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /rides/:id/status ───────────────────────────────────
router.post('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const ride = await prisma.ride.findUnique({
      where: { id: req.params.id },
      include: { driver: true }
    });

    if (!ride) return res.status(404).json({ success: false, message: 'Course introuvable' });

    const isDriver = ride.driver?.userId === req.user.id;
    const isClient = ride.clientId === req.user.id;

    const validTransitions = {
      driver_en_route: { from: ['accepted'], by: 'driver' },
      arrived:         { from: ['driver_en_route'], by: 'driver' },
      in_progress:     { from: ['arrived'], by: 'driver' },
      completed:       { from: ['in_progress'], by: 'driver' },
      cancelled:       { from: ['searching', 'accepted', 'driver_en_route', 'arrived'], by: 'any' }
    };

    const transition = validTransitions[status];
    if (!transition) return res.status(400).json({ success: false, message: 'Statut invalide' });
    if (!transition.from.includes(ride.status)) {
      return res.status(409).json({ success: false, message: `Transition ${ride.status} → ${status} invalide` });
    }
    if (transition.by === 'driver' && !isDriver) {
      return res.status(403).json({ success: false, message: 'Action réservée au chauffeur' });
    }

    const updateData = { status };
    const timestamps = {
      driver_en_route: {},
      arrived: {},
      in_progress: { pickedUpAt: new Date() },
      completed: { completedAt: new Date(), finalPrice: ride.estimatedPrice },
      cancelled: { cancelledAt: new Date(), cancelledBy: req.user.id, cancelReason: req.body.reason }
    };
    Object.assign(updateData, timestamps[status]);

    const updatedRide = await prisma.ride.update({
      where: { id: req.params.id },
      data: updateData
    });

    // Libérer le chauffeur si course terminée/annulée
    if (['completed', 'cancelled'].includes(status) && ride.driver) {
      await prisma.driver.update({
        where: { id: ride.driver.id },
        data: { availability: 'online' }
      });
    }

    // Notifications
    const io = req.app.get('io');
    if (io) io.to(`ride_${req.params.id}`).emit('ride_status_changed', { rideId: req.params.id, status });

    if (status === 'arrived') notifyDriverArrived(ride.clientId, ride.id);
    if (status === 'in_progress') notifyRideStarted(ride.clientId, ride.id);
    if (status === 'completed') notifyRideCompleted(ride.clientId, ride.id, updatedRide.finalPrice);
    if (status === 'cancelled') {
      const notify = isDriver ? ride.clientId : ride.driver?.userId;
      if (notify) notifyRideCancelled(notify, ride.id, isDriver);
    }

    res.json({ success: true, ride: updatedRide });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /rides/:id/rate ─────────────────────────────────────
// Utilisable par le client ET le chauffeur (un seul avis par personne par course)
router.post('/:id/rate', authenticate,
  body('score').isInt({ min: 1, max: 5 }),
  body('comment').optional().trim().isLength({ max: 500 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const ride = await prisma.ride.findUnique({
        where: { id: req.params.id },
        include: { driver: { include: { user: true } }, ratings: true }
      });

      if (!ride || ride.status !== 'completed') {
        return res.status(400).json({ success: false, message: 'Course non terminée' });
      }

      const isClient = ride.clientId === req.user.id;
      const isDriver = ride.driver?.userId === req.user.id;

      if (!isClient && !isDriver) {
        return res.status(403).json({ success: false, message: 'Accès refusé' });
      }

      // Vérifier si cet utilisateur a déjà noté
      const alreadyRated = ride.ratings?.some(r => r.fromUser === req.user.id);
      if (alreadyRated) {
        return res.status(409).json({ success: false, message: 'Vous avez déjà noté cette course' });
      }

      // Le client note le chauffeur, le chauffeur note le client
      const toUserId = isClient ? ride.driver.userId : ride.clientId;

      const rating = await prisma.rating.create({
        data: {
          rideId: ride.id,
          fromUser: req.user.id,
          toUser: toUserId,
          score: req.body.score,
          comment: req.body.comment || null
        }
      });

      // Mettre à jour la note moyenne du conducteur si c'est le client qui note
      if (isClient && ride.driver) {
        const avg = await prisma.rating.aggregate({
          where: { toUser: ride.driver.userId },
          _avg: { score: true },
          _count: true,
        });
        await prisma.driver.update({
          where: { id: ride.driver.id },
          data: { rating: avg._avg.score || 5 }
        });
      }

      res.json({ success: true, rating });
    } catch (err) {
      console.error('rate error:', err);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ── GET /rides/geocode/autocomplete ─────────────────────────
router.get('/geocode/autocomplete', authenticate, async (req, res) => {
  try {
    const { q, lat, lng } = req.query;
    const results = await autocomplete(q, parseFloat(lat), parseFloat(lng));
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur géocodage' });
  }
});

// ── GET /rides/geocode/reverse ────────────────────────────────
router.get('/geocode/reverse', authenticate, async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const result = await reverseGeocode(parseFloat(lat), parseFloat(lng));
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur géocodage inverse' });
  }
});

// ── GET /rides/geocode/details ────────────────────────────────
router.get('/geocode/details', authenticate, async (req, res) => {
  try {
    const { place_id } = req.query;
    if (!place_id) return res.status(400).json({ success: false, message: 'place_id requis' });
    const result = await getPlaceDetails(place_id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur détails lieu' });
  }
});

// ── POST /rides/:id/sos ──────────────────────────────────────
router.post('/:id/sos', authenticate, async (req, res) => {
  try {
    await prisma.ride.update({
      where: { id: req.params.id },
      data: { isSos: true }
    });

    // Alerter l'admin via socket
    const io = req.app.get('io');
    if (io) io.to('admin_room').emit('sos_alert', { rideId: req.params.id, userId: req.user.id });

    res.json({ success: true, message: 'SOS envoyé' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur SOS' });
  }
});

module.exports = router;
