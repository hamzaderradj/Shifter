const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { authenticate, requireRole, requireDriver } = require('../middleware/auth');

const prisma = new PrismaClient();

// Supabase Storage client (service role pour bypass RLS)
// Node 20 n'a pas WebSocket natif — on désactive le realtime (pas besoin pour Storage)
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  realtime: { transport: require('ws') },
});
const BUCKET = 'driver-documents';

// Multer : mémoire (pas de disque — Render est éphémère)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Helper : upload buffer → Supabase Storage → URL publique
async function uploadToSupabase(buffer, mimetype, filename) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: mimetype, upsert: true });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return publicUrl;
}

// ── POST /drivers/register ────────────────────────────────────
router.post('/register', authenticate,
  body('vehicleMake').notEmpty().withMessage('Marque requise'),
  body('vehicleModel').notEmpty().withMessage('Modèle requis'),
  body('vehiclePlate').notEmpty().withMessage('Plaque requise'),
  body('vehicleColor').notEmpty().withMessage('Couleur requise'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      // Vérifier si déjà inscrit
      const existing = await prisma.driver.findUnique({ where: { userId: req.user.id } });
      if (existing) {
        return res.status(409).json({ success: false, message: 'Profil chauffeur déjà créé', driver: existing });
      }

      const { vehicleMake, vehicleModel, vehicleYear, vehiclePlate, vehicleColor } = req.body;

      const driver = await prisma.driver.create({
        data: {
          userId: req.user.id,
          vehicleMake,
          vehicleModel,
          vehicleYear: vehicleYear ? parseInt(vehicleYear) : null,
          vehiclePlate,
          vehicleColor,
        }
      });

      // Mettre à jour le rôle utilisateur
      await prisma.user.update({
        where: { id: req.user.id },
        data: { role: 'driver' }
      });

      res.status(201).json({ success: true, driver });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ── POST /drivers/documents ───────────────────────────────────
router.post('/documents',
  authenticate,
  upload.single('file'),
  body('type').isIn(['id_card', 'driving_license', 'vehicle_registration', 'insurance', 'profile_photo', 'vehicle_photo']),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Fichier requis' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
      if (!driver) return res.status(404).json({ success: false, message: 'Profil chauffeur introuvable' });

      // Upload vers Supabase Storage (persistant)
      const ext = req.file.mimetype === 'application/pdf' ? '.pdf' : '.jpg';
      const filename = `${driver.id}/${req.body.type}_${Date.now()}${ext}`;
      const fileUrl = await uploadToSupabase(req.file.buffer, req.file.mimetype, filename);

      const doc = await prisma.driverDocument.upsert({
        where: { driverId_type: { driverId: driver.id, type: req.body.type } },
        update: { fileUrl, status: 'pending', notes: null },
        create: { driverId: driver.id, type: req.body.type, fileUrl }
      });

      res.json({ success: true, document: doc });
    } catch (err) {
      console.error('[UPLOAD DOC]', err);
      res.status(500).json({ success: false, message: 'Erreur upload document' });
    }
  }
);

// ── GET /drivers/me ───────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
      include: {
        documents: true,
        user: { select: { firstName: true, lastName: true, phone: true, avatarUrl: true } }
      }
    });
    if (!driver) return res.status(404).json({ success: false, message: 'Profil introuvable' });

    // Calcul note moyenne depuis les ratings reçus
    const ratings = await prisma.rating.findMany({
      where: { toUserId: req.user.id }
    });
    const avgRating = ratings.length > 0
      ? parseFloat((ratings.reduce((s, r) => s + r.score, 0) / ratings.length).toFixed(2))
      : null;

    res.json({ success: true, driver: { ...driver, avgRating, ratingsCount: ratings.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /drivers/availability ─────────────────────────────────
router.put('/availability', authenticate, requireDriver,
  body('availability').isIn(['online', 'offline']),
  async (req, res) => {
    try {
      const { availability } = req.body;

      const driver = await prisma.driver.update({
        where: { id: req.user.driver.id },
        data: { availability }
      });

      const io = req.app.get('io');
      if (io) io.emit('driver_availability_changed', {
        driverId: driver.id,
        availability: driver.availability
      });

      // Si le chauffeur passe EN LIGNE et a une position connue,
      // lui envoyer les courses en attente à proximité (max 10 min, rayon 5 km)
      if (availability === 'online' && driver.currentLat && driver.currentLng) {
        const pendingRides = await prisma.$queryRaw`
          SELECT r.id, r.pickup_address, r.pickup_lat, r.pickup_lng,
                 r.dropoff_address, r.dropoff_lat, r.dropoff_lng,
                 r.estimated_price, r.distance_km, r.duration_minutes,
                 r.payment_method, r.created_at,
                 u.id as client_id, u.first_name, u.last_name, u.phone, u.avatar_url
          FROM rides r
          JOIN users u ON u.id = r.client_id
          WHERE r.status = 'searching'
            AND r.created_at > NOW() - INTERVAL '10 minutes'
            AND (
              6371 * acos(
                cos(radians(${driver.currentLat})) * cos(radians(r.pickup_lat)) *
                cos(radians(r.pickup_lng) - radians(${driver.currentLng})) +
                sin(radians(${driver.currentLat})) * sin(radians(r.pickup_lat))
              )
            ) <= 5
          ORDER BY r.created_at DESC
          LIMIT 3
        `;

        if (io && pendingRides.length > 0) {
          // Délai de 500ms pour laisser le temps à l'app de traiter la réponse HTTP
          // et passer isOnline=true avant de recevoir l'événement socket
          setTimeout(() => {
          for (const ride of pendingRides) {
            io.to(`user_${req.user.id}`).emit('new_ride_request', {
              ride: {
                id: ride.id,
                pickupAddress: ride.pickup_address,
                pickupLat: parseFloat(ride.pickup_lat),
                pickupLng: parseFloat(ride.pickup_lng),
                dropoffAddress: ride.dropoff_address,
                dropoffLat: parseFloat(ride.dropoff_lat),
                dropoffLng: parseFloat(ride.dropoff_lng),
                estimatedPrice: parseFloat(ride.estimated_price),
                distanceKm: parseFloat(ride.distance_km),
                durationMinutes: ride.duration_minutes,
                paymentMethod: ride.payment_method,
                client: {
                  id: ride.client_id,
                  firstName: ride.first_name,
                  lastName: ride.last_name,
                  phone: ride.phone,
                  avatarUrl: ride.avatar_url,
                },
                createdAt: ride.created_at,
              }
            });
          }
          console.log(`[AVAILABILITY] Chauffeur ${driver.id} en ligne → ${pendingRides.length} course(s) en attente envoyées`);
          }, 500); // fin setTimeout
        }
      }

      res.json({ success: true, driver });
    } catch (err) {
      console.error('[AVAILABILITY]', err);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ── PUT /drivers/location ─────────────────────────────────────
router.put('/location', authenticate, requireDriver,
  body('lat').isFloat(),
  body('lng').isFloat(),
  async (req, res) => {
    try {
      const { lat, lng, speed, heading } = req.body;
      await prisma.driver.update({
        where: { id: req.user.driver.id },
        data: { currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() }
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ── GET /drivers/earnings ─────────────────────────────────────
router.get('/earnings', authenticate, requireDriver, async (req, res) => {
  try {
    const { period = 'week' } = req.query;
    let dateFrom = new Date();

    if (period === 'today') dateFrom.setHours(0, 0, 0, 0);
    else if (period === 'week') dateFrom.setDate(dateFrom.getDate() - 7);
    else if (period === 'month') dateFrom.setMonth(dateFrom.getMonth() - 1);

    const rides = await prisma.ride.findMany({
      where: {
        driverId: req.user.driver.id,
        status: 'completed',
        completedAt: { gte: dateFrom }
      },
      select: { id: true, finalPrice: true, completedAt: true, distanceKm: true }
    });

    const total = rides.reduce((sum, r) => sum + (parseFloat(r.finalPrice) || 0), 0);
    const earnings = total * 0.80; // 80% pour le chauffeur

    res.json({
      success: true,
      period,
      totalRides: rides.length,
      grossRevenue: parseFloat(total.toFixed(2)),
      netEarnings: parseFloat(earnings.toFixed(2)),
      platformFee: parseFloat((total - earnings).toFixed(2)),
      rides
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /drivers/requests (courses disponibles) ───────────────
router.get('/requests', authenticate, requireDriver, async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({ where: { id: req.user.driver.id } });

    const rides = await prisma.ride.findMany({
      where: { status: 'searching' },
      include: { client: { select: { firstName: true, lastName: true, avatarUrl: true, phone: true } } },
      orderBy: { requestedAt: 'desc' },
      take: 10
    });

    // Filtrer par distance si le chauffeur a une position
    let filteredRides = rides;
    if (driver.currentLat && driver.currentLng) {
      const { haversineDistance } = require('../services/pricing');
      filteredRides = rides.filter(r => {
        const dist = haversineDistance(
          parseFloat(driver.currentLat), parseFloat(driver.currentLng),
          parseFloat(r.pickupLat), parseFloat(r.pickupLng)
        );
        return dist <= 10; // 10km max
      });
    }

    res.json({ success: true, rides: filteredRides });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;
