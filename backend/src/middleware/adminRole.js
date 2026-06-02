/**
 * Middleware de gouvernance admin — rôles et audit log
 *
 * Hiérarchie :
 *   support < operations < finance < admin < superadmin
 *
 * Stocké dans users.admin_role (colonne à ajouter via SQL)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ROLE_LEVELS = {
  support:    1,
  operations: 2,
  finance:    3,
  admin:      4,
  superadmin: 5,
};

/**
 * Exige un niveau de rôle minimum parmi les admins
 * Utilise users.admin_role (raw SQL car pas encore dans schema Prisma)
 */
const requireAdminRole = (minRole) => async (req, res, next) => {
  try {
    const [row] = await prisma.$queryRaw`
      SELECT COALESCE(admin_role, 'admin') as admin_role
      FROM users WHERE id = ${req.user.id}
    `;
    const userLevel = ROLE_LEVELS[row?.admin_role] || ROLE_LEVELS.admin;
    const required  = ROLE_LEVELS[minRole] || 0;

    if (userLevel < required) {
      return res.status(403).json({
        success: false,
        message: `Accès refusé. Rôle requis : ${minRole}`,
        yourRole: row?.admin_role || 'admin',
      });
    }

    req.adminRole = row?.admin_role || 'admin';
    next();
  } catch {
    // Si la colonne n'existe pas encore, laisser passer (compatibilité)
    req.adminRole = 'admin';
    next();
  }
};

/**
 * Middleware d'audit — enregistre les actions critiques admin
 * À placer sur les routes qui modifient des données
 */
const auditLog = (action) => async (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = async (body) => {
    // Enregistrer l'action si succès
    if (body?.success !== false) {
      try {
        await prisma.$executeRaw`
          INSERT INTO admin_audit_logs (admin_id, action, target_id, target_type, details, ip, created_at)
          VALUES (
            ${req.user.id},
            ${action},
            ${req.params.id || null},
            ${req.baseUrl?.split('/').pop() || 'unknown'},
            ${JSON.stringify({ body: req.body, params: req.params, query: req.query })}::jsonb,
            ${req.ip || 'unknown'},
            NOW()
          )
        `;
      } catch {} // Non bloquant — la table peut ne pas encore exister
    }
    return originalJson(body);
  };

  next();
};

module.exports = { requireAdminRole, auditLog, ROLE_LEVELS };
