-- Performance-sanering — multiple_permissive_policies long-tail, SLICE 1: app_settings
--
-- CONTEXT: fase 1 (ADR 0048/0049, migratie 20260719090108) heeft de 273×/269×
-- multiple_permissive_policies-advisor opgeruimd voor alle hete financiële tabellen, maar liet
-- app_settings BEWUST staan ("gemengde public/authenticated-rolsets + security-gevoelige
-- API-key-filtering -> niet 1-op-1 te bewijzen in die batch"). Deze migratie ruimt die residual op.
-- Advisor-stand vóór: 4× multiple_permissive_policies op app_settings (SELECT×4, INSERT×2,
-- UPDATE×2, DELETE×2 overlappende permissive policies).
--
-- WAAROM GEDRAGSNEUTRAAL: permissive policies worden door Postgres met OR gecombineerd. Meerdere
-- permissive policies voor dezelfde (rol, actie) -> één policy waarvan USING/WITH CHECK de OR is van
-- de losse predicaten = identiek netto-toegangsgedrag, maar één policy-evaluatie i.p.v. meerdere.
-- De FOR ALL-policy ("app_settings own keys") wordt gesplitst: zijn SELECT-tak vouwt in de lees-policy,
-- zijn schrijf-takken in de per-actie schrijf-policies.
--
-- LEAK-EQUIVALENTIE PER ROL (vóór == ná):
--  * anon              : had NUL toegang (geen enkele policy `to anon`; de `to public` superadmin-
--                        policies evalueerden altijd onwaar voor anon). Houdt NUL toegang: alle nieuwe
--                        policies staan `to authenticated`, dus anon heeft geen policy meer -> default deny.
--                        Dit is tighter zonder gedragswijziging (anon was nooit superadmin).
--  * authenticated,
--    niet-superadmin   : SELECT = eigen `<uid>_*`-keys OF globale niet-secret keys OF eigen
--                        checkin_household_<eigen hh>_* ; NOOIT anthropic/openai/mistral_api_key of
--                        truelayer_* (secret-uitsluiting van `global read` exact overgenomen) en NOOIT
--                        een uuid-namige per-user key van een ander. INSERT/UPDATE/DELETE = enkel eigen
--                        keys (own-key match). Identiek aan vóór.
--  * authenticated,
--    superadmin        : volledige lees/schrijf via de superadmin-tak (exact dezelfde predicaten per
--                        actie: inline EXISTS(profiles.role=superadmin) voor SELECT/INSERT/UPDATE,
--                        is_superadmin() voor DELETE — 1-op-1 uit de oude policies).
--  * service_role      : BYPASSRLS -> RLS niet geëvalueerd; onaangeroerd.
--
-- Geen ADR nodig: semantiek ongewijzigd; besluitkader staat in ADR 0048/0049. Geen tabel/FK-wijziging,
-- dus `npm run arch:diagram` niet nodig. Live-apply + get_advisors(performance)-hermeting = release-stap.

-- Oude policies (allemaal `if exists` i.v.m. mogelijke drift lokaal vs. remote):
drop policy if exists "app_settings own keys"            on public.app_settings;
drop policy if exists "app_settings global read"         on public.app_settings;
drop policy if exists "app_settings household checkin read" on public.app_settings;
drop policy if exists "Superadmins can read app_settings"   on public.app_settings;
drop policy if exists "Superadmins can insert app_settings" on public.app_settings;
drop policy if exists "Superadmins can update app_settings" on public.app_settings;
drop policy if exists "Superadmins can delete app_settings" on public.app_settings;

-- Eén policy per actie, `to authenticated`. Predicaten = OR van de oude losse predicaten.

-- SELECT: own-key OR globale niet-secret OR eigen-huishouden-checkin OR superadmin
create policy "app_settings select" on public.app_settings
  for select to authenticated
  using (
    position((select auth.uid())::text in key) > 0
    or (
      key !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      and key <> all (array['anthropic_api_key','openai_api_key','mistral_api_key','truelayer_client_id','truelayer_client_secret'])
    )
    or (
      user_household_id() is not null
      and key like ('checkin_household_' || (user_household_id())::text || '\_%')
    )
    or exists (
      select 1 from profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'superadmin'
    )
  );

-- INSERT: own-key OR superadmin
create policy "app_settings insert" on public.app_settings
  for insert to authenticated
  with check (
    position((select auth.uid())::text in key) > 0
    or exists (
      select 1 from profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'superadmin'
    )
  );

-- UPDATE: own-key OR superadmin (USING én WITH CHECK, exact zoals de oude policies)
create policy "app_settings update" on public.app_settings
  for update to authenticated
  using (
    position((select auth.uid())::text in key) > 0
    or exists (
      select 1 from profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'superadmin'
    )
  )
  with check (
    position((select auth.uid())::text in key) > 0
    or exists (
      select 1 from profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'superadmin'
    )
  );

-- DELETE: own-key OR is_superadmin() (oude delete-policy gebruikte de helper i.p.v. inline EXISTS —
-- 1-op-1 behouden)
create policy "app_settings delete" on public.app_settings
  for delete to authenticated
  using (
    position((select auth.uid())::text in key) > 0
    or is_superadmin()
  );
