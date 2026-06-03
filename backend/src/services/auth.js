const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const config = require('../config');

// ── OTP ──────────────────────────────────────────────────────
const OTP_MAX_ATTEMPTS = 5; // Blocage après 5 tentatives incorrectes

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendOtp = async (phone) => {
  const code = config.otp.bypassDev ? config.otp.devCode : generateOtp();
  const expiresAt = new Date(Date.now() + config.otp.expiresMinutes * 60 * 1000);

  // Invalider tous les OTP non utilisés pour ce numéro
  await prisma.otpCode.updateMany({
    where: { phone, used: false },
    data: { used: true }
  });

  await prisma.otpCode.create({ data: { phone, code, expiresAt } });

  if (!config.otp.bypassDev) {
    try {
      const twilio = require('twilio')(config.twilio.accountSid, config.twilio.authToken);
      await twilio.messages.create({
        body: `[Shifter] Votre code de vérification : ${code}. Valable ${config.otp.expiresMinutes} minutes.`,
        from: config.twilio.phoneNumber,
        to: phone
      });
    } catch (err) {
      console.error('SMS error:', err.message);
      if (config.env === 'production') throw err;
    }
  } else {
    // Ne jamais logger le code OTP en entier — masquer partiellement
    console.log(`[DEV OTP] ${phone.slice(0, 6)}*** → ${code.slice(0, 3)}***`);
  }

  return { success: true, expiresAt };
};

const verifyOtp = async (phone, code) => {
  // 1. Chercher le dernier OTP non utilisé pour ce numéro
  const latestOtp = await prisma.otpCode.findFirst({
    where: { phone, used: false },
    orderBy: { createdAt: 'desc' }
  });

  // 2. Vérifier si trop de tentatives → blocage (fail-closed)
  if (latestOtp && latestOtp.attempts >= OTP_MAX_ATTEMPTS) {
    // Invalider cet OTP et forcer une nouvelle demande
    await prisma.otpCode.update({
      where: { id: latestOtp.id },
      data: { used: true }
    });
    return {
      success: false,
      message: `Trop de tentatives incorrectes. Demandez un nouveau code.`
    };
  }

  // 3. Chercher l'OTP correspondant au code fourni
  const otp = await prisma.otpCode.findFirst({
    where: {
      phone,
      code,
      used: false,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!otp) {
    // Incrémenter les tentatives sur le dernier OTP actif
    if (latestOtp) {
      await prisma.otpCode.update({
        where: { id: latestOtp.id },
        data: { attempts: { increment: 1 } }
      }).catch(() => {});
    }
    return { success: false, message: 'Code invalide ou expiré' };
  }

  // 4. Marquer comme utilisé
  await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
  return { success: true };
};

// ── JWT ───────────────────────────────────────────────────────
const generateTokens = async (userId, expiresIn = config.jwt.expiresIn) => {
  if (!config.jwt.secret || config.jwt.secret === 'dev-secret-change-in-prod') {
    console.error('[SECURITY] JWT_SECRET non configuré ou utilise la valeur par défaut !');
    if (config.env === 'production') throw new Error('JWT_SECRET non sécurisé en production');
  }

  const accessToken = jwt.sign({ userId }, config.jwt.secret, { expiresIn });
  const refreshTokenValue = crypto.randomBytes(64).toString('hex');

  await prisma.refreshToken.create({
    data: {
      userId,
      token: refreshTokenValue,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 jours
    }
  });

  return { accessToken, refreshToken: refreshTokenValue };
};

const refreshAccessToken = async (refreshTokenValue) => {
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { token: refreshTokenValue },
    include: { user: true }
  });

  if (!tokenRecord) {
    return { success: false, message: 'Refresh token invalide' };
  }

  if (tokenRecord.revoked) {
    // Token révoqué réutilisé → possible token theft → révocation globale (fail-safe)
    console.warn(
      `[SECURITY] Refresh token révoqué réutilisé pour userId=${tokenRecord.userId} — révocation globale`
    );
    await prisma.refreshToken.updateMany({
      where: { userId: tokenRecord.userId, revoked: false },
      data: { revoked: true }
    });
    return {
      success: false,
      message: 'Session invalidée pour raison de sécurité. Reconnectez-vous.'
    };
  }

  if (tokenRecord.expiresAt < new Date()) {
    return { success: false, message: 'Session expirée. Reconnectez-vous.' };
  }

  // Rotation : révoquer l'ancien et créer un nouveau
  await prisma.refreshToken.update({
    where: { id: tokenRecord.id },
    data: { revoked: true }
  });

  const newAccessToken = jwt.sign(
    { userId: tokenRecord.userId },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
  const newRefreshValue = crypto.randomBytes(64).toString('hex');

  await prisma.refreshToken.create({
    data: {
      userId: tokenRecord.userId,
      token: newRefreshValue,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  return { success: true, accessToken: newAccessToken, refreshToken: newRefreshValue };
};

const revokeRefreshToken = async (token) => {
  await prisma.refreshToken.updateMany({ where: { token }, data: { revoked: true } });
};

module.exports = { sendOtp, verifyOtp, generateTokens, refreshAccessToken, revokeRefreshToken };
