-- ════════════════════════════════════════════════════════════════════
-- SHIFTER — Script de sécurité Supabase
-- À exécuter dans le SQL Editor de Supabase (une seule fois)
-- ════════════════════════════════════════════════════════════════════

-- ── 1. BUCKET PRIVÉ pour les documents chauffeurs ─────────────────
-- Exécuter dans Supabase Dashboard → Storage → driver-documents → Edit
-- Passer "Public bucket" → OFF (bucket privé)
-- OU via SQL :
UPDATE storage.buckets
SET public = false
WHERE name = 'driver-documents';

-- ── 2. Politique d'accès Storage : service_role uniquement ────────
-- Le backend utilise la service_role_key pour uploader → il a accès direct.
-- Les accès client se font UNIQUEMENT via les signed URLs générées par le backend.
-- Supprimer toute policy publique existante sur ce bucket :
DELETE FROM storage.policies
WHERE bucket_id = 'driver-documents';

-- Policy : accès lecture via service_role uniquement (le backend)
INSERT INTO storage.policies (name, bucket_id, operation, definition)
VALUES (
  'service-role-only',
  'driver-documents',
  'SELECT',
  'auth.role() = ''service_role'''
) ON CONFLICT DO NOTHING;

INSERT INTO storage.policies (name, bucket_id, operation, definition)
VALUES (
  'service-role-insert',
  'driver-documents',
  'INSERT',
  'auth.role() = ''service_role'''
) ON CONFLICT DO NOTHING;

INSERT INTO storage.policies (name, bucket_id, operation, definition)
VALUES (
  'service-role-update',
  'driver-documents',
  'UPDATE',
  'auth.role() = ''service_role'''
) ON CONFLICT DO NOTHING;

INSERT INTO storage.policies (name, bucket_id, operation, definition)
VALUES (
  'service-role-delete',
  'driver-documents',
  'DELETE',
  'auth.role() = ''service_role'''
) ON CONFLICT DO NOTHING;

-- ── 3. Colonne admin_role (si pas encore créée) ───────────────────
-- Cette colonne est utilisée par le middleware adminRole.js pour le RBAC
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'admin_role'
  ) THEN
    ALTER TABLE users ADD COLUMN admin_role VARCHAR(20) DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_users_admin_role ON users(admin_role);
    RAISE NOTICE 'Colonne admin_role ajoutée à la table users';
  ELSE
    RAISE NOTICE 'Colonne admin_role déjà présente';
  END IF;
END $$;

-- ── 4. Table admin_audit_logs (si pas encore créée) ───────────────
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(100) NOT NULL,
  target_id  UUID,
  target_type VARCHAR(50),
  details    JSONB,
  ip         VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id   ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON admin_audit_logs(created_at DESC);

-- ── 5. Contraintes de base sur les tables critiques ───────────────
-- S'assurer que les statuts sont dans des valeurs connues
DO $$
BEGIN
  -- Contrainte sur rides.status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'rides' AND constraint_name = 'rides_status_check'
  ) THEN
    ALTER TABLE rides ADD CONSTRAINT rides_status_check
      CHECK (status IN ('searching', 'accepted', 'driver_en_route', 'arrived', 'in_progress', 'completed', 'cancelled'));
  END IF;

  -- Contrainte sur drivers.availability
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'drivers' AND constraint_name = 'drivers_availability_check'
  ) THEN
    ALTER TABLE drivers ADD CONSTRAINT drivers_availability_check
      CHECK (availability IN ('online', 'offline', 'busy'));
  END IF;

  -- Contrainte sur drivers.status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'drivers' AND constraint_name = 'drivers_status_check'
  ) THEN
    ALTER TABLE drivers ADD CONSTRAINT drivers_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));
  END IF;
END $$;

-- ── 6. Index de performance + sécurité ────────────────────────────
-- Accélérer les lookups courants et les requêtes de sécurité
CREATE INDEX IF NOT EXISTS idx_users_phone       ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active   ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_rides_client_id   ON rides(client_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver_id   ON rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status      ON rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_created_at  ON rides(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token   ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked ON refresh_tokens(revoked);
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone   ON otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_otp_codes_used    ON otp_codes(used);

-- ── 7. Nettoyage automatique des données expirées ─────────────────
-- Supprimer les OTP expirés de plus de 1 jour (via Supabase cron ou pg_cron)
-- Créer un trigger pour maintenir les données propres :

CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_codes
  WHERE expires_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM refresh_tokens
  WHERE expires_at < NOW() - INTERVAL '7 days'
     OR (revoked = true AND created_at < NOW() - INTERVAL '30 days');
END;
$$ LANGUAGE plpgsql;

-- ── 8. Table security_bans (TERMINATOR T1 — persistance des bans IP) ─
-- Permet aux bans IP de survivre aux redémarrages Render
CREATE TABLE IF NOT EXISTS security_bans (
  ip           VARCHAR(45)  PRIMARY KEY,
  level        VARCHAR(20)  NOT NULL DEFAULT 'soft_ban',
  incidents    INT          NOT NULL DEFAULT 0,
  banned_until TIMESTAMPTZ  NOT NULL,
  reason       VARCHAR(200),
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- Index pour cleanup automatique des bans expirés
CREATE INDEX IF NOT EXISTS idx_security_bans_until ON security_bans(banned_until);

-- Nettoyage automatique des bans expirés (via trigger ou cron)
CREATE OR REPLACE FUNCTION cleanup_expired_bans()
RETURNS void AS $$
BEGIN
  DELETE FROM security_bans WHERE banned_until < NOW();
END;
$$ LANGUAGE plpgsql;

-- ── 10. Vérifications finales ──────────────────────────────────────
SELECT 'Bucket driver-documents privé' as check,
  CASE WHEN public = false THEN '✅ OK' ELSE '❌ Encore public!' END as status
FROM storage.buckets WHERE name = 'driver-documents';

SELECT 'Table admin_audit_logs' as check,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_audit_logs')
       THEN '✅ Présente' ELSE '❌ Manquante' END as status;

SELECT 'Colonne admin_role' as check,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'admin_role')
       THEN '✅ Présente' ELSE '❌ Manquante' END as status;
