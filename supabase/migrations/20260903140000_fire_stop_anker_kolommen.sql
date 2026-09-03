-- ADR 0129 (D1) — fase F1, stap 1 van 2: het stop-anker krijgt eigen kolommen.
--
-- WAAROM
-- profiles.fire_end_strategy draagt vijf waarden die twee verschillende vragen
-- beantwoorden: WAT moet er aan het eind gelden (deplete/legacy/perpetual) en
-- WANNEER stop ik (pensioen = AOW, nu-stoppen = vandaag). Dat is een conflatie
-- die ADR 0127 bewust en tijdelijk aanvaardde; ADR 0129 heft hem op via
-- expand-contract. Deze migratie is de EXPAND-stap: de twee nieuwe kolommen
-- bestaan, fire_end_strategy blijft ongewijzigd naast ze staan tot F4.
--
-- WAT DIT WEL EN NIET IS
-- Wel: twee additieve kolommen op een bestaande tabel + drie CHECK-constraints.
-- Niet: geen nieuwe tabel, geen RLS-wijziging, geen datawijziging. De backfill
-- (inclusief besluit M1) staat bewust in een APARTE migratie,
-- 20260903141000_backfill_fire_stop_anker.sql, zodat een mislukte
-- datacorrectie het schema niet meesleept. Rol ze in die volgorde uit.
--
-- ── TOEGANGSMODEL — expliciete RLS-dekkingscheck op de nieuwe kolommen ──────
-- Een ALTER TABLE ... ADD COLUMN erft de bestaande policies stilzwijgend. Wat
-- die kolommen dekt, gemeten tegen de LIVE database op 03-09-2026 (pg_policies,
-- pg_class.relrowsecurity, pg_trigger — niet gelezen uit migratiebestanden,
-- ADR 0045):
--
--   * RLS staat AAN op public.profiles (relrowsecurity = true).
--   * Er is precies EEN policy: "Users can manage own profile", FOR ALL,
--     USING `(select auth.uid()) = id`, zonder aparte WITH CHECK. Postgres
--     hanteert de USING-expressie dan ook als WITH CHECK bij UPDATE. Dat is
--     dus eigen-rij lezen en eigen-rij schrijven, en niets anders.
--   * Er is GEEN superadmin-/beheer-SELECT op profiles (die is in
--     20260611065914 bewust weggehaald); beheer leest via service-role
--     (ADR 0006). De nieuwe kolommen erven die situatie ongewijzigd.
--   * De trigger trg_guard_profiles_role (functie guard_profiles_role) is een
--     DENYLIST op role / commercial_tier / active_subscriptions, geen
--     allowlist. Hij blokkeert de nieuwe kolommen dus niet.
--
-- Bedoeld schrijfpad: own-row read-modify-write via de anon RLS-client, precies
-- zoals app/api/fire-settings vandaag fire_end_strategy/fire_end_age schrijft
-- (spiegel van app/api/appearance). NOOIT service-role. Er ontstaat hier geen
-- schrijfgat: de gebruiker mocht zijn eigen profielrij al schrijven, en beide
-- kolommen zijn zuiver persoonlijke planvoorkeuren zonder rechten-, prijs- of
-- huishoud-betekenis. Er is dus ook geen kolom die niemand mag schrijven.
--
-- ── WAARDEDOMEIN ────────────────────────────────────────────────────────────
-- fire_stop_anchor: 'solved' (app rekent de vroegste leeftijd uit) | 'aow' |
--   'now' | 'age' (zelfgekozen). NOT NULL DEFAULT 'solved' — 'solved' is het
--   gedrag dat de app vandaag voor iedere niet-pensioen/niet-nu-stoppen-rij al
--   vertoont, dus de default maakt bestaande rijen gedragsbehoudend.
-- fire_stop_age: numeric(4,1) NULL, 18..100 in HALVE jaren. Halve jaren omdat
--   de stop-slider op step={0.5} staat en de kernel fractionele leeftijden
--   aanneemt; stil afronden naar hele jaren zou een keuze van de gebruiker
--   vervalsen. numeric(4,1) legt de schaal al op één decimaal vast; de
--   *2 = floor(*2)-clausule sluit .1 t/m .9 behalve .5 uit.
-- Consistentie: `(fire_stop_anchor = 'age') = (fire_stop_age IS NOT NULL)` —
--   een leeftijd bestaat dan en slechts dan als het anker er om vraagt. Beide
--   zijden zijn non-null (anchor is NOT NULL), dus de CHECK kan niet stil
--   NULL/true worden.
--
-- GEEN INDEX. Beide kolommen worden uitsluitend gelezen als onderdeel van de
-- eigen profielrij (lookup op primary key id). Een index op een kolom met vier
-- waarden op een tabel van 27 rijen is pure schrijf- en onderhoudslast zonder
-- lezer. Bewuste keuze, geen omissie.
--
-- ── VOLGORDE T.O.V. DE APPLICATIE ───────────────────────────────────────────
-- Deze migratie moet LIVE ZIJN VOORDAT lib/fire-strategy.ts#parseFirePlan en
-- app/api/fire-settings/route.ts de kolommen lezen/schrijven. Andersom leest de
-- parser een niet-bestaande kolom (42703) op elke profielload.
--
-- ── LINEAGE (gemeten 03-09-2026) ────────────────────────────────────────────
-- supabase_migrations.schema_migrations naast supabase/migrations/ gelegd:
-- de vier voorgangers van 03-09 (20260903100000 assets_household_write_guard,
-- 20260903101000 drop_backup_tx_rabobank0596, 20260903110000
-- calculator_reports_superadmin_moderatie, 20260903120000 transaction_flags)
-- staan alle vier in het register EN zijn structureel geverifieerd
-- (transaction_flags bestaat; backup_tx_rabobank0596 is weg; calculator_reports
-- draagt de superadmin-SELECT/UPDATE-policies; assets draagt de huishoud-guard-
-- trigger). Vandaar het tijdstempel 20260903140000, ná die vier.
--
-- BEKENDE DRIFT OP DEZE KOLOMFAMILIE — IN BEIDE RICHTINGEN (gemeten 03-09-2026)
--   * 20260321000001_allow_pensioen_fire_end_strategy staat WEL in de repo,
--     NIET in schema_migrations — terwijl de live constraint 'pensioen' wel
--     toestaat (via de herbouw in 20260902120000).
--   * 20260227221838_add_fire_end_strategy_columns staat WEL in
--     schema_migrations, ZONDER bestand in de repo.
-- Die drift is hier NIET hersteld: dat is een aparte beslissing van de
-- eigenaar. Consequentie voor wie hierop stapelt: verifieer elk schemafeit
-- tegen pg_constraint / information_schema / pg_policies, nooit tegen een
-- migratiebestand. De DO-blok-vorm hieronder (bestaan toetsen, niet aannemen)
-- is daarop gebouwd.
--
-- ── UITROLLEN — PROJECTVALKUIL ──────────────────────────────────────────────
-- Rol NIET uit met apply_migration: die verzint een eigen tijdstempel, waardoor
-- het register uit de pas loopt met de bestandsnaam. Rol uit via execute_sql en
-- registreer de versie daarna expliciet:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260903140000', 'fire_stop_anker_kolommen');
--
-- ── DE TERUGWEG (wat herstelt dit, en waaraan zie je dat het misging) ───────
-- Waaraan je ziet dat het misging:
--   (a) 42703 "column fire_stop_anchor does not exist" in error_logs of in de
--       Supabase-logs op /api/fire-settings of een profielload -> de DDL is
--       niet geland terwijl de app-code wel live is (volgorde omgedraaid).
--   (b) 23514 "profiles_fire_stop_anchor_age_consistent" bij het opslaan van
--       een plan -> een schrijfpad zet 'age' zonder leeftijd of andersom.
--   (c) een profielload die 500't waar hij eerder 200 gaf.
-- Herstel: er is in F1 GEEN drop column. De kolommen zijn additief en worden
-- door niets gelezen zolang de app-code niet live is; ze laten staan is
-- gedragsneutraal. Bij (b) is de correctie een nieuwe migratie die de
-- consistentie-CHECK tijdelijk dropt terwijl het schrijfpad wordt gerepareerd:
--   ALTER TABLE public.profiles
--     DROP CONSTRAINT IF EXISTS profiles_fire_stop_anchor_age_consistent;
-- Het daadwerkelijk verwijderen van de kolommen hoort bij F4, en pas nadat de
-- nieuwe situatie zich bewezen heeft. Doe het niet als hotfix.

-- ── 1. Kolommen ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fire_stop_anchor text NOT NULL DEFAULT 'solved';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fire_stop_age numeric(4,1);

COMMENT ON COLUMN public.profiles.fire_stop_anchor IS
  'ADR 0129 — stop-anker: wanneer stopt de gebruiker met werken. solved = de app rekent de vroegste leeftijd uit; aow = op de AOW-leeftijd; now = vandaag; age = een zelfgekozen leeftijd (dan staat fire_stop_age gevuld). Los van fire_end_strategy, dat de eind-vorm draagt.';

COMMENT ON COLUMN public.profiles.fire_stop_age IS
  'ADR 0129 — zelfgekozen stopleeftijd in halve jaren (18..100), uitsluitend gevuld als fire_stop_anchor = ''age''. Halve jaren omdat de stop-slider op 0,5 staat en de kernel fractionele leeftijden aanneemt.';

-- ── 2. CHECK-constraints (idempotent: bestaan toetsen, niet aannemen) ───────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_fire_stop_anchor_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_fire_stop_anchor_check
      CHECK (fire_stop_anchor IN ('solved', 'aow', 'now', 'age'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_fire_stop_age_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_fire_stop_age_check
      CHECK (
        fire_stop_age IS NULL
        OR (
          fire_stop_age >= 18
          AND fire_stop_age <= 100
          AND fire_stop_age * 2 = floor(fire_stop_age * 2)
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_fire_stop_anchor_age_consistent'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_fire_stop_anchor_age_consistent
      CHECK ((fire_stop_anchor = 'age') = (fire_stop_age IS NOT NULL));
  END IF;
END $$;

-- ── 3. Verificatie na uitrol (draai deze twee, verwacht 3 rijen resp. 2) ────
--
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.profiles'::regclass
--     AND conname IN ('profiles_fire_stop_anchor_check',
--                     'profiles_fire_stop_age_check',
--                     'profiles_fire_stop_anchor_age_consistent');
--
--   SELECT column_name, data_type, numeric_precision, numeric_scale,
--          is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'profiles'
--     AND column_name IN ('fire_stop_anchor', 'fire_stop_age');
