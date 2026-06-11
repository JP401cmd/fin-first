-- Werkelijk AI-tokenverbruik per call: functie, account, model, tokens in/uit.
-- Aanvulling op ai_usage (credits = afgesproken kosten per actie): deze tabel
-- meet wat we ÉCHT verbruiken bij de provider, om de zwaarte van functies en
-- het gebruik per account te volgen (/beheer/ai-verbruik).
--
-- Schrijven gebeurt uitsluitend server-side via de service-role
-- (lib/ai/token-usage.ts, gevoed door de model-middleware in lib/ai/config.ts);
-- er is bewust géén insert-policy voor interactieve sessies. user_id is null
-- voor systeemcalls (crons zoals nieuws-ingest).

create table if not exists public.ai_token_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  feature text not null,
  provider text not null default '',
  model text not null default '',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.ai_token_usage enable row level security;

-- Eigen verbruik blijft voor de gebruiker zelf leesbaar (toekomstige
-- accountweergave); beheer leest cross-user via de service-role (ADR 0006).
create policy "ai_token_usage own select" on public.ai_token_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

create index if not exists ai_token_usage_created_at_idx on public.ai_token_usage (created_at desc);
create index if not exists ai_token_usage_user_idx on public.ai_token_usage (user_id);
create index if not exists ai_token_usage_feature_idx on public.ai_token_usage (feature);
