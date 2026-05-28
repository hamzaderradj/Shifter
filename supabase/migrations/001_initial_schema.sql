-- ============================================================
-- TAXI MOTO - Schéma initial PostgreSQL
-- Compatible Supabase & PostgreSQL standalone
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";  -- géolocalisation avancée

-- ── ENUM TYPES ──────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('client', 'driver', 'admin');
CREATE TYPE driver_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE driver_availability AS ENUM ('online', 'offline', 'busy');
CREATE TYPE ride_status AS ENUM (
  'searching',    -- client cherche un chauffeur
  'accepted',     -- chauffeur accepté
  'driver_en_route', -- chauffeur en route vers client
  'arrived',      -- chauffeur arrivé
  'in_progress',  -- course en cours
  'completed',    -- course terminée
  'cancelled'     -- course annulée
);
CREATE TYPE document_type AS ENUM (
  'id_card', 'driving_license', 'vehicle_registration',
  'insurance', 'profile_photo', 'vehicle_photo'
);
CREATE TYPE document_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE payment_method AS ENUM ('cash', 'mobile_money', 'card');
CREATE TYPE notification_type AS ENUM (
  'ride_request', 'ride_accepted', 'driver_arrived',
  'ride_started', 'ride_completed', 'ride_cancelled',
  'account_approved', 'account_rejected', 'promo', 'system'
);

-- ── TABLE: users ────────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone         VARCHAR(20) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE,
  first_name    VARCHAR(100),
  last_name     VARCHAR(100),
  avatar_url    TEXT,
  role          user_role NOT NULL DEFAULT 'client',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  push_token    TEXT,                          -- Expo push token
  language      VARCHAR(10) DEFAULT 'fr',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);

-- ── TABLE: otp_codes ────────────────────────────────────────
CREATE TABLE otp_codes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone       VARCHAR(20) NOT NULL,
  code        VARCHAR(6) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  attempts    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_phone ON otp_codes(phone);
CREATE INDEX idx_otp_expires ON otp_codes(expires_at);

-- ── TABLE: refresh_tokens ────────────────────────────────────
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ── TABLE: drivers ──────────────────────────────────────────
CREATE TABLE drivers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status            driver_status NOT NULL DEFAULT 'pending',
  availability      driver_availability NOT NULL DEFAULT 'offline',
  vehicle_make      VARCHAR(100),              -- marque moto (Honda, Yamaha...)
  vehicle_model     VARCHAR(100),
  vehicle_year      INT,
  vehicle_color     VARCHAR(50),
  vehicle_plate     VARCHAR(20),
  rating            DECIMAL(3,2) DEFAULT 0.00,
  total_rides       INT NOT NULL DEFAULT 0,
  total_earnings    DECIMAL(12,2) NOT NULL DEFAULT 0,
  rejection_reason  TEXT,
  -- localisation courante (mise à jour via Socket.io)
  current_lat       DECIMAL(10,8),
  current_lng       DECIMAL(11,8),
  location_updated_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drivers_user ON drivers(user_id);
CREATE INDEX idx_drivers_status ON drivers(status);
CREATE INDEX idx_drivers_availability ON drivers(availability);
-- Index spatial pour trouver les chauffeurs proches
CREATE INDEX idx_drivers_location ON drivers(current_lat, current_lng)
  WHERE availability = 'online' AND status = 'approved';

-- ── TABLE: driver_documents ─────────────────────────────────
CREATE TABLE driver_documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id   UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  type        document_type NOT NULL,
  file_url    TEXT NOT NULL,
  status      document_status NOT NULL DEFAULT 'pending',
  notes       TEXT,                             -- notes admin
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(driver_id, type)
);

CREATE INDEX idx_docs_driver ON driver_documents(driver_id);
CREATE INDEX idx_docs_status ON driver_documents(status);

-- ── TABLE: rides ────────────────────────────────────────────
CREATE TABLE rides (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id         UUID NOT NULL REFERENCES users(id),
  driver_id         UUID REFERENCES drivers(id),
  status            ride_status NOT NULL DEFAULT 'searching',
  -- Origine
  pickup_address    TEXT NOT NULL,
  pickup_lat        DECIMAL(10,8) NOT NULL,
  pickup_lng        DECIMAL(11,8) NOT NULL,
  -- Destination
  dropoff_address   TEXT NOT NULL,
  dropoff_lat       DECIMAL(10,8) NOT NULL,
  dropoff_lng       DECIMAL(11,8) NOT NULL,
  -- Tarification
  estimated_price   DECIMAL(10,2),
  final_price       DECIMAL(10,2),
  distance_km       DECIMAL(8,3),
  duration_minutes  INT,
  payment_method    payment_method NOT NULL DEFAULT 'cash',
  -- Timestamps
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at       TIMESTAMPTZ,
  picked_up_at      TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  cancelled_by      UUID REFERENCES users(id),
  -- Extras
  notes             TEXT,
  is_sos            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rides_client ON rides(client_id);
CREATE INDEX idx_rides_driver ON rides(driver_id);
CREATE INDEX idx_rides_status ON rides(status);
CREATE INDEX idx_rides_requested ON rides(requested_at DESC);

-- ── TABLE: ratings ──────────────────────────────────────────
CREATE TABLE ratings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id     UUID NOT NULL UNIQUE REFERENCES rides(id),
  from_user   UUID NOT NULL REFERENCES users(id),
  to_user     UUID NOT NULL REFERENCES users(id),
  score       INT NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ratings_ride ON ratings(ride_id);
CREATE INDEX idx_ratings_to ON ratings(to_user);

-- ── TABLE: notifications ────────────────────────────────────
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB,                            -- données extra (ride_id, etc.)
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user ON notifications(user_id);
CREATE INDEX idx_notif_read ON notifications(user_id, is_read);

-- ── TABLE: favorite_addresses ───────────────────────────────
CREATE TABLE favorite_addresses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       VARCHAR(100) NOT NULL,           -- 'Maison', 'Bureau', etc.
  address     TEXT NOT NULL,
  lat         DECIMAL(10,8) NOT NULL,
  lng         DECIMAL(11,8) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_favorites_user ON favorite_addresses(user_id);

-- ── TABLE: ride_tracking ────────────────────────────────────
-- Historique GPS pour audit / support
CREATE TABLE ride_tracking (
  id          BIGSERIAL PRIMARY KEY,
  ride_id     UUID NOT NULL REFERENCES rides(id),
  driver_id   UUID NOT NULL REFERENCES drivers(id),
  lat         DECIMAL(10,8) NOT NULL,
  lng         DECIMAL(11,8) NOT NULL,
  speed       DECIMAL(6,2),                    -- km/h
  heading     DECIMAL(6,2),                    -- direction
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tracking_ride ON ride_tracking(ride_id);
CREATE INDEX idx_tracking_time ON ride_tracking(recorded_at DESC);

-- ── TABLE: promo_codes ──────────────────────────────────────
CREATE TABLE promo_codes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(50) UNIQUE NOT NULL,
  discount_pct    INT CHECK (discount_pct BETWEEN 1 AND 100),
  discount_flat   DECIMAL(10,2),
  max_uses        INT,
  used_count      INT NOT NULL DEFAULT 0,
  valid_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until     TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TABLE: support_tickets ──────────────────────────────────
CREATE TABLE support_tickets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id),
  ride_id     UUID REFERENCES rides(id),
  subject     VARCHAR(255) NOT NULL,
  message     TEXT NOT NULL,
  status      VARCHAR(50) NOT NULL DEFAULT 'open',
  response    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TRIGGERS: updated_at auto-update ────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_drivers_updated BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_rides_updated BEFORE UPDATE ON rides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_docs_updated BEFORE UPDATE ON driver_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── TRIGGER: mise à jour rating chauffeur ───────────────────
CREATE OR REPLACE FUNCTION update_driver_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_driver_id UUID;
  v_avg DECIMAL(3,2);
BEGIN
  -- Récupérer le driver_id depuis la course
  SELECT r.driver_id INTO v_driver_id
  FROM rides r WHERE r.id = NEW.ride_id;

  IF v_driver_id IS NOT NULL THEN
    -- Calculer la nouvelle moyenne
    SELECT AVG(rt.score) INTO v_avg
    FROM ratings rt
    JOIN rides rd ON rd.id = rt.ride_id
    WHERE rd.driver_id = v_driver_id;

    UPDATE drivers SET rating = ROUND(v_avg, 2)
    WHERE id = v_driver_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_rating AFTER INSERT ON ratings
  FOR EACH ROW EXECUTE FUNCTION update_driver_rating();

-- ── TRIGGER: compteur courses chauffeur ─────────────────────
CREATE OR REPLACE FUNCTION increment_driver_rides()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE drivers
    SET total_rides = total_rides + 1,
        total_earnings = total_earnings + COALESCE(NEW.final_price, 0) * 0.80
    WHERE id = NEW.driver_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_driver_rides AFTER UPDATE ON rides
  FOR EACH ROW EXECUTE FUNCTION increment_driver_rides();

-- ── FUNCTION: Chauffeurs proches ──────────────────────────────
CREATE OR REPLACE FUNCTION find_nearby_drivers(
  p_lat DECIMAL,
  p_lng DECIMAL,
  p_radius_km DECIMAL DEFAULT 5
)
RETURNS TABLE (
  driver_id UUID,
  user_id UUID,
  distance_km DECIMAL,
  rating DECIMAL,
  vehicle_make VARCHAR,
  vehicle_model VARCHAR,
  vehicle_color VARCHAR,
  first_name VARCHAR,
  last_name VARCHAR,
  avatar_url TEXT,
  current_lat DECIMAL,
  current_lng DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.user_id,
    ROUND(
      CAST(
        6371 * acos(
          cos(radians(p_lat)) * cos(radians(d.current_lat)) *
          cos(radians(d.current_lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(d.current_lat))
        ) AS DECIMAL
      ), 2
    ) AS distance_km,
    d.rating,
    d.vehicle_make,
    d.vehicle_model,
    d.vehicle_color,
    u.first_name,
    u.last_name,
    u.avatar_url,
    d.current_lat,
    d.current_lng
  FROM drivers d
  JOIN users u ON u.id = d.user_id
  WHERE
    d.status = 'approved'
    AND d.availability = 'online'
    AND d.current_lat IS NOT NULL
    AND d.current_lng IS NOT NULL
    AND (
      6371 * acos(
        cos(radians(p_lat)) * cos(radians(d.current_lat)) *
        cos(radians(d.current_lng) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(d.current_lat))
      )
    ) <= p_radius_km
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql;

-- ── DONNÉES INITIALES ─────────────────────────────────────────
-- Admin par défaut (mot de passe hashé à changer au premier lancement)
INSERT INTO users (phone, email, first_name, last_name, role, is_active, is_verified)
VALUES ('+000000000', 'admin@taxamoto.com', 'Admin', 'TaxaMoto', 'admin', TRUE, TRUE);

-- Codes promo de bienvenue
INSERT INTO promo_codes (code, discount_pct, max_uses, valid_until)
VALUES
  ('BIENVENUE20', 20, 1000, NOW() + INTERVAL '1 year'),
  ('PROMO10', 10, 500, NOW() + INTERVAL '6 months');
