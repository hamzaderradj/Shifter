/**
 * TERMINATOR — T4 : Préflight de production
 * VERSION 2 — Vérifications renforcées + longueur JWT + validation clés
 *
 * En DEVELOPMENT → warnings uniquement, démarrage autorisé
 * En PRODUCTION  → tolérance zéro sur les checks bloquants → process.exit(1)
 */

const logger = require('../../services/logger');

// ── Checks de sécurité ────────────────────────────────────────
const CHECKS = [
  // ── BLOQUANTS en production ────────────────────────────────
  {
    name:    'OTP_BYPASS_DEV désactivé',
    blocker: true,
    check:   () => process.env.OTP_BYPASS_DEV !== 'true',
    message: 'OTP_BYPASS_DEV=true — n\'importe qui peut se connecter avec 123456',
    fix:     'Supprimer OTP_BYPASS_DEV dans Render env vars',
  },
  {
    name:    'JWT_SECRET défini',
    blocker: true,
    check:   () => !!process.env.JWT_SECRET && process.env.JWT_SECRET !== 'dev-secret-change-in-prod',
    message: 'JWT_SECRET manquant ou valeur par défaut',
    fix:     'Générer: openssl rand -base64 64',
  },
  {
    name:    'JWT_SECRET longueur minimale (≥ 32 caractères)',
    blocker: true,
    check:   () => (process.env.JWT_SECRET?.length || 0) >= 32,
    message: `JWT_SECRET trop court (${process.env.JWT_SECRET?.length || 0} chars) — minimum 32 requis`,
    fix:     'Générer un secret fort: openssl rand -base64 64',
  },
  {
    name:    'Credentials admin définis',
    blocker: true,
    check:   () => !!(process.env.ADMIN_1_EMAIL && process.env.ADMIN_1_PASSWORD),
    message: 'ADMIN_1_EMAIL ou ADMIN_1_PASSWORD manquants',
    fix:     'Définir dans Render env vars',
  },
  {
    name:    'Mot de passe admin longueur minimale (≥ 12 caractères)',
    blocker: true,
    check:   () => (process.env.ADMIN_1_PASSWORD?.length || 0) >= 12,
    message: `ADMIN_1_PASSWORD trop court (${process.env.ADMIN_1_PASSWORD?.length || 0} chars) — minimum 12`,
    fix:     'Utiliser un mot de passe d\'au moins 12 caractères avec majuscules, chiffres et symboles',
  },
  {
    name:    'DATABASE_URL définie',
    blocker: true,
    check:   () => !!process.env.DATABASE_URL,
    message: 'DATABASE_URL manquante — impossible de démarrer',
    fix:     'Définir DATABASE_URL dans Render env vars',
  },
  {
    name:    'NODE_ENV correctement défini',
    blocker: true,
    check:   () => ['production', 'development', 'staging'].includes(process.env.NODE_ENV),
    message: `NODE_ENV invalide: "${process.env.NODE_ENV}" — utiliser production|development|staging`,
    fix:     'Définir NODE_ENV=production dans Render env vars',
  },

  // ── WARNINGS en production (non bloquants) ─────────────────
  {
    name:    'Firebase Admin configuré',
    blocker: false,
    check:   () => !!(process.env.project_id && process.env.client_email && process.env.private_key),
    message: 'Firebase non configuré — auth OTP par Firebase impossible',
    fix:     'Définir project_id, client_email, private_key dans Render',
  },
  {
    name:    'Supabase configuré',
    blocker: false,
    check:   () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    message: 'Supabase non configuré — upload documents impossible',
    fix:     'Définir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans Render',
  },
  {
    name:    'Google Maps API Key présente',
    blocker: false,
    check:   () => !!process.env.GOOGLE_MAPS_KEY,
    message: 'GOOGLE_MAPS_KEY manquante — géocodage en mode dégradé (Haversine)',
    fix:     'Définir GOOGLE_MAPS_KEY dans Render',
  },
  {
    name:    'Expo Push Access Token présent',
    blocker: false,
    check:   () => !!process.env.EXPO_ACCESS_TOKEN,
    message: 'EXPO_ACCESS_TOKEN manquant — risque de rate limiting Expo',
    fix:     'Définir EXPO_ACCESS_TOKEN dans Render',
  },
  {
    name:    'URL Admin Panel définie',
    blocker: false,
    check:   () => !!process.env.ADMIN_URL,
    message: 'ADMIN_URL non définie — CORS admin panel peut rejeter des requêtes légitimes',
    fix:     'Définir ADMIN_URL=https://shifter-admin.netlify.app dans Render',
  },
];

// ── Exécuter le preflight ─────────────────────────────────────
const runPreflight = () => {
  const env    = process.env.NODE_ENV || 'development';
  const isProd = env === 'production';

  const report = {
    env,
    timestamp:          new Date().toISOString(),
    passed:             [],
    warnings:           [],
    blockers:           [],
    readyForProduction: true,
  };

  const LINE = '═'.repeat(62);
  console.log(`\n${LINE}`);
  console.log('  🛡️  TERMINATOR V2 — PREFLIGHT SÉCURITÉ');
  console.log(`  Environnement: ${env.toUpperCase()}`);
  console.log(LINE);

  for (const check of CHECKS) {
    const ok = check.check();

    if (ok) {
      report.passed.push(check.name);
      console.log(`  ✅  ${check.name}`);
    } else if (check.blocker && isProd) {
      report.blockers.push({ name: check.name, message: check.message, fix: check.fix });
      report.readyForProduction = false;
      console.log(`  🚨  BLOQUANT: ${check.name}`);
      console.log(`       Problème: ${check.message}`);
      console.log(`       Fix:      ${check.fix}`);
    } else {
      report.warnings.push({ name: check.name, message: check.message, fix: check.fix });
      if (!ok) report.readyForProduction = false;
      console.log(`  ⚠️   ${check.name}`);
      console.log(`       ${check.message}`);
    }
  }

  console.log(LINE);

  if (report.blockers.length > 0 && isProd) {
    console.log(`\n  ❌  ${report.blockers.length} check(s) bloquant(s) — démarrage impossible en PRODUCTION\n`);
    logger.security('TERMINATOR PREFLIGHT BLOQUÉ', {
      env,
      blockers: report.blockers.map((b) => b.name),
    });
    process.exit(1);
  }

  const emoji = report.readyForProduction ? '🟢' : '🟡';
  const label = report.readyForProduction ? 'Prêt pour la production' : 'Corrections recommandées';
  console.log(`\n  ${emoji}  ${label}`);
  console.log(`  ✅ ${report.passed.length} checks réussis`);
  if (report.warnings.length > 0) {
    console.log(`  ⚠️  ${report.warnings.length} avertissement(s)\n`);
  } else {
    console.log();
  }

  return report;
};

// ── Statut pour l'API admin ───────────────────────────────────
const getSecurityStatus = () => ({
  env: process.env.NODE_ENV || 'development',
  checks: CHECKS.map((c) => ({
    name:    c.name,
    passed:  c.check(),
    blocker: c.blocker,
  })),
  readyForProduction: CHECKS.filter((c) => c.blocker).every((c) => c.check()),
});

module.exports = { runPreflight, getSecurityStatus };
