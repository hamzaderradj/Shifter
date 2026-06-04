const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { sendOtp, verifyOtp, generateTokens, refreshAccessToken, revokeRefreshToken } = require('../services/auth');
const { authenticate } = require('../middleware/auth');
const { otpLimiter, adminLoginLimiter, strictLimiter } = require('../middleware/rateLimit');
const { timingSafeCompare } = require('../middleware/security');
const firebaseAdmin = require('../services/firebase');
const { recordAuthFailure }   = require('../middleware/terminator/anomaly');
const { withFirebase }        = require('../middleware/terminator/circuitBreaker');
const { trackOtpRequest, trackAccountCreation } = require('../middleware/terminator/adaptiveDefense');
const { trackFingerprint }    = require('../middleware/terminator/deviceFingerprint');

// ── Normalisation numéro de téléphone ──────────────────────────
function normalizePhone(phone) {
  if (!phone) return phone;
  let p = phone.replace(/[\s\-\(\)\.]/g, '');
  if (p.startsWith('+330')) p = '+33' + p.slice(4);
  if (/^0\d{9}$/.test(p))  p = '+33' + p.slice(1);
  if (/^33\d{9}$/.test(p)) p = '+' + p;
  return p;
}

function getAlternativeFormats(phone) {
  const fmts = new Set();
  if (phone.startsWith('+33') && !phone.startsWith('+330')) {
    fmts.add('+330' + phone.slice(3));
    fmts.add('0' + phone.slice(3));
    fmts.add(phone.slice(1));
  }
  if (phone.startsWith('+330')) {
    fmts.add('+33' + phone.slice(4));
  }
  return Array.from(fmts);
}

// ── Vérification mot de passe admin (plaintext ou bcrypt hash) ──
// Si le mot de passe en env commence par '$2b$' → bcrypt hash
// Sinon → comparaison en temps constant
const verifyAdminPassword = async (stored, provided) => {
  if (!stored || !provided) return false;
  if (stored.startsWith('$2b$') || stored.startsWith('$2a$')) {
    return bcrypt.compare(provided, stored);
  }
  return timingSafeCompare(stored, provided);
};

// ── POST /auth/send-otp ─────────────────────────────────────
router.post(
  '/send-otp',
  otpLimiter,
  body('phone').matches(/^\+?[1-9]\d{7,14}$/).withMessage('Numéro invalide'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const phone = normalizePhone(req.body.phone);

      // T5 : détecter le flooding OTP
      const allowed = trackOtpRequest(req.ip, req.fingerprintId, phone);
      if (!allowed) {
        return res.status(429).json({ success: false, message: 'Trop de demandes OTP. Veuillez patienter.' });
      }

      const result = await sendOtp(phone);
      res.json({ success: true, message: 'Code OTP envoyé', expiresAt: result.expiresAt });
    } catch (err) {
      console.error('[OTP SEND]', err.message);
      res.status(500).json({ success: false, message: 'Erreur envoi OTP' });
    }
  }
);

// ── POST /auth/verify-otp ───────────────────────────────────
router.post(
  '/verify-otp',
  body('phone').matches(/^\+?[1-9]\d{7,14}$/).withMessage('Numéro invalide'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code OTP invalide'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    try {
      let { phone, code, firstName, lastName } = req.body;
      phone = normalizePhone(phone);

      let otpResult = await verifyOtp(phone, code);

      // Essayer les formats alternatifs si l'OTP a été créé avec un ancien format
      if (!otpResult.success) {
        for (const alt of getAlternativeFormats(phone)) {
          otpResult = await verifyOtp(alt, code);
          if (otpResult.success) break;
        }
      }

      if (!otpResult.success) {
        recordAuthFailure(req.ip, 'otp_invalid'); // TERMINATOR T2
        return res.status(400).json({ success: false, message: otpResult.message });
      }

      // ── Trouver l'utilisateur — lookup résilient ───────────
      let user = await prisma.user.findUnique({ where: { phone } });

      if (!user) {
        for (const altPhone of getAlternativeFormats(phone)) {
          user = await prisma.user.findFirst({ where: { phone: altPhone } });
          if (user) {
            await prisma.user
              .update({ where: { id: user.id }, data: { phone } })
              .catch(() => {});
            console.log(`[AUTH] Numéro corrigé en DB: ${altPhone} → ${phone} (userId: ${user.id})`);
            break;
          }
        }
      }

      const isNewUser = !user;

      if (!user) {
        user = await prisma.user.create({
          data: {
            phone,
            firstName: firstName?.trim() || null,
            lastName: lastName?.trim() || null,
            isVerified: true,
          }
        });
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { isVerified: true, isActive: true, lastLoginAt: new Date() }
        });
      }

      const { accessToken, refreshToken } = await generateTokens(user.id);

      const driver = await prisma.driver.findUnique({
        where: { userId: user.id },
        include: {
          documents: true,
          user: { select: { firstName: true, lastName: true, phone: true, avatarUrl: true } }
        }
      });

      // T5 : détecter la création de comptes en masse par IP/device
      if (isNewUser) trackAccountCreation(req.ip, req.fingerprintId);

      // T3-FP : associer le fingerprint à ce userId
      trackFingerprint(req.fingerprintId, user.id, req);

      res.json({
        success: true,
        isNewUser,
        accessToken,
        refreshToken,
        user: {
          id:        user.id,
          phone:     user.phone,
          firstName: user.firstName,
          lastName:  user.lastName,
          role:      user.role,
          avatarUrl: user.avatarUrl,
        },
        driver: driver || null,
      });
    } catch (err) {
      console.error('[OTP VERIFY]', err.message);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ── POST /auth/refresh-token ────────────────────────────────
router.post(
  '/refresh-token',
  body('refreshToken').notEmpty(),
  async (req, res) => {
    const { refreshToken } = req.body;
    const result = await refreshAccessToken(refreshToken);
    if (!result.success) return res.status(401).json(result);
    res.json({
      success: true,
      accessToken:  result.accessToken,
      refreshToken: result.refreshToken,
    });
  }
);

// ── POST /auth/logout ───────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) await revokeRefreshToken(refreshToken);
  res.json({ success: true, message: 'Déconnecté' });
});

// ── POST /auth/admin-login ──────────────────────────────────
router.post(
  '/admin-login',
  adminLoginLimiter,
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').notEmpty().isLength({ min: 6 }).withMessage('Mot de passe requis'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    // Délai fixe pour éviter les timing attacks (même durée si email inconnu ou mdp faux)
    await new Promise((r) => setTimeout(r, 300));

    try {
      const { email, password } = req.body;

      const ADMINS = [
        process.env.ADMIN_1_EMAIL && process.env.ADMIN_1_PASSWORD
          ? {
              email:     process.env.ADMIN_1_EMAIL,
              password:  process.env.ADMIN_1_PASSWORD,
              username:  process.env.ADMIN_1_USERNAME  || 'Admin1',
              firstName: process.env.ADMIN_1_FIRSTNAME || 'Admin',
              lastName:  process.env.ADMIN_1_LASTNAME  || '1',
            }
          : null,
        process.env.ADMIN_2_EMAIL && process.env.ADMIN_2_PASSWORD
          ? {
              email:     process.env.ADMIN_2_EMAIL,
              password:  process.env.ADMIN_2_PASSWORD,
              username:  process.env.ADMIN_2_USERNAME  || 'Admin2',
              firstName: process.env.ADMIN_2_FIRSTNAME || 'Admin',
              lastName:  process.env.ADMIN_2_LASTNAME  || '2',
            }
          : null,
      ].filter(Boolean);

      if (ADMINS.length === 0) {
        console.error('[ADMIN LOGIN] Variables ADMIN_x_EMAIL / ADMIN_x_PASSWORD non configurées');
        return res.status(503).json({ success: false, message: 'Service temporairement indisponible' });
      }

      const adminDef = ADMINS.find(
        (a) => a.email.toLowerCase() === email.trim().toLowerCase()
      );

      // Vérification en temps constant — même délai que l'email soit connu ou non
      const passwordOk = adminDef ? await verifyAdminPassword(adminDef.password, password) : false;

      if (!adminDef || !passwordOk) {
        console.warn(`[ADMIN LOGIN] Échec pour ${email} depuis ${req.ip}`);
        recordAuthFailure(req.ip, 'admin_login_failed'); // TERMINATOR T2
        // Message identique peu importe la raison (anti-énumération)
        return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
      }

      // Trouver ou créer l'utilisateur admin en base
      let user = await prisma.user.findFirst({ where: { email: adminDef.email } });
      if (!user) {
        const fakePhone = `+33600${adminDef.username.replace(/\D/g, '').padStart(6, '0')}`;
        user = await prisma.user.create({
          data: {
            phone:      fakePhone,
            email:      adminDef.email,
            firstName:  adminDef.firstName,
            lastName:   adminDef.lastName,
            role:       'admin',
            isActive:   true,
            isVerified: true,
          }
        });
      }

      if (user.role !== 'admin') {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: 'admin', lastLoginAt: new Date() }
        });
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() }
        });
      }

      // JWT admin — durée courte (8h)
      const { accessToken, refreshToken } = await generateTokens(user.id, '8h');

      console.log(`[ADMIN LOGIN] Connexion réussie: ${adminDef.email} depuis ${req.ip}`);
      await prisma.$executeRaw`
        INSERT INTO admin_audit_logs (admin_id, action, target_type, details, ip, created_at)
        VALUES (${user.id}, 'admin_login', 'auth',
          ${JSON.stringify({ email: adminDef.email, userAgent: req.headers['user-agent'] })}::jsonb,
          ${req.ip}, NOW())
      `.catch(() => {});

      res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id:        user.id,
          email:     user.email,
          firstName: user.firstName,
          lastName:  user.lastName,
          username:  adminDef.username,
          role:      'admin',
        }
      });
    } catch (err) {
      console.error('[Admin Login Error]', err.message);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ── POST /auth/verify-firebase-token ────────────────────────
// Point d'entrée principal — remplace send-otp + verify-otp
// Le client s'authentifie via Firebase Phone Auth (SMS géré par Google),
// puis envoie l'ID token Firebase. Le backend le vérifie et émet ses propres JWT.
router.post(
  '/verify-firebase-token',
  strictLimiter,
  body('idToken').notEmpty().isLength({ max: 4096 }).withMessage('ID token requis'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    try {
      // 1. Vérifier le token Firebase (expire après 1h, signé par Google)
      // withFirebase : circuit breaker — si Firebase est down, erreur propre sans ban IP
      const decoded = await withFirebase(() =>
        firebaseAdmin.auth().verifyIdToken(req.body.idToken, true)
      );

      const firebasePhone = decoded.phone_number;
      if (!firebasePhone) {
        return res.status(400).json({ success: false, message: 'Token invalide — numéro de téléphone manquant' });
      }

      // 2. Normaliser le numéro
      const phone = normalizePhone(firebasePhone);

      // 3. Trouver ou créer l'utilisateur
      let user = await prisma.user.findUnique({ where: { phone } });
      const isNewUser = !user;

      if (!user) {
        // Essayer les formats alternatifs (migration depuis anciens formats)
        for (const altPhone of getAlternativeFormats(phone)) {
          user = await prisma.user.findFirst({ where: { phone: altPhone } });
          if (user) {
            await prisma.user.update({ where: { id: user.id }, data: { phone } }).catch(() => {});
            break;
          }
        }
      }

      if (!user) {
        user = await prisma.user.create({
          data: { phone, isVerified: true }
        });
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { isVerified: true, isActive: true, lastLoginAt: new Date() }
        });
      }

      // 4. Émettre nos propres JWT (le token Firebase n'est pas utilisé après cette étape)
      const { accessToken, refreshToken } = await generateTokens(user.id);

      const driver = await prisma.driver.findUnique({
        where: { userId: user.id },
        include: {
          documents: true,
          user: { select: { firstName: true, lastName: true, phone: true, avatarUrl: true } }
        }
      });

      console.log(`[FIREBASE AUTH] Connexion réussie: ${phone} (uid=${decoded.uid}) depuis ${req.ip}`);

      res.json({
        success: true,
        isNewUser,
        accessToken,
        refreshToken,
        user: {
          id:        user.id,
          phone:     user.phone,
          firstName: user.firstName,
          lastName:  user.lastName,
          role:      user.role,
          avatarUrl: user.avatarUrl,
        },
        driver: driver || null,
      });
    } catch (err) {
      // Erreurs Firebase Auth
      if (err.code === 'auth/id-token-expired') {
        return res.status(401).json({ success: false, message: 'Session expirée, reconnectez-vous' });
      }
      if (err.code === 'CIRCUIT_OPEN') {
        // Firebase est down — pas la faute de l'utilisateur → pas de ban IP
        return res.status(503).json({ success: false, message: 'Service temporairement indisponible' });
      }
      if (err.code?.startsWith('auth/')) {
        // Erreur métier Firebase (token invalide, expiré) → ban IP
        recordAuthFailure(req.ip, 'firebase_token_invalid');
        return res.status(401).json({ success: false, message: 'Token invalide' });
      }
      console.error('[FIREBASE AUTH ERROR]', err.message);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ── GET /auth/me ────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ── PUT /auth/profile ───────────────────────────────────────
router.put(
  '/profile',
  authenticate,
  body('firstName').optional().trim().isLength({ min: 2, max: 50 }),
  body('lastName').optional().trim().isLength({ min: 2, max: 50 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('pushToken').optional().trim().isLength({ max: 200 }),
  body('language').optional().isIn(['fr', 'en', 'ar']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { firstName, lastName, email, pushToken, language } = req.body;
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          ...(firstName !== undefined && { firstName }),
          ...(lastName  !== undefined && { lastName }),
          ...(email     !== undefined && { email }),
          ...(pushToken !== undefined && { pushToken }),
          ...(language  !== undefined && { language }),
        }
      });
      res.json({ success: true, user });
    } catch (err) {
      if (err.code === 'P2002')
        return res.status(409).json({ success: false, message: 'Email déjà utilisé' });
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

module.exports = router;
