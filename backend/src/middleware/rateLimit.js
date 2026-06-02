const rateLimit = require('express-rate-limit');
const config = require('../config');

// ── Limiter général ───────────────────────────────────────────
const defaultLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  // Utiliser l'IP réelle derrière proxy (Render)
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Trop de requêtes, veuillez réessayer plus tard.' }
});

// ── OTP — limité par numéro de téléphone ET IP ───────────────
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: config.rateLimit.otpMax,
  // Double clé : phone + IP pour éviter bypass X-Forwarded-For
  keyGenerator: (req) => {
    const phone = req.body.phone || '';
    const ip = req.ip;
    return `${phone}_${ip}`;
  },
  message: { success: false, message: 'Trop de demandes OTP. Attendez 10 minutes.' }
});

// ── Admin login — 5 tentatives / 15 minutes par IP ──────────
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip,
  skipSuccessfulRequests: true, // Ne compte que les échecs
  message: { success: false, message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
});

// ── Strict — 20 req/min pour routes sensibles ────────────────
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Limite atteinte.' }
});

// ── Création de course — 3 courses / 5 min par user ─────────
const rideLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { success: false, message: 'Trop de courses créées. Attendez quelques minutes.' }
});

module.exports = { defaultLimiter, otpLimiter, adminLoginLimiter, strictLimiter, rideLimiter };
