-- Hoofdinstelling "Geen tekort-lening in mijn plan" (16 sep 2026).
--
-- Additief op `profiles`: één nieuw eigen-rij-instelveld dat de horizon-kernel-adapter
-- consumeert. true = de FIRE-solver kiest de vroegste stopleeftijd waarbij géén
-- blijvende tekort-lening nodig is; false/NULL = uit, het bestaande solvergedrag.
--
-- BEWUST NULL-BAAR, GEEN DEFAULT, GEEN BACKFILL: NULL = "niet gekozen" = uit. Bestaande
-- rijen krijgen NULL en rekenen dus byte-identiek; pas een expliciete keuze verandert de
-- projectie. Zelfde patroon als `fire_legacy_include_illiquid` (migratie 20260913150000).
--
-- TOEGANG / RLS (gemeten tegen pg_policies, pg_trigger, information_schema.column_privileges
-- en role_table_grants op productie, 16-09-2026):
--   - `profiles` heeft één policy "Users can manage own profile" (FOR ALL,
--     using ((select auth.uid()) = id)). Postgres-RLS is rij-gebaseerd, dus deze kolom valt
--     zonder wijziging onder dezelfde eigen-rij-lees- én schrijfregel. Geen nieuwe policy.
--   - Geen kolom-grant-patroon: authenticated/anon hebben tabelbrede privileges; bestaande
--     kolommen (o.a. fire_legacy_include_illiquid) erven die, dus ook deze kolom. Geen
--     `grant update (col)` nodig.
--   - Trigger `trg_guard_profiles_role` → `guard_profiles_role()` is een DENYLIST
--     (role, commercial_tier, active_subscriptions), geen whitelist. Een gebruiker mag
--     zijn eigen planvoorkeur zetten, dus deze kolom hoort er bewust NIET in.
--   Bedoeld schrijfpad: `PUT /api/fire-settings` (zod) via de anon-RLS-client, own-row.
--   Leespad: server-loaders (getOwnProfile) en lib/horizon-kernel/adapter. Geen
--   service-role-pad.
--
-- TERUGWEG: append-only. Blijkt de instelling ongewenst, dan zet een correctiemigratie
-- `update public.profiles set fire_no_deficit_loan = null where fire_no_deficit_loan is not null`
-- (→ huidig solvergedrag) en verwijdert een latere migratie de kolom pas nadat geen route
-- of loader 'm meer leest (getOwnProfile doet select *, dus eerst de code). Zichtbaar
-- misgaan: een verschoven stopleeftijd bij een gebruiker die niets koos — kan hier per
-- constructie niet, want NULL is uit.

alter table public.profiles
  add column if not exists fire_no_deficit_loan boolean;

comment on column public.profiles.fire_no_deficit_loan is
  'Hoofdinstelling "Geen tekort-lening in mijn plan". true = de FIRE-solver kiest de '
  'vroegste stopleeftijd zonder blijvende tekort-lening; false/NULL = uit (bestaand '
  'solvergedrag). Eigen rij. Geschreven via PUT /api/fire-settings; geconsumeerd door '
  'de horizon-kernel-adapter (lib/horizon-kernel/adapter).';
