const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const config = require('../config');

const prisma = new PrismaClient();

// ── OTP ──────────────────────────────────────────────────────
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendOtp = async (phone) => {
  const code = config.otp.bypassDev ? config.otp.devCode : generateOtp();
  const expiresAt = new Date(Date.now() + config.otp.expiresMinutes * 60 * 1000);

  // Invalider les anciens OTP pour ce numéro
  await prisma.otpCode.updateMany({
    where: { phone, used: false },
    data: { used: true }
  });

  await prisma.otpCode.create({ data: { phone, code, expiresAt } });

  if (!config.otp.bypassDev) {
    try {
      const twilio = require('twilio')(config.twilio.accountSid, config.twilio.authToken);
      await twilio.messages.create({
        body: `[TaxaMoto] Votre code de vérification : ${code}. Valable ${config.otp.expiresMinutes} minutes.`,
        from: config.twilio.phoneNumber,
        to: phone
      });
    } catch (err) {
      console.error('SMS error:', err.message);
      // En dev, on continue même si SMS échoue
      if (config.env === 'production') throw err;
    }
  } else {
    console.log(`[DEV OTP] ${phone} → ${code}`);
  }

  return { success: true, expiresAt };
};

const verifyOtp = async (phone, code) => {
  const otp = await prisma.otpCode.findFirst({
    where: { phone, code, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' }
  });

  if (!otp) {
    // Incrémenter les tentatives
    await prisma.otpCode.updateMany({
      where: { phone, used: false },
      data: { attempts: { increment: 1 } }
    });
    return { success: false, message: 'Code invalide ou expiré' };
  }

  // Marquer comme utilisé
  await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
  return { success: true };
};

// ── JWT ───────────────────────────────────────────────────────
const generateTokens = async (userId) => {
  const accessToken = jwt.sign({ userId }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const refreshTokenValue = crypto.randomBytes(64).toString('hex');

  await prisma.refreshToken.create({
    data: {
      userId,
      token: refreshTokenValue,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  return { accessToken, refreshToken: refreshTokenValue };
};

const refreshAccessToken = async (refreshTokenValue) => {
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { token: refreshTokenValue },
    include: { user: true }
  });

  if (!tokenRecord || tokenRecord.revoked || tokenRecord.expiresAt < new Date()) {
    return { success: false, message: 'Refresh token invalide' };
  }

  const accessToken = jwt.sign({ userId: tokenRecord.userId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn
  });

  return { success: true, accessToken };
};

const revokeRefreshToken = async (token) => {
  await prisma.refreshToken.updateMany({ where: { token }, data: { revoked: true } });
};

module.exports = { sendOtp, verifyOtp, generateTokens, refreshAccessToken, revokeRefreshToken };
