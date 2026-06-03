const router = require('express').Router();
const { body, query, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate, requireDriver } = require('../middleware/auth');
const { rideLimiter, strictLimiter } = require('../middleware/rateLimit');
const { validateUUID, clampInt } = require('../middleware/security');
const { estimateRide, haversineDistance } = require('../services/pricing');
const { autocomplete, getPlaceDetails, reverseGeocode } = require('../services/geocoding');
const {
  notifyRideRequest, notifyRideAccepted, notifyDriverArrived,
  notifyRideStarted, notifyRideCompleted, notifyRideCancelled
} = require('../services/notifications');

// ── POST /rides/estimate ─────────────────────────────────────
router.post('/estimate', authenticate,
  body('pickupLat').isFloat({ min: -90,  max: 90  }),
  body('pickupLng').isFloat({ min: -180, max: 180 }),
  body('dropoffLat').isFloat({ min: -90,  max: 90  }),
  body('dropoffLng').isFloat({ min: -180, max: 180 }),
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
router.get('/nearby-drivers', authenticate,
  query('lat').isFloat({ min: -90,  max: 90  }),
  query('lng').isFloat({ min: -180, max: 180 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const lat    = parseFloat(req.query.lat);
      const lng    = parseFloat(req.query.lng);
      const radius = Math.min(parseFloat(req.query.radius) || 5, 20); // max 20km

      const drivers = await prisma.$queryRaw`
        SELECT d.id, d.user_id, d.rating, d.vehicle_make, d.vehicle_model, d.vehicle_color,
               d.current_lat, d.current_lng, u.first_name, u.last_name, u.avatar_url,
               ROUND(CAST(
                 6371 * acos(
                   cos(radians(${lat})) * cos(radians(d.current_lat)) *
                   cos(radians(d.current_lng) - radians(${lng})) +
                   sin(radians(${lat})) * sin(radians(d.current_lat))
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
              cos(radians(${lat})) * cos(radians(d.current_lat)) *
              cos(radians(d.current_lng) - radians(${lng})) +
              sin(radians(${lat})) * sin(radians(d.current_lat))
            )
          ) <= ${radius}
        ORDER BY distance_km ASC
        LIMIT 20
      `;

      res.json({ success: true, drivers, count: drivers.length });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ── POST /rides ──────────────────────────────────────────────
router.post('/', authenticate, rideLimiter,
  body('pickupAddress').notEmpty().isLength({ max: 500 }).trim(),
  body('pickupLat').isFloat({ min: -90,  max: 90  }),
  body('pickupLng').isFloat({ min: -180, max: 180 }),
  body('dropoffAddress').notEmpty().isLength({ max: 500 }).trim(),
  body('dropoffLat').isFloat({ min: -90,  max: 90  }),
  body('dropoffLng').isFloat({ min: -180, max: 180 }),
  body('paymentMethod').optional().isIn(['cash', 'mobile_money', 'card']),
  body('notes').optional().trim().isLength({ max: 500 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { pickupAddress, pickupLat, pickupLng, dropoffAddress, dropoffLat, dropoffLng, paymentMethod, notes } = req.body;

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
          estimatedPrice:   estimate.estimatedPrice,
          distanceKm:       estimate.distanceKm,
          durationMinutes:  estimate.durationMinutes,
          paymentMethod:    paymentMethod || 'cash',
          notes:            notes || null,
          status: 'searching'
        },
        include: { client: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } } }
      });

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
        if (io) {
          io.sendToUser(d.user_id, 'new_ride_request', {
            ride: {
              id:             ride.id,
              pickupAddress:  ride.pickupAddress,
              pickupLat:      ride.pickupLat,
              pickupLng:      ride.pickupLng,
              dropoffAddress: ride.dropoffAddress,
              dropoffLat:     ride.dropoffLat,
              dropoffLng:     ride.dropoffLng,
              estimatedPrice: ride.estimatedPrice,
              distanceKm:     ride.distanceKm,
              durationMinutes:ride.durationMinutes,
              paymentMethod:  ride.paymentMethod,
              client:         ride.client,
              createdAt:      ride.createdAt,
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
      : { clientId: req.user.id,        status: { in: ['searching', 'accepted', 'driver_en_route', 'arrived', 'in_progress'] } };

    const ride = await prisma.ride.findFirst({
      where: statusFilter,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } },
        driver: { include: { user: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } } } }
      }
    });

    res.json({ success: true, ride });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /rides/unrated ───────────────────────────────────────
router.get('/unrated', authenticate, async (req, res) => {
  try {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h

    const ride = await prisma.ride.findFirst({
      where: {
        clientId: req.user.id,
        status: 'completed',
        completedAt: { gte: since },
        ratings: { none: { fromUser: req.user.id } }
      },
      orderBy: { completedAt: 'desc' },
      include: {
        driver: { include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } } }
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
    const page  = clampInt(req.query.page, 1, 1000, 1);
    const limit = clampInt(req.query.limit, 1, 50, 20);
    const skip  = (page - 1) * limit;

    const where = req.user.driver
      ? { driverId: req.user.driver.id, status: { in: ['completed', 'cancelled'] } }
      : { clientId: req.user.id,        status: { in: ['completed', 'cancelled'] } };

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
        take: limit
      }),
      prisma.ride.count({ where })
    ]);

    res.json({ success: true, rides, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /rides/geocode/autocomplete ─────────────────────────
router.get('/geocode/autocomplete', authenticate, strictLimiter, async (req, res) => {
  try {
    const { q, lat, lng } = req.query;
    if (!q || typeof q !== 'string' || q.length > 200) {
      return res.status(400).json({ success: false, message: 'Requête invalide' });
    }
    const results = await autocomplete(q, parseFloat(lat), parseFloat(lng));
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur géocodage' });
  }
});

// ── GET /rides/geocode/reverse ────────────────────────────────
router.get('/geocode/reverse', authenticate,
  query('lat').isFloat({ min: -90,  max: 90  }),
  query('lng').isFloat({ min: -180, max: 180 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const result = await reverseGeocode(parseFloat(req.query.lat), parseFloat(req.query.lng));
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Erreur géocodage inverse' });
    }
  }
);

// ── GET /rides/geocode/details ────────────────────────────────
router.get('/geocode/details', authenticate, async (req, res) => {
  try {
    const { place_id } = req.query;
    if (!place_id || typeof place_id !== 'string' || place_id.length > 300) {
      return res.status(400).json({ success: false, message: 'place_id requis' });
    }
    const result = await getPlaceDetails(place_id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur détails lieu' });
  }
});

// ── GET /rides/:id ───────────────────────────────────────────
router.get('/:id', authenticate, ...validateUUID('id'), async (req, res) => {
  try {
    const ride = await prisma.ride.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } },
        driver: { include: { user: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } } } },
        ratings: true
      }
    });

    if (!ride) return res.status(404).json({ success: false, message: 'Course introuvable' });

    const isClient = ride.clientId === req.user.id;
    const isDriver = ride.driver?.userId === req.user.id;
    const isAdmin  = req.user.role === 'admin';

    if (!isClient && !isDriver && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    res.json({ success: true, ride });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /rides/:id/accept (chauffeur) ───────────────────────
router.post('/:id/accept', authenticate, requireDriver, ...validateUUID('id'), async (req, res) => {
  try {
    const updatedRide = await prisma.$transaction(async (tx) => {
      const current = await tx.ride.findUnique({ where: { id: req.params.id } });
      if (!current || current.status !== 'searching') {
        const err = new Error('Course non disponible');
        err.code = 'RIDE_NOT_AVAILABLE';
        throw err;
      }
      return tx.ride.update({
        where: { id: req.params.id },
        data: {
          driverId:   req.user.driver.id,
          status:     'accepted',
          acceptedAt: new Date()
        },
        include: {
          client: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } },
          driver: { include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } } }
        }
      });
    });

    await prisma.driver.update({
      where: { id: req.user.driver.id },
      data: { availability: 'busy' }
    });

    const io = req.app.get('io');
    if (io) io.to(`ride_${req.params.id}`).emit('ride_accepted', { ride: updatedRide });

    notifyRideAccepted(
      updatedRide.clientId,
      updatedRide.id,
      `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim()
    );

    res.json({ success: true, ride: updatedRide });
  } catch (err) {
    if (err.code === 'RIDE_NOT_AVAILABLE') {
      return res.status(409).json({ success: false, message: 'Course non disponible' });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /rides/:id/status ───────────────────────────────────
router.post('/:id/status', authenticate, ...validateUUID('id'), async (req, res) => {
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
      driver_en_route: { from: ['accepted'],       by: 'driver' },
      arrived:         { from: ['driver_en_route'], by: 'driver' },
      in_progress:     { from: ['arrived'],         by: 'driver' },
      completed:       { from: ['in_progress'],     by: 'driver' },
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
    // Pour 'cancelled', vérifier que l'appelant est bien un participant
    if (status === 'cancelled' && !isDriver && !isClient) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const updateData = { status };
    const timestamps = {
      driver_en_route: {},
      arrived:         {},
      in_progress:     { pickedUpAt: new Date() },
      completed:       { completedAt: new Date(), finalPrice: ride.estimatedPrice },
      cancelled:       { cancelledAt: new Date(), cancelledBy: req.user.id, cancelReason: req.body.reason }
    };
    Object.assign(updateData, timestamps[status]);

    const updatedRide = await prisma.ride.update({
      where: { id: req.params.id },
      data: updateData
    });

    if (['completed', 'cancelled'].includes(status) && ride.driver) {
      const driverUpdate = { availability: 'online' };

      if (status === 'completed') {
        const price    = parseFloat(updatedRide.finalPrice || ride.estimatedPrice || 0);
        const earnings = price * (1 - (parseFloat(process.env.PLATFORM_COMMISSION) || 0.20));
        driverUpdate.totalRides    = { increment: 1 };
        driverUpdate.totalEarnings = { increment: Math.round(earnings * 100) / 100 };
      }

      await prisma.driver.update({ where: { id: ride.driver.id }, data: driverUpdate });
    }

    const io = req.app.get('io');
    if (io) io.to(`ride_${req.params.id}`).emit('ride_status_changed', { rideId: req.params.id, status });

    if (status === 'arrived')    notifyDriverArrived(ride.clientId, ride.id);
    if (status === 'in_progress') notifyRideStarted(ride.clientId, ride.id);
    if (status === 'completed')   notifyRideCompleted(ride.clientId, ride.id, updatedRide.finalPrice);
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
router.post('/:id/rate', authenticate, ...validateUUID('id'),
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

      const alreadyRated = ride.ratings?.some((r) => r.fromUser === req.user.id);
      if (alreadyRated) {
        return res.status(409).json({ success: false, message: 'Vous avez déjà noté cette course' });
      }

      const toUserId = isClient ? ride.driver.userId : ride.clientId;

      const rating = await prisma.rating.create({
        data: {
          rideId:  ride.id,
          fromUser: req.user.id,
          toUser:   toUserId,
          score:    req.body.score,
          comment:  req.body.comment || null
        }
      });

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

// ── POST /rides/:id/sos ──────────────────────────────────────
// SÉCURITÉ : uniquement le client ou le chauffeur de cette course
router.post('/:id/sos', authenticate, ...validateUUID('id'), async (req, res) => {
  try {
    const ride = await prisma.ride.findUnique({
      where: { id: req.params.id },
      select: { clientId: true, driverId: true, status: true }
    });

    if (!ride) return res.status(404).json({ success: false, message: 'Course introuvable' });

    // Vérifier que l'appelant est bien un participant de cette course
    const isClient = ride.clientId === req.user.id;
    const isDriver = req.user.driver && ride.driverId === req.user.driver.id;

    if (!isClient && !isDriver) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    await prisma.ride.update({
      where: { id: req.params.id },
      data: { isSos: true }
    });

    const io = req.app.get('io');
    if (io) {
      io.to('admin_room').emit('sos_alert', {
        rideId:    req.params.id,
        userId:    req.user.id,
        userRole:  req.user.role,
        timestamp: Date.now()
      });
    }

    res.json({ success: true, message: 'SOS envoyé' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur SOS' });
  }
});

module.exports = router;
