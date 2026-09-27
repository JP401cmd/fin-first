-- Vermogenssnapshots en waarderingen worden strikt persoonlijk; rollovers
-- schrijft alleen de aanmaker van het budget.
--
-- Raakt drie tabellen: public.net_worth_snapshots, public.valuations en
-- public.budget_rollovers. Pure DDL: policies, twee CHECK-constraints en één
-- guard-trigger. GEEN backfill (0 gedeelde rijen, zie de metingen hieronder).
-- Terugweg: supabase/terugweg/terugweg_snapshots_waarderingen_rollovers_eigen_rij.sql.
-- Verificatie ná toepassen: supabase/terugweg/verificatie_snapshots_waarderingen_rollovers_eigen_rij.sql.
--
-- ── Waarom ────────────────────────────────────────────────────────────────────
-- `net_worth_snapshots` en `valuations` zijn de enige twee tabellen met de
-- huishoud-SELECT-tak `ownership = 'shared' AND household_id = user_household_id()`
-- ZONDER de `trg_stamp_household_id`-trigger die op assets/debts/goals het
-- household_id server-side stempelt. Hun INSERT-check toetst alleen
-- `auth.uid() = user_id`. Een gebruiker kon dus zelf `ownership='shared'` en elk
-- bestaand household_id op een eigen rij zetten, en daarmee rijen in de SELECT
-- van een ánder huishouden laten verschijnen. Bij `valuations` komt daar bij dat
-- `entity_id` geen FK en geen guard heeft (RLS scopet de RIJ, niet de WAARDE van
-- een FK-kolom — ADR 0075): een partner kon een verzonnen waardering onder zijn
-- eigen user_id aan de gedeelde bezitting van de ander hangen, en zeven lezers
-- die alleen op entity_id filteren (o.a. lib/assets-data-loader.ts) toonden die
-- dan in de historie van de eigenaar.
--
-- `budget_rollovers` leest al afgeleid van `budgets`, maar INSERT/UPDATE toetsten
-- `budget_id` niet: je kon een rollover-rij onder je eigen user_id aan het budget
-- van een ander hangen.
--
-- ── Besluiten van de eigenaar (27-09-2026, bindend) ──────────────────────────
--   1. net_worth_snapshots: SELECT alleen eigen rijen. Een gezamenlijk verloop
--      komt later als optelsom van twee persoonlijke reeksen, niet via deze kolom.
--   2. valuations: SELECT alleen eigen rijen + een guard op entity_id: je schrijft
--      alleen waarderingen bij je eigen bezitting of schuld. De partner ziet de
--      waarderingshistorie van gedeelde bezittingen (nog) niet.
--   3. budget_rollovers: alleen de aanmaker van het budget schrijft.
--
-- ── GEMETEN FEITEN (live database, pg_policies / pg_constraint / pg_trigger /
--    pg_proc / pg_attribute / tellingen, 27-09-2026 — NIET uit migratiebestanden
--    overgenomen, conform ADR 0045) ──────────────────────────────────────────
--   * Policies vóór deze migratie (alle drie tabellen, verder geen andere):
--       net_worth_snapshots / valuations
--         SELECT "View own or shared …"  {authenticated}
--           ((select auth.uid()) = user_id) OR (ownership = 'shared'
--            AND household_id IS NOT NULL AND household_id = (select user_household_id()))
--         INSERT "Users can insert own …" {public}  with_check (select auth.uid()) = user_id
--         UPDATE "Users can update own …" {public}  using own; with_check: GEEN op
--                net_worth_snapshots, wél own op valuations
--         DELETE "Users can delete own …" {public}  using own
--       budget_rollovers
--         SELECT "View own or shared budget rollovers" {authenticated} — eigen rij OF
--                budget_id in een gedeeld budget van het eigen huishouden (blijft staan)
--         INSERT {public} with_check own · UPDATE {public} using own, GEEN with_check ·
--         DELETE {public} using own
--   * Kolommen: op beide tabellen `ownership text NOT NULL default 'personal'`
--     (CHECK in ('personal','shared')) en `household_id uuid NULL`
--     → households(id) ON DELETE SET NULL. user_id NOT NULL → auth.users(id)
--     ON DELETE CASCADE. budget_rollovers.budget_id NOT NULL → budgets(id)
--     ON DELETE CASCADE; UNIQUE (budget_id, period).
--   * valuations: entity_type CHECK in ('asset','debt'); entity_id uuid NOT NULL,
--     GEEN FK, GEEN trigger. Unieke sleutel (user_id, entity_type, entity_id,
--     valuation_date) — de oude globale (entity_id, valuation_date) bestaat niet meer.
--   * Triggers: geen enkele op deze drie tabellen.
--   * Data: net_worth_snapshots 249 rijen, 0 met ownership <> 'personal' of
--     household_id IS NOT NULL; valuations 75 rijen, idem 0; 1 valuations-rij
--     (entity_type 'debt') zonder ouderrij; 0 rijen waarvan de ouder een ándere
--     eigenaar heeft; budget_rollovers 0 rijen; households 0.
--   * Rechten: anon heeft SELECT-privilege op alle drie de tabellen (dus anon krijgt
--     straks 0 rijen, geen fout); user_household_id() heeft GEEN execute voor anon.
--   * Lineage: laatste toegepaste versie 20260926180000; sinds 1 sep staat elke
--     repo-migratie in schema_migrations behalve 20261001120000 (ai_enabled), die
--     bewust NIET is toegepast. Deze migratie bouwt daar niet op en hangt er niet
--     van af.
--
-- ── Functies die deze tabellen schrijven (pg_proc, álle schema's, 27-09-2026) ──
--   * household_leave()            SECURITY DEFINER, owner postgres (rolbypassrls)
--     zet net_worth_snapshots/valuations WHERE ownership='shared' terug naar
--     ('personal', NULL). Dat is precies de vorm die de nieuwe CHECK eist, en het
--     matcht vanaf nu nooit meer een rij: de regels worden no-ops, niet fouten.
--     Bewust NIET herschreven — de functie aanraken om twee no-op-regels te
--     schrappen is meer risico dan winst.
--   * save_budget_plan(jsonb)      SECURITY DEFINER, owner postgres (rolbypassrls)
--   * resolve_budget_model_proposal(uuid,text)  idem
--     Beide DELETEn alleen uit budget_rollovers; ze passeren RLS via de owner en
--     worden door deze policy-wijziging niet geraakt.
--   Geen enkele functie zet ownership = 'shared' of een household_id op
--   net_worth_snapshots of valuations. Geen app-code schrijft die kolommen op deze
--   twee tabellen (grep, 27-09-2026).
--
-- ── Toegangsmodel na deze migratie ───────────────────────────────────────────
--   net_worth_snapshots  lezen/schrijven: alleen eigen rij (to authenticated).
--                        CHECK: ownership = 'personal' AND household_id IS NULL.
--   valuations           lezen/schrijven: alleen eigen rij (to authenticated).
--                        CHECK idem. Guard: eigenaar(entity) = user_id.
--   budget_rollovers     lezen: ongewijzigd (eigen rij of gedeeld budget in het
--                        eigen huishouden). INSERT/UPDATE: eigen rij ÉN het budget
--                        is van jou. DELETE: eigen rij.
--   Beheer/cron: service-role, buiten RLS (ADR 0006/0146) — ongewijzigd. De guard
--   draait óók voor de service-role (triggers kennen geen bypass) en toetst tegen
--   NEW.user_id, niet tegen auth.uid(). Op 27-09-2026 schrijft geen enkele
--   service-role-code valuations: banksync en entity-backfill draaien op een
--   sessieclient (RLS + guard). Een toekomstige service-role-schrijver moet onder
--   de eigenaar van de entiteit schrijven, anders weigert de guard hem.
--
-- ── Bewuste afwijkingen / keuzes ─────────────────────────────────────────────
--   * De kolommen ownership/household_id blijven bestaan (household_leave leest ze
--     en droppen is onomkeerbaar). De CHECK maakt ze tot vaste waarden.
--   * De bestaande CHECK *_ownership_check (in ('personal','shared')) blijft staan;
--     hij is nu overbodig maar onschadelijk, en de terugweg blijft zo eenvoudiger.
--   * De budget_rollovers-DELETE toetst alleen de eigen rij, niet het budget: wie
--     ooit een rij onder zijn user_id had (bv. vóór een huishoud-merge), moet die
--     zelf kunnen opruimen.

-- ══ 0. Pre-flight ════════════════════════════════════════════════════════════
-- Faalt met een leesbare melding in plaats van een kale 23514 als er tussen de
-- meting en de uitrol toch een gedeelde rij is bijgekomen. Dan eerst uitzoeken
-- wie die schreef, niet de CHECK afzwakken.
do $$
declare
  v_nws integer;
  v_val integer;
begin
  select count(*) into v_nws from public.net_worth_snapshots
   where ownership is distinct from 'personal' or household_id is not null;
  select count(*) into v_val from public.valuations
   where ownership is distinct from 'personal' or household_id is not null;
  if v_nws > 0 or v_val > 0 then
    raise exception 'Pre-flight: % net_worth_snapshots- en % valuations-rijen zijn niet persoonlijk; migratie afgebroken', v_nws, v_val;
  end if;
end
$$;

-- ══ 1. net_worth_snapshots ═══════════════════════════════════════════════════

drop policy if exists "View own or shared net worth snapshots" on public.net_worth_snapshots;
drop policy if exists "Users can view own net worth snapshots" on public.net_worth_snapshots;
create policy "Users can view own net worth snapshots" on public.net_worth_snapshots
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can insert own net worth snapshots" on public.net_worth_snapshots;
create policy "Users can insert own net worth snapshots" on public.net_worth_snapshots
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- UPDATE met een expliciete `with check`: zonder eigen check valt Postgres terug
-- op USING, maar vertrouw daar niet op (zie 20260901140000, goal_links).
drop policy if exists "Users can update own net worth snapshots" on public.net_worth_snapshots;
create policy "Users can update own net worth snapshots" on public.net_worth_snapshots
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own net worth snapshots" on public.net_worth_snapshots;
create policy "Users can delete own net worth snapshots" on public.net_worth_snapshots
  for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.net_worth_snapshots
  drop constraint if exists net_worth_snapshots_alleen_persoonlijk;
alter table public.net_worth_snapshots
  add constraint net_worth_snapshots_alleen_persoonlijk
  check (ownership = 'personal' and household_id is null);

comment on constraint net_worth_snapshots_alleen_persoonlijk on public.net_worth_snapshots is
  'Snapshots zijn strikt persoonlijk (eigenaarsbesluit 27-09-2026). Een gezamenlijk verloop is een optelsom van twee persoonlijke reeksen, niet een gedeelde rij. Migratie 20260927120000.';

-- ══ 2. valuations ════════════════════════════════════════════════════════════

drop policy if exists "View own or shared valuations" on public.valuations;
drop policy if exists "Users can view own valuations" on public.valuations;
create policy "Users can view own valuations" on public.valuations
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can insert own valuations" on public.valuations;
create policy "Users can insert own valuations" on public.valuations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update own valuations" on public.valuations;
create policy "Users can update own valuations" on public.valuations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own valuations" on public.valuations;
create policy "Users can delete own valuations" on public.valuations
  for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.valuations
  drop constraint if exists valuations_alleen_persoonlijk;
alter table public.valuations
  add constraint valuations_alleen_persoonlijk
  check (ownership = 'personal' and household_id is null);

comment on constraint valuations_alleen_persoonlijk on public.valuations is
  'Waarderingen zijn strikt persoonlijk (eigenaarsbesluit 27-09-2026). De partner ziet de waarderingshistorie van gedeelde bezittingen nog niet. Migratie 20260927120000.';

-- Eigenaarsguard op entity_id — spiegel van guard_goal_link_owner() (20260901140000).
--
-- VORM: strikt "eigenaar van de ouderrij = NEW.user_id", niet "ouderrij zichtbaar
-- voor de schrijver". Onderbouwing (gemeten 27-09-2026):
--   * De UPDATE-policies op assets en debts zijn eigen-rij (`(select auth.uid()) =
--     user_id`). Een partner kan de waarde van een gedeelde bezitting of schuld van
--     de ander dus níét bijwerken; elke schrijver die dat probeert (ValuationModal,
--     check-in, /core/assets/revalue) liep vandaag al stil op 0 rijen in de
--     ouder-update, terwijl de waardering wél landde. "Zichtbaar" als norm zou
--     precies die halve schrijfactie legitimeren — en met de SELECT hierboven op
--     eigen rij zou de eigenaar zo'n rij bovendien nooit meer zien.
--   * De enige schrijvers van valuations (grep op .from('valuations') met insert/
--     upsert/update, 27-09-2026): components/core/assets-client.tsx (×2),
--     components/app/core/debts/debt-form.tsx, debt-valuation-modal.tsx,
--     app/(app)/core/checkin/page.tsx (×2), app/(app)/core/assets/revalue/page.tsx,
--     app/api/snapshots/entity-backfill/route.ts, lib/truelayer/balance-valuation.ts
--     (×2), lib/seed-persona.ts. De server-schrijvers filteren hun ouder al op
--     user_id; de twee batch-schrijvers (check-in, revalue) filteren in dezelfde
--     wijziging hun batch op eigen entiteiten, zodat één gedeelde partnerrij niet
--     de hele batch laat falen. Geen RPC schrijft valuations.
--
-- WANNEER HIJ VUURT: BEFORE INSERT, en BEFORE UPDATE OF entity_id, entity_type,
-- user_id. Een UPDATE van alleen value/notes/valuation_date vuurt niet, zodat de
-- ene bestaande rij zonder ouderrij bewerkbaar blijft. Een upsert (INSERT … ON
-- CONFLICT DO UPDATE) vuurt de INSERT-trigger wél op de voorgestelde rij, en de
-- UPDATE-trigger alleen als de SET-lijst die kolommen noemt — daarom valideert de
-- functie bij UPDATE alleen bij een echte waardewijziging (zelfde short-circuit
-- als guard_goal_link_owner), zodat een latere eigenaarswissel van de ouder een
-- bestaande rij nooit alsnog laat stuklopen.
create or replace function public.guard_valuation_entity_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eigenaar uuid;
begin
  if tg_op = 'UPDATE'
     and new.entity_id   is not distinct from old.entity_id
     and new.entity_type is not distinct from old.entity_type
     and new.user_id     is not distinct from old.user_id then
    return new;
  end if;

  if new.entity_type = 'asset' then
    select a.user_id into v_eigenaar
    from public.assets a
    where a.id = new.entity_id;
  elsif new.entity_type = 'debt' then
    select d.user_id into v_eigenaar
    from public.debts d
    where d.id = new.entity_id;
  end if;
  -- Een onbekend entity_type laat v_eigenaar NULL (de CHECK
  -- valuations_entity_type_check vangt dat al; hier fail-closed).

  -- Eén antwoord voor "bestaat niet" en "niet van jou": geen existentie-orakel op
  -- andermans id's, en geen id's of bedragen in de melding.
  if v_eigenaar is null or v_eigenaar is distinct from new.user_id then
    raise exception 'Deze bezitting of schuld bestaat niet of is niet van jou'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Een trigger draait ongeacht EXECUTE-grants; niemand hoeft deze functie zelf aan
-- te roepen. `public` expliciet: functies krijgen bij creatie EXECUTE aan PUBLIC.
revoke all on function public.guard_valuation_entity_owner() from public, anon, authenticated;

drop trigger if exists trg_guard_valuation_entity_owner on public.valuations;
create trigger trg_guard_valuation_entity_owner
  before insert or update of entity_id, entity_type, user_id on public.valuations
  for each row execute function public.guard_valuation_entity_owner();

-- ══ 3. budget_rollovers ══════════════════════════════════════════════════════
-- SELECT blijft ongewijzigd. De schrijfpolicies gaan naar `to authenticated`, en
-- INSERT/UPDATE eisen dat het budget van de schrijver is. De client schrijft
-- rollovers al alleen als aanmaker (buildAutoRolloverInserts in
-- lib/budget-rollover.ts slaat budgetten van een ander over); dit maakt dat een
-- datalaag-invariant in plaats van een client-afspraak. De EXISTS draait onder de
-- budgets-RLS van de schrijver; een eigen budget is daar altijd zichtbaar.

drop policy if exists "Users can insert own budget rollovers" on public.budget_rollovers;
create policy "Users can insert own budget rollovers" on public.budget_rollovers
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.budgets b
      where b.id = budget_rollovers.budget_id
        and b.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can update own budget rollovers" on public.budget_rollovers;
create policy "Users can update own budget rollovers" on public.budget_rollovers
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.budgets b
      where b.id = budget_rollovers.budget_id
        and b.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete own budget rollovers" on public.budget_rollovers;
create policy "Users can delete own budget rollovers" on public.budget_rollovers
  for delete to authenticated
  using (user_id = (select auth.uid()));
