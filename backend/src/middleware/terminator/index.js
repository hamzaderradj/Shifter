/**
 * TERMINATOR V3 — Orchestrateur central
 *
 * Architecture défense en profondeur :
 *
 *   RÉSEAU     → Cloudflare Workers (HTTP proxy, headers sécurité)
 *   T1         → IP Firewall & Auto-ban (persisté en DB)
 *   T2         → Anomaly Detection (injection, scan de routes)
 *   T3-CB      → Circuit Breakers (Google Maps, Expo, Firebase, Supabase)
 *   T3-FP      → Device Fingerprint (50 comptes/appareil → HARD_BAN)
 *   T4         → Preflight (vérification config production)
 *   T5         → Adaptive Defense Engine (comportements anormaux)
 *   HONEYPOT   → Routes pièges (SOFT_BAN immédiat)
 *   T7         → Rate Limiting composite (IP + userId + fingerprint + route)
 *   T8         → Re-auth admin pour actions critiques
 *   T9         → Security Events (journal immuable PostgreSQL)
 *   RATE LIMIT → Rate limiting par route (express-rate-limit)
 *   AUTH       → JWT + rotation + révocation
 *   AUTHZ      → RBAC + UUID validation + ownership
 *   AUDIT      → Logs structurés + audit trail
 *   CRON       → Nettoyage automatique des données expirées
 */

const { ipFirewallMiddleware, listBannedIps, unbanIp, recordIncident } = require('./ipFirewall');
const { anomalyDetector, recordAuthFailure }                            = require('./anomaly');
const { getAllBreakersStatus }                                           = require('./circuitBreaker');
const { runPreflight, getSecurityStatus }                               = require('./preflight');
const { deviceFingerprintMiddleware, loadBannedFingerprints }           = require('./deviceFingerprint');
const { adaptiveDefenseMiddleware,
        trackAccountCreation, trackOtpRequest,
        trackRideCreation, checkImpossibleGeolocation }                 = require('./adaptiveDefense');
const { honeypotMiddleware }                                             = require('./honeypot');
const { securityLoggerMiddleware, logSecurityEvent }                     = require('./securityLogger');
const logger                                                             = require('../../services/logger');

/**
 * Initialise TERMINATOR V3.
 */
const init = () => {
  const report = runPreflight();

  // Charger les fingerprints bannis
  loadBannedFingerprints().catch(() => {});

  // Démarrer les cron jobs
  try {
    require('../../cron');
    logger.info('[TERMINATOR] Cron jobs démarrés');
  } catch (err) {
    logger.warn('[TERMINATOR] Cron jobs non disponibles', { error: err.message });
  }

  logger.info('[TERMINATOR V3] Système de sécurité initialisé', {
    env:      report.env,
    passed:   report.passed.length,
    warnings: report.warnings.length,
    blockers: report.blockers.length,
    layers:   ['T1-Firewall','T2-Anomaly','T3-CircuitBreaker','T3-Fingerprint','T4-Preflight','T5-Adaptive','Honeypot','T9-ImmutableLog'],
  });

  return report;
};

/**
 * Stack principal — ordre critique.
 *
 * 1. Honeypots en premier : répondent avant toute autre logique
 * 2. Security logger : injecte req.logSecurityEvent
 * 3. Device fingerprint : injecte req.fingerprintId
 * 4. IP Firewall T1 : bloque les IPs bannies
 * 5. T5 Adaptive Defense : scan + scraping
 * 6. T2 Anomaly : injection + volume
 */
const middlewareStack = [
  honeypotMiddleware,             // HONEYPOT : avant tout le reste
  securityLoggerMiddleware,       // T9 : injecte req.logSecurityEvent
  deviceFingerprintMiddleware,    // T3-FP : injecte req.fingerprintId
  ipFirewallMiddleware,           // T1 : bloque les IPs/devices bannis
  adaptiveDefenseMiddleware,      // T5 : scan + scraping
  anomalyDetector,                // T2 : injection SQL/XSS + volume
];

/**
 * Statut complet exposé via GET /admin/terminator/status.
 */
const getFullStatus = () => ({
  timestamp:       new Date().toISOString(),
  version:         'V3',
  security:        getSecurityStatus(),
  circuitBreakers: getAllBreakersStatus(),
  bannedIps:       listBannedIps(),
  uptime:          process.uptime(),
  layers: {
    T1_firewall:    'active',
    T2_anomaly:     'active',
    T3_breakers:    'active',
    T3_fingerprint: 'active',
    T4_preflight:   'active',
    T5_adaptive:    'active',
    honeypot:       'active',
    T9_auditLog:    'active',
  },
});

module.exports = {
  init,
  middlewareStack,
  getFullStatus,

  // Exports pour usage dans les routes
  recordIncident,
  recordAuthFailure,
  listBannedIps,
  unbanIp,
  logSecurityEvent,
  trackAccountCreation,
  trackOtpRequest,
  trackRideCreation,
  checkImpossibleGeolocation,
};
