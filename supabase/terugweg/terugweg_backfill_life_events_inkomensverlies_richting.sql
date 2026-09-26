-- TERUGWEG voor 20260926180000_backfill_life_events_inkomensverlies_richting.
-- NIET TOEGEPAST, en bewust BUITEN supabase/migrations/. Alleen gebruiken als de
-- backfill fout blijkt; dan dit bestand als nieuw, getimestampt migratiebestand
-- naar supabase/migrations/ kopiëren (nooit de backfill zelf bewerken).
--
-- Wat hij doet: zet precies de rijen met de auditmarker
-- `metadata.richting_backfill_20260926` terug naar hun vorige vorm
-- (monthly_income_change := bedrag, monthly_cost_change := 0) en haalt de marker
-- weg. GEEN DDL.
--
-- Zuiverheid: alleen rijen waarvan het maandblok nog EXACT is wat de backfill
-- schreef (cost = marker.bedrag, income = 0). Heeft de gebruiker de rij na de
-- backfill zelf bewerkt, dan is die bewerking de waarheid en blijft de rij staan;
-- die rijen worden geteld (`bewerkt_niet_teruggezet`) en per stuk beoordeeld.
-- Idempotent: na één run is de marker weg, een tweede run matcht niets.
--
-- Vervalsbare marker (security-review 27 sep): `metadata` is via de eigen-rij-UPDATE
-- door de gebruiker zelf te schrijven en de markernaam staat in een publieke repo.
-- Daarom:
--   * het bedrag wordt alleen gecast als het een JSON-getal is — via CASE, niet via
--     een losse AND, want de volgorde van WHERE-voorwaarden ligt niet vast. Een
--     marker als {"bedrag": "x"} geeft zo NULL in plaats van een cast-fout die de
--     hele terugweg voor iedereen zou afbreken;
--   * alleen rijen binnen hetzelfde criterium als de backfill (persoonlijk, type,
--     exact catalogusbedrag, duur, created_at vanaf 8 mei) komen in aanmerking;
--   * markers daarbuiten worden alleen geteld (`genegeerd`), nooit geraakt.

DO $$
DECLARE
  v_voor      integer;
  v_geldig    integer;
  v_bewerkt   integer;
  v_geraakt   integer;
BEGIN
  SELECT count(*) INTO v_voor
  FROM public.life_events
  WHERE metadata ? 'richting_backfill_20260926';

  WITH kandidaat AS (
    SELECT le.id,
           le.event_type,
           le.duration_months,
           le.monthly_income_change,
           le.monthly_cost_change,
           CASE WHEN jsonb_typeof(le.metadata->'richting_backfill_20260926'->'bedrag') = 'number'
                THEN (le.metadata->'richting_backfill_20260926'->>'bedrag')::numeric
           END AS bedrag
    FROM public.life_events le
    WHERE le.metadata ? 'richting_backfill_20260926'
      AND le.ownership = 'personal'
      AND le.created_at >= timestamptz '2026-05-08 00:00:00+02'
  ), geldig AS (
    SELECT * FROM kandidaat k
    WHERE k.bedrag IS NOT NULL
      AND (
           (k.event_type = 'part_time'          AND k.bedrag = 1000 AND k.duration_months > 0)
        OR (k.event_type = 'werkloosheid'       AND k.bedrag = 1500 AND k.duration_months > 0)
        OR (k.event_type = 'early_retirement'   AND k.bedrag = 2500 AND coalesce(k.duration_months, 0) = 0)
        OR (k.event_type = 'overlijden_partner' AND k.bedrag = 2500 AND coalesce(k.duration_months, 0) = 0)
      )
  )
  SELECT count(*),
         count(*) FILTER (WHERE NOT (coalesce(g.monthly_income_change, 0) = 0 AND g.monthly_cost_change = g.bedrag))
    INTO v_geldig, v_bewerkt
  FROM geldig g;

  WITH kandidaat AS (
    SELECT le.id,
           le.event_type,
           le.duration_months,
           CASE WHEN jsonb_typeof(le.metadata->'richting_backfill_20260926'->'bedrag') = 'number'
                THEN (le.metadata->'richting_backfill_20260926'->>'bedrag')::numeric
           END AS bedrag
    FROM public.life_events le
    WHERE le.metadata ? 'richting_backfill_20260926'
      AND le.ownership = 'personal'
      AND le.created_at >= timestamptz '2026-05-08 00:00:00+02'
  ), geldig AS (
    SELECT * FROM kandidaat k
    WHERE k.bedrag IS NOT NULL
      AND (
           (k.event_type = 'part_time'          AND k.bedrag = 1000 AND k.duration_months > 0)
        OR (k.event_type = 'werkloosheid'       AND k.bedrag = 1500 AND k.duration_months > 0)
        OR (k.event_type = 'early_retirement'   AND k.bedrag = 2500 AND coalesce(k.duration_months, 0) = 0)
        OR (k.event_type = 'overlijden_partner' AND k.bedrag = 2500 AND coalesce(k.duration_months, 0) = 0)
      )
  )
  UPDATE public.life_events le
  SET monthly_income_change = g.bedrag,
      monthly_cost_change   = 0,
      metadata              = le.metadata - 'richting_backfill_20260926',
      updated_at            = now()
  FROM geldig g
  WHERE le.id = g.id
    AND coalesce(le.monthly_income_change, 0) = 0
    AND le.monthly_cost_change = g.bedrag;
  GET DIAGNOSTICS v_geraakt = ROW_COUNT;

  RAISE NOTICE 'terugweg richting_backfill_20260926: gemarkeerd_voor=% geldig=% teruggezet=% bewerkt_niet_teruggezet=% genegeerd=%',
    v_voor, v_geldig, v_geraakt, v_bewerkt, v_voor - v_geldig;
END
$$;
