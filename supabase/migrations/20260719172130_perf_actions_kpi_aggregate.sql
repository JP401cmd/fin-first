-- Perf/correctheid (FASE 3 · Task 2.6): KPI-aggregaat over acties.
--
-- WAAROM: de dashboard-loader haalde ACTIE-rijen op (`.limit(1000)` ==
-- PostgREST max_rows, config.toml = 1000) om er in JS de headline-KPI's op te
-- sommen. Voor gebruikers met >1000 acties (open+postponed+completed) kapte dat
-- STIL af → `totalFreedomDaysWon` (som van freedom_days_impact over completed) en
-- `completionRatio` (completed/totaal) werden te laag. Een aggregaat levert per
-- definitie één rij en kan niet afkappen — spiegel van T2.2 (tx_month_aggregate).
--
-- TOEGANGSMODEL (leesfunctie over persoonlijke actie-data):
--   • SECURITY INVOKER (nooit DEFINER): de functie draait onder de RLS van de
--     aanroeper. De actieve SELECT-policy op `actions` ("Users can view own
--     actions": user_id = auth.uid()) geldt onverkort — geen cross-user-lek.
--     Live geverifieerd: SELECT-policy is user_id-only (geen partner/assigned_to
--     clausule meer na de 20260717-baseline). p_own_only is daardoor vandaag
--     een no-op maar blijft als expliciete narrowing voor toekomstige policies.
--   • search_path = '' + volledig gekwalificeerde namen (Supabase-hardening).
--   • EXECUTE alleen authenticated + anon. anon draait onder RLS → auth.uid() is
--     null → `null = user_id` matcht niets → 0 rijen (som = 0, count = 0), géén
--     fout (conventie). PUBLIC krijgt niets.
--
-- OUTPUT: één rij. total_freedom_days_won = Σ freedom_days_impact over completed;
-- completed_count = #completed; total_count = #(open+postponed+completed) — exact
-- dezelfde noemer als de loader (`.in('status', ['open','postponed','completed'])`,
-- 'rejected' telt niet mee). De loader leidt completionRatio + willpowerScore
-- ONGEWIJZIGD hieruit af.

drop function if exists public.actions_kpi_aggregate(boolean);

create function public.actions_kpi_aggregate(
  p_own_only boolean default false
)
returns table (
  total_freedom_days_won numeric,
  completed_count bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(a.freedom_days_impact) filter (where a.status = 'completed'), 0)::numeric as total_freedom_days_won,
    count(*) filter (where a.status = 'completed')                                          as completed_count,
    count(*)                                                                                as total_count
  from public.actions a
  where a.status in ('open', 'postponed', 'completed')
    and (not p_own_only or a.user_id = (select auth.uid()))
$$;

revoke all on function public.actions_kpi_aggregate(boolean) from public;
grant execute on function public.actions_kpi_aggregate(boolean) to authenticated, anon;

comment on function public.actions_kpi_aggregate(boolean) is
  'FASE 3 T2.6: KPI-aggregaat over acties (Σ freedom_days_impact + counts) — één rij, afkap-vrij. SECURITY INVOKER, RLS van actions (user_id-only) geldt. p_own_only=true beperkt extra tot eigen rijen. Vervangt de afkap-gevoelige .limit(1000)-reduce voor totalFreedomDaysWon/completionRatio.';
