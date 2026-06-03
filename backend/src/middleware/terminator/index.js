/**
 * TERMINATOR — Orchestrateur central
 *
 * Initialise et coordonne toutes les couches de défense.
 * Point d'entrée unique : require('./middleware/terminator')
 *
 * Architecture défense en profondeur :
 *
 *   RÉSEAU     → Cloudflare (WAF, DDoS, Bot) — externe
 *   T1         → IP Firewall & Auto-ban
 *   T2         → Anomaly Detection
 *   T3         → Circuit Breakers (services externes)
 *   T4         → Preflight (vérification config prod)
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
const logger                                                            = require('../../services/logger');

/**
 * Initialise TERMINATOR — à appeler une seule fois au démarrage.
 * Lance le preflight et démarre les cron jobs de nettoyage.
 */
const init = () => {
  // Lancer le preflight de sécurité
  const report = runPreflight();

  // Démarrer les cron jobs
  try {
    require('../../cron');
    logger.info('[TERMINATOR] Cron jobs démarrés');
  } catch (err) {
    logger.warn('[TERMINATOR] Cron jobs non disponibles', { error: err.message });
  }

  logger.info('[TERMINATOR] Système de sécurité initialisé', {
    env:       report.env,
    passed:    report.passed.length,
    warnings:  report.warnings.length,
    blockers:  report.blockers.length,
    readyForProduction: report.readyForProduction,
  });

  return report;
};

/**
 * Stack de middlewares TERMINATOR à appliquer sur toutes les routes.
 * Usage : app.use(terminator.middlewareStack)
 */
const middlewareStack = [
  ipFirewallMiddleware,   // T1 : bloque les IPs bannies immédiatement
  anomalyDetector,        // T2 : détecte les comportements suspects
];

/**
 * Statut complet du système TERMINATOR.
 * Exposé via GET /api/admin/terminator/status (admin only).
 */
const getFullStatus = () => ({
  timestamp:      new Date().toISOString(),
  security:       getSecurityStatus(),
  circuitBreakers: getAllBreakersStatus(),
  bannedIps:      listBannedIps(),
  uptime:         process.uptime(),
});

module.exports = {
  init,
  middlewareStack,
  getFullStatus,

  // Exports utilitaires pour usage dans les routes
  recordIncident,
  recordAuthFailure,
  listBannedIps,
  unbanIp,
};
