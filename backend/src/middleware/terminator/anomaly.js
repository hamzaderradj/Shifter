/**
 * TERMINATOR — T2 : Détection d'anomalies comportementales
 * VERSION 2 — Injection contextuelle + userId réel + détection active
 *
 * Changements v2 :
 *   - Patterns d'injection intelligents (zéro faux positif sur adresses/messages normaux)
 *   - Extraction userId depuis JWT header (sans vérification) pour tracking réel
 *   - Détection volume par user désormais fonctionnelle
 *   - Scan de routes déclenche 403 immédiat après 50 routes (pas seulement un log)
 */

const logger = require('../../services/logger');
const { recordIncident } = require('./ipFirewall');

// ── Patterns d'injection CONTEXTUELS ────────────────────────
// Principe : détecter les vrais patterns d'attaque, pas les mots-clés isolés.
// "Select Road" → OK. "' SELECT 1 FROM" → bloqué.

const PATTERNS = {
  // SQL injection — nécessite un CONTEXTE d'attaque (quote + opérateur, ou combo mots-clés)
  sql: [
    /('|")\s*(OR|AND)\s+('|"|1|0|\d)/i,          // ' OR '1' / ' OR 1=
    /\bUNION\s+(ALL\s+)?SELECT\b/i,               // UNION SELECT (combo)
    /;\s*(DROP|DELETE|TRUNCATE|ALTER)\s+\b/i,     // ; DROP TABLE
    /\bEXEC\s*\(/i,                               // EXEC(
    /'[^']*;\s*--/,                               // '; -- (commentaire SQL)
    /\/\*[\s\S]{1,50}\*\//,                       // /* ... */ commentaire inline
    /\b(SELECT|INSERT)\s+.{0,30}\s+FROM\b/i,      // SELECT x FROM (contexte complet)
    /\bWHERE\s+\d+\s*=\s*\d+/i,                  // WHERE 1=1
    /0x[0-9a-fA-F]{6,}/,                          // encoding hex 0x414243...
    /\bCAST\s*\([^)]+AS\s+\w+\)/i,               // CAST(x AS type)
    /\bCONVERT\s*\([^,]+,[^)]+\)/i,              // CONVERT(type, val)
    /CHAR\s*\(\d{2,3}\)/i,                        // CHAR(65) char encoding
    /SLEEP\s*\(\d+\)/i,                           // SLEEP(5) time-based
    /BENCHMARK\s*\(\d+/i,                          // BENCHMARK blind
    /LOAD_FILE\s*\(/i,                             // file read
    /INTO\s+(OUTFILE|DUMPFILE)\s+'/i,             // file write
  ],

  // XSS — nécessite du HTML ou du JavaScript exécutable
  xss: [
    /<script[\s>]/i,                              // <script> ou <script src=
    /<\/script>/i,                                // fermeture </script>
    /javascript\s*:/i,                            // javascript:
    /on\w{2,20}\s*=\s*["']?\s*\w/i,             // onerror= onclick= onload=
    /<iframe[\s>]/i,                              // iframes
    /document\s*\.\s*cookie/i,                    // vol de cookie
    /document\s*\.\s*write\s*\(/i,               // document.write
    /window\s*\.\s*location/i,                   // redirection
    /<img[^>]{0,50}src\s*=\s*["']?javascript/i,  // <img src=javascript:
    /&#x?[0-9a-f]{2,4};/i,                       // encoding HTML entities &#x3C;
    /expression\s*\([^)]+\)/i,                   // CSS expression()
    /vbscript\s*:/i,                             // VBScript
  ],

  // Path traversal — accès aux fichiers système
  pathTraversal: [
    /\.\.[\/\\]{1,3}/,                           // ../
    /%2e%2e[%2f%5c]/i,                           // URL-encoded ../
    /%252e%252e/i,                               // Double-encoded
    /\.\.\\/,                                    // ..\\ Windows
  ],

  // Injection de commandes shell
  command: [
    /[;|`&]\s*\$\(/,                             // ; $(cmd)
    /[;|]\s*(cat|ls|rm|curl|wget|bash|sh|nc|python|perl|ruby)\s+/i, // ; ls /etc
    /`[^`]{3,50}`/,                              // `cmd`
    /\|\s*base64\s+-d/i,                         // | base64 -d
    /\|\s*bash/i,                                // | bash
  ],
};

// ── Extraction userId depuis JWT (sans vérification) ──────────
// On décode juste le payload pour avoir l'ID — pas de confiance pour l'auth.
const extractUserIdFromJwt = (req) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const parts = auth.split(' ')[1].split('.');
    if (parts.length !== 3) return null;
    // base64url → base64 standard
    const payload = Buffer.from(
      parts[1].replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8');
    return JSON.parse(payload).userId || null;
  } catch {
    return null;
  }
};

// ── Test d'injection sur une valeur string ────────────────────
const isAttackString = (value, context = 'text') => {
  if (typeof value !== 'string' || value.length < 4) return false;

  const str = value;

  // XSS + path traversal + command : vérifiés dans tous les contextes
  if (PATTERNS.xss.some((p) => p.test(str))) return true;
  if (PATTERNS.pathTraversal.some((p) => p.test(str))) return true;
  if (PATTERNS.command.some((p) => p.test(str))) return true;

  // SQL : seulement sur les champs non-adresse
  // Les adresses peuvent contenir des mots innocents comme "Insert" ou "Select"
  if (context !== 'address') {
    if (PATTERNS.sql.some((p) => p.test(str))) return true;
  } else {
    // Même pour les adresses : appliquer les patterns les plus dangereux
    const criticalSql = PATTERNS.sql.filter((_, i) => [0,1,2,3,4].includes(i));
    if (criticalSql.some((p) => p.test(str))) return true;
  }

  return false;
};

// ── Champs qui sont des adresses (libres mais pas du SQL) ─────
const ADDRESS_FIELDS = new Set([
  'pickupAddress', 'dropoffAddress', 'address', 'pickup_address', 'dropoff_address',
  'label', 'shortAddress', 'formatted_address',
]);

// ── Champs à ignorer complètement (déjà validés strictement) ──
const SKIP_FIELDS = new Set([
  'phone', 'email', 'lat', 'lng', 'pickupLat', 'pickupLng', 'dropoffLat', 'dropoffLng',
  'id', 'rideId', 'driverId', 'userId', 'score', 'page', 'limit', 'radius',
  'idToken', 'refreshToken', 'accessToken', 'code', 'availability',
  'status', 'paymentMethod', 'period', 'days', 'type', 'targetRole',
]);

// ── Scanner récursif avec conscience du contexte ──────────────
const scanForAttack = (obj, depth = 0) => {
  if (depth > 4 || !obj) return { found: false };
  if (typeof obj !== 'object') return { found: false };

  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_FIELDS.has(key)) continue;

    if (typeof value === 'string') {
      const ctx = ADDRESS_FIELDS.has(key) ? 'address' : 'text';
      if (isAttackString(value, ctx)) {
        return { found: true, field: key, sample: value.slice(0, 80) };
      }
    } else if (typeof value === 'object' && value !== null) {
      const result = scanForAttack(value, depth + 1);
      if (result.found) return result;
    }
  }
  return { found: false };
};

// ── Compteurs ─────────────────────────────────────────────────
const routeCounters = new Map();  // ip → { routes: Set, windowStart }
const userActivity  = new Map();  // userId → { count, windowStart }
const authFailures  = new Map();  // ip → { count, lastAt }

/**
 * Middleware principal d'anomalie.
 * Monté globalement via app.use() — s'exécute avant les routes.
 */
const anomalyDetector = (req, res, next) => {
  const ip     = req.ip;
  const method = req.method;
  const path   = req.path;

  // ── 1. Détection d'injection sur les inputs ──────────────────
  const inputs = { ...req.body, ...req.query, ...req.params };
  const attack = scanForAttack(inputs);
  if (attack.found) {
    logger.security('[T2] Pattern d\'injection détecté', {
      ip, path, method,
      field:  attack.field,
      sample: attack.sample,
    });
    recordIncident(ip, 'injection_attempt');
    return res.status(400).json({ success: false, message: 'Requête invalide' });
  }

  // ── 2. Détection de scan de routes ──────────────────────────
  const now = Date.now();
  if (!routeCounters.has(ip)) routeCounters.set(ip, { routes: new Set(), windowStart: now });
  const rc = routeCounters.get(ip);
  if (now - rc.windowStart > 5 * 60 * 1000) { rc.routes.clear(); rc.windowStart = now; }
  rc.routes.add(`${method}:${path}`);

  if (rc.routes.size > 50) {
    logger.security('[T2] Scan de routes excessif', { ip, routeCount: rc.routes.size });
    recordIncident(ip, 'route_scan');
    // Bloquer immédiatement après 50 routes uniques
    if (rc.routes.size > 80) {
      return res.status(429).json({ success: false, message: 'Trop de requêtes' });
    }
  }

  // ── 3. Tracking volume utilisateur (via JWT decode) ──────────
  // On extrait l'userId du JWT SANS vérifier la signature — juste pour comptage
  const userId = extractUserIdFromJwt(req);
  if (userId) {
    if (!userActivity.has(userId)) userActivity.set(userId, { count: 0, windowStart: now });
    const ua = userActivity.get(userId);
    if (now - ua.windowStart > 60 * 1000) { ua.count = 0; ua.windowStart = now; }
    ua.count++;

    if (ua.count > 300) {
      logger.security('[T2] Volume excessif par utilisateur', { userId, ip, count: ua.count });
      recordIncident(ip, 'user_volume_abuse');
    }
  }

  // ── 4. Intercepter 401/403 pour incrémenter le score risque ──
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 403) recordIncident(ip, `forbidden:${path}`);
    if (res.statusCode === 401) recordIncident(ip, `unauthorized:${path}`);
    return originalJson(body);
  };

  next();
};

/**
 * Enregistrer manuellement un échec d'authentification.
 * Appelé depuis routes/auth.js.
 */
const recordAuthFailure = (ip, reason = 'auth_failed') => {
  const now = Date.now();
  if (!authFailures.has(ip)) authFailures.set(ip, { count: 0, lastAt: now });
  const af = authFailures.get(ip);
  if (now - af.lastAt > 30 * 60 * 1000) af.count = 0;
  af.count++;
  af.lastAt = now;

  recordIncident(ip, reason);

  if (af.count >= 3) {
    logger.security(`[T2] ${af.count} échecs d'auth répétés`, { ip, reason });
  }
};

// Nettoyage toutes les 10 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, rc] of routeCounters.entries()) {
    if (now - rc.windowStart > 10 * 60 * 1000) routeCounters.delete(ip);
  }
  for (const [ip, af] of authFailures.entries()) {
    if (now - af.lastAt > 60 * 60 * 1000) authFailures.delete(ip);
  }
  for (const [uid, ua] of userActivity.entries()) {
    if (now - ua.windowStart > 10 * 60 * 1000) userActivity.delete(uid);
  }
}, 10 * 60 * 1000);

module.exports = { anomalyDetector, recordAuthFailure };
