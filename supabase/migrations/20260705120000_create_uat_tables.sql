-- UAT-procesplaat (/beheer/uat): testrondes en -resultaten voor de
-- handmatige acceptatietest van de scenariocatalogus (lib/uat/catalog.ts).
-- Zie docs/uat/uat-plan.md Deel 3 §3.4 voor de volledige spec.
--
-- Scenariocatalogus = code (lib/uat/catalog.ts, versiebeheerd), resultaten =
-- database. scenario_id/sub/platform zijn daarom bewust GEEN foreign keys
-- naar een catalogustabel — de catalogus leeft alleen in de repo.
--
-- Dit is een admin-only testtool, géén gebruikersdata: alle lees-/
-- schrijfpaden lopen server-side via de service-role-client
-- (lib/supabase/service.ts#getServiceClient) achter een isSuperAdmin-check
-- in de admin-API-routes (GET/POST /api/admin/uat/rounds,
-- PATCH /api/admin/uat/rounds/[id], GET/POST /api/admin/uat/results,
-- GET /api/admin/uat/compare) — conform ADR 0006
-- (docs/adr/0006-superadmin-inzage-via-service-role.md). Er zijn daarom
-- BEWUST géén RLS-policies voor anon/authenticated: RLS staat aan zonder
-- policies, wat interactieve sessies standaard alle toegang ontzegt; de
-- service-role omzeilt RLS en blijft het enige toegangspad.

-- Eén testronde: een tijdvak waarbinnen resultaten worden geregistreerd
-- tegen een specifieke app-versie/omgeving.
create table if not exists public.uat_rounds (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  app_version text not null,
  environment text not null,
  notes text,
  created_by uuid references auth.users(id)
);

comment on table public.uat_rounds is
  'Admin-only UAT-testronde (/beheer/uat). Geen RLS-policies: toegang uitsluitend via admin-service-routes (service-role + isSuperAdmin-check), conform ADR 0006. Geen gebruikersdata.';

alter table public.uat_rounds enable row level security;

-- Eén registratie per subscenario x platform binnen een ronde. Invoer is
-- een upsert op de unieke sleutel (round_id, scenario_id, sub, platform):
-- de laatste registratie wint, historie tussen rondes zit in de rondes zelf.
create table if not exists public.uat_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.uat_rounds(id) on delete cascade,
  scenario_id text not null,
  sub text not null,
  platform text not null,
  status text not null,
  faalstap text,
  severity text,
  opmerking text,
  frictie text,
  tested_at timestamptz not null default now(),
  tester uuid references auth.users(id),
  constraint uat_results_sub_check check (sub in ('a', 'b', 'c', 'd')),
  constraint uat_results_platform_check check (platform in ('webapp', 'mobiel')),
  constraint uat_results_status_check check (status in ('geslaagd', 'gefaald', 'geblokkeerd')),
  constraint uat_results_severity_check check (severity is null or severity in ('S0', 'S1', 'S2', 'S3')),
  -- Severity is verplicht zodra een subscenario faalt.
  constraint uat_results_severity_required_on_fail check (status <> 'gefaald' or severity is not null),
  constraint uat_results_unique_registration unique (round_id, scenario_id, sub, platform)
);

comment on table public.uat_results is
  'Admin-only UAT-testresultaten (/beheer/uat). Geen RLS-policies: toegang uitsluitend via admin-service-routes (service-role + isSuperAdmin-check), conform ADR 0006. scenario_id verwijst naar lib/uat/catalog.ts (code, geen FK). Geen gebruikersdata.';

alter table public.uat_results enable row level security;

create index if not exists uat_results_round_id_idx on public.uat_results (round_id);
