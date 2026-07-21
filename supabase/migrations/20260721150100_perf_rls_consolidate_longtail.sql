-- Performance-sanering — multiple_permissive_policies long-tail, SLICE 2:
-- household_members + questionnaires + questionnaire_questions
--
-- CONTEXT: sluitstuk op fase 1 (ADR 0048/0049). Deze drie tabellen bleven daar bewust staan
-- (household_members: "afwijkende with_check-semantiek"; questionnaires/questionnaire_questions:
-- "1 residual SELECT-overlap per tabel"). Advisor-stand vóór deze migratie: 3× mpp
-- (household_members UPDATE×2, questionnaire_questions SELECT×2, questionnaires SELECT×2).
-- Doel na deze + slice 1: multiple_permissive_policies -> 0.
--
-- WAAROM GEDRAGSNEUTRAAL: permissive policies zijn OR-gecombineerd; samenvoegen tot één policy per
-- (rol, actie) met OR van de predicaten = identiek gedrag, één evaluatie. FOR ALL-policies worden
-- gesplitst in een lees- en schrijf-deel. Service-role blijft overal RLS-bypassen (BYPASSRLS).

-- ═══════════════════════════════════════════════════════════════════════════
-- household_members — UPDATE-overlap samenvoegen
-- ═══════════════════════════════════════════════════════════════════════════
-- Vóór: twee permissive UPDATE-policies:
--   "Owner can update household members" (authenticated) USING household_id = user_owned_household_id()
--        (geen expliciete WITH CHECK -> Postgres gebruikt USING ook als check)
--   "Users can update own privacy settings" (public)    USING/CHECK user_id = (select auth.uid())
-- LEAK-EQUIVALENTIE (vóór == ná):
--   * owner            : mag alle leden van het EIGEN huishouden updaten (owner-tak). Identiek.
--   * lid (niet-owner) : mag UITSLUITEND de eigen rij updaten (privacy-tak, user_id-match); kan
--                        andermans rij niet raken. Identiek.
--   * anon             : geen toegang (owner-tak onwaar; user_id = auth.uid() onwaar zonder sessie).
--                        Nieuwe policy is `to authenticated`, dus anon heeft géén UPDATE-policy meer
--                        -> default deny. Identiek net-gedrag (privacy-policy stond `to public` maar was
--                        altijd onwaar voor anon).
drop policy if exists "Owner can update household members"      on public.household_members;
drop policy if exists "Users can update own privacy settings"   on public.household_members;

create policy "household_members update" on public.household_members
  for update to authenticated
  using (
    household_id = user_owned_household_id()
    or user_id = (select auth.uid())
  )
  with check (
    household_id = user_owned_household_id()
    or user_id = (select auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- questionnaire_questions — SELECT-overlap opheffen
-- ═══════════════════════════════════════════════════════════════════════════
-- Vóór: "authenticated_read_questions" (SELECT authenticated, USING true) OVERLAPT met
--        "questionnaire_questions admin all" (FOR ALL public, USING/CHECK service_role OR superadmin).
-- De admin-SELECT is redundant: `USING true` dekt élke authenticated lezer al (incl. superadmin).
-- FIX: admin-policy vervangen door drie SCHRIJF-policies (INSERT/UPDATE/DELETE) met identiek predicaat;
-- de SELECT-tak vervalt (was overbodig). authenticated_read_questions blijft ongewijzigd.
-- LEAK-EQUIVALENTIE (vóór == ná):
--   * authenticated (incl. superadmin) : SELECT = alle vragen (USING true). Identiek.
--   * anon             : geen SELECT (authenticated_read is `to authenticated`; admin-SELECT bestond
--                        wél `to public` maar predicaat onwaar voor anon -> 0 rijen). Identiek.
--   * schrijven        : uitsluitend service_role (BYPASSRLS) of superadmin — predicaat 1-op-1 behouden.
drop policy if exists "questionnaire_questions admin all" on public.questionnaire_questions;

create policy "questionnaire_questions admin insert" on public.questionnaire_questions
  for insert to public
  with check (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
  );

create policy "questionnaire_questions admin update" on public.questionnaire_questions
  for update to public
  using (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
  )
  with check (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
  );

create policy "questionnaire_questions admin delete" on public.questionnaire_questions
  for delete to public
  using (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- questionnaires — SELECT-overlap samenvoegen (LET OP: admin moet óók inactieve zien)
-- ═══════════════════════════════════════════════════════════════════════════
-- Vóór: "authenticated_read_active_questionnaires" (SELECT authenticated, USING is_active = true)
--        OVERLAPT met "questionnaires admin all" (FOR ALL public, service_role OR superadmin).
-- Hier mag de admin-SELECT NIET zomaar vervallen: superadmin/service_role moeten óók INACTIEVE
-- questionnaires kunnen zien. Daarom SELECT SAMENVOEGEN tot één policy met de OR van beide predicaten.
-- KRITISCH: de samengevoegde SELECT staat `to authenticated` (NIET `to public`) — anders zou de
-- is_active-tak `to public` inactieve... nee: actieve questionnaires ZICHTBAAR maken voor ANON. Dat is
-- een verruiming en moet voorkomen worden. `to authenticated` houdt anon exact op 0 rijen zoals vóór.
-- LEAK-EQUIVALENTIE (vóór == ná):
--   * authenticated, niet-admin : alleen is_active = true. Identiek.
--   * superadmin / service_role : alle questionnaires incl. inactieve (superadmin-/service-tak). Identiek.
--   * anon             : geen SELECT-policy meer `to public` -> 0 rijen; vóór zag anon ook 0 (admin-
--                        predicaat onwaar, active-policy was `to authenticated`). Identiek — en géén lek.
drop policy if exists "authenticated_read_active_questionnaires" on public.questionnaires;
drop policy if exists "questionnaires admin all"                 on public.questionnaires;

create policy "questionnaires select" on public.questionnaires
  for select to authenticated
  using (
    is_active = true
    or (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
  );

create policy "questionnaires admin insert" on public.questionnaires
  for insert to public
  with check (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
  );

create policy "questionnaires admin update" on public.questionnaires
  for update to public
  using (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
  )
  with check (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
  );

create policy "questionnaires admin delete" on public.questionnaires
  for delete to public
  using (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
  );
