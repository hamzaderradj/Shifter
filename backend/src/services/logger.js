/**
 * Logger structuré — Shifter Platform
 *
 * Format JSON structuré pour faciliter la recherche dans les logs Render.
 * En développement → format humain coloré.
 * En production → JSON ligne par ligne (compatible avec la plupart des log aggregators).
 *
 * Niveaux : error > warn > info > debug
 * Événements de sécurité : logger.security(event, details)
 * Événements audit admin : logger.audit(adminId, action, details)
 */

const isProd = process.env.NODE_ENV === 'production';

const LEVELS = { error: 0, warn: 1, info: 2, security: 2, audit: 2, debug: 3 };
const COLORS = {
  error:    '\x1b[31m', // rouge
  warn:     '\x1b[33m', // jaune
  info:     '\x1b[36m', // cyan
  security: '\x1b[35m', // magenta
  audit:    '\x1b[34m', // bleu
  debug:    '\x1b[90m', // gris
  reset:    '\x1b[0m',
};

function timestamp() {
  return new Date().toISOString();
}

function formatDev(level, message, meta) {
  const color = COLORS[level] || '';
  const reset = COLORS.reset;
  const metaStr = meta && Object.keys(meta).length > 0
    ? ' ' + JSON.stringify(meta)
    : '';
  return `${color}[${level.toUpperCase()}]${reset} ${timestamp()} ${message}${metaStr}`;
}

function formatProd(level, message, meta) {
  return JSON.stringify({
    ts:      timestamp(),
    level,
    message,
    service: 'shifter-backend',
    ...meta
  });
}

function log(level, message, meta = {}) {
  const line = isProd
    ? formatProd(level, message, meta)
    : formatDev(level, message, meta);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

const logger = {
  error:   (message, meta) => log('error', message, meta),
  warn:    (message, meta) => log('warn',  message, meta),
  info:    (message, meta) => log('info',  message, meta),
  debug:   (message, meta) => log('debug', message, meta),

  /**
   * Événement de sécurité — utilisé pour les tentatives suspectes,
   * violations d'accès, anomalies d'authentification, etc.
   */
  security: (event, details = {}) => log('security', `[SECURITY] ${event}`, details),

  /**
   * Audit trail — toutes les actions admin importantes.
   * Ces logs ne doivent jamais être supprimés en production.
   */
  audit: (adminId, action, details = {}) => log('audit', `[AUDIT] ${action}`, {
    adminId,
    action,
    ...details
  }),

  /**
   * Erreur d'application avec contexte de requête.
   * Usage : logger.request(req, err)
   */
  request: (req, err, extra = {}) => log('error', err?.message || 'Request error', {
    errorId: Date.now().toString(36),
    method:  req.method,
    path:    req.path,
    ip:      req.ip,
    userId:  req.user?.id || null,
    ...extra,
    ...(isProd ? {} : { stack: err?.stack }),
  }),
};

module.exports = logger;
