const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { sendOtp, verifyOtp, generateTokens, refreshAccessToken, revokeRefreshToken } = require('../services/auth');
const { authenticate } = require('../middleware/auth');
const { otpLimiter } = require('../middleware/rateLimit');

const prisma = new PrismaClient();

// ── POST /auth/send-otp ─────────────────────────────────────
router.post('/send-otp',
  otpLimiter,
  body('phone').matches(/^\+?[1-9]\d{7,14}$/).withMessage('Numéro invalide'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { phone } = req.body;
      const result = await sendOtp(phone);
      res.json({ success: true, message: 'Code OTP envoyé', expiresAt: result.expiresAt });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Erreur envoi OTP' });
    }
  }
);

// ── POST /auth/verify-otp ───────────────────────────────────
router.post('/verify-otp',
  body('phone').matches(/^\+?[1-9]\d{7,14}$/).withMessage('Numéro invalide'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code OTP invalide'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { phone, code, firstName, lastName } = req.body;

      const otpResult = await verifyOtp(phone, code);
      if (!otpResult.success) {
        return res.status(400).json({ success: false, message: otpResult.message });
      }

      // Trouver ou créer l'utilisateur
      let user = await prisma.user.findUnique({ where: { phone } });
      const isNewUser = !user;

      if (!user) {
        user = await prisma.user.create({
          data: {
            phone,
            firstName: firstName || null,
            lastName: lastName || null,
            isVerified: true,
          }
        });
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { isVerified: true, lastLoginAt: new Date() }
        });
      }

      const { accessToken, refreshToken } = await generateTokens(user.id);

      res.json({
        success: true,
        isNewUser,
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          avatarUrl: user.avatarUrl,
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ── POST /auth/refresh-token ────────────────────────────────
router.post('/refresh-token',
  body('refreshToken').notEmpty(),
  async (req, res) => {
    const { refreshToken } = req.body;
    const result = await refreshAccessToken(refreshToken);
    if (!result.success) return res.status(401).json(result);
    res.json({ success: true, accessToken: result.accessToken });
  }
);

// ── POST /auth/logout ───────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) await revokeRefreshToken(refreshToken);
  res.json({ success: true, message: 'Déconnecté' });
});

// ── POST /auth/admin-login ──────────────────────────────────
// Connexion email + mot de passe pour les 2 admins (comptes fixes)
router.post('/admin-login',
  body('email').isEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Mot de passe requis'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { email, password } = req.body;

      // 2 comptes admin fixes (mot de passe en clair, privé côté serveur)
      const ADMINS = [
        {
          email: 'samyderradj57@gmail.com',
          password: process.env.ADMIN_1_PASSWORD || 'Smy9380',
          username: 'Samy15',
          firstName: 'Samy',
          lastName: 'Derradj',
        },
        {
          email: 'hamza.derradjpro@gmail.com',
          password: process.env.ADMIN_2_PASSWORD || 'Hmz9380',
          username: 'Hamza03',
          firstName: 'Hamza',
          lastName: 'Derradj',
        },
      ];

      const adminDef = ADMINS.find(
        a => a.email.toLowerCase() === email.trim().toLowerCase()
      );
      if (!adminDef || adminDef.password !== password) {
        return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
      }

      // Trouver ou créer l'utilisateur admin en base
      let user = await prisma.user.findFirst({ where: { email: adminDef.email } });
      if (!user) {
        const fakePhone = `+33600${adminDef.username.replace(/\D/g, '').padStart(6, '0')}`;
        user = await prisma.user.create({
          data: {
            phone: fakePhone,
            email: adminDef.email,
            firstName: adminDef.firstName,
            lastName: adminDef.lastName,
            role: 'admin',
            isActive: true,
            isVerified: true,
          }
        });
      }

      // S'assurer que le rôle est bien admin
      if (user.role !== 'admin') {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: 'admin', lastLoginAt: new Date() }
        });
      } else {
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      }

      const { accessToken, refreshToken } = await generateTokens(user.id);

      res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          username: adminDef.username,
          role: 'admin',
        }
      });
    } catch (err) {
      console.error('[Admin Login Error]', err.message);
      res.status(500).json({ success: false, message: 'Erreur serveur : ' + err.message });
    }
  }
);

// ── GET /auth/me ────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// ── PUT /auth/profile ───────────────────────────────────────
router.put('/profile', authenticate,
  body('firstName').optional().trim().isLength({ min: 2 }),
  body('lastName').optional().trim().isLength({ min: 2 }),
  body('email').optional().isEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { firstName, lastName, email, pushToken, language } = req.body;
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: { firstName, lastName, email, pushToken, language }
      });
      res.json({ success: true, user });
    } catch (err) {
      if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'Email déjà utilisé' });
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

module.exports = router;
