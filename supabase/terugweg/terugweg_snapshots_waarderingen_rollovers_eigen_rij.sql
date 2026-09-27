-- TERUGWEG voor 20260927120000_snapshots_waarderingen_rollovers_eigen_rij.
-- NIET TOEGEPAST, en bewust BUITEN supabase/migrations/. Alleen gebruiken als de
-- migratie fout blijkt; dan dit bestand als nieuw, getimestampt migratiebestand
-- naar supabase/migrations/ kopiëren (nooit de migratie zelf bewerken).
--
-- ── Waaraan je ziet dat het misging ──────────────────────────────────────────
--   * Een 42501 met de tekst "Deze bezitting of schuld bestaat niet of is niet van
--     jou" op een schrijfactie van een gebruiker op ZIJN EIGEN bezitting/schuld —
--     in de Vercel-logs o.a. als `Valuation error:`, `[debt-form] waardehistorie
--     niet bijgewerkt`, een 500 van /api/snapshots/entity-backfill, of een
--     banksync die met "Herwaardering van het banksaldo wegschrijven mislukt"
--     afbreekt. Een 42501 op een bezitting van de PARTNER is het bedoelde gedrag.
--   * Een 23514 (check_violation) op net_worth_snapshots_alleen_persoonlijk of
--     valuations_alleen_persoonlijk: een schrijver (app, cron of RPC) zet ergens
--     toch ownership/household_id. Dat is een schrijver die gevonden moet worden,
--     niet per se een reden om de hele migratie terug te draaien.
--   * `budgets:rollover-autocompute-insert` met 42501 in de logs voor een budget
--     waarvan de gebruiker zelf de aanmaker is, of doorgeschoven saldo dat op
--     /budgetteren ineens ontbreekt voor eigen budgetten.
--   * Een 42501/"permission denied" op SELECT van net_worth_snapshots of
--     valuations voor een ingelogde gebruiker (verwacht: eigen rijen), of een
--     FOUT in plaats van 0 rijen voor anon.
--   * Het verificatiescript naast dit bestand geeft iets anders dan de verwachting
--     die in de kop staat.
--
-- ── Wat hij doet ─────────────────────────────────────────────────────────────
-- Zet de policies terug zoals ze op 27-09-2026 live stonden (gemeten tegen
-- pg_policies — namen, rolsets en expressies), dropt de twee CHECK-constraints en
-- de guard (trigger + functie). GEEN DML.
--
-- LET OP: terugdraaien heropent het lek dat de migratie dichtte (zelf gezette
-- ownership='shared' + household_id, en waarderingen op andermans entiteit).
-- Draai bij voorkeur alleen de sectie die het probleem veroorzaakt; de drie
-- secties zijn onafhankelijk. Idempotent: `drop … if exists` vóór elke create.

-- ══ 1. net_worth_snapshots ═══════════════════════════════════════════════════

alter table public.net_worth_snapshots
  drop constraint if exists net_worth_snapshots_alleen_persoonlijk;

drop policy if exists "Users can view own net worth snapshots" on public.net_worth_snapshots;
drop policy if exists "View own or shared net worth snapshots" on public.net_worth_snapshots;
create policy "View own or shared net worth snapshots" on public.net_worth_snapshots
  for select to authenticated
  using (
    ((select auth.uid()) = user_id)
    or (
      ownership = 'shared'::text
      and household_id is not null
      and household_id = (select public.user_household_id())
    )
  );

drop policy if exists "Users can insert own net worth snapshots" on public.net_worth_snapshots;
create policy "Users can insert own net worth snapshots" on public.net_worth_snapshots
  for insert to public
  with check ((select auth.uid()) = user_id);

-- Oud: GEEN with_check op deze UPDATE (gemeten 27-09-2026).
drop policy if exists "Users can update own net worth snapshots" on public.net_worth_snapshots;
create policy "Users can update own net worth snapshots" on public.net_worth_snapshots
  for update to public
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own net worth snapshots" on public.net_worth_snapshots;
create policy "Users can delete own net worth snapshots" on public.net_worth_snapshots
  for delete to public
  using ((select auth.uid()) = user_id);

-- ══ 2. valuations ════════════════════════════════════════════════════════════

drop trigger if exists trg_guard_valuation_entity_owner on public.valuations;
drop function if exists public.guard_valuation_entity_owner();

alter table public.valuations
  drop constraint if exists valuations_alleen_persoonlijk;

drop policy if exists "Users can view own valuations" on public.valuations;
drop policy if exists "View own or shared valuations" on public.valuations;
create policy "View own or shared valuations" on public.valuations
  for select to authenticated
  using (
    ((select auth.uid()) = user_id)
    or (
      ownership = 'shared'::text
      and household_id is not null
      and household_id = (select public.user_household_id())
    )
  );

drop policy if exists "Users can insert own valuations" on public.valuations;
create policy "Users can insert own valuations" on public.valuations
  for insert to public
  with check ((select auth.uid()) = user_id);

-- Oud: wél een with_check op deze UPDATE (gemeten 27-09-2026).
drop policy if exists "Users can update own valuations" on public.valuations;
create policy "Users can update own valuations" on public.valuations
  for update to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own valuations" on public.valuations;
create policy "Users can delete own valuations" on public.valuations
  for delete to public
  using ((select auth.uid()) = user_id);

-- ══ 3. budget_rollovers ══════════════════════════════════════════════════════
-- De SELECT-policy is door de migratie niet aangeraakt en blijft staan.

drop policy if exists "Users can insert own budget rollovers" on public.budget_rollovers;
create policy "Users can insert own budget rollovers" on public.budget_rollovers
  for insert to public
  with check ((select auth.uid()) = user_id);

-- Oud: GEEN with_check op deze UPDATE (gemeten 27-09-2026).
drop policy if exists "Users can update own budget rollovers" on public.budget_rollovers;
create policy "Users can update own budget rollovers" on public.budget_rollovers
  for update to public
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own budget rollovers" on public.budget_rollovers;
create policy "Users can delete own budget rollovers" on public.budget_rollovers
  for delete to public
  using ((select auth.uid()) = user_id);
