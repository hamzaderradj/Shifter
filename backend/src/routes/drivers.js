const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');
const { authenticate, requireRole, requireDriver } = require('../middleware/auth');

const prisma = new PrismaClient();

// Multer pour l'upload de documents
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/documents/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.user.id}_${file.fieldname}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

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

    try {
      const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
      if (!driver) return res.status(404).json({ success: false, message: 'Profil chauffeur introuvable' });

      const fileUrl = `/uploads/documents/${req.file.filename}`;

      const doc = await prisma.driverDocument.upsert({
        where: { driverId_type: { driverId: driver.id, type: req.body.type } },
        update: { fileUrl, status: 'pending', notes: null },
        create: { driverId: driver.id, type: req.body.type, fileUrl }
      });

      res.json({ success: true, document: doc });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Erreur upload' });
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
    res.json({ success: true, driver });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /drivers/availability ─────────────────────────────────
router.put('/availability', authenticate, requireDriver,
  body('availability').isIn(['online', 'offline']),
  async (req, res) => {
    try {
      const driver = await prisma.driver.update({
        where: { id: req.user.driver.id },
        data: { availability: req.body.availability }
      });

      const io = req.app.get('io');
      if (io) io.emit('driver_availability_changed', {
        driverId: driver.id,
        availability: driver.availability
      });

      res.json({ success: true, driver });
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
      grossRevenue: Math.round(total),
      netEarnings: Math.round(earnings),
      platformFee: Math.round(total - earnings),
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
