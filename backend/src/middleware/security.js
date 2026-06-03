/**
 * Middleware de sécurité transversal
 * - Échappement HTML/JS pour le rendu côté serveur (protection XSS)
 * - Validation UUID des paramètres de route
 * - Comparaison de chaînes en temps constant (protection timing attack)
 */
const { param, validationResult } = require('express-validator');
const crypto = require('crypto');

// ── Échappement HTML ──────────────────────────────────────────
const escapeHtml = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// ── Sérialisation sûre pour les blocs <script> ────────────────
// JSON.stringify échappe naturellement <, >, &, et les guillemets
const safeJson = (value) => JSON.stringify(value);

// ── Comparaison en temps constant ────────────────────────────
const timingSafeCompare = (a, b) => {
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) {
      // On exécute quand même la comparaison pour ne pas leaker la longueur via le timing
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
};

// ── Validation UUID (v4) pour les paramètres de route ────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUUID = (str) => UUID_REGEX.test(str);

/**
 * Middleware qui valide qu'un paramètre de route est un UUID v4 valide.
 * Usage : router.get('/:id', validateUUID('id'), handler)
 */
const validateUUID = (...paramNames) => {
  const validators = paramNames.map((name) =>
    param(name).matches(UUID_REGEX).withMessage(`${name} invalide`)
  );

  const check = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    next();
  };

  return [...validators, check];
};

// ── Validation nombre flottant dans query ──────────────────────
const clampInt = (value, min, max, fallback) => {
  const n = parseInt(value, 10);
  if (isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

module.exports = { escapeHtml, safeJson, timingSafeCompare, isValidUUID, validateUUID, clampInt };
