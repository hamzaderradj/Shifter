/**
 * TERMINATOR — Phase 3 : Device Fingerprint
 *
 * Génère un fingerprintId côté serveur à partir des headers de la requête.
 * Les apps mobiles peuvent aussi envoyer X-Device-Id (calculé côté client).
 *
 * Composants du fingerprint :
 *   - X-Device-Id   header envoyé par l'app (priorité)
 *   - User-Agent    → OS + Device
 *   - Accept-Language → Locale
 *   - X-App-Version → Version de l'app
 *   - X-Platform    → ios | android
 *   - X-Timezone    → Timezone appareil
 *
 * Utilisations :
 *   - Détecter 50+ comptes sur le même appareil → HARD_BAN
 *   - Enrichir les security_events avec fingerprintId
 *   - Bloquer les appareils bannis
 *
 * Note : le fingerprint est une approximation — pas une empreinte cryptographique.
 * Suffisant pour détecter les abus évidents, pas pour l'authentification.
 */

const crypto  = require('crypto');
const logger  = require('../../services/logger');
const { logSecurityEvent } = require('./securityLogger');
const { recordIncident }   = require('./ipFirewall');

// Seuil : nombre de comptes différents avant HARD_BAN sur ce device
const MAX_ACCOUNTS_PER_DEVICE = 50;

// Cache mémoire des fingerprints bannis (évite une query DB par requête)
const bannedFingerprints = new Set();
let bannedFpLoaded = false;

// Lazy-load Prisma
let _prisma = null;
const db = () => {
  if (!_prisma) _prisma = require('../../lib/prisma');
  return _prisma;
};

/**
 * Charger les fingerprints bannis depuis la DB au démarrage.
 */
const loadBannedFingerprints = async () => {
  try {
    const rows = await db().$queryRaw`
      SELECT fingerprint_id FROM device_fingerprints WHERE is_banned = true
    `;
    for (const row of rows) bannedFingerprints.add(row.fingerprint_id);
    if (rows.length > 0) logger.info(`[FP] ${rows.length} fingerprint(s) banni(s) chargé(s)`);
    bannedFpLoaded = true;
  } catch (err) {
    logger.warn('[FP] Chargement fingerprints bannis échoué', { error: err.message });
  }
};

// Chargement différé 3s après démarrage
setTimeout(loadBannedFingerprints, 3000);

/**
 * Calculer le fingerprintId depuis les headers de la requête.
 */
const computeFingerprint = (req) => {
  // Priorité : header envoyé par l'app
  const deviceId = req.headers['x-device-id'];
  if (deviceId && typeof deviceId === 'string' && deviceId.length >= 8 && deviceId.length <= 128) {
    return `app_${crypto.createHash('sha256').update(deviceId).digest('hex').slice(0, 32)}`;
  }

  // Fallback : calcul serveur depuis les headers
  const components = [
    req.headers['user-agent']       || '',
    req.headers['accept-language']  || '',
    req.headers['x-app-version']    || '',
    req.headers['x-platform']       || '',
    req.headers['x-timezone']       || '',
  ].join('|');

  if (components === '||||') return null; // Aucun header disponible

  return `srv_${crypto.createHash('sha256').update(components).digest('hex').slice(0, 32)}`;
};

/**
 * Extraire les infos device depuis les headers (pour stockage en DB).
 */
const extractDeviceInfo = (req) => ({
  userAgent:    req.headers['user-agent']      || null,
  language:     req.headers['accept-language'] || null,
  appVersion:   req.headers['x-app-version']   || null,
  platform:     req.headers['x-platform']      || null,
  timezone:     req.headers['x-timezone']      || null,
  deviceId:     req.headers['x-device-id']     || null,
});

/**
 * Mettre à jour ou créer l'entrée fingerprint en DB pour un userId.
 * Non bloquant (fire-and-forget).
 */
const trackFingerprint = (fingerprintId, userId, req) => {
  if (!fingerprintId || !userId) return;
  const deviceInfo = extractDeviceInfo(req);

  setImmediate(async () => {
    try {
      const prisma = db();

      // Upsert : créer ou mettre à jour
      await prisma.$executeRaw`
        INSERT INTO device_fingerprints (fingerprint_id, user_ids, device_info, last_seen, account_count)
        VALUES (
          ${fingerprintId},
          ARRAY[${userId}]::TEXT[],
          ${JSON.stringify(deviceInfo)}::jsonb,
          NOW(),
          1
        )
        ON CONFLICT (fingerprint_id) DO UPDATE SET
          user_ids      = CASE
            WHEN NOT (${userId} = ANY(device_fingerprints.user_ids))
            THEN array_append(device_fingerprints.user_ids, ${userId})
            ELSE device_fingerprints.user_ids
          END,
          account_count = array_length(
            CASE
              WHEN NOT (${userId} = ANY(device_fingerprints.user_ids))
              THEN array_append(device_fingerprints.user_ids, ${userId})
              ELSE device_fingerprints.user_ids
            END,
            1
          ),
          last_seen     = NOW(),
          updated_at    = NOW()
      `;

      // Vérifier si le seuil de comptes est atteint
      const [row] = await prisma.$queryRaw`
        SELECT account_count, is_banned FROM device_fingerprints
        WHERE fingerprint_id = ${fingerprintId}
      `;

      if (row && !row.is_banned && row.account_count >= MAX_ACCOUNTS_PER_DEVICE) {
        // HARD_BAN l'appareil
        await prisma.$executeRaw`
          UPDATE device_fingerprints
          SET is_banned = true, ban_reason = ${`${row.account_count} comptes créés sur cet appareil`}
          WHERE fingerprint_id = ${fingerprintId}
        `;
        bannedFingerprints.add(fingerprintId);
        logger.security(`[FP] HARD_BAN device: ${fingerprintId} (${row.account_count} comptes)`);
        logSecurityEvent({
          action: 'multi_account_device',
          ip: req.ip, fingerprintId, userId,
          riskScore: 85,
          details: { accountCount: row.account_count },
        });

        // Mettre à jour fingerprintId sur tous les users associés
        await prisma.user.updateMany({
          where: { fingerprintId },
          data:  { isActive: false },
        }).catch(() => {});
      }
    } catch (err) {
      logger.warn('[FP] trackFingerprint error', { error: err.message });
    }
  });
};

/**
 * Middleware Express principal.
 * Calcule le fingerprintId et l'injecte dans req.
 * Bloque si l'appareil est banni.
 */
const deviceFingerprintMiddleware = (req, res, next) => {
  const fp = computeFingerprint(req);
  req.fingerprintId = fp;

  if (!fp) return next();

  // Vérifier le ban en mémoire (O(1))
  if (bannedFingerprints.has(fp)) {
    logger.security('[FP] Appareil banni bloqué', { fp, ip: req.ip });
    logSecurityEvent({ action: 'device_banned', ip: req.ip, fingerprintId: fp });
    return res.status(403).json({ success: false, message: 'Accès refusé' });
  }

  next();
};

module.exports = {
  deviceFingerprintMiddleware,
  trackFingerprint,
  computeFingerprint,
  loadBannedFingerprints,
  bannedFingerprints,
};
