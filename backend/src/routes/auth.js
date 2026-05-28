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
