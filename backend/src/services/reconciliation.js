/**
 * RECONCILIATION SERVICE — Réparation automatique des états incohérents
 *
 * Appelé au démarrage du backend, avant d'accepter les premières connexions.
 *
 * Corrige les situations causées par :
 *   - Redémarrage du backend pendant une course active
 *   - Crash / OOM du processus
 *   - Perte de connexion réseau prolongée
 *   - Bug applicatif laissant un état intermédiaire
 *
 * Scénarios traités :
 *   1. Courses en `searching` trop vieilles (> 10min)  → cancelled
 *   2. Courses en `searching` récentes (< 10min)       → relance offre
 *   3. Courses en accepted/en_route/arrived bloquées   → cancelled après 1h
 *   4. Courses en `in_progress` trop longues (> 4h)   → alerte admin
 *   5. Chauffeurs `busy` sans course active            → remis online
 */

const prisma = require('../lib/prisma');
const logger  = require('./logger');

// ── Seuils ────────────────────────────────────────────────────
const STUCK_SEARCHING_MS   = 10 * 60 * 1000;    // 10 min
const STUCK_ACTIVE_MS      = 60 * 60 * 1000;    //  1 h
const STUCK_IN_PROGRESS_MS =  4 * 60 * 60 * 1000; //  4 h

// ─────────────────────────────────────────────────────────────────────────────

const reconcile = async (io) => {
  logger.info('[RECON] ━━━━━━ Démarrage réconciliation ━━━━━━');
  const t0 = Date.now();

  try {
    const [s, a, ip, d] = await Promise.all([
      _reconcileSearching(io),
      _reconcileActive(io),
      _reconcileInProgress(io),
      _reconcileBlockedDrivers(),
    ]);

    logger.info(
      `[RECON] ✓ Terminé en ${Date.now() - t0}ms — ` +
      `searching: ${s.cancelled}↓ ${s.restarted}↺ | ` +
      `active: ${a.cancelled}↓ | ` +
      `in_progress: ${ip.alerts}⚠ | ` +
      `drivers: ${d.freed}↑`
    );
  } catch (err) {
    logger.error('[RECON] Erreur critique', { error: err.message, stack: err.stack });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Courses en `searching`
// ─────────────────────────────────────────────────────────────────────────────

const _reconcileSearching = async (io) => {
  const cutoff = new Date(Date.now() - STUCK_SEARCHING_MS);

  const [stale, recent] = await Promise.all([
    prisma.ride.findMany({
      where: { status: 'searching', requestedAt: { lt: cutoff } },
      select: { id: true, clientId: true, requestedAt: true },
    }),
    prisma.ride.findMany({
      where: { status: 'searching', requestedAt: { gte: cutoff } },
      select: { id: true },
    }),
  ]);

  // Annuler les courses trop vieilles
  for (const ride of stale) {
    const stuckMin = Math.round((Date.now() - ride.requestedAt.getTime()) / 60000);
    logger.info(`[RECON] searching → cancelled: ride ${ride.id} (${stuckMin}min sans chauffeur)`);

    await prisma.ride.update({
      where: { id: ride.id },
      data: {
        status:      'cancelled',
        cancelledAt: new Date(),
        cancelReason: 'Aucun chauffeur disponible (timeout système)',
      },
    }).catch((e) => logger.error(`[RECON] DB cancel failed: ${e.message}`));

    if (io) {
      io.to(`ride_${ride.id}`).emit('ride_status_changed', {
        rideId: ride.id, status: 'cancelled', reason: 'Aucun chauffeur disponible', timestamp: Date.now(),
      });
      io.to(`ride_${ride.id}`).emit('ride_cancelled', {
        rideId: ride.id, reason: 'Aucun chauffeur disponible', timestamp: Date.now(),
      });
      io.to('admin_room').emit('ride_reconciled', {
        rideId: ride.id, from: 'searching', action: 'cancelled', reason: 'timeout', timestamp: Date.now(),
      });
    }

    const { sendPushNotification } = require('./notifications');
    sendPushNotification(ride.clientId, {
      type: 'ride_cancelled', title: '❌ Course annulée',
      body: 'Aucun chauffeur disponible dans votre zone',
      data: { rideId: ride.id, action: 'ride_cancelled' },
    }).catch(() => {});
  }

  // Relancer les courses récentes (perdues au restart)
  if (recent.length > 0) {
    logger.info(`[RECON] searching récentes: ${recent.length} course(s) → relance offer loop`);
    // Import tardif pour éviter la dépendance circulaire
    const { offerRideToNextDriver } = require('./rideManager');
    for (const r of recent) {
      setTimeout(() => offerRideToNextDriver(r.id, io).catch(() => {}), 500);
    }
  }

  return { cancelled: stale.length, restarted: recent.length };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Courses active bloquées (accepted / driver_en_route / arrived)
// ─────────────────────────────────────────────────────────────────────────────

const _reconcileActive = async (io) => {
  const cutoff = new Date(Date.now() - STUCK_ACTIVE_MS);

  const stuck = await prisma.ride.findMany({
    where: {
      status: { in: ['accepted', 'driver_en_route', 'arrived'] },
      updatedAt: { lt: cutoff },
    },
    include: { driver: { select: { id: true, userId: true } } },
  });

  for (const ride of stuck) {
    const stuckMin = Math.round((Date.now() - ride.updatedAt.getTime()) / 60000);
    logger.info(`[RECON] ${ride.status} → cancelled: ride ${ride.id} (${stuckMin}min bloqué)`);

    await prisma.ride.update({
      where: { id: ride.id },
      data: {
        status:      'cancelled',
        cancelledAt: new Date(),
        cancelReason: 'Course bloquée — annulation automatique système',
      },
    }).catch((e) => logger.error(`[RECON] DB cancel failed: ${e.message}`));

    if (ride.driver) {
      await prisma.driver.update({
        where: { id: ride.driver.id },
        data:  { availability: 'online' },
      }).catch(() => {});
    }

    if (io) {
      io.to(`ride_${ride.id}`).emit('ride_status_changed', {
        rideId: ride.id, status: 'cancelled', reason: 'Course annulée par le système', timestamp: Date.now(),
      });
      io.to(`ride_${ride.id}`).emit('ride_cancelled', {
        rideId: ride.id, reason: 'Course annulée par le système', timestamp: Date.now(),
      });
      io.to('admin_room').emit('ride_reconciled', {
        rideId: ride.id, from: ride.status, action: 'cancelled', reason: 'stuck_active', timestamp: Date.now(),
      });
    }
  }

  return { cancelled: stuck.length };
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Courses in_progress trop longues → alerte admin (sans annulation auto)
// ─────────────────────────────────────────────────────────────────────────────

const _reconcileInProgress = async (io) => {
  const cutoff = new Date(Date.now() - STUCK_IN_PROGRESS_MS);

  const stuck = await prisma.ride.findMany({
    where: {
      status: 'in_progress',
      pickedUpAt: { lt: cutoff },
    },
    select: { id: true, clientId: true, driverId: true, pickedUpAt: true },
  });

  for (const ride of stuck) {
    const stuckH = Math.round((Date.now() - ride.pickedUpAt.getTime()) / 3600000);
    logger.warn(`[RECON] in_progress stuck: ride ${ride.id} depuis ${stuckH}h — alerte admin`);
    if (io) {
      io.to('admin_room').emit('ride_stuck_alert', {
        rideId:     ride.id,
        status:     'in_progress',
        stuckHours: stuckH,
        message:    `⚠️ Course en cours depuis ${stuckH}h — intervention manuelle requise`,
        timestamp:  Date.now(),
      });
    }
  }

  return { alerts: stuck.length };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Chauffeurs busy sans course active → remis online
// ─────────────────────────────────────────────────────────────────────────────

const _reconcileBlockedDrivers = async () => {
  const busyDrivers = await prisma.driver.findMany({
    where: { availability: 'busy' },
    select: { id: true, userId: true },
  });

  let freed = 0;
  for (const driver of busyDrivers) {
    const activeRide = await prisma.ride.findFirst({
      where: {
        driverId: driver.id,
        status: { in: ['accepted', 'driver_en_route', 'arrived', 'in_progress'] },
      },
      select: { id: true },
    });

    if (!activeRide) {
      await prisma.driver.update({
        where: { id: driver.id },
        data:  { availability: 'online' },
      }).catch(() => {});
      freed++;
      logger.info(`[RECON] driver ${driver.id}: busy sans course → online`);
    }
  }

  return { freed };
};

module.exports = { reconcile };
