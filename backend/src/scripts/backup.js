/**
 * BACKUP AUTOMATIQUE — Phase 10
 *
 * Export quotidien des données critiques vers Supabase Storage.
 * RPO < 24h garanti par le cron job (tous les jours à 2h UTC).
 *
 * Stratégie :
 *   - Export JSON des tables critiques via Prisma (pas de pg_dump nécessaire)
 *   - Compression gzip via zlib
 *   - Upload vers Supabase Storage (bucket 'backups', créé automatiquement)
 *   - Rotation : conservation des 30 derniers backups
 *
 * Tables exportées :
 *   - users (sans push_token)
 *   - drivers
 *   - rides (complètes + annulées, 90 derniers jours)
 *   - ratings
 *   - sos_alerts
 *   - security_bans
 *
 * Tables NON exportées (données reconstituables ou sensibles) :
 *   - otp_codes (éphémères)
 *   - refresh_tokens (éphémères)
 *   - notifications (volumineuses, peu critiques)
 *   - ride_tracking (très volumineuse)
 */

const zlib       = require('zlib');
const { promisify } = require('util');
const gzip       = promisify(zlib.gzip);
const { createClient } = require('@supabase/supabase-js');

let _prisma = null;
const db = () => {
  if (!_prisma) _prisma = require('../lib/prisma');
  return _prisma;
};

const logger = require('../services/logger');

const BACKUP_BUCKET = 'backups';

const getSupabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: require('ws') } }
);

/**
 * Créer le bucket backups si inexistant.
 */
const ensureBucket = async (supabase) => {
  const { data, error } = await supabase.storage.getBucket(BACKUP_BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BACKUP_BUCKET, { public: false });
    logger.info('[BACKUP] Bucket "backups" créé');
  }
};

/**
 * Exporter toutes les tables critiques.
 */
const exportData = async () => {
  const prisma  = db();
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [users, drivers, rides, ratings, sosAlerts, securityBans] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true, phone: true, email: true, firstName: true, lastName: true,
        role: true, isActive: true, isVerified: true, createdAt: true, lastLoginAt: true,
        // pushToken exclu (sensible, reconstituable par les apps)
      }
    }),
    prisma.driver.findMany({
      include: { documents: { select: { id: true, type: true, status: true, fileUrl: true } } }
    }),
    prisma.ride.findMany({
      where: { createdAt: { gte: since90 } },
      include: { ratings: true }
    }),
    prisma.rating.findMany({ where: { createdAt: { gte: since90 } } }),
    prisma.$queryRaw`SELECT * FROM sos_alerts ORDER BY created_at DESC LIMIT 1000`,
    prisma.$queryRaw`SELECT ip, level, incidents, banned_until FROM security_bans WHERE banned_until > NOW()`,
  ]);

  return { users, drivers, rides, ratings, sosAlerts, securityBans };
};

/**
 * Supprimer les anciens backups (conserver les 30 derniers).
 */
const rotateBackups = async (supabase) => {
  try {
    const { data: files } = await supabase.storage.from(BACKUP_BUCKET).list('daily', {
      sortBy: { column: 'created_at', order: 'asc' }
    });
    if (files && files.length > 30) {
      const toDelete = files.slice(0, files.length - 30).map((f) => `daily/${f.name}`);
      await supabase.storage.from(BACKUP_BUCKET).remove(toDelete);
      logger.info(`[BACKUP] Rotation : ${toDelete.length} ancien(s) backup(s) supprimé(s)`);
    }
  } catch (err) {
    logger.warn('[BACKUP] Rotation échouée', { error: err.message });
  }
};

/**
 * Exécuter le backup complet.
 * Appelé par le cron job tous les jours à 2h UTC.
 */
const runBackup = async () => {
  const startTime = Date.now();
  logger.info('[BACKUP] ━━━ Démarrage backup quotidien ━━━');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logger.warn('[BACKUP] Supabase non configuré — backup ignoré');
    return { success: false, reason: 'supabase_not_configured' };
  }

  try {
    const supabase = getSupabase();
    await ensureBucket(supabase);

    // Export
    logger.info('[BACKUP] Export des données en cours...');
    const data = await exportData();

    // Stats
    const stats = {
      users:        data.users.length,
      drivers:      data.drivers.length,
      rides:        data.rides.length,
      ratings:      data.ratings.length,
      sosAlerts:    data.sosAlerts.length,
      securityBans: data.securityBans.length,
      exportedAt:   new Date().toISOString(),
      backupVersion: 'v1',
    };

    const payload = JSON.stringify({ stats, data });

    // Compression
    const compressed = await gzip(Buffer.from(payload, 'utf8'));
    const sizeKb = Math.round(compressed.length / 1024);

    // Nom du fichier : daily/2026-06-04T02-00-00Z.json.gz
    const filename = `daily/${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}Z.json.gz`;

    // Upload
    const { error } = await supabase.storage
      .from(BACKUP_BUCKET)
      .upload(filename, compressed, { contentType: 'application/gzip', upsert: false });

    if (error) throw new Error(`Upload échoué: ${error.message}`);

    // Rotation
    await rotateBackups(supabase);

    const elapsed = Date.now() - startTime;
    logger.info(`[BACKUP] ✓ Terminé en ${elapsed}ms — ${sizeKb}KB → ${filename}`, stats);
    return { success: true, filename, sizeKb, stats, elapsed };
  } catch (err) {
    logger.error('[BACKUP] ✗ Échec backup', { error: err.message });
    return { success: false, error: err.message };
  }
};

module.exports = { runBackup };
