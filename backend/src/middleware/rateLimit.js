const rateLimit = require('express-rate-limit');
const config = require('../config');

const defaultLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de requêtes, veuillez réessayer plus tard.' }
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: config.rateLimit.otpMax,
  keyGenerator: (req) => req.body.phone || req.ip,
  message: { success: false, message: 'Trop de demandes OTP. Attendez 10 minutes.' }
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'Limite atteinte.' }
});

module.exports = { defaultLimiter, otpLimiter, strictLimiter };
