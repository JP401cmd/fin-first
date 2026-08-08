-- Grenzenpotten fase 5 — weergavenaam "Grenzenpot" of "Schaamtepot".
--
-- WAAROM: sommige mensen worden gemotiveerd door een neutrale norm ("grens"),
-- anderen door een confronterende ("schaamte"). De keuze is PUUR COSMETISCH: ze
-- raakt geen rij, geen regel, geen bedrag en geen berekening (ADR 0089 besluit 1).
-- Intern heet alles onverkort spend_limit(s); de alias leeft uitsluitend in de
-- copy-map (lib/spend-limits/copy.ts).
--
-- ── WAAROM EEN SCALAR KOLOM EN GEEN JSONB-SUBKEY (D29) ──────────────────────
-- Letterlijke spiegel van 20260808140000_add_profiles_euro_view.sql en
-- 20260622151417_add_profiles_display_mode.sql: één globale weergavevoorkeur met
-- twee toegestane waarden. Een enum met twee waarden is geen map, en in een
-- JSONB-blob (bv. widget_prefs/status_banner_minimized) zou de DB-validatie
-- wegvallen — de CHECK-constraint hieronder is precies wat een JSONB-subkey niet
-- kan bieden. Server-side en dus cross-device; géén localStorage, want de keuze
-- moet op élk apparaat gelden.
--
-- ── GEEN BACKFILL, EN WAAROM DAT HIER JUIST IS ─────────────────────────────
-- Hetzelfde onderscheid als bij euro_view: 'grenzenpot' ÍS het huidige beeld —
-- elke bestaande gebruiker ziet vandaag exact die naam, dus de default levert
-- gedragsbehoud. (Vergelijk 20260622151417_add_profiles_display_mode, die WEL
-- moest backfillen omdat haar default 'simple' de diepte-secties inklapte.)
-- Een backfill zou hier dus geen gedrag behouden maar juist een gedrags-
-- wijziging zijn.
--
-- ── TOEGANGSMODEL — GEMETEN TEGEN DE LIVE DATABASE OP 08-08-2026 ────────────
-- Niet overgenomen uit een migratiebestand; gelezen uit pg_class / pg_policy /
-- pg_trigger / pg_proc op de remote database.
--   * pg_class.relrowsecurity op public.profiles = true (relforcerowsecurity =
--     false).
--   * pg_policy levert PRECIES ÉÉN policy op de tabel: "Users can manage own
--     profile", polcmd '*' (FOR ALL), polroles leeg (= PUBLIC),
--     USING ((select auth.uid()) = id), WITH CHECK = NULL.
--     Bij een ALL-policy zonder eigen WITH CHECK hanteert Postgres de
--     USING-expressie óók als schrijfcheck: zowel de rij die je raakt als de rij
--     die je achterlaat moet je eigen rij zijn. `TO PUBLIC` is geen verbreding —
--     voor anon is auth.uid() NULL en `NULL = id` is nooit waar.
--   * RLS is row-level, niet kolom-level: deze nieuwe kolom valt daarmee
--     automatisch en volledig onder die ene bestaande eigen-rij ALL-policy.
--
-- ── DEKKINGSCHECK ADDITIEVE KOLOM (verplicht bij ALTER TABLE … ADD COLUMN) ──
--   Dekkende policy voor lezen én schrijven: "Users can manage own profile"
--   (FOR ALL, own-row). Er komt géén policy bij en er verbreedt niets.
--   Bedoeld en enig schrijfpad: PUT /api/spend-limit-alias — own-row update via
--   de anon RLS-client (`.eq('id', user.id)`), NOOIT service-role; spiegelt
--   app/api/appearance en app/api/euro-view.
--   Leespad: de layout-render server-side (getOwnProfile's select('*') brengt de
--   kolom zonder query-wijziging binnen als SSR-seed voor de provider).
--   Deze migratie opent dus géén nieuw schrijfgat en introduceert ook geen kolom
--   die niemand mag schrijven: het bereik is exact de eigen profielrij.
--
-- ── KOLOM-GEWIJSDE GUARD-TRIGGER: GECONTROLEERD, VALT ERBUITEN ─────────────
-- GEMETEN OP 08-08-2026: op public.profiles staat één niet-interne trigger,
-- `trg_guard_profiles_role` (BEFORE INSERT OR UPDATE FOR EACH ROW EXECUTE
-- FUNCTION guard_profiles_role()). De uitgerolde body van die functie (gelezen
-- met pg_get_functiondef) blokkeert voor de rollen authenticated/anon uitsluitend
-- wijzigingen aan `role`, `commercial_tier` en `active_subscriptions`. Deze
-- nieuwe kolom is géén entitlement-kolom en komt in die functie niet voor; de
-- guard laat een update op spend_limit_alias dus ongemoeid. Dat is expliciet
-- geverifieerd omdat een verkeerde aanname hier pas in de UI zou falen: de kolom
-- zou dan via de anon-client onschrijfbaar zijn.
--
-- PUUR ADDITIEF: raakt verder niets aan; veilig her-uitvoerbaar via
-- IF NOT EXISTS / DROP CONSTRAINT IF EXISTS.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS spend_limit_alias text NOT NULL DEFAULT 'grenzenpot';

-- Constraint apart van de ADD COLUMN, zodat re-apply op een bestaande kolom de
-- CHECK alsnog (her)zet in plaats van stil over te slaan.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_spend_limit_alias_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_spend_limit_alias_check
  CHECK (spend_limit_alias IN ('grenzenpot', 'schaamtepot'));

COMMENT ON COLUMN public.profiles.spend_limit_alias IS
  'Weergavenaam voor grenzenpotten: ''grenzenpot'' (default) of ''schaamtepot''. Puur cosmetisch — raakt geen data, geen regel en geen berekening (ADR 0089 besluit 1). Cross-device omdat het op de eigen profiles-rij staat. Gelezen door de layout-render (server-seed, geen flash) en door de meldingen-aggregator op generatiemoment; geschreven door PUT /api/spend-limit-alias (own-row, anon RLS-client, nooit service-role). Default ''grenzenpot'' = exact het huidige beeld; bewust NIET gebackfilled, want een backfill zou hier een gedragswijziging zijn i.p.v. gedragsbehoud.';
