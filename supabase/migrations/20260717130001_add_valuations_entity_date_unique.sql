-- Borgt de remote al bestaande UNIQUE (entity_id, valuation_date) op valuations
-- in de migratie-historie. Alle valuations-upserts in de codebase gebruiken
-- onConflict 'entity_id,valuation_date' (herwaardering, check-in, asset/debt-edit,
-- entity-backfill); zonder dit bestand mist een schone rebuild deze constraint en
-- breken die upserts met "no unique or exclusion constraint matching the ON
-- CONFLICT specification". Idempotent: remote (waar de constraint al staat) is
-- dit een no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'valuations_entity_id_valuation_date_key'
      AND conrelid = 'public.valuations'::regclass
  ) THEN
    ALTER TABLE public.valuations
      ADD CONSTRAINT valuations_entity_id_valuation_date_key UNIQUE (entity_id, valuation_date);
  END IF;
END $$;
