-- Percentiel-aggregatie voor de RUM-beheerview (feature 885, /beheer).
--
-- Deze RPC's rekenen de p75 (Google's Core-Web-Vitals-standaard) server-side uit
-- met `percentile_cont(0.75)`, zodat de beheer-pagina NIET duizenden losse rijen
-- hoeft op te halen om zelf te percentileren: één aggregatie-query per view i.p.v.
-- een egress-zware rij-dump. `percentile_cont` interpoleert lineair — geschikt
-- voor continue metingen (ms / CLS-score) — en draait op de indexen
-- (metric,created_at) / (route,created_at) uit 20260720100000.
--
-- Toegang is bewust service-role-only, consistent met web_vitals zelf (ADR 0006:
-- cross-user-leestoegang loopt uitsluitend via de service-role, nooit via een
-- brede RLS-policy):
--
--   • SECURITY INVOKER (default, hier expliciet): de functies draaien met de
--     RECHTEN VAN DE AANROEPER. web_vitals heeft RLS aan en GEEN policies, dus
--     een gewone (authenticated/anon) aanroeper ziet nul rijen en krijgt lege
--     aggregaten — RLS blijft de harde grens. De service-role heeft BYPASSRLS
--     en krijgt de echte cross-user-aggregaten. Dit is bewust STERKER dan
--     SECURITY DEFINER zou zijn: definer zou RLS omzeilen ongeacht de aanroeper,
--     waardoor een per ongeluk verbreed EXECUTE-grant meteen een cross-user-lek
--     wordt. (Contrast met applied_migration_versions (20260720092326): DIE moet
--     definer zijn omdat het supabase_migrations-schema niet leesbaar is voor de
--     app-rollen; web_vitals staat in public en wordt door RLS beschermd, dus
--     invoker + RLS is hier zowel voldoende als strikter.)
--   • EXECUTE wordt ingetrokken voor public/anon/authenticated en alleen aan
--     service_role gegeven — dubbele afdekking bovenop de RLS-grens.
--   • STABLE + `set search_path = ''` (tabelnaam volledig gekwalificeerd als
--     public.web_vitals) tegen search-path-injectie; ingebouwde functies
--     (percentile_cont, date_trunc, now, make_interval) resolven via pg_catalog,
--     dat altijd impliciet in het pad zit.

-- ── 1) Samenvatting per metric (KPI-cards) ──────────────────────────────────
-- Eén rij per metric: p75 + aantal metingen over de laatste p_days dagen.
create or replace function public.web_vitals_p75_summary(p_days int default 28)
returns table (
  metric       text,
  p75          double precision,
  sample_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    v.metric,
    percentile_cont(0.75) within group (order by v.value) as p75,
    count(*)                                               as sample_count
  from public.web_vitals v
  where v.created_at >= now() - make_interval(days => p_days)
  group by v.metric
  order by v.metric;
$$;

-- ── 2) Tijdreeks: p75 per metric per kalenderdag (TrendChart) ────────────────
-- Bucket op UTC-kalenderdag (deterministisch, ongeacht sessie-timezone).
create or replace function public.web_vitals_p75_daily(p_days int default 28)
returns table (
  day          date,
  metric       text,
  p75          double precision,
  sample_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (date_trunc('day', v.created_at at time zone 'UTC'))::date as day,
    v.metric,
    percentile_cont(0.75) within group (order by v.value)      as p75,
    count(*)                                                    as sample_count
  from public.web_vitals v
  where v.created_at >= now() - make_interval(days => p_days)
  group by 1, v.metric
  order by 1, v.metric;
$$;

-- ── 3) Per route voor één metric, slechtste-eerst (ranglijst-tabel) ──────────
-- Alle Core Web Vitals zijn lager-is-beter, dus 'slechtste eerst' = hoogste p75
-- eerst. p_min_samples dempt ruis van routes met te weinig metingen.
create or replace function public.web_vitals_p75_by_route(
  p_metric       text,
  p_days         int default 28,
  p_min_samples  int default 5
)
returns table (
  route        text,
  p75          double precision,
  sample_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    v.route,
    percentile_cont(0.75) within group (order by v.value) as p75,
    count(*)                                               as sample_count
  from public.web_vitals v
  where v.metric = p_metric
    and v.created_at >= now() - make_interval(days => p_days)
  group by v.route
  having count(*) >= p_min_samples
  order by percentile_cont(0.75) within group (order by v.value) desc, v.route;
$$;

-- ── Grants: service-role-only (spiegel van web_vitals' toegangsmodel) ────────
revoke execute on function public.web_vitals_p75_summary(int)              from public, anon, authenticated;
revoke execute on function public.web_vitals_p75_daily(int)               from public, anon, authenticated;
revoke execute on function public.web_vitals_p75_by_route(text, int, int) from public, anon, authenticated;

grant execute on function public.web_vitals_p75_summary(int)              to service_role;
grant execute on function public.web_vitals_p75_daily(int)               to service_role;
grant execute on function public.web_vitals_p75_by_route(text, int, int) to service_role;
