-- Vragenlijst-invullingen: superadmin leest niet meer via RLS (ADR 0146).
--
-- ── Het gebrek ────────────────────────────────────────────────────────────────
-- ADR 0146 besluit dat beheer vragenlijst-antwoorden ZONDER invuller ziet
-- ("Invulling N"). De beheer-route liet `user_id` al weg, maar de SELECT-policies
-- op `questionnaire_sessions` en `questionnaire_responses` hebben een
-- superadmin-tak. Daarmee kon elke superadmin met de browser-client
--   supabase.from('questionnaire_sessions').select('user_id, questionnaire_responses(answer_text)')
-- opvragen en elk antwoord aan een persoon koppelen — het pseudoniem was alleen
-- weergave. Gevonden in de security-ship-gate van ADR 0146 (15-09-2026).
--
-- ── Wat deze migratie WEL doet ────────────────────────────────────────────────
-- De twee SELECT-policies opnieuw aanmaken ZONDER de superadmin-tak. De overige
-- takken (service_role, eigen rij / antwoord in eigen sessie) zijn letterlijk
-- overgenomen uit het LIVE predicaat (pg_get_expr(polqual), 15-09-2026), dat
-- gelijk is aan 20260913130000_questionnaire_rls_invulgrenzen.sql.
--
-- De beheer-routes lezen voortaan via de service-role ná isSuperAdmin(), met een
-- expliciete kolomlijst zonder `user_id`:
--   app/api/admin/questionnaires/route.ts               (tellingen per lijst)
--   app/api/admin/questionnaires/[id]/responses/route.ts (antwoorden + DELETE)
-- De DELETE gaat óók via de service-role: een DELETE met WHERE vereist in
-- Postgres dat de rij via een SELECT-policy zichtbaar is, dus via de
-- sessie-client zou hij na deze migratie stil 0 rijen raken.
--
-- ── Wat bewust NIET ───────────────────────────────────────────────────────────
-- De superadmin-takken op INSERT/UPDATE/DELETE blijven staan. Zonder SELECT-recht
-- kan een superadmin via de browser geen bestaande rij meer vinden om te wijzigen
-- of te wissen (WHERE vereist zichtbaarheid); wat overblijft is een blinde INSERT
-- — integriteit, geen inzage. Opruimen daarvan is een eigen migratie.
--
-- ── Uitrolvolgorde ────────────────────────────────────────────────────────────
-- EERST de code (routes op de service-role), DAN deze migratie. Andersom toont
-- /beheer/vragenlijsten tussendoor 0 invullingen en faalt verwijderen stil.
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Correctiemigratie die beide policies opnieuw aanmaakt mét de superadmin-tak
-- (predicaat staat in 20260913130000). Dat heropent de koppeling antwoord ↔
-- persoon en is een expliciet besluit tegen ADR 0146. Geen rijen geraakt.
--
-- Idempotent (drop policy if exists + create).

drop policy if exists "questionnaire_sessions select" on public.questionnaire_sessions;
create policy "questionnaire_sessions select" on public.questionnaire_sessions
  for select to authenticated
  using (
    (select auth.role()) = 'service_role'
    or user_id = (select auth.uid())
  );

drop policy if exists "questionnaire_responses select" on public.questionnaire_responses;
create policy "questionnaire_responses select" on public.questionnaire_responses
  for select to authenticated
  using (
    (select auth.role()) = 'service_role'
    or exists (
      select 1 from public.questionnaire_sessions s
      where s.id = questionnaire_responses.session_id
        and s.user_id = (select auth.uid())
    )
  );
