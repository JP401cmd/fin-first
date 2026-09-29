-- Homescherm 'nieuws' — de CHECK op profiles.home_screen krijgt de Krant erbij.
--
-- WAAROM (Krant 2A fase 2, keuze 1A van de eigenaar, ADR 0184): een account
-- met alleen de module 'nieuws' (de Krant) opent op /nieuws. De productkeuze-
-- route PUT /api/modules zet bij de overgang naar de Krant daarom óók
-- `home_screen = 'nieuws'`, zodat de client-side "ga naar hoofdscherm"-
-- navigaties (top-bar ←, long-press op de waffle, `useHomeScreen().homeHref`)
-- en de edge-proxy uit dezelfde kolom dezelfde bestemming lezen. De proxy
-- leidt de Krant-home daarnaast al uit `active_modules` af
-- (`resolveHomeHref`, fase 1) — een rij met een stale `home_screen` landt dus
-- ook goed; deze CHECK maakt de waarde alleen persisteerbaar.
--
-- 'nieuws' is een PERSISTEERBARE waarde, geen KIESBARE: `PUT /api/home-screen`
-- (de picker en de ⌘K-actie) accepteert via `HOME_SCREEN_PICKABLE` alleen
-- 'overzicht' | 'budget'. Alleen de server (PUT /api/modules) schrijft
-- 'nieuws'. Waarden + routes canoniek in lib/home-screen.ts
-- (`HOME_SCREEN_VALUES` ⊇ `HOME_SCREEN_PICKABLE`).
--
-- ── VOLGORDE T.O.V. DE DEPLOY: MIGRATIE EERST ──────────────────────────────
-- Toepassen VÓÓR de deploy van de code die PUT /api/modules bevat. Die route
-- kan 'nieuws' schrijven; draait hij tegen de oude CHECK, dan faalt de update
-- met 23514 (check_violation) → 500 op de productkeuze. Omgekeerd is veilig:
-- de verruimde CHECK is voor de huidige code onzichtbaar (die schrijft alleen
-- 'overzicht' | 'budget').
--
-- ── GEEN BACKFILL, GEEN UPDATE, GEEN POLICY-WIJZIGING ──────────────────────
-- Gemeten tegen public.profiles op 28-09-2026 (read-only SELECT via de
-- Supabase-MCP): 29 rijen, alle 29 met home_screen = 'overzicht'; 0 rijen met
-- active_modules = ['nieuws'] (3 × null). Er is dus niets om bij te werken;
-- een verruiming van een CHECK valideert de bestaande rijen opnieuw en die
-- vallen allemaal binnen de nieuwe set.
--
-- ── TOEGANGSMODEL (gemeten 28-09-2026, pg_policies/pg_class/pg_trigger) ─────
-- RLS staat aan op public.profiles (relrowsecurity = true) met precies één
-- policy: "Users can manage own profile", FOR ALL, roles {public},
-- USING ((select auth.uid()) = id), geen eigen WITH CHECK (USING geldt dus óók
-- als schrijfcheck). Deze migratie verandert daar niets aan: alleen de
-- waardenset van een bestaande kolom verruimt. Het schrijfpad voor 'nieuws' is
-- PUT /api/modules — own-row `.update().eq('id', user.id)` via de anon
-- RLS-sessieclient, NOOIT service-role (spiegelt app/api/home-screen).
--
-- KOLOM-GEWIJSDE GUARD-TRIGGER — gecontroleerd, valt erbuiten: de enige
-- niet-interne trigger op profiles is `trg_guard_profiles_role`
-- (BEFORE INSERT OR UPDATE → public.guard_profiles_role()). Die functie
-- blokkeert voor authenticated/anon uitsluitend wijzigingen aan `role`,
-- `commercial_tier` en `active_subscriptions` (functiedefinitie gelezen via
-- pg_get_functiondef, 28-09-2026). `home_screen` en `active_modules` komen er
-- niet in voor: de productkeuze-route wordt niet geblokkeerd, en er ontstaat
-- ook geen nieuw escalatiepad — modules zijn geen betaalrecht (ADR 0184).
--
-- ── TERUGWEG ───────────────────────────────────────────────────────────────
-- Eerst de code terugdraaien (zodat niets meer 'nieuws' schrijft), dan de rijen
-- met 'nieuws' terugzetten en de oude CHECK herstellen, in één transactie:
--   begin;
--   update public.profiles set home_screen = 'overzicht' where home_screen = 'nieuws';
--   alter table public.profiles drop constraint if exists profiles_home_screen_check;
--   alter table public.profiles add constraint profiles_home_screen_check
--     check (home_screen in ('overzicht', 'budget'));
--   commit;
-- Die UPDATE verandert voor een Krant-account niets zichtbaars: de home volgt
-- uit active_modules (resolveHomeHref), niet uit home_screen.
--
-- IDEMPOTENT: DROP CONSTRAINT IF EXISTS + ADD, zodat her-uitvoeren hetzelfde
-- eindresultaat geeft. ÉÉN TRANSACTIE, zodat er geen moment zonder CHECK is:
-- bewust géén expliciete BEGIN/COMMIT in het bestand (geen enkele migratie in
-- de repo doet dat, en de Supabase-CLI wikkelt elke migratie zelf al in een
-- transactie). Bij handmatig uitrollen via execute_sql draai je het bestand
-- mét de versie-INSERT binnen één `begin; … commit;` (zie ADR 0184, Uitrol).

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_home_screen_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_home_screen_check
  CHECK (home_screen IN ('overzicht', 'budget', 'nieuws'));

COMMENT ON COLUMN public.profiles.home_screen IS
  'Homescherm: ''overzicht'' (default), ''budget'' (Budgetteren-pagina) of ''nieuws'' (de Krant). ''overzicht''/''budget'' zijn kiesbaar via PUT /api/home-screen (HOME_SCREEN_PICKABLE); ''nieuws'' zet alleen de server bij de productkeuze Krant (PUT /api/modules, ADR 0184). Stuurt uitsluitend semantische "ga naar hoofdscherm"-navigaties; een account met alleen de module nieuws landt ongeacht deze kolom op /nieuws (resolveHomeHref). Waarden + routes canoniek in lib/home-screen.ts. Own-row, anon RLS-client, nooit service-role.';
