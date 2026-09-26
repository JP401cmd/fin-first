-- Backfill — inkomensverlies uit de catalogus dat EventPane als INKOMST opsloeg.
-- Eigenaarsbesluit 26-09-2026: bestaande foute gebeurtenissen direct corrigeren,
-- script eerst ter akkoord. NIET TOEGEPAST bij het schrijven.
--
-- GEEN DDL. Deze migratie raakt uitsluitend bestaande rijen van
-- public.life_events; er komt geen kolom, constraint, index of policy bij.
--
-- ── HET DEFECT ──────────────────────────────────────────────────────────────
-- `initFormState` (lib/horizon/event-pane-edit-form.ts) zette voor een NIEUW
-- event elk niet-nul `defaultMonthlyIncome` uit de catalogus op richting
-- 'income' — ook een negatief (inkomensverlies). `buildDraftEvent` schrijft een
-- maandblok altijd als POSITIEF bedrag, in `monthly_income_change` bij
-- richting 'income' en in `monthly_cost_change` bij 'expense'. Een verlies van
-- €1.000/mnd werd zo `monthly_income_change = +1000`: het plan werd rooskleuriger
-- in plaats van krapper.
--   * ingevoerd: 3b0616029 (08-05-2026, EventPane geboren mét de conditie;
--     via `git log -S` op de conditie, verhuisd naar lib/ in 3de308251)
--   * gefixt:    49696bb44 (26-09-2026) — op het moment van schrijven NIET
--     gepusht; de fout staat dus nog live tot die deploy.
--
-- Geraakte types = catalogus-entries met een NEGATIEF defaultMonthlyIncome die
-- de form-state NIET alsnog overschrijven:
--   part_time          −1000, duur 60 → tijdelijk blok  (sinds 15-06-2026
--                      hiddenFromCatalog, 5b1e0315f; daarvóór kiesbaar)
--   early_retirement   −2500, duur 0  → blijvend blok
--   werkloosheid       −1500, duur 12 → tijdelijk blok  } tot 38704f576
--   overlijden_partner −2500, duur 0  → blijvend blok   } (26-09-2026, ook nog
--                      niet gepusht) zonder berekend voorstel, dus óók geraakt
-- NIET geraakt: sabbatical en world_trip — hun story (`computeImpact`) zet de
-- richting expliciet op 'expense' en overschrijft de catalogus-richting.
--
-- ── NIET GERAAKTE PADEN (blijven buiten het criterium) ──────────────────────
-- AI-extractie/onboarding (app/api/onboarding/save-own-data,
-- lib/ai/local/local-extraction-defaults.ts), seed-persona's, de
-- pensioen-/strategie-editors en /api/life-events/strategie schrijven een
-- inkomensverlies als NEGATIEF `monthly_income_change`. Die rijen matchen
-- `monthly_income_change > 0` nooit.
--
-- ── HET CRITERIUM ───────────────────────────────────────────────────────────
-- Een rij is een bug-rij als ALLES geldt:
--   1. event_type ∈ de vier bovenstaande types;
--   2. monthly_income_change > 0 en monthly_cost_change = 0
--      (de richting-'income'-vorm die buildDraftEvent schreef);
--   3. het bedrag is EXACT de catalogus-default van dat type (1000/2500/1500/2500)
--      — een afwijkend bedrag kan een bewuste eigen invoer zijn (bv. een
--      vroegpensioenuitkering als inkomst gemodelleerd) en blijft ongemoeid;
--   4. duration_months past bij het catalogusblok (part_time/werkloosheid > 0,
--      early_retirement/overlijden_partner = 0);
--   5. created_at >= 2026-05-08 (het ontstaan van de fout);
--   6. ownership = 'personal' — zie TRIGGER hieronder;
--   7. nog geen auditmarker (idempotentie).
--
-- ── DE CORRECTIE ────────────────────────────────────────────────────────────
-- Exact de vorm die de GEFIXTE EventPane schrijft voor hetzelfde formulier:
--   monthly_cost_change := het bedrag, monthly_income_change := 0.
-- Niet `monthly_income_change := −bedrag`: dat is de AI-extractievorm, niet de
-- EventPane-vorm, en de gecorrigeerde rij moet identiek zijn aan een nieuw
-- opgeslagen rij.
--
-- ── TRIGGER ─────────────────────────────────────────────────────────────────
-- `trg_stamp_household_id` (BEFORE INSERT OR UPDATE, live gemeten tegen
-- pg_trigger/pg_get_functiondef, 26-09-2026) herschrijft `household_id` bij
-- ELKE update: `shared` → user_household_id() (auth.uid()-afhankelijk, in een
-- migratie NULL), anders NULL. Een update op een gedeelde rij zou dus de
-- huishoudkoppeling wissen. Daarom criterium 6: alleen persoonlijke rijen
-- (live: 0 persoonlijke rijen met household_id ≠ NULL, dus voor die rijen is de
-- trigger een no-op). Gedeelde bug-rijen worden alleen GETELD (NOTICE) en
-- vragen een apart besluit.
--
-- ── AUDITSPOOR / TERUGWEG ───────────────────────────────────────────────────
-- Elke gecorrigeerde rij krijgt in `metadata` de sleutel
--   richting_backfill_20260926 = {"bedrag": <n>, "was": "monthly_income_change"}
-- `buildDraftEvent` neemt onbekende metadata-sleutels over (restMetadata), dus de
-- marker overleeft een latere bewerking. De inverse staat klaar als bestand:
--   supabase/terugweg/terugweg_backfill_life_events_inkomensverlies_richting.sql
-- Bewust BUITEN supabase/migrations/: alles in die map geldt voor de release als
-- 'nog toe te passen' en zou de correctie direct terugdraaien (en generate.mjs
-- scant de map recursief). Nodig? Kopieer hem dan als nieuw, getimestampt
-- migratiebestand naar supabase/migrations/.
-- Waaraan je ziet dat het misging: een gebruiker meldt dat een bewust als
-- INKOMST ingevoerde vervroegd-pensioen-/part-time-regel ineens een uitgave is,
-- of de NA-telling wijkt af van het NOTICE-aantal.
--
-- ── LIVE GEMETEN VOORAF (public.life_events, 26-09-2026, alleen tellingen) ──
--   rijen totaal                                   : 57
--   part_time                                      :  0
--   early_retirement                               :  1 (inactief, aangemaakt
--                                                     vóór 08-05, maandblok 0/0)
--   werkloosheid / overlijden_partner              :  0 / 0
--   sabbatical / world_trip                        :  1 / 1, beide via
--                                                     monthly_cost_change (juist)
--   BUG-RIJEN VOLGENS CRITERIUM                    :  0
--   rijen met positief inkomen op een verliestype  :  0 (ook zonder criterium 3-5)
-- Op dit moment doet deze migratie dus NIETS. Zijn nut is de sweep NÁ de deploy
-- van 49696bb44 + 38704f576: tot die deploy kan early_retirement (en
-- werkloosheid/overlijden_partner) nog fout worden aangemaakt. Draai hem dus
-- pas ná die deploy, en tel vooraf opnieuw.
--
-- LINEAGE (26-09-2026): laatste in schema_migrations = 20260925120000
-- (job_runs_status_partial). Openstaand in de repo: 20261001120000
-- (ai_enabled_uit_zonder_keuze, bewust uitgesteld, raakt profiles — onafhankelijk
-- van deze migratie). Deze backfill bouwt op geen enkele ongedraaide kolom.
--
-- ── TELQUERY VOOR EN NA (draai identiek, vergelijk) ─────────────────────────
--   SELECT count(*) FILTER (WHERE metadata ? 'richting_backfill_20260926') AS gecorrigeerd,
--          count(*) FILTER (WHERE event_type IN ('part_time','early_retirement',
--                                  'werkloosheid','overlijden_partner')
--                             AND monthly_income_change > 0) AS positief_op_verliestype
--   FROM public.life_events;
--   VOOR: gecorrigeerd 0 | positief_op_verliestype N (live 26-09: 0)
--   NA:   gecorrigeerd = het NOTICE-aantal | positief_op_verliestype = N − dat aantal
--         (een rest > 0 = bewust buiten het criterium gebleven: ander bedrag,
--          gedeeld, of van vóór 08-05 — die per stuk laten beoordelen)
--
-- ── IDEMPOTENTIE ────────────────────────────────────────────────────────────
-- De UPDATE draagt de vertrektoestand als guard (monthly_income_change > 0 en
-- geen marker). Na één run staat monthly_income_change op 0 en de marker erop:
-- een tweede run matcht niets en meldt 0.

DO $$
DECLARE
  v_voor      integer;
  v_gedeeld   integer;
  v_geraakt   integer;
  v_na        integer;
BEGIN
  -- Telling vóór: bug-rijen volgens het volledige criterium (persoonlijk).
  SELECT count(*) INTO v_voor
  FROM public.life_events le
  WHERE le.ownership = 'personal'
    AND le.monthly_income_change > 0
    AND coalesce(le.monthly_cost_change, 0) = 0
    AND le.created_at >= timestamptz '2026-05-08 00:00:00+02'
    AND NOT (le.metadata ? 'richting_backfill_20260926')
    AND (
         (le.event_type = 'part_time'          AND le.monthly_income_change = 1000 AND le.duration_months > 0)
      OR (le.event_type = 'werkloosheid'       AND le.monthly_income_change = 1500 AND le.duration_months > 0)
      OR (le.event_type = 'early_retirement'   AND le.monthly_income_change = 2500 AND coalesce(le.duration_months, 0) = 0)
      OR (le.event_type = 'overlijden_partner' AND le.monthly_income_change = 2500 AND coalesce(le.duration_months, 0) = 0)
    );

  -- Zelfde criterium, maar gedeeld: alleen tellen, niet raken (zie TRIGGER).
  SELECT count(*) INTO v_gedeeld
  FROM public.life_events le
  WHERE le.ownership <> 'personal'
    AND le.monthly_income_change > 0
    AND coalesce(le.monthly_cost_change, 0) = 0
    AND le.created_at >= timestamptz '2026-05-08 00:00:00+02'
    AND NOT (le.metadata ? 'richting_backfill_20260926')
    AND (
         (le.event_type = 'part_time'          AND le.monthly_income_change = 1000 AND le.duration_months > 0)
      OR (le.event_type = 'werkloosheid'       AND le.monthly_income_change = 1500 AND le.duration_months > 0)
      OR (le.event_type = 'early_retirement'   AND le.monthly_income_change = 2500 AND coalesce(le.duration_months, 0) = 0)
      OR (le.event_type = 'overlijden_partner' AND le.monthly_income_change = 2500 AND coalesce(le.duration_months, 0) = 0)
    );

  UPDATE public.life_events le
  SET monthly_cost_change   = le.monthly_income_change,
      monthly_income_change = 0,
      metadata = le.metadata || jsonb_build_object(
        'richting_backfill_20260926',
        jsonb_build_object('bedrag', le.monthly_income_change, 'was', 'monthly_income_change')
      ),
      updated_at = now()
  WHERE le.ownership = 'personal'
    AND le.monthly_income_change > 0
    AND coalesce(le.monthly_cost_change, 0) = 0
    AND le.created_at >= timestamptz '2026-05-08 00:00:00+02'
    AND NOT (le.metadata ? 'richting_backfill_20260926')
    AND (
         (le.event_type = 'part_time'          AND le.monthly_income_change = 1000 AND le.duration_months > 0)
      OR (le.event_type = 'werkloosheid'       AND le.monthly_income_change = 1500 AND le.duration_months > 0)
      OR (le.event_type = 'early_retirement'   AND le.monthly_income_change = 2500 AND coalesce(le.duration_months, 0) = 0)
      OR (le.event_type = 'overlijden_partner' AND le.monthly_income_change = 2500 AND coalesce(le.duration_months, 0) = 0)
    );
  GET DIAGNOSTICS v_geraakt = ROW_COUNT;

  SELECT count(*) INTO v_na
  FROM public.life_events
  WHERE metadata ? 'richting_backfill_20260926';

  RAISE NOTICE 'richting_backfill_20260926: voor=% geraakt=% gemarkeerd_na=% gedeeld_niet_geraakt=%',
    v_voor, v_geraakt, v_na, v_gedeeld;

  -- Vangrail: de update mag nooit meer raken dan de voortelling.
  IF v_geraakt <> v_voor THEN
    RAISE EXCEPTION 'richting_backfill_20260926: geraakt (%) <> voortelling (%) — afgebroken', v_geraakt, v_voor;
  END IF;
END
$$;
