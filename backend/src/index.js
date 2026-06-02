require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const { defaultLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const ridesRoutes = require('./routes/rides');
const driversRoutes = require('./routes/drivers');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

const initSocket = require('./socket');

const app = express();
const server = http.createServer(app);

// ── Vérifications de sécurité au démarrage ────────────────────
if (config.env === 'production') {
  const criticalVars = ['JWT_SECRET', 'ADMIN_1_EMAIL', 'ADMIN_1_PASSWORD', 'DATABASE_URL'];
  const missing = criticalVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`[SECURITY] Variables critiques manquantes: ${missing.join(', ')}`);
  }
  if (process.env.JWT_SECRET === 'dev-secret-change-in-prod') {
    console.error('[SECURITY] CRITIQUE: JWT_SECRET utilise la valeur par défaut en production!');
  }
  if (process.env.OTP_BYPASS_DEV === 'true') {
    console.error('[SECURITY] CRITIQUE: OTP_BYPASS_DEV est activé en production!');
  }
}

// ── CORS — origines strictement définies ──────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8081',
  'http://localhost:19006',
  // Admin panel — URL exacte uniquement (pas de wildcard Netlify)
  'https://shifter-admin.netlify.app',
  // Variable d'env pour permettre une URL custom en prod
  ...(process.env.ADMIN_URL ? [process.env.ADMIN_URL] : []),
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
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
  pingInterval: 25000
});

initSocket(io);
app.set('io', io);

// ── Middlewares ───────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'unpkg.com'], // Pour la page de tracking Leaflet
      styleSrc:  ["'self'", "'unsafe-inline'", 'unpkg.com'],
      imgSrc:    ["'self'", 'data:', '*.tile.openstreetmap.org', '*.supabase.co'],
      connectSrc: ["'self'", '*.supabase.co', 'api.expo.dev'],
      fontSrc:   ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"], // Interdit l'embedding dans des iframes
    },
  },
  hsts: {
    maxAge: 31536000, // 1 an
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(compression());
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
// Trust proxy (nécessaire sur Render/Heroku pour rate-limit correct)
app.set('trust proxy', 1);
// Rate limiter — exclure /api/health et monter la limite pour les apps mobiles
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  return defaultLimiter(req, res, next);
});

// Dossier uploads
const uploadsDir = path.join(__dirname, '../uploads/documents');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Routes API ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/rides', ridesRoutes);
app.use('/api/drivers', driversRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);

// ── Page de suivi de trajet (publique) ───────────────────────
app.get('/track/:rideId', async (req, res) => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const ride = await prisma.ride.findUnique({
      where: { id: req.params.rideId },
      include: {
        driver: { include: { user: { select: { firstName: true, lastName: true } } } },
        client: { select: { firstName: true } }
      }
    });
    if (!ride) return res.status(404).send('<h2>Course introuvable</h2>');

    const driverName = ride.driver
      ? `${ride.driver.user.firstName} ${ride.driver.user.lastName}`
      : 'En recherche...';
    const driverLat = ride.driver?.currentLat || ride.pickupLat;
    const driverLng = ride.driver?.currentLng || ride.pickupLng;

    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Suivi Shifter — ${ride.client.firstName}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
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
    <h2>🛵 Course de ${ride.client.firstName}</h2>
    <p>Chauffeur : <strong style="color:#f8fafc">${driverName}</strong></p>
    <div class="status"><div class="dot"></div> Suivi en direct</div>
    <div class="row">
      <div class="badge"><span>Destination</span><strong>${ride.dropoffAddress.split(',')[0]}</strong></div>
      <div class="badge"><span>Prix estimé</span><strong>${ride.estimatedPrice} €</strong></div>
    </div>
  </div>
  <div class="branding">Propulsé par <strong>Shifter</strong> 🛵</div>

  <script>
    const RIDE_ID = '${req.params.rideId}';
    const API = '${process.env.RENDER_EXTERNAL_URL || 'https://shifter-bmbf.onrender.com'}';

    const map = L.map('map').setView([${driverLat}, ${driverLng}], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);

    const motoIcon = L.divIcon({
      html: '<div style="font-size:28px;line-height:1">🛵</div>',
      className: '', iconAnchor: [14, 14]
    });
    const pickupIcon = L.divIcon({
      html: '<div style="font-size:22px;line-height:1">📍</div>',
      className: '', iconAnchor: [11, 22]
    });
    const dropoffIcon = L.divIcon({
      html: '<div style="font-size:22px;line-height:1">🏁</div>',
      className: '', iconAnchor: [11, 22]
    });

    L.marker([${ride.pickupLat}, ${ride.pickupLng}], { icon: pickupIcon })
      .addTo(map).bindPopup('Départ : ${ride.pickupAddress.replace(/'/g, "\\'")}');
    L.marker([${ride.dropoffLat}, ${ride.dropoffLng}], { icon: dropoffIcon })
      .addTo(map).bindPopup('Arrivée : ${ride.dropoffAddress.replace(/'/g, "\\'")}');

    let driverMarker = L.marker([${driverLat}, ${driverLng}], { icon: motoIcon }).addTo(map);

    async function refresh() {
      try {
        const r = await fetch(API + '/api/rides/' + RIDE_ID + '/track');
        const d = await r.json();
        if (d.lat && d.lng) {
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
  } catch (e) {
    res.status(500).send('<h2>Erreur</h2>');
  } finally {
    await prisma.$disconnect();
  }
});

// ── API publique de position chauffeur (pour la page de suivi) ─
app.get('/api/rides/:rideId/track', async (req, res) => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const ride = await prisma.ride.findUnique({
      where: { id: req.params.rideId },
      include: { driver: { select: { currentLat: true, currentLng: true } } }
    });
    if (!ride) return res.status(404).json({ error: 'Not found' });
    res.json({
      status: ride.status,
      lat: ride.driver?.currentLat ? parseFloat(ride.driver.currentLat) : null,
      lng: ride.driver?.currentLng ? parseFloat(ride.driver.currentLng) : null,
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  } finally {
    await prisma.$disconnect();
  }
});

// ── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: config.env
  });
});

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} introuvable` });
});

// ── Gestion des erreurs globale ───────────────────────────────
app.use((err, req, res, next) => {
  // Logger l'erreur complète côté serveur uniquement
  const errorId = Date.now().toString(36);
  console.error(`[ERROR:${errorId}]`, {
    method: req.method,
    path: req.path,
    ip: req.ip,
    error: err.message,
    stack: config.env !== 'production' ? err.stack : undefined,
  });

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Fichier trop volumineux' });
  }

  // En production : jamais de stack trace ou message interne
  res.status(err.status || 500).json({
    success: false,
    message: config.env === 'production' ? 'Une erreur est survenue' : err.message,
    errorId, // Permet de retrouver l'erreur dans les logs sans exposer les détails
  });
});

// ── Keep-alive (évite le sleep Render free tier) ──────────────
// UptimeRobot s'en charge déjà — pas besoin d'un ping interne
// (le http.get() natif ne supporte pas https, on supprime ce bloc)

// ── Démarrage ─────────────────────────────────────────────────
server.listen(config.port, () => {
  console.log(`
╔════════════════════════════════════════╗
║       🛵  TAXI MOTO API SERVER         ║
╠════════════════════════════════════════╣
║  Port:  ${config.port}                          ║
║  Mode:  ${config.env.padEnd(30)} ║
║  URL:   http://localhost:${config.port}          ║
╚════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

module.exports = { app, server, io };
