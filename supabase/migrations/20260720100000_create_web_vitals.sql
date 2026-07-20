-- Eigen web-vitals / RUM-collectie: echte Core Web Vitals (LCP, CLS, INP, FCP,
-- TTFB) gemeten in de browser van gebruikers, per route/device/verbinding.
-- Interne observability om performanceregressies te betrappen zonder externe
-- RUM-provider (aanvulling op Speed Insights).
--
-- Toegang is bewust service-role-only (ADR 0006): schrijven (884, via de
-- ingest-route met de service-client) en lezen/aggregeren (885, /beheer) lopen
-- uitsluitend server-side. Er is daarom GEEN insert/select/update/delete-policy
-- voor interactieve sessies — RLS staat aan en dicht (least-privilege), dus de
-- afwezigheid van policies is opzet, geen vergeten policy.
--
-- user_id is nullable (on delete set null): metingen worden ook pre-auth
-- verzameld (landing/login vóór inlog) en de sample blijft bruikbaar als het
-- account later verwijderd wordt. route wordt server-side GESCRUBD: id-achtige
-- segmenten (uuid/getal/token) worden '[id]', echte slugs blijven staan
-- (bv. '/overzicht/bezittingen/woning/[id]'), zodat er geen identificerende
-- id's in de tabel belanden.

create table if not exists public.web_vitals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete set null,
  metric           text not null,               -- 'LCP'|'CLS'|'INP'|'FCP'|'TTFB'
  value            double precision not null,    -- ms (CLS = unitless score)
  rating           text,                         -- 'good'|'needs-improvement'|'poor'
  route            text not null,                -- GESCRUBD server-side: '/overzicht/bezittingen/woning/[id]'
  navigation_type  text,
  device           text,                         -- 'mobile'|'desktop'
  viewport_bucket  text,                         -- 'xs'|'sm'|'md'|'lg'|'xl'
  effective_type   text,                         -- '4g'|'3g'|'2g'|'slow-2g'
  created_at       timestamptz not null default now()
);

alter table public.web_vitals enable row level security;
-- Bewust GEEN policies: interactieve sessies mogen niet lezen/schrijven.
-- Schrijven (884) en lezen (885) lopen uitsluitend via de service-role (ADR 0006).

create index if not exists web_vitals_created_at_idx     on public.web_vitals (created_at desc);
create index if not exists web_vitals_metric_created_idx on public.web_vitals (metric, created_at desc);
create index if not exists web_vitals_route_created_idx  on public.web_vitals (route, created_at desc);
