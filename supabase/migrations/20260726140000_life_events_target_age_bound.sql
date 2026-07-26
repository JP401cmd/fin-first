-- ── life_events.target_age sanity-bound ─────────────────────────────
-- Vangnet tegen absurde leeftijden (bug WF-TOEK-15-bug3): een out-of-range
-- leeftijd (bv. 421) kon via de pane-editor door de client-write heen en werd
-- gepersisteerd. De echte, gebruikersspecifieke grens is [currentAge, endAge] en
-- wordt client-side afgedwongen; de DB kent dateOfBirth/fireStrategy niet, dus hier
-- alleen een RUIME, altijd-geldige sanity-bound die beide client-direct save-paden
-- (event-pane.tsx handleSave + horizon-client.tsx saveEvent/drag) op DB-niveau
-- beschermt zonder bestaande rijen te breken.
--
-- Data vooraf geverifieerd (26 jul 2026): 53 rijen, allemaal target_age 33-75,
-- géén violaties buiten 0-120 → ADD CONSTRAINT is veilig.
--
-- NULL blijft toegestaan (target_age is optioneel; events kunnen op target_date staan).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'life_events_target_age_sane'
  ) THEN
    ALTER TABLE life_events
      ADD CONSTRAINT life_events_target_age_sane
      CHECK (target_age IS NULL OR (target_age BETWEEN 0 AND 120));
  END IF;
END $$;
