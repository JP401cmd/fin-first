-- ============================================================================
-- Vragenlijsten — RLS-correctie: invulgrenzen in de database, niet alleen in de route
-- ============================================================================
-- DOEL
-- Twee gaten uit de security-review van de vragenlijsten-ronde (beide ouder dan
-- die ronde) dichten:
--   1. `questionnaire_questions` was leesbaar met USING (true): elke ingelogde
--      gebruiker las via PostgREST ook de vragen van inactieve/concept-lijsten.
--      Sinds 20260913120000 starten nieuwe lijsten inactief, dus dit gat werd
--      precies het concept-venster van beheer.
--   2. `questionnaire_sessions access` en `questionnaire_responses access` waren
--      FOR ALL met als enige eis "eigen rij / eigen sessie". Wie de routes
--      omzeilt en direct naar PostgREST schrijft, kon een sessie openen op een
--      inactieve lijst, een sessie "afgerond" inserten zonder antwoorden,
--      antwoorden schrijven of wijzigen in een afgeronde sessie, een afgeronde
--      sessie heropenen, en een antwoord hangen aan een vraag van een ándere lijst.
-- De routes toetsen dit wél (app/api/questionnaires/[id]/{session,respond}); de
-- database wordt hiermee de laatste verdedigingslinie in plaats van een open deur.
--
-- ACCESSMODEL NA DEZE MIGRATIE
-- Drie soorten aanroepers, per policy dezelfde volgorde van takken:
--   * service_role — BYPASSRLS, raakt policies niet; de tak staat er voor
--     symmetrie met de consolidatie-migraties (20260719090108 / 20260721150100).
--   * superadmin (profiles.role = 'superadmin', via de anon RLS-client in
--     app/api/admin/questionnaires/**) — mag alles, ongewijzigd: resultaten
--     lezen, invullingen verwijderen, vragen beheren.
--   * eigenaar (gewone ingelogde gebruiker) — hieronder aangescherpt.
-- anon — geen enkele policy staat `to anon`/`to public` nog open; 0 rijen, geen
-- fout (was al zo: de predicaten waren voor anon onwaar).
--
-- WAT VERANDERT PER POLICY
-- questionnaire_questions
--   "authenticated_read_questions" (SELECT, USING true)
--     → "questionnaire_questions select": superadmin/service_role alles; verder
--       alleen vragen waarvan de lijst actief is. Het is_active-predicaat staat
--       expliciet in de policy (niet alleen geërfd via de RLS op questionnaires,
--       die in de subquery óók nog geldt): een latere verruiming van
--       "questionnaires select" mag concept-vragen niet stil mee openzetten.
--   Admin insert/update/delete: ongewijzigd.
-- questionnaire_sessions — "questionnaire_sessions access" (ALL) gesplitst in:
--   select : superadmin/service_role, of eigen rij. (Ongewijzigd in effect.)
--   insert : eigenaar alleen met user_id = zichzelf, completed_at IS NULL, en
--            een ACTIEVE lijst.
--   update : eigenaar alleen op een eigen OPEN sessie (USING: oude rij
--            completed_at IS NULL) en de nieuwe rij blijft van hem op een
--            ACTIEVE lijst. Afronden mag; heropenen of wijzigen na afronding niet.
--            Besluit: óók hier "lijst actief". Zonder die eis kon een sessie op
--            een net gedeactiveerde lijst worden afgerond zonder verplichte
--            antwoorden (de nieuwe vraag-policy toont de PATCH-route dan 0 vragen,
--            dus "alle verplichte beantwoord" is leeg-waar).
--   delete : eigenaar alleen een eigen OPEN sessie. Besluit + motivering: de
--            sessieroute ruimt een dubbele, zojuist aangemaakte open sessie op;
--            een afgeronde invulling is ingeleverd onderzoeksmateriaal en wordt
--            door beheer (superadmin) of via de accountverwijdering (FK-cascade
--            vanaf auth.users) gewist, niet stil door de invuller zelf.
--   + KOLOMRECHT: authenticated verliest tabel-breed UPDATE en krijgt alleen
--     UPDATE (completed_at). RLS kan de oude rij in WITH CHECK niet zien, dus
--     zonder dit kon een eigenaar een open sessie met antwoorden naar een andere
--     actieve lijst verhangen (questionnaire_id) of started_at vervalsen. Geen
--     enkele route wijzigt een andere sessiekolom (ook beheer niet: die leest en
--     verwijdert alleen). LET OP bij een toekomstige kolom die de gebruiker wél
--     moet kunnen wijzigen: die heeft een eigen `grant update (kolom)` nodig.
-- questionnaire_responses — "questionnaire_responses access" (ALL) gesplitst in:
--   select : superadmin/service_role, of antwoord in een eigen sessie
--            (ongewijzigd — nodig voor hervatten en de AVG-export).
--   insert : eigenaar alleen in een eigen OPEN sessie van een ACTIEVE lijst,
--            met een question_id die bij de questionnaire_id van díe sessie hoort
--            (dus ook niet NULL).
--   update : dezelfde eis op de oude rij (USING) én op de nieuwe rij (WITH CHECK).
--   delete : alleen superadmin/service_role. Geen route laat de invuller losse
--            antwoorden wissen; het opruimen van een sessie loopt via de
--            FK-cascade, en RI-acties omzeilen RLS.
--
-- WELKE ROUTE WELKE POLICY NODIG HEEFT (anon RLS-client, ingelogde gebruiker)
--   GET  /api/questionnaires              questionnaires select, questionnaire_questions
--                                         select (embed op actieve lijsten),
--                                         sessions select, responses select
--   GET  /api/questionnaires/[id]/session idem (actieve lijst + eigen open sessie)
--   POST /api/questionnaires/[id]/session sessions insert (actieve lijst, completed_at
--                                         null), sessions select, sessions delete
--                                         (dubbele OPEN sessie)
--   POST /api/questionnaires/[id]/respond questionnaire_questions select, responses
--                                         insert + update (upsert on conflict)
--   PATCH /api/questionnaires/[id]/respond questions/responses select, sessions update
--                                         (completed_at op open sessie, actieve lijst)
--   GET  /api/account/export              sessions select + responses select (embed)
--   /api/admin/questionnaires/**          superadmin-tak op elke policy
--
-- LIVE GEMETEN VÓÓR SCHRIJVEN (pg_policies / pg_indexes / role_table_grants /
-- pg_constraint, 13-09-2026)
--   * questionnaire_questions: "authenticated_read_questions" SELECT to
--     authenticated USING true; admin insert/update/delete to public.
--   * questionnaire_sessions: alleen "questionnaire_sessions access" ALL to public,
--     USING = CHECK = service_role OR superadmin OR (select auth.uid()) = user_id.
--   * questionnaire_responses: alleen "questionnaire_responses access" ALL to public,
--     USING = CHECK = service_role OR superadmin OR exists eigen sessie.
--   * questionnaires: "questionnaires select" to authenticated (is_active OR
--     service_role OR superadmin) + admin insert/update/delete — ongewijzigd hier.
--   * RLS aan op alle vier; niet FORCE. anon/authenticated hebben tabel-brede
--     grants (Supabase-standaard) — de afscherming zit volledig in RLS.
--   * FK's: sessions.questionnaire_id → questionnaires ON DELETE CASCADE,
--     sessions.user_id → auth.users ON DELETE CASCADE, responses.session_id →
--     sessions ON DELETE CASCADE, responses.question_id → questions ON DELETE SET
--     NULL. UNIQUE (session_id, question_id) op responses (upsert-doel).
--   * Indexen dekken de policy-joins al: sessions (user_id, questionnaire_id),
--     sessions (questionnaire_id), responses (session_id), questions
--     (questionnaire_id, sort_order), plus de pkeys. Geen nieuwe index nodig.
--
-- PERFORMANCE / INITPLAN
-- auth.uid() en auth.role() staan overal als `(select …)`, en de superadmin-check
-- is een ongecorreleerde subquery — alle drie één keer per statement (initplan).
-- Eén permissive policy per (tabel, rol, actie): geen multiple_permissive_policies.
--
-- TERUGWEG
-- Geen down-migratie; herstel via een nieuwe correctiemigratie die de nieuwe
-- policies dropt en de oude één-op-één terugzet (predicaten staan hierboven onder
-- LIVE GEMETEN), plus `grant update on public.questionnaire_sessions to
-- authenticated;`. Er worden geen rijen aangeraakt, dus terugdraaien kost geen data.
-- ============================================================================

-- ── questionnaire_questions — alleen vragen van zichtbare lijsten ────────────
drop policy if exists "authenticated_read_questions"   on public.questionnaire_questions;
drop policy if exists "questionnaire_questions select" on public.questionnaire_questions;

create policy "questionnaire_questions select" on public.questionnaire_questions
  for select to authenticated
  using (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
    or exists (
      select 1 from questionnaires q
      where q.id = questionnaire_questions.questionnaire_id
        and q.is_active = true
    )
  );

-- ── questionnaire_sessions — FOR ALL gesplitst per operatie ──────────────────
drop policy if exists "questionnaire_sessions access" on public.questionnaire_sessions;
drop policy if exists "questionnaire_sessions select" on public.questionnaire_sessions;
drop policy if exists "questionnaire_sessions insert" on public.questionnaire_sessions;
drop policy if exists "questionnaire_sessions update" on public.questionnaire_sessions;
drop policy if exists "questionnaire_sessions delete" on public.questionnaire_sessions;

create policy "questionnaire_sessions select" on public.questionnaire_sessions
  for select to authenticated
  using (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
    or user_id = (select auth.uid())
  );

create policy "questionnaire_sessions insert" on public.questionnaire_sessions
  for insert to authenticated
  with check (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
    or (
      user_id = (select auth.uid())
      and completed_at is null
      and exists (
        select 1 from questionnaires q
        where q.id = questionnaire_sessions.questionnaire_id
          and q.is_active = true
      )
    )
  );

create policy "questionnaire_sessions update" on public.questionnaire_sessions
  for update to authenticated
  using (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
    or (user_id = (select auth.uid()) and completed_at is null)
  )
  with check (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
    or (
      user_id = (select auth.uid())
      and exists (
        select 1 from questionnaires q
        where q.id = questionnaire_sessions.questionnaire_id
          and q.is_active = true
      )
    )
  );

create policy "questionnaire_sessions delete" on public.questionnaire_sessions
  for delete to authenticated
  using (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
    or (user_id = (select auth.uid()) and completed_at is null)
  );

-- Kolomrecht: een sessie verhangen of backdaten kan RLS niet zien (geen oude rij
-- in WITH CHECK). Alleen afronden is een gebruikersschrijfactie.
revoke update on public.questionnaire_sessions from authenticated;
grant update (completed_at) on public.questionnaire_sessions to authenticated;

-- ── questionnaire_responses — FOR ALL gesplitst per operatie ─────────────────
drop policy if exists "questionnaire_responses access" on public.questionnaire_responses;
drop policy if exists "questionnaire_responses select" on public.questionnaire_responses;
drop policy if exists "questionnaire_responses insert" on public.questionnaire_responses;
drop policy if exists "questionnaire_responses update" on public.questionnaire_responses;
drop policy if exists "questionnaire_responses delete" on public.questionnaire_responses;

create policy "questionnaire_responses select" on public.questionnaire_responses
  for select to authenticated
  using (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
    or exists (
      select 1 from questionnaire_sessions s
      where s.id = questionnaire_responses.session_id
        and s.user_id = (select auth.uid())
    )
  );

-- Schrijven door de eigenaar: eigen open sessie, actieve lijst, en de vraag hoort
-- bij de lijst van die sessie. De join op questionnaire_questions sluit ook een
-- NULL question_id uit.
create policy "questionnaire_responses insert" on public.questionnaire_responses
  for insert to authenticated
  with check (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
    or exists (
      select 1
      from questionnaire_sessions s
      join questionnaires q on q.id = s.questionnaire_id
      join questionnaire_questions qq on qq.questionnaire_id = s.questionnaire_id
      where s.id = questionnaire_responses.session_id
        and qq.id = questionnaire_responses.question_id
        and s.user_id = (select auth.uid())
        and s.completed_at is null
        and q.is_active = true
    )
  );

create policy "questionnaire_responses update" on public.questionnaire_responses
  for update to authenticated
  using (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
    or exists (
      select 1
      from questionnaire_sessions s
      join questionnaires q on q.id = s.questionnaire_id
      join questionnaire_questions qq on qq.questionnaire_id = s.questionnaire_id
      where s.id = questionnaire_responses.session_id
        and qq.id = questionnaire_responses.question_id
        and s.user_id = (select auth.uid())
        and s.completed_at is null
        and q.is_active = true
    )
  )
  with check (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
    or exists (
      select 1
      from questionnaire_sessions s
      join questionnaires q on q.id = s.questionnaire_id
      join questionnaire_questions qq on qq.questionnaire_id = s.questionnaire_id
      where s.id = questionnaire_responses.session_id
        and qq.id = questionnaire_responses.question_id
        and s.user_id = (select auth.uid())
        and s.completed_at is null
        and q.is_active = true
    )
  );

create policy "questionnaire_responses delete" on public.questionnaire_responses
  for delete to authenticated
  using (
    (select auth.role()) = 'service_role'
    or exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin')
  );
