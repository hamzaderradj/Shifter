const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { authenticate, requireRole, requireDriver } = require('../middleware/auth');
const { withSupabase } = require('../middleware/terminator/circuitBreaker');
const logger = require('../services/logger');
const { triggerOfferIfIdle } = require('../services/rideManager');

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

// Helper : upload buffer → Supabase Storage → chemin stocké en DB
// Protégé par circuit breaker TERMINATOR T3 (withSupabase)
async function uploadToSupabase(buffer, mimetype, filename) {
  return withSupabase(async () => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(filename, buffer, { contentType: mimetype, upsert: true });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return filename;
  }); // fallback null → erreur capturée dans la route
}

// Helper : générer une signed URL temporaire (valide 15min)
// Protégé par circuit breaker TERMINATOR T3 (withSupabase)
async function getSignedUrl(storagePath, expiresInSeconds = 900) {
  return withSupabase(async () => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error) throw new Error(`Signed URL error: ${error.message}`);
    return data.signedUrl;
  }); // fallback null
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

      // ── P1.3 — Upload robuste ─────────────────────────────────────────────────
      // Le fichier est en RAM (multer memoryStorage) — Render free tier redémarre
      // fréquemment. Si le process crashe pendant l'upload, le fichier est perdu.
      // On vérifie explicitement le retour de Supabase avant toute écriture en DB.
      const ext = req.file.mimetype === 'application/pdf' ? '.pdf' : '.jpg';
      const filename = `${driver.id}/${req.body.type}_${Date.now()}${ext}`;

      logger.info('[UPLOAD DOC] Début upload', {
        driverId: driver.id, type: req.body.type, size: req.file.size, filename,
      });

      const storagePath = await uploadToSupabase(req.file.buffer, req.file.mimetype, filename);

      // Null = circuit breaker ouvert ou Supabase indisponible
      if (!storagePath) {
        logger.warn('[UPLOAD DOC] Supabase indisponible ou circuit ouvert', { driverId: driver.id });
        return res.status(503).json({
          success:   false,
          message:   'Le service de stockage est temporairement indisponible. Veuillez réessayer dans quelques instants.',
          code:      'STORAGE_UNAVAILABLE',
          retryable: true,
        });
      }

      // Écriture DB uniquement si l'upload Supabase a réussi
      const doc = await prisma.driverDocument.upsert({
        where:  { driverId_type: { driverId: driver.id, type: req.body.type } },
        update: { fileUrl: storagePath, status: 'pending', notes: null },
        create: { driverId: driver.id, type: req.body.type, fileUrl: storagePath },
      });

      logger.info('[UPLOAD DOC] Succès', { driverId: driver.id, type: req.body.type, docId: doc.id });
      res.json({ success: true, document: doc });
    } catch (err) {
      logger.error('[UPLOAD DOC] Erreur', { error: err.message, driverId: req.user?.id });
      res.status(500).json({
        success:   false,
        message:   'Erreur lors de l\'upload. Le fichier n\'a pas été enregistré. Veuillez réessayer.',
        retryable: true,
      });
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
      where: { toUser: req.user.id }
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

      // Lire le driver via raw SQL pour avoir search_radius (pas dans le schema Prisma)
      const [driverRaw] = await prisma.$queryRaw`
        SELECT id, current_lat, current_lng, availability,
               COALESCE(search_radius, 5) as search_radius
        FROM drivers WHERE id = ${req.user.driver.id}
      `;
      await prisma.driver.update({
        where: { id: req.user.driver.id },
        data: { availability }
      });
      const driver = driverRaw;
      const searchRadius = Math.min(Math.max(parseInt(driver.search_radius) || 5, 1), 20);

      // Notifier uniquement l'admin room (pas broadcast global)
      const io = req.app.get('io');
      if (io) io.to('admin_room').emit('driver_availability_changed', {
        driverId: driver.id,
        availability
      });

      // ── P1.1 — Dispatch unifié via offerRideToNextDriver ─────────────────────
      // Avant : envoi direct des courses via socket → bypass du flow normal
      // → un driver pouvait recevoir la même course deux fois.
      // Maintenant : on passe uniquement par triggerOfferIfIdle qui vérifie s'il
      // y a déjà un timer actif pour la ride avant de lancer une nouvelle offre.
      // offerRideToNextDriver est l'unique source de vérité pour le dispatch.
      if (availability === 'online' && driver.current_lat && driver.current_lng) {
        const idleRides = await prisma.$queryRaw`
          SELECT r.id
          FROM rides r
          WHERE r.status = 'searching'
            AND r.created_at > NOW() - INTERVAL '10 minutes'
            AND (
              6371 * acos(
                cos(radians(${driver.current_lat})) * cos(radians(r.pickup_lat)) *
                cos(radians(r.pickup_lng) - radians(${driver.current_lng})) +
                sin(radians(${driver.current_lat})) * sin(radians(r.pickup_lat))
              )
            ) <= ${searchRadius}
          ORDER BY r.created_at DESC
          LIMIT 5
        `;

        if (idleRides.length > 0) {
          logger.info(`[AVAILABILITY] Driver ${driver.id} online → ${idleRides.length} ride(s) éligible(s) → triggerOfferIfIdle`);
          // Petit délai pour laisser le JWT côté app se mettre à jour
          setTimeout(() => {
            for (const ride of idleRides) {
              triggerOfferIfIdle(ride.id, io).catch(() => {});
            }
          }, 500);
        }
      }

      res.json({ success: true, driver: { ...driver, availability, searchRadius } });
    } catch (err) {
      console.error('[AVAILABILITY]', err);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ── PUT /drivers/radius ───────────────────────────────────────
router.put('/radius', authenticate, requireDriver,
  body('radius').isInt({ min: 1, max: 20 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const driver = await prisma.$executeRaw`
        UPDATE drivers SET search_radius = ${req.body.radius} WHERE id = ${req.user.driver.id}
      `;
      res.json({ success: true, searchRadius: req.body.radius });
    } catch (err) {
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

// ── GET /drivers/documents/:docId/url — signed URL temporaire ─
// Admin ou le chauffeur propriétaire uniquement
router.get('/documents/:docId/url', authenticate, async (req, res) => {
  try {
    const { docId } = req.params;

    const doc = await prisma.driverDocument.findUnique({
      where: { id: docId },
      include: { driver: { select: { userId: true } } }
    });

    if (!doc) return res.status(404).json({ success: false, message: 'Document introuvable' });

    // Accès : admin OU le chauffeur propriétaire
    const isOwner = doc.driver.userId === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    // URL signée valide 15 minutes
    const signedUrl = await getSignedUrl(doc.fileUrl, 900);

    res.json({ success: true, url: signedUrl, expiresIn: 900 });
  } catch (err) {
    console.error('[SIGNED URL]', err.message);
    res.status(500).json({ success: false, message: 'Erreur génération URL' });
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
