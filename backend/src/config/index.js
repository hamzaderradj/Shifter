require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-prod',
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',   // TERMINATOR: réduit de 7j à 2h
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  otp: {
    bypassDev: process.env.OTP_BYPASS_DEV === 'true',
    devCode: '123456',
    expiresMinutes: 10,
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM || 'noreply@taxamoto.com',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  pricing: {
    baseFare: parseFloat(process.env.BASE_FARE) || 2.50,
    pricePerKm: parseFloat(process.env.PRICE_PER_KM) || 1.50,
    pricePerMinute: parseFloat(process.env.PRICE_PER_MINUTE) || 0.15,
    minFare: parseFloat(process.env.MIN_FARE) || 5.00,
    platformCommission: parseFloat(process.env.PLATFORM_COMMISSION) || 0.20,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 500,
    otpMax: parseInt(process.env.OTP_RATE_LIMIT_MAX, 10) || 5,
  },

  expo: {
    accessToken: process.env.EXPO_ACCESS_TOKEN,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
};
