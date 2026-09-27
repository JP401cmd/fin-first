-- VERIFICATIE ná het toepassen van
-- 20260927120000_snapshots_waarderingen_rollovers_eigen_rij.
-- Geen migratie; niet naar supabase/migrations/ kopiëren. Blok voor blok draaien
-- (SQL-editor of execute_sql). Blok A–E zijn alleen-lezen en geven alleen
-- metadata en TELLINGEN terug, nooit inhoud. Blok F schrijft (in een transactie
-- met rollback) en draait alleen met expliciet akkoord van de eigenaar.
--
-- Nulmeting 27-09-2026 (vóór toepassen, zelfde blokken D en E): D gaf
-- eigen 90 / andermans 0 (snapshots), eigen 42 / andermans 0 (waarderingen),
-- 0 / 0 (rollovers); E gaf 0 / 0 / 0 zonder fout. Na toepassen hoort D exact
-- hetzelfde te geven — de migratie haalt alleen een (lege) gedeelde tak weg.

-- ══ A. Policies bestaan zoals bedoeld ════════════════════════════════════════
-- Verwacht: 12 rijen (4 per tabel), ok = true op elke rij.
select tablename, policyname, cmd, roles::text as rollen,
       case
         when tablename in ('net_worth_snapshots', 'valuations') then
              roles = '{authenticated}'
          and coalesce(qual, '')       not ilike '%household%'
          and coalesce(with_check, '') not ilike '%household%'
          and (cmd <> 'UPDATE' or with_check is not null)
          -- Geen lege policy (een `using (true)` mag hier niet groen worden): elke tak
          -- pint de eigen rij, in using én — waar die geldt — in with check.
          and (cmd = 'INSERT' or (qual ilike '%auth.uid()%' and qual ilike '%user_id%'))
          and (cmd not in ('INSERT', 'UPDATE') or (with_check ilike '%auth.uid()%' and with_check ilike '%user_id%'))
         when tablename = 'budget_rollovers' and cmd in ('INSERT', 'UPDATE') then
              roles = '{authenticated}'
          and with_check ilike '%budgets%'
          and with_check ilike '%auth.uid()%'
         when tablename = 'budget_rollovers' then
              roles = '{authenticated}'
          and qual ilike '%auth.uid()%'
       end as ok
from pg_policies
where schemaname = 'public'
  and tablename in ('net_worth_snapshots', 'valuations', 'budget_rollovers')
order by tablename, cmd;

-- Verwacht: 0 — geen policy meer op {public} op deze drie tabellen, en geen
-- oude "View own or shared"-policy op snapshots/waarderingen.
select count(*) as afwijkend
from pg_policies
where schemaname = 'public'
  and (
       (tablename in ('net_worth_snapshots', 'valuations', 'budget_rollovers') and roles = '{public}')
    or (tablename in ('net_worth_snapshots', 'valuations') and policyname ilike 'View own or shared%')
  );

-- ══ B. CHECK-constraints en guard ════════════════════════════════════════════
-- Verwacht: 2 rijen, gevalideerd = true.
select c.relname as tabel, con.conname, con.convalidated as gevalideerd
from pg_constraint con
join pg_class c on c.oid = con.conrelid
where c.relnamespace = 'public'::regnamespace
  and con.conname in ('net_worth_snapshots_alleen_persoonlijk', 'valuations_alleen_persoonlijk');

-- Verwacht: 1 rij, ingeschakeld = 'O', en de definitie noemt
-- "UPDATE OF entity_id, entity_type, user_id".
select t.tgname, t.tgenabled as ingeschakeld, pg_get_triggerdef(t.oid) as definitie
from pg_trigger t
where t.tgrelid = 'public.valuations'::regclass
  and not t.tgisinternal;

-- Verwacht: security definer = true, search_path leeg, eigenaar = postgres (met
-- bypassrls), en GEEN execute voor anon/authenticated/PUBLIC (alleen postgres en
-- service_role).
select p.proname, p.prosecdef as security_definer, p.proconfig::text as config,
       pg_get_userbyid(p.proowner) as eigenaar, r.rolbypassrls as eigenaar_bypassrls,
       p.proacl::text as rechten
from pg_proc p
join pg_roles r on r.oid = p.proowner
where p.oid = 'public.guard_valuation_entity_owner()'::regprocedure;

-- ══ C. Hygiëne-gate op de nieuwe policies ════════════════════════════════════
-- De functie somt élke policy op die een huishoud-helper aanroept; de
-- overtreding staat in de laatste kolom. Zie migratie 20260810220000.
-- Nulmeting 27-09-2026: 3 rijen, alle zonder overtreding (de drie SELECT-policies).
-- Verwacht ná toepassen: precies 1 rij — budget_rollovers /
-- "View own or shared budget rollovers" — met overtreding = NULL. Snapshots en
-- waarderingen horen hier niet meer in voor te komen.
select tabel_naam, policy_naam, commando, rollen, kale_aanroepen, overtreding
from public.rls_helper_policy_hygiene()
where tabel_naam in ('net_worth_snapshots', 'valuations', 'budget_rollovers');

-- ══ D. Leak-check als ingelogde gebruiker ════════════════════════════════════
-- Twee identiteiten:
--   D1 een bestaande gebruiker die zowel snapshots als waarderingen heeft
--      (bewijst dat de check niet leeg is: eigen > 0) — verwacht andermans = 0;
--   D2 een vreemde uid die nergens rijen heeft — verwacht zichtbaar = 0.
-- De sub wordt gezet vóór `set local role`, zodat de keuze nog als postgres leest.
begin;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v.user_id
              from public.valuations v
              join public.net_worth_snapshots n using (user_id)
             limit 1),
    'role', 'authenticated')::text,
  true);
set local role authenticated;
select 'D1' as check, current_user as rol, 'net_worth_snapshots' as tabel,
       count(*) filter (where user_id =  (select auth.uid())) as eigen,
       count(*) filter (where user_id <> (select auth.uid())) as andermans
  from public.net_worth_snapshots
union all
select 'D1', current_user, 'valuations',
       count(*) filter (where user_id =  (select auth.uid())),
       count(*) filter (where user_id <> (select auth.uid()))
  from public.valuations
union all
select 'D1', current_user, 'budget_rollovers',
       count(*) filter (where user_id =  (select auth.uid())),
       count(*) filter (where user_id <> (select auth.uid()))
  from public.budget_rollovers;
rollback;

begin;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
  true);
set local role authenticated;
select 'D2' as check, current_user as rol, 'net_worth_snapshots' as tabel, count(*) as zichtbaar from public.net_worth_snapshots
union all select 'D2', current_user, 'valuations',       count(*) from public.valuations
union all select 'D2', current_user, 'budget_rollovers', count(*) from public.budget_rollovers;
rollback;

-- ══ E. anon ══════════════════════════════════════════════════════════════════
-- Verwacht: 0 rijen per tabel en GEEN fout. Een fout (bv. 42501) is hier een
-- bevinding: een rolset-/rechten-regressie, geen correcte afscherming.
begin;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select 'E' as check, current_user as rol, 'net_worth_snapshots' as tabel, count(*) as zichtbaar from public.net_worth_snapshots
union all select 'E', current_user, 'valuations',       count(*) from public.valuations
union all select 'E', current_user, 'budget_rollovers', count(*) from public.budget_rollovers;
rollback;

-- ══ F. Schrijfproef (OPTIONEEL — schrijft, altijd rollback) ══════════════════
-- Alleen met expliciet akkoord van de eigenaar, of op een branch/lokale database.
-- Bewijst dat (1) de guard een waardering op andermans bezitting weigert, (2) de
-- CHECK een gedeelde snapshot weigert, (3) een rollover op andermans budget
-- geweigerd wordt, (4) een waardering op een eigen bezitting wél slaagt, (5) een
-- eigen waardering niet naar andermans bezitting omgehangen kan worden, en (6) een
-- bijwerking met ongewijzigde entity-kolommen (zoals een PostgREST-upsert ze in
-- SET zet) via de short-circuit slaagt.
-- Geeft alleen een telling "geweigerd zoals bedoeld" terug.
begin;
create temporary table _uitkomst (proef text, geslaagd boolean) on commit drop;
grant insert, select on _uitkomst to authenticated;
-- A = eigenaar van een bezitting; B = een andere gebruiker met een budget.
select set_config('app.verif_a', (select a.user_id::text from public.assets a limit 1), true);
select set_config('app.verif_asset', (select a.id::text from public.assets a
                                       where a.user_id::text = current_setting('app.verif_a') limit 1), true);
select set_config('app.verif_b', (select b.user_id::text from public.budgets b
                                   where b.user_id::text <> current_setting('app.verif_a') limit 1), true);
select set_config('app.verif_budget_a', coalesce((select b.id::text from public.budgets b
                                   where b.user_id::text = current_setting('app.verif_a') limit 1), ''), true);
-- Voor (5) en (6): een bestaande waardering van A, en een bezitting van iemand anders.
select set_config('app.verif_valuation_a', coalesce((select v.id::text from public.valuations v
                                   where v.user_id::text = current_setting('app.verif_a') limit 1), ''), true);
select set_config('app.verif_asset_ander', coalesce((select a.id::text from public.assets a
                                   where a.user_id::text <> current_setting('app.verif_a') limit 1), ''), true);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('app.verif_b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  -- (1) B schrijft een waardering op de bezitting van A.
  begin
    insert into public.valuations (user_id, entity_type, entity_id, valuation_date, value)
    values (current_setting('app.verif_b')::uuid, 'asset', current_setting('app.verif_asset')::uuid, date '1900-01-01', 1);
    insert into _uitkomst values ('guard weigert andermans bezitting', false);
  exception when insufficient_privilege then
    insert into _uitkomst values ('guard weigert andermans bezitting', true);
  end;
  -- (2) B schrijft een snapshot met ownership = 'shared'.
  begin
    insert into public.net_worth_snapshots (user_id, snapshot_date, total_assets, total_debts, net_worth, ownership)
    values (current_setting('app.verif_b')::uuid, date '1900-01-01', 0, 0, 0, 'shared');
    insert into _uitkomst values ('CHECK weigert gedeelde snapshot', false);
  exception when check_violation then
    insert into _uitkomst values ('CHECK weigert gedeelde snapshot', true);
  end;
  -- (3) B schrijft een rollover op een budget van A (alleen als A een budget heeft).
  if current_setting('app.verif_budget_a') <> '' then
    begin
      insert into public.budget_rollovers (user_id, budget_id, period, carried_amount, rollover_type)
      values (current_setting('app.verif_b')::uuid, current_setting('app.verif_budget_a')::uuid, '1900-01', 0, 'carry-over');
      insert into _uitkomst values ('RLS weigert rollover op andermans budget', false);
    exception when insufficient_privilege then
      insert into _uitkomst values ('RLS weigert rollover op andermans budget', true);
    end;
  end if;
end
$$;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('app.verif_a'), 'role', 'authenticated')::text, true);
do $$
begin
  -- (4) A schrijft een waardering op de eigen bezitting.
  begin
    insert into public.valuations (user_id, entity_type, entity_id, valuation_date, value)
    values (current_setting('app.verif_a')::uuid, 'asset', current_setting('app.verif_asset')::uuid, date '1900-01-01', 1);
    insert into _uitkomst values ('eigen waardering slaagt', true);
  exception when others then
    insert into _uitkomst values ('eigen waardering slaagt', false);
  end;
  if current_setting('app.verif_valuation_a') <> '' and current_setting('app.verif_asset_ander') <> '' then
    -- (5) A hangt een eigen waardering om naar de bezitting van een ander.
    begin
      update public.valuations
         set entity_type = 'asset', entity_id = current_setting('app.verif_asset_ander')::uuid
       where id = current_setting('app.verif_valuation_a')::uuid;
      insert into _uitkomst values ('guard weigert omhangen naar andermans bezitting', false);
    exception when insufficient_privilege then
      insert into _uitkomst values ('guard weigert omhangen naar andermans bezitting', true);
    end;
  end if;
  if current_setting('app.verif_valuation_a') <> '' then
    -- (6) A werkt een eigen waardering bij met de entity-kolommen ongewijzigd in SET.
    begin
      update public.valuations
         set value = value, entity_id = entity_id, entity_type = entity_type, user_id = user_id
       where id = current_setting('app.verif_valuation_a')::uuid;
      insert into _uitkomst values ('upsert-vorm op eigen rij slaagt', true);
    exception when others then
      insert into _uitkomst values ('upsert-vorm op eigen rij slaagt', false);
    end;
  end if;
end
$$;
-- Verwacht: elke rij geslaagd = true.
select proef, geslaagd from _uitkomst order by proef;
rollback;

-- ══ G. Advisors ═══════════════════════════════════════════════════════════════
-- Draai na het toepassen `get_advisors` (type security). De guard
-- guard_valuation_entity_owner() hoort daar niet te verschijnen (lint 0028/0029:
-- execute voor anon/authenticated op een security-definer-functie).
