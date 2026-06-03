require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const config = require('./config');
const { defaultLimiter } = require('./middleware/rateLimit');
const { escapeHtml, safeJson, isValidUUID } = require('./middleware/security');
const logger = require('./services/logger');
const prisma = require('./lib/prisma');
const terminator = require('./middleware/terminator');

const authRoutes    = require('./routes/auth');
const ridesRoutes   = require('./routes/rides');
const driversRoutes = require('./routes/drivers');
const usersRoutes   = require('./routes/users');
const adminRoutes   = require('./routes/admin');

const initSocket = require('./socket');

const app = express();
const server = http.createServer(app);

// ── TERMINATOR — Initialisation & Preflight ───────────────────
terminator.init();

// ── Vérifications de sécurité au démarrage (legacy) ──────────
if (config.env === 'production') {
  const criticalVars = ['JWT_SECRET', 'ADMIN_1_EMAIL', 'ADMIN_1_PASSWORD', 'DATABASE_URL'];
  const missing = criticalVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    logger.error(`Variables critiques manquantes en production: ${missing.join(', ')}`);
  }
  if (process.env.JWT_SECRET === 'dev-secret-change-in-prod') {
    logger.security('JWT_SECRET utilise la valeur par défaut en production — CRITIQUE');
  }
  if (process.env.OTP_BYPASS_DEV === 'true') {
    logger.security('OTP_BYPASS_DEV est activé en production — CRITIQUE');
  }
}

// ── CORS — origines strictement définies ──────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8081',
  'http://localhost:19006',
  'https://shifter-admin.netlify.app',
  ...(process.env.ADMIN_URL     ? [process.env.ADMIN_URL]     : []),
  ...(process.env.FRONTEND_URL  ? [process.env.FRONTEND_URL]  : []),
  // Expo Go en développement
  /^exp:\/\//,
  /^https:\/\/u\.expo\.dev/,
];

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  // Limite taille des messages Socket.io
  maxHttpBufferSize: 1e6, // 1MB
});

initSocket(io);
app.set('io', io);

// ── Middlewares ───────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", 'unpkg.com'],
      styleSrc:       ["'self'", "'unsafe-inline'", 'unpkg.com'],
      imgSrc:         ["'self'", 'data:', '*.tile.openstreetmap.org', '*.supabase.co'],
      connectSrc:     ["'self'", '*.supabase.co', 'api.expo.dev'],
      fontSrc:        ["'self'"],
      objectSrc:      ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Masquer la technologie utilisée
  hidePoweredBy: true,
}));

app.use(compression());
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logs HTTP — en prod, format combined pour avoir IP, user-agent, etc.
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

// Trust proxy (nécessaire sur Render pour rate-limit correct)
app.set('trust proxy', 1);

// ── TERMINATOR middlewares (T1 + T2) — avant tout le reste ───
app.use(terminator.middlewareStack);

// Rate limiter global — exclure /health
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/api/health') return next();
  return defaultLimiter(req, res, next);
});

// ── SUPPRIMÉ : /uploads ne doit PAS être servi publiquement ──
// Les documents chauffeurs passent désormais par des signed URLs Supabase
// (voir GET /api/drivers/documents/:docId/url)

// ── Routes API ────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/rides',   ridesRoutes);
app.use('/api/drivers', driversRoutes);
app.use('/api/users',   usersRoutes);
app.use('/api/admin',   adminRoutes);

// ── Page de suivi de trajet (publique) ───────────────────────
// SÉCURITÉ : toutes les données insérées dans le HTML sont échappées
// Les données passées au JS utilisent JSON.stringify (safe par définition)
app.get('/track/:rideId', async (req, res) => {
  // Validation UUID avant toute requête DB
  if (!isValidUUID(req.params.rideId)) {
    return res.status(404).send('<h2>Course introuvable</h2>');
  }

  try {
    const ride = await prisma.ride.findUnique({
      where: { id: req.params.rideId },
      include: {
        driver: { include: { user: { select: { firstName: true, lastName: true } } } },
        client: { select: { firstName: true } }
      }
    });
    if (!ride) return res.status(404).send('<h2>Course introuvable</h2>');

    // ── Données brutes (non échappées) — uniquement pour calculs ──
    const driverLat = parseFloat(ride.driver?.currentLat) || parseFloat(ride.pickupLat);
    const driverLng = parseFloat(ride.driver?.currentLng) || parseFloat(ride.pickupLng);

    // ── Données texte → HTML-escaped pour insertion dans le HTML ──
    const driverName = ride.driver
      ? escapeHtml(`${ride.driver.user.firstName} ${ride.driver.user.lastName}`)
      : 'En recherche...';
    const clientFirstName   = escapeHtml(ride.client?.firstName || 'Client');
    const dropoffLine1      = escapeHtml(ride.dropoffAddress?.split(',')[0] || '');
    const estimatedPrice    = parseFloat(ride.estimatedPrice || 0).toFixed(2);

    // ── Données pour le bloc <script> → JSON.stringify (safe) ────
    const rideIdJson         = safeJson(req.params.rideId);
    const apiBaseJson        = safeJson(process.env.RENDER_EXTERNAL_URL || 'https://shifter-bmbf.onrender.com');
    const pickupLatJson      = safeJson(parseFloat(ride.pickupLat));
    const pickupLngJson      = safeJson(parseFloat(ride.pickupLng));
    const dropoffLatJson     = safeJson(parseFloat(ride.dropoffLat));
    const dropoffLngJson     = safeJson(parseFloat(ride.dropoffLng));
    const driverLatJson      = safeJson(driverLat);
    const driverLngJson      = safeJson(driverLng);
    const pickupAddressJson  = safeJson(ride.pickupAddress || '');
    const dropoffAddressJson = safeJson(ride.dropoffAddress || '');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Suivi Shifter</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="anonymous"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="anonymous"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; background: #0f172a; color: #fff; height: 100vh; display: flex; flex-direction: column; }
    #map { flex: 1; }
    .info { padding: 16px; background: #1e293b; border-top: 1px solid #334155; }
    .info h2 { font-size: 16px; font-weight: 700; color: #f8fafc; }
    .info p { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .status { display: inline-flex; align-items: center; gap: 6px; background: #0f172a; border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 600; color: #10b981; margin-top: 8px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
    .row { display: flex; gap: 12px; margin-top: 10px; }
    .badge { background: #1e3a5f; border-radius: 10px; padding: 8px 12px; flex: 1; text-align: center; }
    .badge span { display: block; font-size: 11px; color: #64748b; }
    .badge strong { font-size: 15px; color: #60a5fa; }
    .branding { text-align: center; padding: 8px; font-size: 11px; color: #475569; }
    .branding strong { color: #f97316; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="info">
    <h2>&#x1F6F5; Course de ${clientFirstName}</h2>
    <p>Chauffeur : <strong style="color:#f8fafc">${driverName}</strong></p>
    <div class="status"><div class="dot"></div> Suivi en direct</div>
    <div class="row">
      <div class="badge"><span>Destination</span><strong>${dropoffLine1}</strong></div>
      <div class="badge"><span>Prix estimé</span><strong>${estimatedPrice} €</strong></div>
    </div>
  </div>
  <div class="branding">Propulsé par <strong>Shifter</strong> &#x1F6F5;</div>

  <script>
    // Toutes les variables sont sérialisées avec JSON.stringify — aucune injection possible
    const RIDE_ID = ${rideIdJson};
    const API     = ${apiBaseJson};

    const map = L.map('map').setView([${driverLatJson}, ${driverLngJson}], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    const motoIcon    = L.divIcon({ html: '<div style="font-size:28px;line-height:1">&#x1F6F5;</div>', className: '', iconAnchor: [14, 14] });
    const pickupIcon  = L.divIcon({ html: '<div style="font-size:22px;line-height:1">&#x1F4CD;</div>', className: '', iconAnchor: [11, 22] });
    const dropoffIcon = L.divIcon({ html: '<div style="font-size:22px;line-height:1">&#x1F3C1;</div>', className: '', iconAnchor: [11, 22] });

    L.marker([${pickupLatJson}, ${pickupLngJson}], { icon: pickupIcon })
      .addTo(map).bindPopup('Départ : ' + ${pickupAddressJson});
    L.marker([${dropoffLatJson}, ${dropoffLngJson}], { icon: dropoffIcon })
      .addTo(map).bindPopup('Arrivée : ' + ${dropoffAddressJson});

    let driverMarker = L.marker([${driverLatJson}, ${driverLngJson}], { icon: motoIcon }).addTo(map);

    async function refresh() {
      try {
        const r = await fetch(API + '/api/rides/' + RIDE_ID + '/track');
        if (!r.ok) return;
        const d = await r.json();
        if (typeof d.lat === 'number' && typeof d.lng === 'number') {
          driverMarker.setLatLng([d.lat, d.lng]);
          map.panTo([d.lat, d.lng], { animate: true, duration: 1 });
        }
        if (d.status === 'completed' || d.status === 'cancelled') {
          clearInterval(timer);
          document.querySelector('.dot').style.background = d.status === 'completed' ? '#f97316' : '#ef4444';
          document.querySelector('.status').lastChild.textContent = d.status === 'completed' ? ' Course terminée' : ' Course annulée';
        }
      } catch {}
    }

    const timer = setInterval(refresh, 4000);
    refresh();
  </script>
</body>
</html>`);
  } catch (err) {
    logger.error('Track page error', { rideId: req.params.rideId, error: err.message });
    res.status(500).send('<h2>Erreur</h2>');
  }
});

// ── API publique de position chauffeur (pour la page de suivi) ─
// SÉCURITÉ : retourne uniquement lat/lng/status — pas de données sensibles
app.get('/api/rides/:rideId/track', async (req, res) => {
  if (!isValidUUID(req.params.rideId)) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const ride = await prisma.ride.findUnique({
      where: { id: req.params.rideId },
      select: {
        status: true,
        driver: { select: { currentLat: true, currentLng: true } }
      }
    });
    if (!ride) return res.status(404).json({ error: 'Not found' });

    res.json({
      status: ride.status,
      lat: ride.driver?.currentLat ? parseFloat(ride.driver.currentLat) : null,
      lng: ride.driver?.currentLng ? parseFloat(ride.driver.currentLng) : null,
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Health Check (minimal — ne révèle pas l'environnement) ───
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route introuvable' });
});

// ── Gestionnaire d'erreurs global ─────────────────────────────
app.use((err, req, res, next) => {
  const errorId = Date.now().toString(36);
  logger.request(req, err, { errorId });

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Payload trop volumineux' });
  }

  res.status(err.status || 500).json({
    success: false,
    message: config.env === 'production' ? 'Une erreur est survenue' : err.message,
    errorId,
  });
});

// ── Démarrage ─────────────────────────────────────────────────
server.listen(config.port, () => {
  logger.info(`Shifter API démarré`, {
    port: config.port,
    env:  config.env,
  });
});

// ── Graceful shutdown ─────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} reçu — arrêt en cours...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// Capturer les rejets non gérés (évite les crashs silencieux)
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', { reason: String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message });
  process.exit(1);
});

module.exports = { app, server, io };
