-- ══════════════════════════════════════════════════════════════
-- TERMINATOR V3 — Migration sécurité
-- ══════════════════════════════════════════════════════════════

-- ── T9 : Journal de sécurité IMMUABLE ────────────────────────
-- Append-only : trigger bloque UPDATE et DELETE au niveau DB
CREATE TABLE IF NOT EXISTS security_events (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip           TEXT,
  fingerprint_id TEXT,
  user_id      TEXT,
  action       TEXT        NOT NULL,
  risk_score   INT         NOT NULL DEFAULT 0,
  details      JSONB
);

-- Trigger d'immutabilité
CREATE OR REPLACE FUNCTION _security_events_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'security_events are immutable — modification forbidden';
END;
$$;

DROP TRIGGER IF EXISTS no_modify_security_events ON security_events;
CREATE TRIGGER no_modify_security_events
  BEFORE UPDATE OR DELETE ON security_events
  FOR EACH ROW EXECUTE FUNCTION _security_events_immutable();

-- Index pour requêtes admin (lecture par IP, user, date)
CREATE INDEX IF NOT EXISTS idx_sec_events_ip        ON security_events (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_user       ON security_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_fp         ON security_events (fingerprint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_action     ON security_events (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_risk       ON security_events (risk_score DESC, created_at DESC);

-- ── T3 Phase 3 : Fingerprints appareils ──────────────────────
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fingerprint_id TEXT        NOT NULL UNIQUE,
  user_ids       TEXT[]      NOT NULL DEFAULT '{}',
  device_info    JSONB,
  first_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  account_count  INT         NOT NULL DEFAULT 1,
  is_banned      BOOLEAN     NOT NULL DEFAULT false,
  ban_reason     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fp_fingerprint_id ON device_fingerprints (fingerprint_id);
CREATE INDEX IF NOT EXISTS idx_fp_banned         ON device_fingerprints (is_banned) WHERE is_banned = true;

COMMENT ON TABLE device_fingerprints IS
  'Fingerprints des appareils mobiles. Permet de détecter plusieurs comptes sur le même appareil.';

-- ── Colonne fingerprint_id sur users ─────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS fingerprint_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_fingerprint ON users (fingerprint_id) WHERE fingerprint_id IS NOT NULL;

-- ── Nettoyage automatique security_events > 90 jours ────────
-- (via cron job dans le backend, pas de trigger ici pour préserver l'immuabilité)
COMMENT ON TABLE security_events IS
  'Journal de sécurité append-only. Modification interdite par trigger. Nettoyage > 90j via cron.';
