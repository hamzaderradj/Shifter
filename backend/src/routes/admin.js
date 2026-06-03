const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireAdminRole, auditLog } = require('../middleware/adminRole');
const { clampInt, validateUUID } = require('../middleware/security');
const { notifyAccountApproved, notifyAccountRejected, sendPushNotification } = require('../services/notifications');
const terminator = require('../middleware/terminator');

const adminOnly = [authenticate, requireRole('admin')];
// Shortcut: adminOnly + UUID validation sur le param :id
const adminId = [...adminOnly, ...validateUUID('id')];

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
router.put('/drivers/:id/approve', ...adminId, requireAdminRole('operations'), auditLog('approve_driver'), async (req, res) => {
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
router.put('/drivers/:id/reject', ...adminId, requireAdminRole('operations'), auditLog('reject_driver'), async (req, res) => {
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
router.put('/drivers/:id/suspend', ...adminId, requireAdminRole('operations'), auditLog('suspend_driver'), async (req, res) => {
  try {
    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: { status: 'suspended', availability: 'offline' }
    });
    // Déconnecter le chauffeur via socket si connecté
    const io = req.app.get('io');
    if (io) io.to(`driver_${req.params.id}`).emit('account_suspended', { message: 'Votre compte a été suspendu.' });
    res.json({ success: true, driver });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /admin/drivers/:id/rehabilitate ──────────────────────
router.put('/drivers/:id/rehabilitate', ...adminId, requireAdminRole('operations'), auditLog('rehabilitate_driver'), async (req, res) => {
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
router.put('/users/:id/toggle', ...adminId, requireAdminRole('operations'), auditLog('toggle_user'), async (req, res) => {
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
    const days = clampInt(req.query.days, 1, 365, 30); // max 1 an
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

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

// ── GET /admin/reports ────────────────────────────────────────
router.get('/reports', ...adminOnly, async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = status === 'all' ? {} : { status };

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, firstName: true, lastName: true, phone: true, role: true } },
          reportedUser: { select: { id: true, firstName: true, lastName: true, phone: true, role: true } },
          ride: { select: { id: true, pickupAddress: true, dropoffAddress: true, createdAt: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.report.count({ where })
    ]);

    res.json({ success: true, reports, pagination: { page: parseInt(page), total, pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /admin/reports/:id ────────────────────────────────────
router.put('/reports/:id', ...adminId, requireAdminRole('operations'), auditLog('update_report'), async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: { status, adminNote: adminNote || null }
    });
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /admin/users/:id/suspend ──────────────────────────────
router.put('/users/:id/suspend', ...adminId, requireAdminRole('operations'), auditLog('suspend_user'), async (req, res) => {
  try {
    const { suspend = true } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: !suspend }
    });
    // Si c'est un chauffeur, suspendre aussi son profil driver
    await prisma.driver.updateMany({
      where: { userId: req.params.id },
      data: { status: suspend ? 'suspended' : 'approved' }
    }).catch(() => {});
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /admin/ratings/suspicious ────────────────────────────
router.get('/ratings/suspicious', ...adminOnly, async (req, res) => {
  try {
    // Avis suspects : note <= 2 avec commentaire
    const ratings = await prisma.rating.findMany({
      where: {
        score: { lte: 2 },
        comment: { not: null }
      },
      include: {
        ride: {
          select: {
            id: true, pickupAddress: true, dropoffAddress: true, createdAt: true,
            client: { select: { id: true, firstName: true, lastName: true, phone: true } },
            driver: { include: { user: { select: { id: true, firstName: true, lastName: true, phone: true } } } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ success: true, ratings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /admin/support ────────────────────────────────────────
router.get('/support', ...adminOnly, async (req, res) => {
  try {
    const { status = 'open', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = status === 'all' ? {} : { status };

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, phone: true, role: true } },
          ride: { select: { id: true, pickupAddress: true, dropoffAddress: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.supportTicket.count({ where })
    ]);

    res.json({ success: true, tickets, pagination: { page: parseInt(page), total, pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /admin/support/:id ────────────────────────────────────
router.put('/support/:id', ...adminId, requireAdminRole('support'), auditLog('update_ticket'), async (req, res) => {
  try {
    const { status, adminReply } = req.body;
    const data = { status };
    if (adminReply !== undefined) {
      data.adminReply = adminReply;
      data.repliedAt = new Date();
    }
    const ticket = await prisma.supportTicket.update({
      where: { id: req.params.id },
      data
    });
    res.json({ success: true, ticket });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /admin/reset-test-data ───────────────────────────────
// DANGER — désactivé en PRODUCTION, superadmin uniquement, tracé dans l'audit log
router.post('/reset-test-data', ...adminOnly, requireAdminRole('superadmin'), auditLog('reset_test_data'), async (req, res) => {
  // Protection absolue : cette route ne fonctionne JAMAIS en production
  if (process.env.NODE_ENV === 'production') {
    console.error(`[SECURITY] Tentative d'accès à reset-test-data en production par userId=${req.user.id} depuis ${req.ip}`);
    return res.status(403).json({
      success: false,
      message: 'Route désactivée en production'
    });
  }
  try {
    await prisma.rating.deleteMany({});
    const ridesDeleted = await prisma.ride.deleteMany({});
    const driversReset = await prisma.driver.updateMany({
      data: { totalEarnings: 0, totalRides: 0, availability: 'offline' }
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

// ── GET /admin/sos ────────────────────────────────────────────
router.get('/sos', ...adminOnly, async (req, res) => {
  try {
    const resolved = req.query.resolved === 'true';
    const alerts = await prisma.sosAlert.findMany({
      where: { resolved },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, phone: true } },
        ride: { select: { id: true, pickupAddress: true, dropoffAddress: true } }
      }
    });
    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /admin/sos/:id/resolve ────────────────────────────────
router.put('/sos/:id/resolve', ...adminId, requireAdminRole('operations'), auditLog('resolve_sos'), async (req, res) => {
  try {
    const alert = await prisma.sosAlert.update({
      where: { id: req.params.id },
      data: { resolved: true }
    });
    res.json({ success: true, alert });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /admin/health — vraie vérification santé des services ─────────
router.get('/health', ...adminOnly, async (req, res) => {
  const results = {};
  const start = Date.now();

  // Base de données
  try {
    await prisma.$queryRaw`SELECT 1`;
    results.database = { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    results.database = { status: 'error', error: err.message };
  }

  // Riders en ligne
  try {
    const onlineDrivers = await prisma.driver.count({ where: { availability: 'online' } });
    results.driversOnline = { status: 'ok', count: onlineDrivers };
  } catch (err) {
    results.driversOnline = { status: 'error' };
  }

  // Courses actives
  try {
    const activeRides = await prisma.ride.count({
      where: { status: { in: ['searching', 'accepted', 'driver_en_route', 'arrived', 'in_progress'] } }
    });
    results.activeRides = { status: 'ok', count: activeRides };
  } catch (err) {
    results.activeRides = { status: 'error' };
  }

  // Courses bloquées en searching > 15min
  try {
    const stuckAt = new Date(Date.now() - 15 * 60 * 1000);
    const stuckRides = await prisma.ride.count({
      where: { status: 'searching', requestedAt: { lt: stuckAt } }
    });
    results.stuckRides = { status: stuckRides > 0 ? 'warning' : 'ok', count: stuckRides };
  } catch (err) {
    results.stuckRides = { status: 'error' };
  }

  // Google Maps API
  try {
    const key = process.env.GOOGLE_MAPS_KEY;
    if (!key) throw new Error('No key');
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=48.8566,2.3522&key=${key}`);
    const d = await r.json();
    results.googleMaps = { status: d.status === 'OK' ? 'ok' : 'warning', googleStatus: d.status };
  } catch (err) {
    results.googleMaps = { status: 'error', error: err.message };
  }

  // Supabase Storage — vérifié via la DB Prisma (même infra)
  // Si la DB est OK, le Storage est OK (même projet Supabase)
  results.supabaseStorage = {
    status: results.database?.status === 'ok' ? 'ok' : 'warning',
  };

  const allOk = Object.values(results).every(s => s.status === 'ok');
  const hasWarning = Object.values(results).some(s => s.status === 'warning');

  res.json({
    success: true,
    overall: allOk ? 'ok' : hasWarning ? 'warning' : 'degraded',
    uptime: process.uptime(),
    checkedAt: new Date().toISOString(),
    services: results,
  });
});

// ── GET /admin/notifications — historique des notifications ───────────
router.get('/notifications', ...adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 50, type, userId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (type) where.type = type;
    if (userId) where.userId = userId;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true, phone: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.notification.count({ where }),
    ]);

    // Stats par type
    const stats = await prisma.notification.groupBy({
      by: ['type'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    res.json({ success: true, notifications, total, stats,
      pagination: { page: parseInt(page), total, pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /admin/notifications/send — notification système globale ─────
router.post('/notifications/send', ...adminOnly, requireAdminRole('admin'), async (req, res) => {
  try {
    const { title, body, targetRole, userIds } = req.body;
    if (!title || !body) return res.status(400).json({ success: false, message: 'title et body requis' });

    let users = [];
    if (userIds?.length) {
      users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, pushToken: true } });
    } else if (targetRole) {
      users = await prisma.user.findMany({ where: { role: targetRole, isActive: true }, select: { id: true, pushToken: true } });
    } else {
      users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, pushToken: true } });
    }

    let sent = 0;
    for (const user of users) {
      await sendPushNotification(user.id, { type: 'system', title, body });
      sent++;
    }

    res.json({ success: true, sent, total: users.length });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /admin/metrics — métriques plateforme + incohérences ─────────
router.get('/metrics', ...adminOnly, async (req, res) => {
  try {
    const now = new Date();
    const stuckAt = new Date(now.getTime() - 15 * 60 * 1000);
    const today = new Date(now.setHours(0, 0, 0, 0));

    const [
      stuckRides, busyDriversNoRide, pendingDocs,
      todaySignups, avgRidePrice, cancellationRate,
      onlineDrivers, totalSearching,
    ] = await Promise.all([
      // Courses bloquées en searching > 15min
      prisma.ride.findMany({
        where: { status: 'searching', requestedAt: { lt: stuckAt } },
        select: { id: true, pickupAddress: true, requestedAt: true, client: { select: { firstName: true, phone: true } } },
      }),
      // Chauffeurs en busy sans course active
      prisma.$queryRaw`
        SELECT d.id, u.first_name, u.phone FROM drivers d
        JOIN users u ON u.id = d.user_id
        WHERE d.availability = 'busy'
        AND NOT EXISTS (
          SELECT 1 FROM rides r WHERE r.driver_id = d.id
          AND r.status IN ('accepted','driver_en_route','arrived','in_progress')
        )
      `,
      // Documents en attente de validation
      prisma.driverDocument.count({ where: { status: 'pending' } }),
      // Inscriptions aujourd'hui
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      // Prix moyen des courses
      prisma.ride.aggregate({ where: { status: 'completed' }, _avg: { finalPrice: true } }),
      // Taux annulation
      prisma.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE status = 'cancelled') * 100.0 / NULLIF(COUNT(*), 0) as rate
        FROM rides WHERE created_at >= NOW() - INTERVAL '7 days'
      `,
      prisma.driver.count({ where: { availability: 'online' } }),
      prisma.ride.count({ where: { status: 'searching' } }),
    ]);

    res.json({
      success: true,
      metrics: {
        stuckRides: { count: stuckRides.length, rides: stuckRides },
        inconsistencies: { busyDriversNoRide },
        pendingDocuments: pendingDocs,
        todaySignups,
        avgRidePrice: parseFloat(avgRidePrice._avg.finalPrice || 0).toFixed(2),
        cancellationRate7d: parseFloat(cancellationRate[0]?.rate || 0).toFixed(1) + '%',
        onlineDrivers,
        totalSearching,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PUT /admin/rides/:id/force-cancel — forcer l'annulation ──────────
router.put('/rides/:id/force-cancel', ...adminId, requireAdminRole('operations'), auditLog('force_cancel_ride'), async (req, res) => {
  try {
    const { reason = 'Annulée par l\'administration' } = req.body;
    const ride = await prisma.ride.findUnique({
      where: { id: req.params.id },
      include: { driver: true }
    });

    if (!ride) return res.status(404).json({ success: false, message: 'Course introuvable' });
    if (['completed', 'cancelled'].includes(ride.status)) {
      return res.status(409).json({ success: false, message: 'Course déjà terminée ou annulée' });
    }

    const updated = await prisma.ride.update({
      where: { id: req.params.id },
      data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: req.user.id, cancelReason: reason }
    });

    if (ride.driver) {
      await prisma.driver.update({
        where: { id: ride.driver.id },
        data: { availability: 'online' }
      });
    }

    const io = req.app.get('io');
    if (io) io.to(`ride_${req.params.id}`).emit('ride_status_changed', { rideId: req.params.id, status: 'cancelled' });

    res.json({ success: true, ride: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /admin/rides/cleanup-stuck — nettoyer les courses bloquées ───
router.post('/rides/cleanup-stuck', ...adminOnly, requireAdminRole('operations'), auditLog('cleanup_stuck_rides'), async (req, res) => {
  try {
    const stuckAt = new Date(Date.now() - 15 * 60 * 1000);
    const result = await prisma.ride.updateMany({
      where: { status: 'searching', requestedAt: { lt: stuckAt } },
      data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'Timeout automatique — aucun chauffeur disponible' }
    });
    res.json({ success: true, cancelled: result.count, message: `${result.count} course(s) bloquée(s) annulée(s)` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /admin/audit-log — journal des actions admin ─────────────────
router.get('/audit-log', ...adminOnly, requireAdminRole('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const logs = await prisma.$queryRaw`
      SELECT
        al.id, al.action, al.target_id, al.target_type, al.details, al.ip, al.created_at,
        u.first_name, u.last_name, u.email
      FROM admin_audit_logs al
      JOIN users u ON u.id = al.admin_id
      ORDER BY al.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;

    const [{ count }] = await prisma.$queryRaw`SELECT COUNT(*) FROM admin_audit_logs`;

    res.json({ success: true, logs, total: parseInt(count),
      pagination: { page: parseInt(page), total: parseInt(count), pages: Math.ceil(parseInt(count) / parseInt(limit)) }
    });
  } catch {
    // Table peut ne pas exister
    res.json({ success: true, logs: [], total: 0, pagination: { page: 1, total: 0, pages: 0 } });
  }
});

// ── GET /admin/me — rôle admin de l'utilisateur connecté ─────────────
router.get('/me', ...adminOnly, async (req, res) => {
  try {
    const [row] = await prisma.$queryRaw`
      SELECT COALESCE(admin_role, 'admin') as admin_role FROM users WHERE id = ${req.user.id}
    `;
    res.json({ success: true, adminRole: row?.admin_role || 'admin', user: req.user });
  } catch {
    res.json({ success: true, adminRole: 'admin', user: req.user });
  }
});

// ── PUT /admin/users/:id/set-role — changer le rôle admin ────────────
router.put('/users/:id/set-role', ...adminId, requireAdminRole('superadmin'), auditLog('set_admin_role'), async (req, res) => {
  try {
    const { adminRole } = req.body;
    const validRoles = ['support', 'operations', 'finance', 'admin', 'superadmin'];
    if (!validRoles.includes(adminRole)) {
      return res.status(400).json({ success: false, message: 'Rôle invalide' });
    }
    await prisma.$executeRaw`UPDATE users SET admin_role = ${adminRole} WHERE id = ${req.params.id}`;
    res.json({ success: true, adminRole });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /admin/fix-phones — normalise les numéros +330xxx → +33xxx ──
// Superadmin uniquement — modifie les numéros de tous les utilisateurs
router.post('/fix-phones', ...adminOnly, requireAdminRole('superadmin'), auditLog('fix_phones'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { phone: { startsWith: '+330' } }
    });
    let fixed = 0;
    for (const user of users) {
      const newPhone = '+33' + user.phone.slice(4);
      // Vérifier qu'il n'y a pas déjà un user avec ce numéro
      const existing = await prisma.user.findUnique({ where: { phone: newPhone } });
      if (!existing) {
        await prisma.user.update({ where: { id: user.id }, data: { phone: newPhone } });
        // Mettre à jour aussi les OTP codes
        await prisma.otpCode.updateMany({ where: { phone: user.phone }, data: { phone: newPhone } });
        fixed++;
      }
    }
    res.json({ success: true, fixed, total: users.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// TERMINATOR — Endpoints de supervision de la sécurité
// ══════════════════════════════════════════════════════════════

// ── GET /admin/terminator/status — statut complet du système ──
router.get('/terminator/status', ...adminOnly, requireAdminRole('admin'), async (req, res) => {
  res.json({ success: true, terminator: terminator.getFullStatus() });
});

// ── GET /admin/terminator/banned-ips — IPs bannies ────────────
router.get('/terminator/banned-ips', ...adminOnly, requireAdminRole('admin'), (req, res) => {
  res.json({ success: true, bannedIps: terminator.listBannedIps() });
});

// ── DELETE /admin/terminator/ban/:ip — débloquer une IP ───────
router.delete('/terminator/ban/:ip', ...adminOnly, requireAdminRole('superadmin'),
  auditLog('unban_ip'),
  (req, res) => {
    terminator.unbanIp(req.params.ip);
    res.json({ success: true, message: `IP ${req.params.ip} débloquée` });
  }
);

// ── POST /admin/terminator/ban — bannir manuellement une IP ───
router.post('/terminator/ban', ...adminOnly, requireAdminRole('superadmin'),
  auditLog('manual_ban_ip'),
  (req, res) => {
    const { ip, reason = 'manual_ban' } = req.body;
    if (!ip) return res.status(400).json({ success: false, message: 'IP requise' });
    // Forcer le ban en enregistrant assez d'incidents
    for (let i = 0; i < 25; i++) terminator.recordIncident(ip, reason);
    res.json({ success: true, message: `IP ${ip} bannie` });
  }
);

module.exports = router;
