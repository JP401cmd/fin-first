-- Bevinding H8 — "Onmogelijke bedragen zonder vraag geaccepteerd".
--
-- ── Wat er mis is ─────────────────────────────────────────────────────────────
-- Op `public.assets` staat vandaag GEEN enkele grens op de getalkolommen
-- (geverifieerd tegen pg_constraint op 27-08-2026: alleen enum-checks op
-- asset_type/ownership/risk_profile/retirement_provider_type/source en de
-- 0-100-check op net_worth_inclusion_pct). Concreet:
--
--   current_value          NUMERIC NOT NULL DEFAULT 0   -- geen boven-/ondergrens
--   purchase_value         NUMERIC NOT NULL DEFAULT 0   -- idem
--   monthly_contribution   NUMERIC NOT NULL DEFAULT 0   -- idem
--   expected_return        NUMERIC NOT NULL DEFAULT 0   -- idem (PERCENT-schaal)
--
-- Daardoor kon `current_value = 999999999999` gewoon landen ("TOTALE WAARDE
-- €1.000.000.507.699", "Afschrijving −€150.000.000.000/jr" uit de bevinding), en
-- kon `expected_return = 665,5` blijven staan — de bevestigde productiebug
-- achter H1/H7.
--
-- Dat dit niet met een route-check alleen te dichten is, staat al eerder in deze
-- repo opgeschreven (zie 20260805120000 voor `profiles`): de RLS-policy is
-- eigen-rij maar KOLOM-onafhankelijk, dus een gebruiker met de anon-key en zijn
-- eigen token kan élke route omzeilen met een directe PostgREST-call. Zonder
-- constraint is een band alleen een norm voor onze eigen code. Via de
-- huishoudprojectie reikt een gedeelde bezitting bovendien tot de cijfers die de
-- PARTNER ziet.
--
-- ── Wat deze migratie doet ────────────────────────────────────────────────────
-- Vier CHECK-constraints, idempotent (Postgres kent geen ADD CONSTRAINT IF NOT
-- EXISTS). Spiegelt `lib/asset-parameter-bands.ts`; wijzig je de band daar,
-- schrijf dan óók een nieuwe migratie.
--
-- ── Waarom de DB-grens RUIM is en de app-band strak ───────────────────────────
-- Deze constraints zijn bewust NIET per asset-type. Dat zou een CASE over
-- dertien types worden die bij elke productwijziging DDL vraagt, terwijl de
-- per-type band in `lib/asset-parameter-bands.ts` (ASSET_RETURN_BANDS) dat werk
-- zonder migratie doet en de foutmelding levert die de gebruiker ziet. De
-- constraint is het slot op de deur die de RLS openlaat: hij vangt het
-- ONMOGELIJKE af, de app-band het onplausibele.
--
--   expected_return  −100 … 100  — −100% is de wiskundige bodem (daaronder wordt
--                                  het bezit negatief); +100% p.j. is geen
--                                  planningsaanname meer. Negatief MOET kunnen:
--                                  'vehicle' en 'physical' schrijven af.
--   bedragen          0 … grens   — grenzen uit ASSET_AMOUNT_LIMITS. Bewust
--                                  royaal: de eigenaar koos optie B (server
--                                  ruim, client vraagt vanaf €10 mln door met
--                                  een vrijheidstijd-vertaling), zodat een
--                                  legitieme UHNW-gebruiker niet hard geweigerd
--                                  wordt.
--
-- ── Geverifieerd tegen de bestaande rijen (27-08-2026, 88 rijen) ──────────────
-- Een ADD CONSTRAINT valideert bestaande rijen; een te strakke band zou de
-- migratie hier laten klappen. Gemeten vóór het schrijven van dit bestand:
--   0 rijen met current_value/purchase_value/monthly_contribution < 0
--   0 rijen met expected_return < −100 of > 30   (feitelijk bereik: −12 … 7)
--   0 rijen met purchase_date in de toekomst
--   hoogste current_value: 1.000.000 (eigen_huis)
-- Alle bestaande rijen vallen dus binnen deze constraints; geen backfill nodig.
--
-- ── BEWUST NIET IN DEZE MIGRATIE: purchase_date ───────────────────────────────
-- "Aankoopdatum niet in de toekomst" hoort inhoudelijk in dit rijtje, maar kan
-- geen CHECK worden: Postgres eist dat een CHECK-expressie IMMUTABLE is, en
-- `CURRENT_DATE`/`now()` zijn STABLE — de ALTER TABLE wordt geweigerd (42P17).
-- Die regel leeft daarom in `lib/asset-parameter-bands.ts`
-- (`isPurchaseDateInFuture`), afgedwongen in `POST /api/assets` en zichtbaar
-- gemaakt met een `max`-attribuut op het datumveld. Hier expliciet benoemd zodat
-- dit niet gedekt lijkt.
--
-- ── Uitrol ────────────────────────────────────────────────────────────────────
-- Dit bestand is GESCHREVEN, niet toegepast. Toepassen + live-verificatie
-- (pg_constraint op naam) hoort bij de release-stap.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.assets'::regclass
      AND conname = 'assets_expected_return_check'
  ) THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_expected_return_check
      CHECK (expected_return >= -100 AND expected_return <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.assets'::regclass
      AND conname = 'assets_current_value_check'
  ) THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_current_value_check
      CHECK (current_value >= 0 AND current_value <= 100000000000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.assets'::regclass
      AND conname = 'assets_purchase_value_check'
  ) THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_purchase_value_check
      CHECK (purchase_value >= 0 AND purchase_value <= 100000000000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.assets'::regclass
      AND conname = 'assets_monthly_contribution_check'
  ) THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_monthly_contribution_check
      CHECK (monthly_contribution >= 0 AND monthly_contribution <= 1000000000);
  END IF;
END $$;

COMMENT ON CONSTRAINT assets_expected_return_check ON public.assets IS
  'Verwacht rendement als PERCENTAGE per jaar (-100..100) — andere eenheid dan profiles.expected_return, dat fracties draagt. Bewust ruim en niet per asset-type: de per-type band staat in lib/asset-parameter-bands.ts (ASSET_RETURN_BANDS) en wordt afgedwongen in POST /api/assets. Negatief is legitiem voor afschrijvende types (vehicle/physical).';

COMMENT ON CONSTRAINT assets_current_value_check ON public.assets IS
  'Huidige waarde in euro (0..1e11). Spiegelt ASSET_AMOUNT_LIMITS in lib/asset-parameter-bands.ts. Bewust ruim: de client vraagt vanaf EUR 10 mln door met een vrijheidstijd-vertaling; deze grens vangt alleen het onmogelijke af.';

COMMENT ON CONSTRAINT assets_purchase_value_check ON public.assets IS
  'Aankoopwaarde in euro (0..1e11). Spiegelt ASSET_AMOUNT_LIMITS in lib/asset-parameter-bands.ts.';

COMMENT ON CONSTRAINT assets_monthly_contribution_check ON public.assets IS
  'Maandelijkse inleg in euro (0..1e9). Spiegelt ASSET_AMOUNT_LIMITS in lib/asset-parameter-bands.ts.';
