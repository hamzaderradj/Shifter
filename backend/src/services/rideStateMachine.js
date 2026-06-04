/**
 * RIDE STATE MACHINE — Source unique de vérité pour toutes les transitions d'état
 *
 * Graphe complet :
 *   searching → accepted → driver_en_route → arrived → in_progress → completed
 *       ↓           ↓             ↓              ↓           ↓
 *   cancelled   cancelled     cancelled      cancelled   cancelled (admin/system uniquement)
 *
 * États terminaux : completed, cancelled — aucune transition possible.
 * Toute transition invalide est refusée avec un message précis.
 *
 * Acteurs :
 *   driver  — chauffeur assigné à la course
 *   client  — client qui a commandé
 *   admin   — opérateur admin
 *   system  — processus interne (réconciliation, timeout, déconnexion)
 *   unknown — acteur non reconnu → accès refusé
 */

// Transitions autorisées : [from, to, [...acteurs]]
const TRANSITIONS = [
  ['searching',       'accepted',        ['driver']],
  ['accepted',        'driver_en_route', ['driver']],
  ['driver_en_route', 'arrived',         ['driver']],
  ['arrived',         'in_progress',     ['driver']],
  ['in_progress',     'completed',       ['driver']],
  // Annulations — chacun peut annuler sauf in_progress (admin/system only)
  ['searching',       'cancelled',       ['client', 'admin', 'system']],
  ['accepted',        'cancelled',       ['client', 'driver', 'admin', 'system']],
  ['driver_en_route', 'cancelled',       ['client', 'driver', 'admin', 'system']],
  ['arrived',         'cancelled',       ['client', 'driver', 'admin', 'system']],
  ['in_progress',     'cancelled',       ['admin', 'system']],
];

// Index O(1) : "from:to" → Set<acteur>
const transitionMap = new Map(
  TRANSITIONS.map(([from, to, actors]) => [`${from}:${to}`, new Set(actors)])
);

const TERMINAL_STATES = new Set(['completed', 'cancelled']);
const ACTIVE_STATES   = ['searching', 'accepted', 'driver_en_route', 'arrived', 'in_progress'];
const ALL_STATES      = [...ACTIVE_STATES, 'completed', 'cancelled'];

/**
 * Valide si une transition est autorisée pour un acteur donné.
 *
 * @param {string} fromStatus — statut actuel de la course
 * @param {string} toStatus   — statut cible
 * @param {string} actor      — 'driver' | 'client' | 'admin' | 'system' | 'unknown'
 * @returns {{ valid: boolean, reason: string|null }}
 */
const validateTransition = (fromStatus, toStatus, actor) => {
  if (TERMINAL_STATES.has(fromStatus)) {
    return {
      valid:  false,
      reason: `État terminal '${fromStatus}' — aucune transition possible`,
    };
  }

  const allowed = transitionMap.get(`${fromStatus}:${toStatus}`);
  if (!allowed) {
    return {
      valid:  false,
      reason: `Transition ${fromStatus} → ${toStatus} interdite`,
    };
  }

  if (!allowed.has(actor)) {
    return {
      valid:  false,
      reason: `'${actor}' ne peut pas effectuer ${fromStatus} → ${toStatus} (autorisé: ${[...allowed].join(', ')})`,
    };
  }

  return { valid: true, reason: null };
};

/**
 * Détermine le rôle d'un acteur par rapport à une course.
 *
 * @param {object|null} actor — objet user depuis le JWT (null = system)
 * @param {object}      ride  — course avec clientId et driver?.userId
 * @returns {'driver'|'client'|'admin'|'system'|'unknown'}
 */
const getActorRole = (actor, ride) => {
  if (!actor) return 'system';
  if (actor.role === 'admin') return 'admin';
  const driverUserId = ride.driver?.userId;
  if (driverUserId && driverUserId === actor.id) return 'driver';
  if (ride.clientId === actor.id) return 'client';
  return 'unknown';
};

const isTerminal = (status) => TERMINAL_STATES.has(status);

module.exports = {
  validateTransition,
  getActorRole,
  isTerminal,
  TERMINAL_STATES,
  ACTIVE_STATES,
  ALL_STATES,
  TRANSITIONS,
};
