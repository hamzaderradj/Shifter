const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireRole } = require('../middleware/auth');
const { notifyAccountApproved, notifyAccountRejected } = require('../services/notifications');

const prisma = new PrismaClient();
const adminOnly = [authenticate, requireRole('admin')];

// ── GET /admin/stats ─────────────────────────────────────────
router.get('/stats', ...adminOnly, async (req, res) => {
  try {
    const [
      totalUsers, totalDrivers, totalRides, totalRevenue,
      pendingDrivers, activeRides, todayRides, todayRevenue
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'client' } }),
      prisma.driver.count(),
      prisma.ride.count({ where: { status: 'completed' } }),
      prisma.ride.aggregate({ where: { status: 'completed' }, _sum: { finalPrice: true } }),
      prisma.driver.count({ where: { status: 'pending' } }),
      prisma.ride.count({ where: { status: { in: ['searching', 'accepted', 'driver_en_route', 'arrived', 'in_progress'] } } }),
      prisma.ride.count({
        where: { status: 'completed', completedAt: { gte: new Date(new Date().setHours(0,0,0,0)) } }
      }),
      prisma.ride.aggregate({
        where: { status: 'completed', completedAt: { gte: new Date(new Date().setHours(0,0,0,0)) } },
        _sum: { finalPrice: true }
      })
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers, totalDrivers, totalRides, pendingDrivers, activeRides,
        totalRevenue: parseFloat(totalRevenue._sum.finalPrice) || 0,
        todayRides,
        todayRevenue: parseFloat(todayRevenue._sum.finalPrice) || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /admin/drivers ───────────────────────────────────────
router.get('/drivers', ...adminOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (search) {
      where.user = { OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } }
      ]};
    }

    const [drivers, total] = await Promise.all([
      prisma.driver.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, avatarUrl: true, createdAt: true } },
          documents: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.driver.count({ where })
    ]);

    res.json({ success: true, drivers, pagination: { page: parseInt(page), total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /admin/drivers/:id/approve ──────────────────────────
router.put('/drivers/:id/approve', ...adminOnly, async (req, res) => {
  try {
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: { status: 'approved' },
      include: { user: true }
    });
    notifyAccountApproved(driver.userId);
    res.json({ success: true, driver });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /admin/drivers/:id/reject ────────────────────────────
router.put('/drivers/:id/reject', ...adminOnly, async (req, res) => {
  try {
    const { reason } = req.body;
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: { status: 'rejected', rejectionReason: reason }
    });
    notifyAccountRejected(driver.userId, reason);
    res.json({ success: true, driver });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /admin/drivers/:id/suspend ──────────────────────────
router.put('/drivers/:id/suspend', ...adminOnly, async (req, res) => {
  try {
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: { status: 'suspended', availability: 'offline' }
    });
    res.json({ success: true, driver });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /admin/drivers/:id/rehabilitate ──────────────────────
router.put('/drivers/:id/rehabilitate', ...adminOnly, async (req, res) => {
  try {
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: { status: 'approved', availability: 'offline' }
    });
    res.json({ success: true, driver });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /admin/users ─────────────────────────────────────────
router.get('/users', ...adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } }
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, phone: true, email: true, firstName: true, lastName: true,
          role: true, isActive: true, isVerified: true, createdAt: true, lastLoginAt: true,
          _count: { select: { clientRides: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.user.count({ where })
    ]);

    res.json({ success: true, users, pagination: { page: parseInt(page), total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /admin/users/:id/toggle ──────────────────────────────
router.put('/users/:id/toggle', ...adminOnly, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: !user.isActive }
    });
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /admin/rides ─────────────────────────────────────────
router.get('/rides', ...adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = status ? { status } : {};

    const [rides, total] = await Promise.all([
      prisma.ride.findMany({
        where,
        include: {
          client: { select: { firstName: true, lastName: true, phone: true } },
          driver: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.ride.count({ where })
    ]);

    res.json({ success: true, rides, pagination: { page: parseInt(page), total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /admin/analytics ─────────────────────────────────────
router.get('/analytics', ...adminOnly, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - parseInt(days));

    const dailyStats = await prisma.$queryRaw`
      SELECT
        DATE(completed_at) as date,
        COUNT(*) as rides,
        SUM(final_price) as revenue
      FROM rides
      WHERE status = 'completed' AND completed_at >= ${dateFrom}
      GROUP BY DATE(completed_at)
      ORDER BY date ASC
    `;

    const topDrivers = await prisma.driver.findMany({
      where: { status: 'approved' },
      include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: { totalRides: 'desc' },
      take: 10
    });

    res.json({ success: true, dailyStats, topDrivers });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /admin/sos-alerts ─────────────────────────────────────
router.get('/sos-alerts', ...adminOnly, async (req, res) => {
  try {
    const alerts = await prisma.ride.findMany({
      where: { isSos: true },
      include: {
        client: { select: { firstName: true, lastName: true, phone: true } },
        driver: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } }
      },
      orderBy: { updatedAt: 'desc' },
      take: 50
    });
    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /admin/reset-test-data ───────────────────────────────
// Supprime toutes les courses et remet les compteurs à zéro
// À n'utiliser qu'en phase de développement
router.post('/reset-test-data', ...adminOnly, async (req, res) => {
  try {
    // Supprimer les notes (FK sur rides)
    await prisma.rating.deleteMany({});
    // Supprimer les courses
    const ridesDeleted = await prisma.ride.deleteMany({});
    // Remettre compteurs chauffeurs à zéro
    const driversReset = await prisma.driver.updateMany({
      data: { totalEarnings: 0, totalRides: 0, ratingCount: 0, availability: 'offline' }
    });
    res.json({
      success: true,
      message: 'Données de test supprimées',
      ridesDeleted: ridesDeleted.count,
      driversReset: driversReset.count
    });
  } catch (err) {
    console.error('reset-test-data:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
