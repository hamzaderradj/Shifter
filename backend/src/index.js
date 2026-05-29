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

// ── Socket.io ─────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  config.frontendUrl,
  'http://localhost:5173',
  'http://localhost:8081',
  'http://localhost:19006',
  'https://shifter-admin.netlify.app',
  /^exp:\/\//,
  /^https:\/\/.*\.netlify\.app$/,
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
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
app.use(defaultLimiter);

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
  console.error('[ERROR]', err);

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Fichier trop volumineux' });
  }

  res.status(err.status || 500).json({
    success: false,
    message: config.env === 'production' ? 'Erreur serveur interne' : err.message
  });
});

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
