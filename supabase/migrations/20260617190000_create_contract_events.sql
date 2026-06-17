-- Operator-telemetrie voor contractdrift van externe koppelingen/uploads —
-- zichtbaar op /beheer/integraties (tab "Contracten"). Registreert wanneer
-- een bestandsformaat of API-response afwijkt van de gedeclareerde contracten.
--
-- Toegangsmodel:
--   • Geen user_id — dit is platform-brede operatordata, niet per-gebruiker.
--   • SELECT: alleen superadmin (gespiegeld van job_runs).
--   • INSERT/UPDATE: uitsluitend via service-role (omzeilt RLS) — de helper
--     `lib/contract-events.ts` roept de RPC `increment_contract_event` aan.
--   • Anon: geen toegang, ook niet via de RPC (zie REVOKE onderaan).
--
-- Privacy by construction:
--   • `fingerprint` = structurele hash van kolom/header-namen; nooit transactiewaarden.
--   • `diff` = jsonb met uitsluitend kolom/header-NAMEN; nooit financiële waarden.
--
-- Precedent: 20260610010000_create_job_runs.sql (RLS-stijl, comment-stijl).

create table if not exists public.contract_events (
  id             uuid        primary key default gen_random_uuid(),
  kind           text        not null check (kind in ('format_drift', 'contract_violation', 'version_watch')),
  surface        text        not null,
  severity       text        not null check (severity in ('info', 'warn', 'error')),
  -- Structurele hash van kolom/header-namen — NOOIT ruwe data of financiële waarden.
  -- NOT NULL default '' zodat de unieke index op (kind, surface, fingerprint) werkt.
  fingerprint    text        not null default '',
  -- Alleen kolom/header-NAMEN als json-object of array; nooit transactierijen.
  diff           jsonb,
  occurrences    int         not null default 1,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);

comment on table public.contract_events is
  'Operator-telemetrie voor contractdrift van externe koppelingen/uploads — zichtbaar op /beheer/integraties. Bevat alleen kolom/header-namen + hash, nooit financiële waarden.';

-- Unieke index: één rij per (kind, surface, fingerprint) — upsert-or-increment is anti-spam.
create unique index if not exists contract_events_kind_surface_fingerprint_idx
  on public.contract_events (kind, surface, fingerprint);

-- Snelle filtering op surface + meest recente events bovenaan.
create index if not exists contract_events_surface_last_seen_idx
  on public.contract_events (surface, last_seen_at desc);

alter table public.contract_events enable row level security;

drop policy if exists "contract_events superadmin select" on public.contract_events;
create policy "contract_events superadmin select" on public.contract_events
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'superadmin'
    )
  );

-- ── Atomaire upsert-or-increment RPC ────────────────────────────────────────
--
-- Voegt een nieuw contract-event in of verhoogt de teller bij een bestaande
-- (kind, surface, fingerprint)-combinatie. SECURITY DEFINER zodat de functie
-- de service-role-privileges van de aanroeper niet nodig heeft — de functie
-- zelf heeft de rechten. Anon en authenticated worden hieronder uitgesloten.

create or replace function public.increment_contract_event(
  p_kind        text,
  p_surface     text,
  p_severity    text,
  p_fingerprint text,
  p_diff        jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.contract_events
    (kind, surface, severity, fingerprint, diff, occurrences, first_seen_at, last_seen_at, created_at)
  values
    (p_kind, p_surface, p_severity, p_fingerprint, p_diff, 1, now(), now(), now())
  on conflict (kind, surface, fingerprint)
  do update set
    occurrences  = contract_events.occurrences + 1,
    last_seen_at = now(),
    severity     = excluded.severity,
    diff         = excluded.diff;
end;
$$;

-- Intrek voor anon én authenticated: alleen service-role mag de RPC aanroepen.
-- Gespiegeld op 20260611130000_harden_app_settings_roadmap_rpc.sql-patroon.
revoke execute on function public.increment_contract_event(text, text, text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.increment_contract_event(text, text, text, text, jsonb) to service_role;
