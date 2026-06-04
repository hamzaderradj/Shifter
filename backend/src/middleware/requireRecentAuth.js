/**
 * Middleware — Re-authentification admin pour actions critiques (Phase 8)
 *
 * Vérifie que le JWT admin a été émis il y a moins de X minutes.
 * Si le token est trop ancien, retourne 401 REAUTH_REQUIRED.
 * Le panel admin doit alors demander le mot de passe admin à nouveau.
 *
 * Actions nécessitant une re-auth récente (30min) :
 *   - Suspendre un chauffeur
 *   - Bannir une IP
 *   - Force-cancel une course
 *   - Supprimer/désactiver un utilisateur
 *   - Réinitialiser des données
 *
 * Le JWT iat (issued-at) est automatiquement inclus par jsonwebtoken.
 * Pas de modification nécessaire à la route d'auth.
 */

const { logSecurityEvent } = require('./terminator/securityLogger');

/**
 * @param {number} maxAgeMinutes — âge maximum du token en minutes (défaut: 30)
 */
const requireRecentAuth = (maxAgeMinutes = 30) => (req, res, next) => {
  const iat = req.user?.iat; // Timestamp UNIX "issued at" du JWT

  if (!iat) {
    return res.status(401).json({
      success: false,
      code:    'REAUTH_REQUIRED',
      message: 'Ré-authentification requise',
    });
  }

  const tokenAgeMs      = Date.now() - (iat * 1000);
  const tokenAgeMinutes = Math.round(tokenAgeMs / 60000);
  const maxMs           = maxAgeMinutes * 60 * 1000;

  if (tokenAgeMs > maxMs) {
    logSecurityEvent({
      action:    'reauth_required',
      ip:        req.ip,
      userId:    req.user?.id,
      riskScore: 10,
      details:   {
        path:            req.path,
        tokenAgeMinutes,
        maxAgeMinutes,
      },
    });

    return res.status(401).json({
      success:        false,
      code:           'REAUTH_REQUIRED',
      message:        `Session expirée pour cette action. Veuillez vous ré-authentifier (token: ${tokenAgeMinutes}min, max: ${maxAgeMinutes}min).`,
      maxAgeMinutes,
      tokenAgeMinutes,
    });
  }

  next();
};

module.exports = { requireRecentAuth };
