/**
 * TERMINATOR T5 — Adaptive Defense Engine
 *
 * Détecte les comportements anormaux que les systèmes statiques ne voient pas.
 *
 * Comportements surveillés :
 *   1. Création de comptes en masse (même IP → 10 comptes / 10min → HARD_BAN)
 *   2. Flooding OTP (même IP/device → 20 req / 10min → HARD_BAN)
 *   3. Création de courses abusive (même user → 30 courses / heure → BAN)
 *   4. Géolocalisation impossible (vitesse > 600 km/h → compte compromis)
 *   5. Scraping (patterns séquentiels, pagination abusive)
 *   6. Scan de routes (80+ routes uniques / 5min → HARD_BAN immédiat)
 *
 * Toute détection → logSecurityEvent (T9) + recordIncident (T1)
 */

const { recordIncident }    = require('./ipFirewall');
const { logSecurityEvent }  = require('./securityLogger');
const logger                = require('../../services/logger');

// ─────────────────────────────────────────────────────────────────────────────
// COMPTEURS EN MÉMOIRE — uniquement pour détection temps réel
// Non critiques : perdus au restart sans impact métier
// ─────────────────────────────────────────────────────────────────────────────

// Création de comptes par IP
const accountCreationsByIp = new Map(); // ip → { count, windowStart }

// Requêtes OTP par IP + fingerprint
const otpRequestsByKey = new Map();     // key → { count, windowStart }

// Création de courses par userId
const rideCreationsByUser = new Map();  // userId → { count, windowStart }

// Dernière position connue par userId (pour détection vitesse impossible)
const lastPositions = new Map();        // userId → { lat, lng, timestamp }

// Scan de routes (Phase 5 — version agressive)
const routeScanByIp = new Map();        // ip → { routes: Set, windowStart }

// Pagination par endpoint+IP (Phase 6 — scraping)
const paginationByKey = new Map();      // `${ip}:${endpoint}` → { count, windowStart }

// Séquences par IP (Phase 6 — pattern séquentiel)
const sequenceByIp = new Map();         // ip → { lastEndpoint, count, windowStart }

// ── Seuils ────────────────────────────────────────────────────
const THRESHOLDS = {
  ACCOUNT_CREATION_PER_IP:   { limit: 10, windowMs: 10 * 60 * 1000 },
  OTP_REQUESTS_PER_KEY:      { limit: 20, windowMs: 10 * 60 * 1000 },
  RIDE_CREATIONS_PER_USER:   { limit: 30, windowMs: 60 * 60 * 1000 },
  MAX_SPEED_KMH:             600,   // Avion = ~900 km/h, on bannit > 600
  ROUTE_SCAN_LIMIT:          80,    // Routes uniques / 5min (Phase 5 — agressif)
  ROUTE_SCAN_WINDOW_MS:      5 * 60 * 1000,
  PAGINATION_LIMIT:          50,    // Même endpoint / minute (Phase 6)
  PAGINATION_WINDOW_MS:      60 * 1000,
  SEQUENCE_LIMIT:            20,    // Requêtes séquentielles consécutives (Phase 6)
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

const hardBan = (ip, action, details, riskScore = 90) => {
  for (let i = 0; i < 25; i++) recordIncident(ip, action);
  logSecurityEvent({ action, ip, riskScore, details });
  logger.security(`[T5] HARD_BAN: ${action}`, { ip, details });
};

// ─────────────────────────────────────────────────────────────────────────────
// DÉTECTEURS — appelés depuis les routes ou le middleware global
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. Création de compte en masse par IP.
 * À appeler depuis POST /api/auth/verify-otp quand isNewUser === true.
 */
const trackAccountCreation = (ip, fingerprintId) => {
  const now = Date.now();
  const key = fingerprintId || ip;

  if (!accountCreationsByIp.has(key)) accountCreationsByIp.set(key, { count: 0, windowStart: now });
  const entry = accountCreationsByIp.get(key);

  if (now - entry.windowStart > THRESHOLDS.ACCOUNT_CREATION_PER_IP.windowMs) {
    entry.count = 0; entry.windowStart = now;
  }
  entry.count++;

  if (entry.count >= THRESHOLDS.ACCOUNT_CREATION_PER_IP.limit) {
    hardBan(ip, 'account_creation_surge', { count: entry.count, key }, 90);
    return false; // Bloquer
  }
  return true;
};

/**
 * 2. Flood OTP par IP + fingerprint.
 * À appeler depuis POST /api/auth/send-otp.
 */
const trackOtpRequest = (ip, fingerprintId, phone) => {
  const now = Date.now();
  const key = `${fingerprintId || ip}:${phone || ''}`;

  if (!otpRequestsByKey.has(key)) otpRequestsByKey.set(key, { count: 0, windowStart: now });
  const entry = otpRequestsByKey.get(key);

  if (now - entry.windowStart > THRESHOLDS.OTP_REQUESTS_PER_KEY.windowMs) {
    entry.count = 0; entry.windowStart = now;
  }
  entry.count++;

  if (entry.count >= THRESHOLDS.OTP_REQUESTS_PER_KEY.limit) {
    hardBan(ip, 'otp_surge', { count: entry.count, key }, 80);
    return false;
  }
  return true;
};

/**
 * 3. Création de courses abusive par userId.
 * À appeler depuis POST /api/rides.
 */
const trackRideCreation = (userId, ip) => {
  const now = Date.now();

  if (!rideCreationsByUser.has(userId)) rideCreationsByUser.set(userId, { count: 0, windowStart: now });
  const entry = rideCreationsByUser.get(userId);

  if (now - entry.windowStart > THRESHOLDS.RIDE_CREATIONS_PER_USER.windowMs) {
    entry.count = 0; entry.windowStart = now;
  }
  entry.count++;

  if (entry.count >= THRESHOLDS.RIDE_CREATIONS_PER_USER.limit) {
    hardBan(ip, 'ride_creation_abuse', { userId, count: entry.count }, 70);
    return false;
  }
  return true;
};

/**
 * 4. Géolocalisation impossible (vitesse physiquement impossible).
 * À appeler quand le client envoie sa position (GET /rides avec lat/lng, ou GPS socket).
 * Retourne true si la position est valide, false si impossible.
 */
const checkImpossibleGeolocation = (userId, lat, lng, ip) => {
  if (!userId || lat == null || lng == null) return true;

  const now = Date.now();
  const prev = lastPositions.get(userId);

  lastPositions.set(userId, { lat, lng, timestamp: now });

  if (!prev) return true;

  const elapsedSeconds = (now - prev.timestamp) / 1000;
  if (elapsedSeconds < 5) return true; // Trop court pour mesurer

  const distanceKm = haversineKm(prev.lat, prev.lng, lat, lng);
  const speedKmh   = (distanceKm / elapsedSeconds) * 3600;

  if (speedKmh > THRESHOLDS.MAX_SPEED_KMH) {
    logger.security(`[T5] Géolocalisation impossible: userId=${userId} ${speedKmh.toFixed(0)} km/h`, {
      from: { lat: prev.lat, lng: prev.lng },
      to:   { lat, lng },
      elapsedSeconds: elapsedSeconds.toFixed(1),
    });
    logSecurityEvent({
      action: 'impossible_geolocation',
      ip, userId,
      riskScore: 80,
      details: { speedKmh: Math.round(speedKmh), distanceKm: Math.round(distanceKm), elapsedSeconds: Math.round(elapsedSeconds) },
    });
    for (let i = 0; i < 5; i++) recordIncident(ip, 'impossible_geolocation');
    return false;
  }

  return true;
};

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE GLOBAL — Phase 5 + 6 (scan + scraping)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Middleware T5 global — scan de routes (Phase 5) + scraping (Phase 6).
 * Monté dans le middlewareStack de TERMINATOR.
 */
const adaptiveDefenseMiddleware = (req, res, next) => {
  const ip     = req.ip;
  const now    = Date.now();
  const path   = req.path;
  const method = req.method;

  // ── Phase 5 : Scan de routes agressif (seuil 80 → HARD_BAN) ──────────────
  if (!routeScanByIp.has(ip)) routeScanByIp.set(ip, { routes: new Set(), windowStart: now });
  const rc = routeScanByIp.get(ip);
  if (now - rc.windowStart > THRESHOLDS.ROUTE_SCAN_WINDOW_MS) { rc.routes.clear(); rc.windowStart = now; }
  rc.routes.add(`${method}:${path.split('/').slice(0, 4).join('/')}`); // Normaliser les UUIDs

  if (rc.routes.size >= THRESHOLDS.ROUTE_SCAN_LIMIT) {
    hardBan(ip, 'route_scan', { routeCount: rc.routes.size }, 85);
    rc.routes.clear(); // Reset après ban
    return res.status(429).json({ success: false, message: 'Trop de requêtes' });
  }

  // ── Phase 6 : Pagination abusive ─────────────────────────────────────────
  // Détecter : même IP, même endpoint, paramètre `page` croissant, > 50 fois/min
  if (req.query.page) {
    const endpoint = `${method}:${path.split('/').slice(0, 3).join('/')}`;
    const pKey = `${ip}:${endpoint}`;

    if (!paginationByKey.has(pKey)) paginationByKey.set(pKey, { count: 0, windowStart: now });
    const pg = paginationByKey.get(pKey);
    if (now - pg.windowStart > THRESHOLDS.PAGINATION_WINDOW_MS) { pg.count = 0; pg.windowStart = now; }
    pg.count++;

    if (pg.count >= THRESHOLDS.PAGINATION_LIMIT) {
      for (let i = 0; i < 8; i++) recordIncident(ip, 'scraping_pagination');
      logSecurityEvent({
        action: 'scraping_detected',
        ip, riskScore: 70,
        details: { type: 'pagination_abuse', endpoint, count: pg.count },
      });
      return res.status(429).json({ success: false, message: 'Trop de requêtes' });
    }
  }

  // ── Phase 6 : Pattern séquentiel ─────────────────────────────────────────
  // Détecter : même IP accède au même type d'endpoint en boucle rapide (ex: /rides/:id)
  const endpointType = path.replace(/[0-9a-f-]{8,}/gi, ':id'); // Normaliser UUIDs/IDs
  if (!sequenceByIp.has(ip)) sequenceByIp.set(ip, { lastEndpoint: '', count: 0, windowStart: now });
  const sq = sequenceByIp.get(ip);

  if (now - sq.windowStart > 30_000) { sq.count = 0; sq.windowStart = now; } // Fenêtre 30s

  if (sq.lastEndpoint === endpointType && method === 'GET') {
    sq.count++;
    if (sq.count >= THRESHOLDS.SEQUENCE_LIMIT) {
      for (let i = 0; i < 5; i++) recordIncident(ip, 'scraping_sequential');
      logSecurityEvent({
        action: 'scraping_detected',
        ip, riskScore: 65,
        details: { type: 'sequential_pattern', endpoint: endpointType, count: sq.count },
      });
      sq.count = 0; // Reset pour éviter le spam de logs
    }
  } else {
    sq.lastEndpoint = endpointType;
    sq.count = 1;
  }

  next();
};

// ─────────────────────────────────────────────────────────────────────────────
// NETTOYAGE
// ─────────────────────────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  const clean = (map, windowMs) => {
    for (const [key, v] of map.entries()) {
      if (now - (v.windowStart || v.timestamp || 0) > windowMs * 2) map.delete(key);
    }
  };
  clean(accountCreationsByIp, THRESHOLDS.ACCOUNT_CREATION_PER_IP.windowMs);
  clean(otpRequestsByKey,     THRESHOLDS.OTP_REQUESTS_PER_KEY.windowMs);
  clean(rideCreationsByUser,  THRESHOLDS.RIDE_CREATIONS_PER_USER.windowMs);
  clean(routeScanByIp,        THRESHOLDS.ROUTE_SCAN_WINDOW_MS);
  clean(paginationByKey,      THRESHOLDS.PAGINATION_WINDOW_MS);
  clean(sequenceByIp,         60_000);
  // lastPositions : garder 30 min max
  for (const [uid, pos] of lastPositions.entries()) {
    if (now - pos.timestamp > 30 * 60 * 1000) lastPositions.delete(uid);
  }
}, 5 * 60 * 1000);

module.exports = {
  adaptiveDefenseMiddleware,
  trackAccountCreation,
  trackOtpRequest,
  trackRideCreation,
  checkImpossibleGeolocation,
};
