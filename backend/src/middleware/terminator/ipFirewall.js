/**
 * TERMINATOR — T1 : Pare-feu IP & Bannissement automatique
 * VERSION 2 — Persistence DB + Warning slowdown + Métriques
 *
 * Niveaux :
 *   WARNING  → délai 500ms ajouté (ralentit, ne bloque pas)
 *   SOFT_BAN → bloquée 30 min → 429
 *   HARD_BAN → bloquée 24h → 429
 *
 * Persistence : les bans sont sauvegardés en DB (table security_bans)
 * et restaurés au démarrage. Survit aux redémarrages Render.
 */

const logger = require('../../services/logger');

// ── Configuration ─────────────────────────────────────────────
const CONFIG = {
  WARNING_THRESHOLD:   5,
  SOFT_BAN_THRESHOLD:  10,
  HARD_BAN_THRESHOLD:  20,
  SOFT_BAN_DURATION:   30 * 60 * 1000,
  HARD_BAN_DURATION:   24 * 60 * 60 * 1000,
  WINDOW:              15 * 60 * 1000,
  WARNING_DELAY_MS:    500,   // délai ajouté aux IPs en WARNING
};

// ── Whitelist ─────────────────────────────────────────────────
const WHITELIST = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// ── Stockage mémoire (source de vérité pour la vitesse) ───────
const incidents = new Map();

// ── Lazy-load Prisma (évite dépendance circulaire au démarrage)
let _prisma = null;
const getPrisma = () => {
  if (!_prisma) _prisma = require('../../lib/prisma');
  return _prisma;
};

// ── Persistence DB : sauvegarder un ban ───────────────────────
const persistBan = async (ip, entry) => {
  try {
    const prisma = getPrisma();
    await prisma.$executeRaw`
      INSERT INTO security_bans (ip, level, incidents, banned_until, updated_at)
      VALUES (${ip}, ${entry.level}, ${entry.count}, ${new Date(entry.bannedUntil)}, NOW())
      ON CONFLICT (ip) DO UPDATE SET
        level       = EXCLUDED.level,
        incidents   = EXCLUDED.incidents,
        banned_until = EXCLUDED.banned_until,
        updated_at  = NOW()
    `;
  } catch (err) {
    // Non bloquant — la sécurité mémoire reste active
    logger.warn('[T1] Impossible de persister le ban en DB', { ip, error: err.message });
  }
};

// ── Persistence DB : supprimer un ban ─────────────────────────
const removeBanFromDb = async (ip) => {
  try {
    const prisma = getPrisma();
    await prisma.$executeRaw`DELETE FROM security_bans WHERE ip = ${ip}`;
  } catch (err) {
    logger.warn('[T1] Impossible de supprimer le ban en DB', { ip, error: err.message });
  }
};

// ── Chargement des bans au démarrage depuis la DB ─────────────
const loadBansFromDb = async () => {
  try {
    const prisma = getPrisma();
    const bans = await prisma.$queryRaw`
      SELECT ip, level, incidents, banned_until
      FROM security_bans
      WHERE banned_until > NOW()
    `;
    let loaded = 0;
    for (const ban of bans) {
      incidents.set(ban.ip, {
        count:       ban.incidents,
        firstAt:     Date.now(),
        bannedUntil: new Date(ban.banned_until).getTime(),
        level:       ban.level,
      });
      loaded++;
    }
    if (loaded > 0) logger.info(`[T1] ${loaded} ban(s) restauré(s) depuis la DB`);
  } catch (err) {
    // Table peut ne pas exister encore — non bloquant
    logger.warn('[T1] Chargement DB bans ignoré', { error: err.message });
  }
};

// Charger les bans dès que le module est chargé (async non bloquant)
setTimeout(loadBansFromDb, 2000); // petit délai pour laisser Prisma s'initialiser

// ── Enregistrer un incident ───────────────────────────────────
const recordIncident = (ip, reason = 'unknown') => {
  if (WHITELIST.has(ip)) return 'ok';

  const now = Date.now();
  const entry = incidents.get(ip) || { count: 0, firstAt: now, bannedUntil: 0, level: 'ok' };

  // Reset fenêtre si expirée et pas de ban actif
  if (now - entry.firstAt > CONFIG.WINDOW && entry.bannedUntil < now) {
    entry.count   = 0;
    entry.firstAt = now;
    entry.level   = 'ok';
  }

  entry.count++;

  if (entry.count >= CONFIG.HARD_BAN_THRESHOLD) {
    entry.level      = 'hard_ban';
    entry.bannedUntil = now + CONFIG.HARD_BAN_DURATION;
    logger.security(`[T1] HARD_BAN: ${ip} — ${reason} (${entry.count} incidents)`);
    persistBan(ip, entry);
  } else if (entry.count >= CONFIG.SOFT_BAN_THRESHOLD) {
    entry.level      = 'soft_ban';
    entry.bannedUntil = now + CONFIG.SOFT_BAN_DURATION;
    logger.security(`[T1] SOFT_BAN: ${ip} — ${reason} (${entry.count} incidents)`);
    persistBan(ip, entry);
  } else if (entry.count >= CONFIG.WARNING_THRESHOLD) {
    if (entry.level !== 'warning') {
      logger.warn(`[T1] WARNING: ${ip} — ${reason} (${entry.count} incidents)`);
    }
    entry.level = 'warning';
  }

  incidents.set(ip, entry);
  return entry.level;
};

const checkBan = (ip) => {
  if (WHITELIST.has(ip)) return null;
  const entry = incidents.get(ip);
  if (!entry) return null;
  const now = Date.now();

  if (entry.bannedUntil > now) {
    return {
      level:        entry.level,
      remainingMin: Math.ceil((entry.bannedUntil - now) / 60000),
    };
  }
  // Ban expiré
  if (entry.bannedUntil > 0 && entry.bannedUntil <= now) {
    incidents.delete(ip);
    removeBanFromDb(ip);
  }
  return null;
};

const unbanIp = (ip) => {
  incidents.delete(ip);
  removeBanFromDb(ip);
  logger.info(`[T1] IP débloquée manuellement: ${ip}`);
};

const listBannedIps = () => {
  const now = Date.now();
  const result = [];
  for (const [ip, entry] of incidents.entries()) {
    if (entry.bannedUntil > now) {
      result.push({
        ip,
        level:        entry.level,
        count:        entry.count,
        bannedUntil:  new Date(entry.bannedUntil).toISOString(),
        remainingMin: Math.ceil((entry.bannedUntil - now) / 60000),
      });
    } else if (entry.level === 'warning') {
      result.push({ ip, level: 'warning', count: entry.count, bannedUntil: null });
    }
  }
  return result;
};

/**
 * Middleware Express — bloque les bannis, ralentit les warnings.
 * Ne lèche PAS le niveau de ban dans la réponse (info pour l'attaquant).
 */
const ipFirewallMiddleware = (req, res, next) => {
  const ip = req.ip;

  // Vérifier ban actif
  const ban = checkBan(ip);
  if (ban && (ban.level === 'soft_ban' || ban.level === 'hard_ban')) {
    logger.security(`[T1] Requête bloquée — ${ip} (${ban.level}, ${ban.remainingMin} min)`);
    return res.status(429).json({
      success: false,
      message: `Trop de requêtes. Réessayez dans ${ban.remainingMin} minute(s).`,
      // Pas de 'level' dans la réponse — ne pas informer l'attaquant
    });
  }

  // IP en WARNING → ajouter un délai (ralentit sans bloquer)
  const entry = incidents.get(ip);
  if (entry?.level === 'warning') {
    return setTimeout(() => next(), CONFIG.WARNING_DELAY_MS);
  }

  next();
};

// Nettoyage toutes les 5 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of incidents.entries()) {
    if (entry.bannedUntil < now && entry.level !== 'warning' && now - entry.firstAt > CONFIG.WINDOW) {
      incidents.delete(ip);
    }
  }
}, 5 * 60 * 1000);

module.exports = {
  ipFirewallMiddleware,
  recordIncident,
  checkBan,
  unbanIp,
  listBannedIps,
  loadBansFromDb,
};
