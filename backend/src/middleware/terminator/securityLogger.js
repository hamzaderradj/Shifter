/**
 * TERMINATOR T9 — Journal de sécurité IMMUABLE
 *
 * Enregistre tous les événements de sécurité dans la table `security_events`.
 * Règles :
 *   - Écriture uniquement (INSERT) — jamais de UPDATE ni DELETE
 *   - Immutabilité enforced au niveau DB par trigger PostgreSQL
 *   - Non bloquant : si l'écriture échoue, la requête continue
 *   - Async fire-and-forget
 *
 * RiskScore :
 *   0-20   INFO     — activité normale
 *   21-50  WARNING  — comportement suspect
 *   51-80  HIGH     — attaque probable
 *   81-100 CRITICAL — bannissement automatique
 */

const logger = require('../../services/logger');

let _prisma = null;
const db = () => {
  if (!_prisma) _prisma = require('../../lib/prisma');
  return _prisma;
};

// ── Actions connues et leurs scores par défaut ────────────────
const RISK_SCORES = {
  injection_attempt:      90,
  route_scan:             70,
  hard_ban:               85,
  soft_ban:               60,
  honeypot_access:        75,
  honeypot_repeat:        90,
  impossible_geolocation: 80,
  account_creation_surge: 85,
  otp_surge:              75,
  ride_creation_abuse:    65,
  scraping_detected:      70,
  rate_limit_exceeded:    50,
  admin_login_failed:     40,
  auth_failed:            30,
  forbidden:              25,
  unauthorized:           15,
  device_banned:          85,
  multi_account_device:   70,
  jwt_tamper:             90,
};

/**
 * Enregistrer un événement de sécurité.
 * Fire-and-forget — ne bloque jamais la requête.
 *
 * @param {object} event
 * @param {string} event.action      — type d'événement
 * @param {string} [event.ip]        — IP source
 * @param {string} [event.fingerprintId]
 * @param {string} [event.userId]
 * @param {number} [event.riskScore] — override du score
 * @param {object} [event.details]   — données additionnelles
 */
const logSecurityEvent = (event) => {
  const { action, ip, fingerprintId, userId, riskScore, details } = event;
  const score = riskScore ?? (RISK_SCORES[action] || 10);

  // Fire-and-forget — setImmediate pour ne pas bloquer le thread courant
  setImmediate(async () => {
    try {
      await db().$executeRaw`
        INSERT INTO security_events (ip, fingerprint_id, user_id, action, risk_score, details)
        VALUES (
          ${ip || null},
          ${fingerprintId || null},
          ${userId || null},
          ${action},
          ${score},
          ${details ? JSON.stringify(details) : null}::jsonb
        )
      `;
    } catch (err) {
      // Non bloquant — log uniquement si persistance échoue
      logger.warn('[T9] Impossible de persister security_event', { action, error: err.message });
    }
  });

  // Log structuré immédiat (synchrone)
  if (score >= 80) {
    logger.security(`[T9] CRITICAL: ${action}`, { ip, userId, fingerprintId, score, details });
  } else if (score >= 50) {
    logger.warn(`[T9] HIGH: ${action}`, { ip, userId, score });
  }
};

/**
 * Middleware Express : injecte logSecurityEvent dans req pour usage dans les routes.
 */
const securityLoggerMiddleware = (req, res, next) => {
  req.logSecurityEvent = (action, extras = {}) => {
    logSecurityEvent({
      action,
      ip:            req.ip,
      fingerprintId: req.fingerprintId,
      userId:        req.user?.id,
      ...extras,
    });
  };
  next();
};

module.exports = { logSecurityEvent, securityLoggerMiddleware, RISK_SCORES };
