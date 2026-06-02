const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { sendOtp, verifyOtp, generateTokens, refreshAccessToken, revokeRefreshToken } = require('../services/auth');
const { authenticate } = require('../middleware/auth');
const { otpLimiter, adminLoginLimiter } = require('../middleware/rateLimit');

const prisma = new PrismaClient();

// ── POST /auth/send-otp ─────────────────────────────────────
router.post('/send-otp',
  otpLimiter,
  body('phone').matches(/^\+?[1-9]\d{7,14}$/).withMessage('Numéro invalide'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const phone = normalizePhone(req.body.phone);
      const result = await sendOtp(phone);
      res.json({ success: true, message: 'Code OTP envoyé', expiresAt: result.expiresAt });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Erreur envoi OTP' });
    }
  }
);

// ── Helpers normalisation numéro téléphone ──────────────────
function normalizePhone(phone) {
  if (!phone) return phone;
  let p = phone.replace(/[\s\-\(\)\.]/g, '');
  // +330XXXXXXXX → +33XXXXXXXX
  if (p.startsWith('+330')) p = '+33' + p.slice(4);
  // 0XXXXXXXXX (10 chiffres) → +33XXXXXXXXX
  if (/^0\d{9}$/.test(p)) p = '+33' + p.slice(1);
  // 33XXXXXXXXX sans + → +33XXXXXXXXX
  if (/^33\d{9}$/.test(p)) p = '+' + p;
  return p;
}

function getAlternativeFormats(phone) {
  const fmts = new Set();
  if (phone.startsWith('+33') && !phone.startsWith('+330')) {
    fmts.add('+330' + phone.slice(3));   // +33X → +330X (ancien format)
    fmts.add('0' + phone.slice(3));      // +33X → 0X   (format local)
    fmts.add(phone.slice(1));            // +33X → 33X  (sans +)
  }
  if (phone.startsWith('+330')) {
    fmts.add('+33' + phone.slice(4));   // +330X → +33X
  }
  return Array.from(fmts);
}

// ── POST /auth/verify-otp ───────────────────────────────────
router.post('/verify-otp',
  body('phone').matches(/^\+?[1-9]\d{7,14}$/).withMessage('Numéro invalide'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code OTP invalide'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      let { phone, code, firstName, lastName } = req.body;

      // Normaliser le numéro (format canonique +33XXXXXXXXX)
      phone = normalizePhone(phone);

      // Vérifier l'OTP — si bypass dev, accepter 123456 pour tout numéro
      let otpResult = await verifyOtp(phone, code);

      // Si OTP non trouvé avec le numéro normalisé, essayer les formats alternatifs
      // (l'OTP a peut-être été créé avec un ancien format stocké)
      if (!otpResult.success) {
        for (const alt of getAlternativeFormats(phone)) {
          otpResult = await verifyOtp(alt, code);
          if (otpResult.success) break;
        }
      }

      if (!otpResult.success) {
        return res.status(400).json({ success: false, message: otpResult.message });
      }

      // ── Trouver l'utilisateur — lookup résilient ───────────
      let user = await prisma.user.findUnique({ where: { phone } });

      // Pas trouvé avec le format normalisé → essayer les formats alternatifs
      // (numéro stocké en DB dans un ancien format)
      if (!user) {
        for (const altPhone of getAlternativeFormats(phone)) {
          user = await prisma.user.findFirst({ where: { phone: altPhone } });
          if (user) {
            // Auto-corriger le numéro en DB vers le format canonique
            await prisma.user.update({
              where: { id: user.id },
              data: { phone }
            }).catch(() => {}); // Non bloquant
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
            firstName: firstName || null,
            lastName: lastName || null,
            isVerified: true,
          }
        });
      } else {
        // isActive: true → un OTP réussi réactive toujours le compte
        // (évite les blocages accidentels via le panel admin)
        await prisma.user.update({
          where: { id: user.id },
          data: { isVerified: true, isActive: true, lastLoginAt: new Date() }
        });
      }

      const { accessToken, refreshToken } = await generateTokens(user.id);

      // Inclure le profil driver directement dans la réponse (évite un 2ème appel)
      const driver = await prisma.driver.findUnique({
        where: { userId: user.id },
        include: {
          documents: true,
          user: { select: { firstName: true, lastName: true, phone: true, avatarUrl: true } }
        }
      });

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
        },
        driver: driver || null,
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
router.post('/admin-login',
  adminLoginLimiter, // 5 tentatives / 15 min — protection brute force
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').notEmpty().isLength({ min: 6 }).withMessage('Mot de passe requis'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    // Délai fixe pour éviter le timing attack (même durée si email inconnu ou mdp faux)
    await new Promise(r => setTimeout(r, 200));

    try {
      const { email, password } = req.body;

      // Credentials admin depuis variables d'environnement UNIQUEMENT
      // Si ADMIN_1_PASSWORD n'est pas défini → blocage total (pas de fallback)
      const ADMINS = [
        process.env.ADMIN_1_EMAIL && process.env.ADMIN_1_PASSWORD ? {
          email: process.env.ADMIN_1_EMAIL,
          password: process.env.ADMIN_1_PASSWORD,
          username: process.env.ADMIN_1_USERNAME || 'Admin1',
          firstName: process.env.ADMIN_1_FIRSTNAME || 'Admin',
          lastName: process.env.ADMIN_1_LASTNAME || '1',
        } : null,
        process.env.ADMIN_2_EMAIL && process.env.ADMIN_2_PASSWORD ? {
          email: process.env.ADMIN_2_EMAIL,
          password: process.env.ADMIN_2_PASSWORD,
          username: process.env.ADMIN_2_USERNAME || 'Admin2',
          firstName: process.env.ADMIN_2_FIRSTNAME || 'Admin',
          lastName: process.env.ADMIN_2_LASTNAME || '2',
        } : null,
      ].filter(Boolean);

      if (ADMINS.length === 0) {
        console.error('[ADMIN LOGIN] Variables ADMIN_x_EMAIL / ADMIN_x_PASSWORD non configurées');
        return res.status(503).json({ success: false, message: 'Service temporairement indisponible' });
      }

      const adminDef = ADMINS.find(
        a => a.email.toLowerCase() === email.trim().toLowerCase()
      );

      // Message identique qu'il s'agisse d'un email inconnu ou d'un mauvais mot de passe (anti-enumération)
      if (!adminDef || adminDef.password !== password) {
        console.warn(`[ADMIN LOGIN] Échec pour ${email} depuis ${req.ip}`);
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

      // JWT admin avec durée courte — 8h (pas 7j comme les users mobiles)
      const { accessToken, refreshToken } = await generateTokens(user.id, '8h');

      // Audit log du succès de connexion admin
      console.log(`[ADMIN LOGIN] Connexion réussie: ${adminDef.email} depuis ${req.ip}`);
      await prisma.$executeRaw`
        INSERT INTO admin_audit_logs (admin_id, action, target_type, details, ip, created_at)
        VALUES (${user.id}, 'admin_login', 'auth',
          ${JSON.stringify({ email: adminDef.email, userAgent: req.headers['user-agent'] })}::jsonb,
          ${req.ip}, NOW())
      `.catch(() => {}); // Non bloquant

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
      // Ne pas exposer les détails d'erreur interne en prod
      res.status(500).json({ success: false, message: 'Erreur serveur' });
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
