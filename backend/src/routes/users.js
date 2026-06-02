const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const prisma = new PrismaClient();

// ── GET /users/favorites ──────────────────────────────────────
router.get('/favorites', authenticate, async (req, res) => {
  try {
    const favorites = await prisma.favoriteAddress.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, favorites });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /users/favorites ─────────────────────────────────────
router.post('/favorites', authenticate,
  body('label').notEmpty().trim(),
  body('address').notEmpty(),
  body('lat').isFloat(),
  body('lng').isFloat(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { label, address, lat, lng } = req.body;
      const fav = await prisma.favoriteAddress.create({
        data: { userId: req.user.id, label, address, lat, lng }
      });
      res.status(201).json({ success: true, favorite: fav });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ── DELETE /users/favorites/:id ───────────────────────────────
router.delete('/favorites/:id', authenticate, async (req, res) => {
  try {
    await prisma.favoriteAddress.deleteMany({
      where: { id: req.params.id, userId: req.user.id }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /users/notifications ──────────────────────────────────
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /users/notifications/read-all ────────────────────────
router.put('/notifications/read-all', authenticate, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /users/support ───────────────────────────────────────
router.post('/support', authenticate,
  body('subject').notEmpty().trim().isLength({ max: 200 }).escape(),
  body('message').notEmpty().trim().isLength({ max: 2000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const ticket = await prisma.supportTicket.create({
        data: {
          userId: req.user.id,
          rideId: req.body.rideId || null,
          subject: req.body.subject,
          message: req.body.message
        }
      });
      res.status(201).json({ success: true, ticket });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ── POST /users/report ────────────────────────────────────────
router.post('/report', authenticate,
  body('reportedUserId').notEmpty(),
  body('reason').isIn(['inappropriate_behavior', 'fraud', 'safety_concern', 'bad_rating', 'other']),
  body('description').optional().trim().isLength({ max: 1000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { reportedUserId, rideId, reason, description } = req.body;
      if (reportedUserId === req.user.id) {
        return res.status(400).json({ success: false, message: 'Vous ne pouvez pas vous signaler vous-même' });
      }
      const report = await prisma.report.create({
        data: {
          reporterId: req.user.id,
          reportedUserId,
          rideId: rideId || null,
          reason,
          description: description?.trim() || null
        }
      });
      res.status(201).json({ success: true, report });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ── POST /users/sos ───────────────────────────────────────────
router.post('/sos', authenticate, async (req, res) => {
  try {
    const { rideId, lat, lng } = req.body;
    const alert = await prisma.sosAlert.create({
      data: {
        userId: req.user.id,
        rideId: rideId || null,
        lat: lat || null,
        lng: lng || null,
      },
      include: {
        user: { select: { firstName: true, lastName: true, phone: true } }
      }
    });

    // Notifier UNIQUEMENT les admins connectés (pas tous les sockets)
    const io = req.app.get('io');
    if (io) io.to('admin_room').emit('sos_alert', { alert });

    res.status(201).json({ success: true, alert });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /admin/sos ────────────────────────────────────────────
// (accessible via admin route, ici pour référence uniquement)

module.exports = router;
