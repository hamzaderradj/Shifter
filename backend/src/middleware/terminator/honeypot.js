/**
 * TERMINATOR — Phase 4 : Honeypots
 *
 * Routes pièges qui n'ont aucune raison d'être accédées par une vraie app.
 * Un accès = sonde ou attaquant → bannissement automatique.
 *
 * Première tentative → SOFT_BAN (30 min)
 * Récidive           → HARD_BAN (24h)
 *
 * Stratégie de réponse : répondre 200 avec du faux contenu
 * pour tromper les scanners automatiques (ils pensent avoir trouvé quelque chose).
 */

const { recordIncident } = require('./ipFirewall');
const { logSecurityEvent } = require('./securityLogger');
const logger = require('../../services/logger');

// Suivi des récidives en mémoire
const honeypotHits = new Map(); // ip → { count, firstAt }

// Routes pièges
const HONEYPOT_PATHS = new Set([
  '/admin-old',
  '/admin',
  '/wp-admin',
  '/wp-login.php',
  '/phpmyadmin',
  '/pma',
  '/api/phpmyadmin',
  '/.env',
  '/.env.local',
  '/.env.production',
  '/config',
  '/config.php',
  '/config.json',
  '/credentials',
  '/credentials.json',
  '/secrets',
  '/backup',
  '/backup.sql',
  '/dump.sql',
  '/database.sql',
  '/db.sql',
  '/shell',
  '/cmd',
  '/exec',
  '/eval',
  '/xmlrpc.php',
  '/cgi-bin',
  '/etc/passwd',
  '/proc/self/environ',
  '/server-status',
  '/server-info',
  '/.git/config',
  '/.git/HEAD',
  '/actuator',
  '/actuator/env',
  '/actuator/health',
  '/swagger',
  '/swagger-ui',
  '/api-docs',
  '/graphql',       // On n'utilise pas GraphQL — piège
  '/console',
  '/h2-console',
  '/solr',
  '/jmx',
]);

// Fausse réponse pour tromper les scanners
const FAKE_RESPONSES = {
  '/.env':            'APP_ENV=production\nDB_PASSWORD=change_me\n',
  '/config.json':     '{"database":{"host":"localhost","port":5432}}\n',
  '/wp-admin':        '<html><title>WordPress</title><body>Login</body></html>',
  '/phpmyadmin':      '<html><title>phpMyAdmin</title><body>Access denied</body></html>',
  'default':          'OK',
};

/**
 * Middleware honeypot.
 * Doit être monté AVANT les routes légitimes.
 */
const honeypotMiddleware = (req, res, next) => {
  const path = req.path.toLowerCase().split('?')[0];

  // Vérification exacte ou prefix
  const isHoneypot = HONEYPOT_PATHS.has(path) ||
    HONEYPOT_PATHS.has(req.path) ||
    path.startsWith('/.') ||               // Fichiers cachés
    path.includes('/../') ||               // Path traversal
    path.includes('/..%2f') ||             // URL encoded
    /\.(php|asp|aspx|jsp|cgi|pl|py|rb)$/i.test(path); // Extensions serveur

  if (!isHoneypot) return next();

  const ip  = req.ip;
  const now = Date.now();

  // Enregistrer la tentative
  const prev = honeypotHits.get(ip) || { count: 0, firstAt: now };
  prev.count++;
  honeypotHits.set(ip, prev);

  const isRepeat = prev.count > 1;

  logger.security(`[HONEYPOT] ${isRepeat ? 'RÉCIDIVE' : 'Accès'} sur ${req.path}`, {
    ip, count: prev.count, method: req.method, userAgent: req.headers['user-agent'],
  });

  // Incidents TERMINATOR T1
  const incidentCount = isRepeat ? 10 : 5; // Récidive → direct HARD_BAN
  for (let i = 0; i < incidentCount; i++) recordIncident(ip, 'honeypot');

  // Journal immuable T9
  logSecurityEvent({
    action:    isRepeat ? 'honeypot_repeat' : 'honeypot_access',
    ip,
    riskScore: isRepeat ? 95 : 75,
    details:   { path: req.path, method: req.method, repeat: prev.count },
  });

  // Réponse qui trompe les scanners (pas de 403 qui révèle qu'on surveille)
  const fakeBody = FAKE_RESPONSES[path] || FAKE_RESPONSES['default'];
  res.status(200).type('text').send(fakeBody);
};

// Nettoyage toutes les heures
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [ip, data] of honeypotHits.entries()) {
    if (data.firstAt < cutoff) honeypotHits.delete(ip);
  }
}, 60 * 60 * 1000);

module.exports = { honeypotMiddleware };
