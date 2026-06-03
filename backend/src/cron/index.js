/**
 * TERMINATOR — Cron Jobs de maintenance et sécurité
 *
 * Tâches automatiques qui maintiennent la plateforme saine :
 *   - Nettoyage OTP expirés
 *   - Nettoyage refresh tokens révoqués/expirés
 *   - Timeout automatique des courses bloquées en "searching"
 *   - Nettoyage des notifications lues > 30 jours
 *   - Rapport de santé quotidien dans les logs
 */

const cron = require('node-cron');
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
          {
            revoked: true,
            createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          }
        ]
      }
    });
    if (result.count > 0) logger.info(`[CRON] Refresh tokens nettoyés: ${result.count}`);
  } catch (err) {
    logger.error('[CRON] Erreur nettoyage refresh tokens', { error: err.message });
  }
});

// ── Timeout courses bloquées — toutes les 5 min ───────────────
cron.schedule('*/5 * * * *', async () => {
  try {
    const stuckAt = new Date(Date.now() - 10 * 60 * 1000); // 10 min sans chauffeur
    const result = await prisma.ride.updateMany({
      where: {
        status: 'searching',
        requestedAt: { lt: stuckAt }
      },
      data: {
        status:      'cancelled',
        cancelledAt: new Date(),
        cancelReason: 'Aucun chauffeur disponible — timeout automatique (10 min)'
      }
    });
    if (result.count > 0) {
      logger.info(`[CRON] Courses timeout annulées: ${result.count}`);
    }
  } catch (err) {
    logger.error('[CRON] Erreur timeout courses', { error: err.message });
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
    const [users, drivers, rides, activeRides, pendingDrivers] = await Promise.all([
      prisma.user.count(),
      prisma.driver.count({ where: { status: 'approved' } }),
      prisma.ride.count({ where: { status: 'completed' } }),
      prisma.ride.count({ where: { status: { in: ['searching', 'accepted', 'driver_en_route', 'arrived', 'in_progress'] } } }),
      prisma.driver.count({ where: { status: 'pending' } }),
    ]);

    logger.info('[CRON] Rapport quotidien', {
      users, approvedDrivers: drivers, completedRides: rides,
      activeRides, pendingDrivers,
    });
  } catch (err) {
    logger.error('[CRON] Erreur rapport quotidien', { error: err.message });
  }
});

logger.info('[CRON] Jobs planifiés: OTP, refresh tokens, timeout courses, notifications, rapport quotidien');
