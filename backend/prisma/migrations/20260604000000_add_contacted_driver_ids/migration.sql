-- Migration: add_contacted_driver_ids
-- Élimine la dépendance à rideOffers en mémoire.
-- Stocke en base les IDs des chauffeurs déjà contactés pour chaque course.
-- Survit à tout restart Render à n'importe quel moment du cycle de vie d'une course.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS contacted_driver_ids TEXT[] NOT NULL DEFAULT '{}';

-- Index partiel sur les rides en cours de recherche pour accélérer l'offer loop
CREATE INDEX IF NOT EXISTS idx_rides_searching
  ON rides (status, requested_at)
  WHERE status = 'searching';

-- Commentaire métier
COMMENT ON COLUMN rides.contacted_driver_ids IS
  'IDs (driver.id) des chauffeurs déjà contactés pour cette course. '
  'Persisté en DB pour survivre aux restarts backend. '
  'Écrit AVANT l''envoi de la notification pour garantir l''idempotence.';
