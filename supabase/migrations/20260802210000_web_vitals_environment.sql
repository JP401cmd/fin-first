-- Environment-discriminator op de RUM-tabel (feature 884/885, ADR 0063).
--
-- WAAROM: `web_vitals` kende geen omgeving. Localhost-dev-beacons en echte
-- productiemetingen belandden in dezelfde tabel en dus in dezelfde p75. Dev-
-- metingen zijn systematisch anders (koude Next-dev-server, geen CDN, geen
-- productie-build) en vervuilen juist de staart die p75 meet. Zonder deze knip
-- is geen enkele vóór/na-performanceclaim schoon; deze kolom is de
-- randvoorwaarde voor alle vervolgmetingen.
--
-- KNIP-DATUM 2026-08-02: alle rijen van vóór deze migratie houden
-- `environment = null` en worden BEWUST NIET gebackfilld — die metingen zijn
-- definitief dev/prod-vermengd, dus elk label zou verzonnen zijn. De p75-RPC's
-- filteren hieronder default op 'production', waardoor die ongelabelde historie
-- er automatisch buiten valt. Dat is de bedoeling. Wie de oude reeks toch wil
-- zien geeft `p_environment => null` mee: dan vervalt het filter en telt alles
-- mee (de beheer-pagina doet dat achter de chip "Alles").
--
-- De waarde wordt SERVER-SIDE gezet uit VERCEL_ENV ('production' | 'preview' |
-- 'development'), nooit uit de client-payload — hetzelfde principe als `user_id`
-- in app/api/web-vitals/route.ts. Kolom blijft nullable en zonder
-- check-constraint: telemetrie mag nooit fail-closed schrijven als het platform
-- ooit een onbekende waarde meegeeft.

alter table public.web_vitals add column if not exists environment text;

comment on column public.web_vitals.environment is
  'Server-side bepaalde omgeving uit VERCEL_ENV: production | preview | development. Null = meting van vóór 2026-08-02 (bewust niet gebackfilld, dev/prod-vermengd).';

-- Index op (environment, created_at desc): dit is precies het toegangspad van
-- alle drie de p75-RPC's hieronder — elke query filtert op environment plus een
-- created_at-venster. Bewust NIET (route, environment, created_at): met `route`
-- vooraan bedient de index alleen `p75_by_route`, terwijl `p75_summary` en
-- `p75_daily` helemaal niet op route filteren en dus zouden terugvallen op een
-- seq scan. Eén index die alle drie bedient is goedkoper in schrijflast dan twee
-- die elk de helft doen — relevant op een high-write telemetrie-tabel. De
-- bestaande (metric, created_at desc) en (route, created_at desc) blijven staan
-- voor de group-by/having-kant.
create index if not exists web_vitals_env_created_idx
  on public.web_vitals (environment, created_at desc);

-- ── p75-RPC's: environment-filter erbij ─────────────────────────────────────-
--
-- POSTGRESQL-VALKUIL: `create or replace function` met een EXTRA parameter —
-- óók een defaulted — vervangt de bestaande functie NIET maar maakt een OVERLOAD
-- ernaast. Een aanroep zonder de nieuwe parameter is dan ambigu (SQLSTATE 42725,
-- "function name is not unique") omdat beide varianten passen. Daarom eerst
-- droppen op de exacte oude signatuur, dán opnieuw aanmaken.
--
-- Let op: met de functie verdwijnen ook haar grants. De revoke/grant-regels
-- onderaan zetten het service-role-only-model terug op de NIEUWE signaturen —
-- een RPC zonder grant is stil kapot op productie.
drop function if exists public.web_vitals_p75_summary(int);
drop function if exists public.web_vitals_p75_daily(int);
drop function if exists public.web_vitals_p75_by_route(text, int, int);

-- Toegangsmodel ongewijzigd t.o.v. 20260720110000: SECURITY INVOKER (de RLS van
-- web_vitals blijft de harde grens; alleen de service-role met BYPASSRLS ziet de
-- cross-user-aggregaten), STABLE en `set search_path = ''` tegen
-- search-path-injectie.

-- ── 1) Samenvatting per metric (KPI-cards) ──────────────────────────────────
create or replace function public.web_vitals_p75_summary(
  p_days        int default 28,
  p_environment text default 'production'
)
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
    and (p_environment is null or v.environment = p_environment)
  group by v.metric
  order by v.metric;
$$;

-- ── 2) Tijdreeks: p75 per metric per kalenderdag (TrendChart) ────────────────
create or replace function public.web_vitals_p75_daily(
  p_days        int default 28,
  p_environment text default 'production'
)
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
    and (p_environment is null or v.environment = p_environment)
  group by 1, v.metric
  order by 1, v.metric;
$$;

-- ── 3) Per route voor één metric, slechtste-eerst (ranglijst-tabel) ──────────
create or replace function public.web_vitals_p75_by_route(
  p_metric       text,
  p_days         int default 28,
  p_min_samples  int default 5,
  p_environment  text default 'production'
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
    and (p_environment is null or v.environment = p_environment)
  group by v.route
  having count(*) >= p_min_samples
  order by percentile_cont(0.75) within group (order by v.value) desc, v.route;
$$;

-- ── Grants: service-role-only (spiegel van web_vitals' toegangsmodel) ────────
revoke execute on function public.web_vitals_p75_summary(int, text)              from public, anon, authenticated;
revoke execute on function public.web_vitals_p75_daily(int, text)                from public, anon, authenticated;
revoke execute on function public.web_vitals_p75_by_route(text, int, int, text)  from public, anon, authenticated;

grant execute on function public.web_vitals_p75_summary(int, text)              to service_role;
grant execute on function public.web_vitals_p75_daily(int, text)                to service_role;
grant execute on function public.web_vitals_p75_by_route(text, int, int, text)  to service_role;
