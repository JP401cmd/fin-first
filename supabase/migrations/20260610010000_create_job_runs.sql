-- Uitvoeringslog voor achtergrondtaken (Vercel-crons) — zichtbaar op /beheer/jobs.
-- Inserts gebeuren via de service-role-client in de cron-endpoints (omzeilt RLS);
-- superadmins mogen lezen via RLS.
create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  status text not null check (status in ('success', 'error')),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  duration_ms integer,
  summary jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists job_runs_job_created_idx
  on public.job_runs (job, created_at desc);

alter table public.job_runs enable row level security;

drop policy if exists "job_runs superadmin select" on public.job_runs;
create policy "job_runs superadmin select" on public.job_runs
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'superadmin'
    )
  );

comment on table public.job_runs is
  'Uitvoeringslog van achtergrondtaken/crons (status, duur, samenvatting, fout). Beheer-view: /beheer/jobs.';
