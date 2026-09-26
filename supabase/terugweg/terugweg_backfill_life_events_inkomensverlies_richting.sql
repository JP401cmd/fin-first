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

DO $$
DECLARE
  v_voor     integer;
  v_bewerkt  integer;
  v_geraakt  integer;
BEGIN
  SELECT count(*) INTO v_voor
  FROM public.life_events
  WHERE metadata ? 'richting_backfill_20260926';

  SELECT count(*) INTO v_bewerkt
  FROM public.life_events le
  WHERE le.metadata ? 'richting_backfill_20260926'
    AND NOT (
      coalesce(le.monthly_income_change, 0) = 0
      AND le.monthly_cost_change = (le.metadata->'richting_backfill_20260926'->>'bedrag')::numeric
    );

  UPDATE public.life_events le
  SET monthly_income_change = (le.metadata->'richting_backfill_20260926'->>'bedrag')::numeric,
      monthly_cost_change   = 0,
      metadata              = le.metadata - 'richting_backfill_20260926',
      updated_at            = now()
  WHERE le.ownership = 'personal'
    AND le.metadata ? 'richting_backfill_20260926'
    AND coalesce(le.monthly_income_change, 0) = 0
    AND le.monthly_cost_change = (le.metadata->'richting_backfill_20260926'->>'bedrag')::numeric;
  GET DIAGNOSTICS v_geraakt = ROW_COUNT;

  RAISE NOTICE 'terugweg richting_backfill_20260926: gemarkeerd_voor=% teruggezet=% bewerkt_niet_teruggezet=%',
    v_voor, v_geraakt, v_bewerkt;
END
$$;
