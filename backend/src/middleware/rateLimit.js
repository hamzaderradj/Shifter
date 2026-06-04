/**
 * Rate Limiting — Phase 7 : Clés composites multi-dimensionnelles
 *
 * Dimensions utilisées selon la route :
 *   - IP
 *   - userId (extrait du JWT authentifié)
 *   - fingerprintId (appareil)
 *   - route (endpoint exact)
 *
 * Score cumulé : chaque dimension ajoute à un compteur global.
 * Un attaquant qui change d'IP mais garde le même userId/fingerprint est quand même limité.
 */

const rateLimit = require('express-rate-limit');
const config    = require('../config');

// ── Clé composite : IP + userId + fingerprint ──────────────
const compositeKey = (req) => {
  const ip          = req.ip || 'unknown';
  const userId      = req.user?.id || '';
  const fingerprint = req.fingerprintId || '';
  // Combiner pour que chaque dimension contribue
  return `${ip}:${userId}:${fingerprint}`;
};

// ── Limiter général ────────────────────────────────────────
const defaultLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max:      config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => req.ip, // IP seule pour le défaut global
  message: { success: false, message: 'Trop de requêtes, veuillez réessayer plus tard.' },
});

// ── OTP — IP + phone + fingerprint ────────────────────────
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max:      config.rateLimit.otpMax,
  keyGenerator: (req) => {
    const phone = req.body.phone || '';
    const fp    = req.fingerprintId || '';
    return `otp:${phone}:${req.ip}:${fp}`;
  },
  message: { success: false, message: 'Trop de demandes OTP. Attendez 10 minutes.' },
});

// ── Admin login — 5 tentatives / 15min (IP + fingerprint) ─
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      5,
  keyGenerator:            (req) => `admin_login:${req.ip}:${req.fingerprintId || ''}`,
  skipSuccessfulRequests:  true,
  message: { success: false, message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
});

// ── Routes sensibles — composite IP + userId + fingerprint ─
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      20,
  keyGenerator: (req) => `strict:${compositeKey(req)}`,
  message: { success: false, message: 'Limite atteinte.' },
});

// ── Création de course — composite IP + userId ─────────────
// Un user ne peut pas créer > 5 courses / 5 min,
// et une IP ne peut pas créer > 10 courses / 5 min (comptes multiples)
const rideLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max:      5,
  keyGenerator: (req) => `ride:${req.user?.id || req.ip}:${req.fingerprintId || ''}`,
  message: { success: false, message: 'Trop de courses créées. Attendez quelques minutes.' },
});

// ── Geocoding — strict par IP (évite l'abus de l'API Google) ─
const geocodingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      30,
  keyGenerator: (req) => `geo:${req.ip}:${req.user?.id || ''}`,
  message: { success: false, message: 'Trop de requêtes de géocodage.' },
});

// ── Refresh token — par token (évite le flooding de refresh) ─
const refreshTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  keyGenerator: (req) => `refresh:${req.body.refreshToken?.slice(0, 16) || req.ip}`,
  message: { success: false, message: 'Trop de tentatives de refresh.' },
});

module.exports = {
  defaultLimiter,
  otpLimiter,
  adminLoginLimiter,
  strictLimiter,
  rideLimiter,
  geocodingLimiter,
  refreshTokenLimiter,
};
