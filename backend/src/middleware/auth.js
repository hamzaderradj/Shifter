const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../lib/prisma');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token manquant' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true, phone: true, email: true,
        firstName: true, lastName: true,
        role: true, isActive: true, isVerified: true,
        avatarUrl: true, pushToken: true,
        driver: {
          select: { id: true, status: true, availability: true }
        }
      }
    });

    if (!user) return res.status(401).json({ success: false, message: 'Utilisateur introuvable' });
    if (!user.isActive) return res.status(403).json({ success: false, message: 'Compte désactivé' });

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expiré', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Token invalide' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Accès refusé' });
  }
  next();
};

const requireDriver = async (req, res, next) => {
  if (!req.user.driver) {
    return res.status(403).json({ success: false, message: 'Profil chauffeur requis' });
  }
  if (req.user.driver.status !== 'approved') {
    return res.status(403).json({
      success: false,
      message: 'Compte chauffeur non approuvé',
      status: req.user.driver.status
    });
  }
  next();
};

module.exports = { authenticate, requireRole, requireDriver };
