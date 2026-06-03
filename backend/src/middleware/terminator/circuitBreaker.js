/**
 * TERMINATOR — T3 : Circuit Breakers pour services externes
 * VERSION 2 — successCount fonctionnel + métriques complètes + tous services connectés
 *
 * Services couverts (tous actifs) :
 *   - Google Maps API   → autocomplete, getPlaceDetails, reverseGeocode, getRouteFromGoogle
 *   - Expo Push         → sendPushNotificationsAsync
 *   - Firebase Auth     → verifyIdToken
 *   - Supabase Storage  → upload, signedUrl
 *
 * États :
 *   CLOSED → normal
 *   OPEN   → service down, appels rejetés immédiatement
 *   HALF   → test de récupération (1 appel autorisé)
 */

const logger = require('../../services/logger');

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name             = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout  = options.recoveryTimeout  || 60_000;
    this.state            = 'CLOSED';
    this.failureCount     = 0;
    this.successCount     = 0;   // ← maintenant réellement incrémenté
    this.totalCalls       = 0;
    this.lastFailureAt    = null;
    this.lastSuccessAt    = null;
    this.openedAt         = null;
    this.openCount        = 0;   // combien de fois le circuit s'est ouvert
  }

  async call(fn, fallback = null) {
    this.totalCalls++;

    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureAt;
      if (elapsed >= this.recoveryTimeout) {
        this.state = 'HALF';
        logger.info(`[T3] Circuit ${this.name}: OPEN → HALF (test de récupération)`);
      } else {
        const remaining = Math.ceil((this.recoveryTimeout - elapsed) / 1000);
        logger.warn(`[T3] Circuit ${this.name} OPEN — rejet immédiat (${remaining}s restantes)`);
        if (fallback !== null) return typeof fallback === 'function' ? fallback() : fallback;
        const err = new Error(`Service ${this.name} temporairement indisponible`);
        err.code = 'CIRCUIT_OPEN';
        throw err;
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      // Ne pas compter comme échec si c'est une erreur métier (ex: token invalide Firebase)
      // On distingue les erreurs réseau/service des erreurs applicatives
      const isServiceError = this._isServiceError(err);
      if (isServiceError) {
        this._onFailure(err);
      }
      if (fallback !== null) return typeof fallback === 'function' ? fallback() : fallback;
      throw err;
    }
  }

  // Distingue les pannes service (réseau, timeout) des erreurs métier (ex: auth/invalid-token)
  _isServiceError(err) {
    // Erreurs Firebase métier → pas des pannes de service
    if (err.code?.startsWith('auth/')) return false;
    // Erreurs réseau, timeout, 5xx
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') return true;
    if (err.message?.includes('fetch failed')) return true;
    if (err.message?.includes('network')) return true;
    if (err.message?.includes('timeout')) return true;
    if (err.status >= 500) return true;
    // Par défaut sur les autres erreurs : compter comme service error
    return true;
  }

  _onSuccess() {
    this.successCount++;  // ← incrémenté ici
    this.lastSuccessAt = Date.now();
    this.failureCount  = 0;

    if (this.state === 'HALF') {
      this.state = 'CLOSED';
      logger.info(`[T3] Circuit ${this.name}: HALF → CLOSED (service récupéré)`);
    }
  }

  _onFailure(err) {
    this.failureCount++;
    this.lastFailureAt = Date.now();

    if (this.state === 'HALF') {
      this.state = 'OPEN';
      this.openCount++;
      logger.warn(`[T3] Circuit ${this.name}: HALF → OPEN (test échoué: ${err.message})`);
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.state    = 'OPEN';
      this.openedAt = Date.now();
      this.openCount++;
      logger.security(
        `[T3] Circuit ${this.name}: CLOSED → OPEN (${this.failureCount} échecs consécutifs)`
      );
    }
  }

  getStatus() {
    const successRate = this.totalCalls > 0
      ? Math.round((this.successCount / this.totalCalls) * 100)
      : 100;

    return {
      name:          this.name,
      state:         this.state,
      failureCount:  this.failureCount,
      successCount:  this.successCount,
      totalCalls:    this.totalCalls,
      successRate:   `${successRate}%`,
      openCount:     this.openCount,
      lastFailureAt: this.lastFailureAt ? new Date(this.lastFailureAt).toISOString() : null,
      lastSuccessAt: this.lastSuccessAt ? new Date(this.lastSuccessAt).toISOString() : null,
      openedAt:      this.openedAt      ? new Date(this.openedAt).toISOString()      : null,
    };
  }
}

// ── Instances ─────────────────────────────────────────────────
const breakers = {
  googleMaps: new CircuitBreaker('GoogleMaps', { failureThreshold: 3, recoveryTimeout: 60_000  }),
  expoPush:   new CircuitBreaker('ExpoPush',   { failureThreshold: 5, recoveryTimeout: 30_000  }),
  firebase:   new CircuitBreaker('Firebase',   { failureThreshold: 3, recoveryTimeout: 120_000 }),
  supabase:   new CircuitBreaker('Supabase',   { failureThreshold: 3, recoveryTimeout: 60_000  }),
};

// ── Wrappers publics ──────────────────────────────────────────

/** Google Maps — fallback: [] pour autocomplete, null pour les autres */
const withGoogleMaps = (fn, fallback = null) =>
  breakers.googleMaps.call(fn, fallback);

/** Expo Push — fallback: null (notification perdue, app continue) */
const withExpoPush = (fn) =>
  breakers.expoPush.call(fn, null);

/**
 * Firebase Auth — pas de fallback (l'auth doit échouer proprement).
 * IMPORTANT : les erreurs métier Firebase (auth/invalid-token, auth/expired)
 * ne comptent PAS comme pannes de service grâce à _isServiceError().
 */
const withFirebase = (fn) =>
  breakers.firebase.call(fn);

/** Supabase Storage — fallback: null */
const withSupabase = (fn, fallback = null) =>
  breakers.supabase.call(fn, fallback);

/** Statut de tous les circuits (pour le health check admin) */
const getAllBreakersStatus = () =>
  Object.values(breakers).map((b) => b.getStatus());

module.exports = {
  withGoogleMaps,
  withExpoPush,
  withFirebase,
  withSupabase,
  getAllBreakersStatus,
  breakers,
};
