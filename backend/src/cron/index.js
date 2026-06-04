/**
 * TERMINATOR — Cron Jobs de maintenance et sécurité
 *
 * Tâches automatiques :
 *   - Nettoyage OTP expirés
 *   - Nettoyage refresh tokens révoqués/expirés
 *   - Timeout courses searching > 10min + notifications (P1.1)
 *   - Vérification intégrité des états toutes les 5min (P1.2)
 *   - Nettoyage notifications lues > 30 jours
 *   - Rapport de santé quotidien
 */

const cron   = require('node-cron');
const prisma = require('../lib/prisma');
const logger = require('../services/logger');

// ── Nettoyage OTP expirés — toutes les heures ─────────────────
cron.schedule('0 * * * *', async () => {
  try {
    const result = await prisma.otpCode.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } }
    });
    if (result.count > 0) logger.info(`[CRON] OTP expirés supprimés: ${result.count}`);
  } catch (err) {
    logger.error('[CRON] Erreur nettoyage OTP', { error: err.message });
  }
});

// ── Nettoyage refresh tokens — toutes les 6h ──────────────────
cron.schedule('0 */6 * * *', async () => {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revoked: true, createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
        ]
      }
    });
    if (result.count > 0) logger.info(`[CRON] Refresh tokens nettoyés: ${result.count}`);
  } catch (err) {
    logger.error('[CRON] Erreur nettoyage refresh tokens', { error: err.message });
  }
});

// ── Timeout courses bloquées + notifications — toutes les 5min (P1.1) ────────
// CORRECTION P1.1 : l'ancien updateMany était silencieux (pas de socket/push).
// Les clients restaient bloqués sur "Recherche en cours" sans jamais être notifiés.
cron.schedule('*/5 * * * *', async () => {
  try {
    const stuckAt = new Date(Date.now() - 10 * 60 * 1000);

    const stuckRides = await prisma.ride.findMany({
      where: { status: 'searching', requestedAt: { lt: stuckAt } },
      select: { id: true, clientId: true },
    });

    if (stuckRides.length === 0) return;

    // Mise à jour en masse
    await prisma.ride.updateMany({
      where: { id: { in: stuckRides.map((r) => r.id) } },
      data: {
        status:      'cancelled',
        cancelledAt: new Date(),
        cancelReason: 'Aucun chauffeur disponible — timeout automatique (10 min)',
      },
    });

    logger.info(`[CRON] Courses timeout annulées: ${stuckRides.length}`);

    // Notifier chaque client via socket + push (différence clé vs avant)
    const rideSyncService = require('../services/rideSyncService');
    const { sendPushNotification } = require('../services/notifications');

    for (const ride of stuckRides) {
      const reason = 'Aucun chauffeur disponible dans votre zone';

      // Socket → ride room + admin room
      const io = rideSyncService.getIo();
      if (io) {
        io.to(`ride_${ride.id}`).emit('ride_status_changed', {
          rideId: ride.id, status: 'cancelled', reason, timestamp: Date.now(),
        });
        io.to(`ride_${ride.id}`).emit('ride_cancelled', {
          rideId: ride.id, reason, timestamp: Date.now(),
        });
        io.to('admin_room').emit('ride_status_changed', {
          rideId: ride.id, status: 'cancelled', reason,
          _source: 'cron_timeout', timestamp: Date.now(),
        });
      }

      // Push notification au client
      sendPushNotification(ride.clientId, {
        type:  'ride_cancelled',
        title: '❌ Course annulée',
        body:  reason,
        data:  { rideId: ride.id, action: 'ride_cancelled' },
      }).catch(() => {});
    }
  } catch (err) {
    logger.error('[CRON] Erreur timeout courses', { error: err.message });
  }
});

// ── Vérification intégrité des états — toutes les 5min (P1.2) ─────────────────
// Détecte et répare les états impossibles mid-runtime sans attendre un restart.
// Avant : uniquement à la réconciliation au démarrage.
cron.schedule('*/5 * * * *', async () => {
  try {
    // 1. Drivers busy sans course active → libérer
    const busyDrivers = await prisma.driver.findMany({
      where: { availability: 'busy' },
      select: { id: true, userId: true },
    });

    let freed = 0;
    for (const driver of busyDrivers) {
      const hasActiveRide = await prisma.ride.findFirst({
        where: {
          driverId: driver.id,
          status: { in: ['accepted', 'driver_en_route', 'arrived', 'in_progress'] },
        },
        select: { id: true },
      });
      if (!hasActiveRide) {
        await prisma.driver.update({
          where: { id: driver.id },
          data:  { availability: 'online' },
        });
        freed++;
        logger.info(`[CRON] Intégrité: driver ${driver.id} busy sans ride → online`);
      }
    }

    // 2. Courses accepted/en_route/arrived bloquées depuis > 2h sans mise à jour
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const blockedRides = await prisma.ride.findMany({
      where: {
        status: { in: ['accepted', 'driver_en_route', 'arrived'] },
        updatedAt: { lt: twoHoursAgo },
      },
      include: { driver: { select: { id: true, userId: true } } },
    });

    for (const ride of blockedRides) {
      const stuckMin = Math.round((Date.now() - ride.updatedAt.getTime()) / 60000);
      logger.warn(`[CRON] Intégrité: ride ${ride.id} bloquée en ${ride.status} depuis ${stuckMin}min`);

      await prisma.ride.update({
        where: { id: ride.id },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'Course bloquée — annulation automatique système' },
      });

      if (ride.driver) {
        await prisma.driver.update({ where: { id: ride.driver.id }, data: { availability: 'online' } }).catch(() => {});
      }

      const rideSyncService = require('../services/rideSyncService');
      const io = rideSyncService.getIo();
      if (io) {
        io.to(`ride_${ride.id}`).emit('ride_cancelled', { rideId: ride.id, reason: 'Course annulée par le système' });
        io.to('admin_room').emit('ride_reconciled', {
          rideId: ride.id, from: ride.status, action: 'cancelled', reason: 'stuck_runtime', timestamp: Date.now(),
        });
      }
    }

    if (freed > 0 || blockedRides.length > 0) {
      logger.info(`[CRON] Intégrité: ${freed} driver(s) libéré(s), ${blockedRides.length} ride(s) annulée(s)`);
    }
  } catch (err) {
    logger.error('[CRON] Erreur vérification intégrité', { error: err.message });
  }
});

// ── Nettoyage notifications lues > 30 jours — tous les jours à 3h ──
cron.schedule('0 3 * * *', async () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await prisma.notification.deleteMany({
      where: { isRead: true, createdAt: { lt: cutoff } }
    });
    if (result.count > 0) logger.info(`[CRON] Notifications supprimées: ${result.count}`);
  } catch (err) {
    logger.error('[CRON] Erreur nettoyage notifications', { error: err.message });
  }
});

// ── Rapport de santé quotidien — tous les jours à 8h ──────────
cron.schedule('0 8 * * *', async () => {
  try {
    const [users, drivers, rides, activeRides, pendingDrivers, busyDrivers] = await Promise.all([
      prisma.user.count(),
      prisma.driver.count({ where: { status: 'approved' } }),
      prisma.ride.count({ where: { status: 'completed' } }),
      prisma.ride.count({ where: { status: { in: ['searching', 'accepted', 'driver_en_route', 'arrived', 'in_progress'] } } }),
      prisma.driver.count({ where: { status: 'pending' } }),
      prisma.driver.count({ where: { availability: 'busy' } }),
    ]);

    logger.info('[CRON] Rapport quotidien', {
      users, approvedDrivers: drivers, completedRides: rides,
      activeRides, pendingDrivers, busyDrivers,
    });
  } catch (err) {
    logger.error('[CRON] Erreur rapport quotidien', { error: err.message });
  }
});

logger.info('[CRON] Jobs planifiés: OTP, refresh tokens, timeout+notif courses, intégrité états, notifications, rapport');
