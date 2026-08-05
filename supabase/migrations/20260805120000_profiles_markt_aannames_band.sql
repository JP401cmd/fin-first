-- Drift-herstel: de band op de markt-aannames van `profiles` terug in de repo,
-- zoals die op de LIVE database werkelijk staat — plus de kolom-defaults in de
-- juiste eenheid.
--
-- ── Wat er mis is ─────────────────────────────────────────────────────────────
-- Gemeten tegen `pg_constraint` en `pg_attrdef` op 05-08-2026 staat op productie:
--
--   profiles_expected_return_check  CHECK (expected_return >= 0.01 AND <= 0.15)   convalidated = t
--   profiles_inflation_rate_check   CHECK (inflation_rate  >= 0.00 AND <= 0.08)   convalidated = t
--   expected_return  DEFAULT 0.07   ·  inflation_rate  DEFAULT 0.02   (beide nullable)
--
-- Geen van beide constraint-namen komt voor in `supabase/migrations/` — dit is
-- out-of-band DDL zonder spiegel-migratie (ADR 0045 besluit 4). En
-- `20260215000000_create_base_tables.sql` r.20-21 zegt `DEFAULT 7` / `DEFAULT 2`;
-- dat bestand is nooit op productie gedraaid (de remote historie begint bij
-- `20260209212747`), maar het is wél wat een VERSE database uit deze repo krijgt.
-- Zeven en twee zijn PERCENTAGES in kolommen die de hele applicatie als FRACTIES
-- leest — daar staat dus 700% resp. 200%.
--
-- Netto: de repo-lijn en de live database lopen op twee punten uiteen, en de
-- repo-lijn is de foute van de twee.
--
-- ── Wat deze migratie doet ────────────────────────────────────────────────────
-- Niets nieuws bedenken; de live toestand codificeren, idempotent, zodat een
-- verse database hetzelfde krijgt als productie:
--
--   1. defaults naar de live waarden (0.07 / 0.02) — corrigeert de eenheidsfout
--      in de repo-lijn; op productie een no-op.
--   2. legacy percentage-waarden omrekenen naar hun fractie. Op productie 0
--      rijen (gemeten: 26 rijen, expected_return 0,05–0,07 met 1 NULL,
--      inflation_rate 0,02 met 1 NULL, nul buiten de band). Op een verse
--      database vangt dit de rijen op die de seeds vóór deze migratie met de
--      oude default 7 / 2 aanmaakten — `20260325000002_create_landing_test_users.sql`
--      en `20260530120000_seed_prefab_calculators.sql` inserten allebei zonder
--      deze kolommen. Bewust een puntmatch op exact 7 / 2 en geen bandtoets:
--      zo kan deze stap per constructie alleen de bekende bogus default raken
--      en nooit een echte gebruikerswaarde stilzwijgend wijzigen.
--   3. de twee CHECK-constraints, onder de namen die live al bestaan, met een
--      `IF NOT EXISTS`-wikkel. Op productie dus een no-op in plaats van een
--      42710-botsing; op een verse database landen ze alsnog.
--
-- BEWUST NIET IN DEZE MIGRATIE: `DROP DEFAULT`. Een eerdere opzet deed dat op de
-- aanname dat de default fout was (7/2). Live is hij 0.07/0.02 en dus correct,
-- en `public.handle_new_user()` — de trigger op `auth.users`, die eveneens niet
-- in de repo staat — doet `insert into public.profiles (id) values (new.id)`.
-- Droppen zou daarmee élke nieuwe aanmelding van 0,07/0,02 naar NULL kantelen,
-- en dat kantelt `hasFireParams` in `app/(app)/layout.tsx` (`expected_return !=
-- null || inflation_rate != null`) van true naar false: een gedragswijziging in
-- de coach-nudges van iedere nieuwe gebruiker. Dat is een productbesluit, geen
-- drift-herstel, en hoort niet ongemerkt in een schema-migratie mee te liften.
--
-- ── Bijbehorende codewijziging (zelfde change) ────────────────────────────────
-- `app/api/onboarding/save-own-data/route.ts` valideerde `expected_return` tot
-- 0,20 en `inflation_rate` tot 0,10 — ruimer dan de constraint die live al
-- bestaat. Een onboarding met een waarde daartussen gaf dus vandaag al een rauwe
-- 23514 in plaats van een nette validatiefout. Die banden komen nu uit
-- `lib/parameters-band.ts`, dezelfde bron die `PUT /api/parameters` en de
-- bewerk-sheet gebruiken.

-- 1. Defaults in de juiste eenheid (= de live waarden).
ALTER TABLE public.profiles ALTER COLUMN expected_return SET DEFAULT 0.07;
ALTER TABLE public.profiles ALTER COLUMN inflation_rate  SET DEFAULT 0.02;

-- 2. Legacy percentage-waarden naar hun fractie. Puntmatch, geen bandtoets.
UPDATE public.profiles SET expected_return = 0.07 WHERE expected_return = 7;
UPDATE public.profiles SET inflation_rate  = 0.02 WHERE inflation_rate  = 2;

-- 3. De band als harde grens, onder de namen die live al bestaan. Idempotent:
--    Postgres kent geen ADD CONSTRAINT IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_expected_return_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_expected_return_check
      CHECK (expected_return >= 0.01 AND expected_return <= 0.15);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_inflation_rate_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_inflation_rate_check
      CHECK (inflation_rate >= 0.00 AND inflation_rate <= 0.08);
  END IF;
END $$;

-- NB: een kale CHECK laat NULL toe (een CHECK die naar NULL evalueert is geen
-- schending), en dat is precies de bedoeling: NULL = "niet ingevuld", waarop de
-- applicatie terugvalt op DEFAULT_RETURN / INFLATION uit lib/constants.ts.
-- De definities hierboven zijn letterlijk die van de live constraints, zodat
-- repo en database op één vorm uitkomen.

COMMENT ON CONSTRAINT profiles_expected_return_check ON public.profiles IS
  'Verwacht bruto beleggingsrendement als FRACTIE (0,01-0,15). Spiegelt lib/parameters-band.ts, gedeeld met PUT /api/parameters en de onboarding-validatie. NULL = niet ingevuld.';

COMMENT ON CONSTRAINT profiles_inflation_rate_check ON public.profiles IS
  'Verwachte inflatie als FRACTIE (0-0,08). Spiegelt lib/parameters-band.ts. NULL = niet ingevuld.';
