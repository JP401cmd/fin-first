-- Kiesbaar homescherm — 'overzicht' (default) of 'budget' (Budgetteren-pagina).
--
-- WAAROM: de gebruiker kiest via ⌘K (en /mijn/uiterlijk) waar de app voor hem
-- opent. Alleen semantische "ga naar hoofdscherm"-navigaties volgen de keuze
-- (login-landing, /dashboard incl. PWA-start_url, top-bar ←, long-press op de
-- waffle-knop); de menu-indeling en alle inhoudelijke deep-links blijven
-- ongewijzigd. Waarden + routes canoniek in lib/home-screen.ts.
--
-- ── WAAROM EEN SCALAR KOLOM EN GEEN JSONB-SUBKEY ────────────────────────────
-- Letterlijke spiegel van 20260808163000_add_profiles_spend_limit_alias.sql
-- (en euro_view/display_mode daarvóór): één globale voorkeur met twee
-- toegestane waarden. In een JSONB-blob zou de DB-validatie wegvallen — de
-- CHECK-constraint hieronder is precies wat een JSONB-subkey niet kan bieden.
-- Server-side en dus cross-device; géén localStorage, want de keuze moet op
-- élk apparaat gelden én de edge-middleware moet 'm kunnen lezen om de
-- login-landing te sturen.
--
-- ── GEEN BACKFILL, EN WAAROM DAT HIER JUIST IS ─────────────────────────────
-- 'overzicht' ÍS het huidige gedrag — elke bestaande gebruiker landt vandaag
-- exact daar, dus de default levert gedragsbehoud. Een backfill zou niets
-- toevoegen (DEFAULT + NOT NULL vult bestaande rijen al bij de ADD COLUMN).
--
-- ── TOEGANGSMODEL ───────────────────────────────────────────────────────────
-- Overgenomen van de meting van 08-08-2026 (zie de uitgebreide analyse in
-- 20260808163000_add_profiles_spend_limit_alias.sql) en her-geverifieerd op
-- apply-moment (zie apply-notitie): op public.profiles staat RLS aan met
-- precies één policy — "Users can manage own profile", FOR ALL, own-row
-- (USING (select auth.uid()) = id, geen eigen WITH CHECK → USING geldt óók
-- als schrijfcheck). RLS is row-level, niet kolom-level: deze nieuwe kolom
-- valt automatisch en volledig onder die eigen-rij-policy.
--
-- ── DEKKINGSCHECK ADDITIEVE KOLOM (verplicht bij ALTER TABLE … ADD COLUMN) ──
--   Dekkende policy voor lezen én schrijven: "Users can manage own profile"
--   (FOR ALL, own-row). Er komt géén policy bij en er verbreedt niets.
--   Bedoeld en enig schrijfpad: PUT /api/home-screen — own-row update via de
--   anon RLS-client (`.eq('id', user.id)`), NOOIT service-role; spiegelt
--   app/api/euro-view en app/api/spend-limit-alias.
--   Leespaden: (1) de layout-render server-side (getOwnProfile's select('*')
--   brengt de kolom zonder query-wijziging binnen als SSR-seed voor de
--   provider); (2) de edge-middleware (lib/supabase/proxy.ts) met een
--   gerichte select('home_screen') op de eigen rij, uitsluitend in de
--   login-landing-/dashboard-branch. Beide onder dezelfde own-row-policy.
--   Deze migratie opent dus géén nieuw schrijfgat en introduceert ook geen
--   kolom die niemand mag schrijven: het bereik is exact de eigen profielrij.
--
-- ── KOLOM-GEWIJSDE GUARD-TRIGGER: GECONTROLEERD, VALT ERBUITEN ─────────────
-- Per dezelfde meting staat op public.profiles één niet-interne trigger,
-- `trg_guard_profiles_role`, die voor authenticated/anon uitsluitend
-- wijzigingen aan `role`, `commercial_tier` en `active_subscriptions`
-- blokkeert. `home_screen` is géén entitlement-kolom en komt in die functie
-- niet voor; de guard laat een update via de anon-client dus ongemoeid.
--
-- PUUR ADDITIEF: raakt verder niets aan; veilig her-uitvoerbaar via
-- IF NOT EXISTS / DROP CONSTRAINT IF EXISTS.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_screen text NOT NULL DEFAULT 'overzicht';

-- Constraint apart van de ADD COLUMN, zodat re-apply op een bestaande kolom de
-- CHECK alsnog (her)zet in plaats van stil over te slaan.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_home_screen_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_home_screen_check
  CHECK (home_screen IN ('overzicht', 'budget'));

COMMENT ON COLUMN public.profiles.home_screen IS
  'Gekozen homescherm: ''overzicht'' (default) of ''budget'' (Budgetteren-pagina). Stuurt uitsluitend semantische "ga naar hoofdscherm"-navigaties (login-landing, /dashboard/PWA-start, top-bar ←, long-press waffle); menu-indeling en deep-links veranderen niet mee. Waarden + routes canoniek in lib/home-screen.ts. Cross-device omdat het op de eigen profiles-rij staat. Gelezen door de layout-render (server-seed) en de edge-middleware (login-landing); geschreven door PUT /api/home-screen (own-row, anon RLS-client, nooit service-role). Default ''overzicht'' = exact het huidige gedrag; bewust niet gebackfilled.';
