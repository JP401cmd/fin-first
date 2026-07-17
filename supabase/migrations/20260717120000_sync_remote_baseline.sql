-- =====================================================================
-- Migratie-drift baseline: remote schema terugsyncen naar de repo
-- =====================================================================
-- Bron: Enterprise-architectuurreview 3 jul 2026, bevinding #19 (Arch F3).
--
-- WAAROM: de live (remote) Supabase telde 74 tabellen, de repo-migraties
-- beschreven er ~56. 23 LIVE tabellen hadden geen tabeldefinitie in de repo,
-- waardoor hun RLS-policies niet vanuit git te reviewen waren en de ERD-view
-- op /beheer/architectuur (gescand uit migrations door scanTableRelations)
-- ze miste. Elke schema-review tegen de repo gaf daardoor een vals beeld.
--
-- WAT: dit bestand codificeert die 23 remote-only tabellen — kolommen,
-- inline FK's/constraints, RLS + policies en indexes — EXACT zoals ze remote
-- bestaan. Het is een DOCUMENTAIRE, IDEMPOTENTE baseline:
--   * De objecten bestaan al op prod; dit bestand is bewust NIET opnieuw op
--     remote uitgevoerd (geen apply_migration) — de remote is de bron, de
--     repo legt hem vast. De IF-NOT-EXISTS-guards op tabellen, policies en
--     indexes maken hem no-op op remote en
--     volledig herspeelbaar op een schone preview-branch.
--   * Puur ADDITIEF: geen history-rewrite, geen `migration repair`, geen
--     drop/recreate. De bestaande files én de remote historie-tabel blijven
--     ongemoeid.
--
-- TOEGANGSMODEL (per domein toegelicht bij de tabel):
--   * Persoonlijke eigen-rij data: `user_id = auth.uid()` (own-row RLS).
--   * Gedeelde huishoud-budgetten: via `user_household_id()` + budgets/
--     transactions.ownership='shared' (helper gedefinieerd in
--     20260218000001 / 20260713120000).
--   * Beheer/audit (admin_actions_log, ai_usage superadmin-read, error_logs,
--     mail_log, tier_assignments_log): superadmin-select of deny-all;
--     systeem-writes lopen via service-role (ADR 0006), niet via een brede
--     interactieve policy.
--   * Referentiedata (nibud_reference_data): publiek leesbaar, alleen
--     superadmin schrijft.
--   * _legacy_* holdings: gedeprecceerde tabellen, own-row RLS behouden.
--
-- LET OP (aparte F3-kaart 'RLS-hygiëne'): error_logs/mail_log e.d. hebben
-- bewust geen brede insert-policy — writes via service-role. De inhoudelijke
-- WITH CHECK(true)-advisor-bevindingen worden op die aparte kaart behandeld.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DE WIL — aanbevelingen, acties, feedback
-- ---------------------------------------------------------------------

-- recommendations: AI/handmatige aanbevelingen, eigenaar = gebruiker.
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  recommendation_type text not null check (recommendation_type = any (array['budget_optimization','asset_reallocation','debt_acceleration','income_increase','savings_boost'])),
  euro_impact_monthly numeric,
  euro_impact_yearly numeric,
  freedom_days_per_year numeric,
  related_budget_slug text,
  related_asset_id uuid references public.assets(id) on delete set null,
  related_debt_id uuid references public.debts(id) on delete set null,
  current_value numeric,
  proposed_value numeric,
  status text not null default 'pending' check (status = any (array['pending','accepted','rejected','postponed','expired'])),
  rejection_reason text,
  postponed_until date,
  postpone_feedback text,
  ai_generation_id text,
  priority_score integer check (priority_score >= 1 and priority_score <= 5),
  suggested_actions jsonb default '[]'::jsonb,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.recommendations enable row level security;
create index if not exists idx_recommendations_user_status on public.recommendations using btree (user_id, status);
drop policy if exists "Users can view own recommendations" on public.recommendations;
create policy "Users can view own recommendations" on public.recommendations for select to public using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own recommendations" on public.recommendations;
create policy "Users can insert own recommendations" on public.recommendations for insert to public with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own recommendations" on public.recommendations;
create policy "Users can update own recommendations" on public.recommendations for update to public using ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own recommendations" on public.recommendations;
create policy "Users can delete own recommendations" on public.recommendations for delete to public using ((select auth.uid()) = user_id);

-- actions: uitvoerbare acties, eigenaar = gebruiker; optioneel gekoppeld aan recommendation.
create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid references public.recommendations(id) on delete set null,
  source text not null default 'manual' check (source = any (array['ai','manual','chat'])),
  title text not null,
  description text,
  freedom_days_impact numeric,
  euro_impact_monthly numeric,
  status text not null default 'open' check (status = any (array['open','postponed','completed','rejected'])),
  scheduled_week date,
  due_date date,
  postpone_weeks integer,
  postponed_until date,
  rejection_reason text,
  sort_order integer not null default 0,
  priority_score integer check (priority_score >= 1 and priority_score <= 5),
  completed_at timestamptz,
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb
);
alter table public.actions enable row level security;
create index if not exists idx_actions_user_status on public.actions using btree (user_id, status);
create index if not exists idx_actions_recommendation on public.actions using btree (recommendation_id);
drop policy if exists "Users can view own actions" on public.actions;
create policy "Users can view own actions" on public.actions for select to public using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own actions" on public.actions;
create policy "Users can insert own actions" on public.actions for insert to public with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own actions" on public.actions;
create policy "Users can update own actions" on public.actions for update to public using ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own actions" on public.actions;
create policy "Users can delete own actions" on public.actions for delete to public using ((select auth.uid()) = user_id);

-- recommendation_feedback: feedback op aanbevelingen, eigenaar = gebruiker.
create table if not exists public.recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  feedback_type text not null check (feedback_type = any (array['accepted','rejected','postponed','action_completed','action_rejected'])),
  reason text,
  recommendation_type text,
  related_budget_slug text,
  freedom_days_impact numeric,
  created_at timestamptz not null default now()
);
alter table public.recommendation_feedback enable row level security;
create index if not exists idx_feedback_user_type on public.recommendation_feedback using btree (user_id, recommendation_type);
drop policy if exists "Users can view own feedback" on public.recommendation_feedback;
create policy "Users can view own feedback" on public.recommendation_feedback for select to public using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own feedback" on public.recommendation_feedback;
create policy "Users can insert own feedback" on public.recommendation_feedback for insert to public with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- DE KERN — budgetten & doelen
-- ---------------------------------------------------------------------

-- budget_amounts: tijdslijn van budgetbedragen per budget. Eigenaar = budgets.user_id;
-- gedeelde huishoud-budgetten ook door huishoudleden beheerbaar.
create table if not exists public.budget_amounts (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  effective_from date not null,
  amount numeric not null,
  created_at timestamptz not null default now(),
  unique (budget_id, effective_from)
);
alter table public.budget_amounts enable row level security;
create unique index if not exists budget_amounts_unique on public.budget_amounts using btree (budget_id, effective_from);
drop policy if exists "Users manage own budget amounts" on public.budget_amounts;
create policy "Users manage own budget amounts" on public.budget_amounts for all to public
  using (budget_id in (select budgets.id from budgets where budgets.user_id = (select auth.uid())))
  with check (budget_id in (select budgets.id from budgets where budgets.user_id = (select auth.uid())));
drop policy if exists "Household members manage shared budget amounts" on public.budget_amounts;
create policy "Household members manage shared budget amounts" on public.budget_amounts for all to authenticated
  using (budget_id in (select budgets.id from budgets where budgets.ownership = 'shared' and budgets.household_id = user_household_id()))
  with check (budget_id in (select budgets.id from budgets where budgets.ownership = 'shared' and budgets.household_id = user_household_id()));

-- budget_rollovers: doorgeschoven budgetrestanten per periode, eigenaar = gebruiker.
create table if not exists public.budget_rollovers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  period text not null,
  carried_amount numeric(12,2) not null default 0,
  rollover_type text not null,
  created_at timestamptz not null default now(),
  unique (budget_id, period)
);
alter table public.budget_rollovers enable row level security;
create index if not exists idx_budget_rollovers_budget_id on public.budget_rollovers using btree (budget_id);
create index if not exists idx_budget_rollovers_period on public.budget_rollovers using btree (period);
create index if not exists idx_budget_rollovers_user_id on public.budget_rollovers using btree (user_id);
drop policy if exists "Users can view own budget rollovers" on public.budget_rollovers;
create policy "Users can view own budget rollovers" on public.budget_rollovers for select to public using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own budget rollovers" on public.budget_rollovers;
create policy "Users can insert own budget rollovers" on public.budget_rollovers for insert to public with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own budget rollovers" on public.budget_rollovers;
create policy "Users can update own budget rollovers" on public.budget_rollovers for update to public using ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own budget rollovers" on public.budget_rollovers;
create policy "Users can delete own budget rollovers" on public.budget_rollovers for delete to public using ((select auth.uid()) = user_id);
drop policy if exists "Household members view shared budget rollovers" on public.budget_rollovers;
create policy "Household members view shared budget rollovers" on public.budget_rollovers for select to authenticated
  using (budget_id in (select budgets.id from budgets where budgets.ownership = 'shared' and budgets.household_id = user_household_id()));

-- goal_contributions: stortingen op een doel, eigenaar = gebruiker.
create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  goal_id uuid not null references public.goals(id) on delete cascade,
  amount numeric not null,
  date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.goal_contributions enable row level security;
create index if not exists idx_goal_contributions_goal on public.goal_contributions using btree (goal_id);
create index if not exists idx_goal_contributions_date on public.goal_contributions using btree (goal_id, date);
drop policy if exists "Users can manage own goal contributions" on public.goal_contributions;
create policy "Users can manage own goal contributions" on public.goal_contributions for all to public
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Referentiedata & rapporten
-- ---------------------------------------------------------------------

-- nibud_reference_data: publieke NIBUD-referentiebedragen. Iedereen leest;
-- alleen superadmin schrijft (beheer).
create table if not exists public.nibud_reference_data (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  household_composition text not null,
  nibud_category_key text not null,
  nibud_category_name text not null,
  basis_amount numeric not null default 0,
  voorbeeld_amount numeric,
  mapped_budget_slug text,
  frequency text not null default 'monthly',
  notes text,
  created_at timestamptz default now(),
  unique (year, household_composition, nibud_category_key)
);
alter table public.nibud_reference_data enable row level security;
drop policy if exists "read_nibud" on public.nibud_reference_data;
create policy "read_nibud" on public.nibud_reference_data for select to public using (true);
drop policy if exists "admin_nibud_insert" on public.nibud_reference_data;
create policy "admin_nibud_insert" on public.nibud_reference_data for insert to public
  with check (exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin'));
drop policy if exists "admin_nibud_update" on public.nibud_reference_data;
create policy "admin_nibud_update" on public.nibud_reference_data for update to public
  using (exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin'));
drop policy if exists "admin_nibud_delete" on public.nibud_reference_data;
create policy "admin_nibud_delete" on public.nibud_reference_data for delete to public
  using (exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.role = 'superadmin'));

-- report_configs: opgeslagen rapportconfiguraties, eigenaar = gebruiker.
create table if not exists public.report_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  period_type text not null check (period_type = any (array['month','quarter','year','custom'])),
  date_from date not null,
  date_to date not null,
  is_scheduled boolean default false,
  schedule_frequency text check (schedule_frequency = any (array['monthly','quarterly','yearly'])),
  last_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cached_data jsonb,
  use_ai boolean not null default true
);
alter table public.report_configs enable row level security;
drop policy if exists "Users manage own report configs" on public.report_configs;
create policy "Users manage own report configs" on public.report_configs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Huishouden — transactie-splits & verrekeningen
-- ---------------------------------------------------------------------

-- transaction_splits: splitsing van een transactie over budgetten. Eigenaar via
-- transactions.user_id; gedeelde huishoud-transacties leesbaar door huishoudleden.
create table if not exists public.transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  budget_id uuid references public.budgets(id) on delete set null,
  amount numeric not null,
  description text,
  created_at timestamptz default now()
);
alter table public.transaction_splits enable row level security;
create index if not exists idx_transaction_splits_transaction_id on public.transaction_splits using btree (transaction_id);
create index if not exists idx_transaction_splits_budget_id on public.transaction_splits using btree (budget_id);
drop policy if exists "Users can view own splits" on public.transaction_splits;
create policy "Users can view own splits" on public.transaction_splits for select to public
  using (transaction_id in (select transactions.id from transactions where transactions.user_id = auth.uid()));
drop policy if exists "Users can insert own splits" on public.transaction_splits;
create policy "Users can insert own splits" on public.transaction_splits for insert to public
  with check (transaction_id in (select transactions.id from transactions where transactions.user_id = auth.uid()));
drop policy if exists "Users can update own splits" on public.transaction_splits;
create policy "Users can update own splits" on public.transaction_splits for update to public
  using (transaction_id in (select transactions.id from transactions where transactions.user_id = auth.uid()));
drop policy if exists "Users can delete own splits" on public.transaction_splits;
create policy "Users can delete own splits" on public.transaction_splits for delete to public
  using (transaction_id in (select transactions.id from transactions where transactions.user_id = auth.uid()));
drop policy if exists "Household members view shared transaction splits" on public.transaction_splits;
create policy "Household members view shared transaction splits" on public.transaction_splits for select to authenticated
  using (transaction_id in (select transactions.id from transactions where transactions.ownership = 'shared' and transactions.household_id = user_household_id()));

-- settlement_entries: onderlinge verrekeningen binnen een huishouden.
create table if not exists public.settlement_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  from_user_id uuid not null references auth.users(id),
  to_user_id uuid not null references auth.users(id),
  amount numeric not null check (amount > 0),
  description text,
  related_transaction_id uuid references public.transactions(id) on delete set null,
  status text not null default 'open' check (status = any (array['open','settled'])),
  settled_at timestamptz,
  created_at timestamptz default now()
);
alter table public.settlement_entries enable row level security;
drop policy if exists "Users can view settlement entries for their household" on public.settlement_entries;
create policy "Users can view settlement entries for their household" on public.settlement_entries for select to public
  using (household_id in (select profiles.household_id from profiles where profiles.id = auth.uid()));
drop policy if exists "Users can insert settlement entries for their household" on public.settlement_entries;
create policy "Users can insert settlement entries for their household" on public.settlement_entries for insert to public
  with check ((household_id in (select profiles.household_id from profiles where profiles.id = auth.uid())) and ((from_user_id = auth.uid()) or (to_user_id = auth.uid())));
drop policy if exists "Users can update settlement entries for their household" on public.settlement_entries;
create policy "Users can update settlement entries for their household" on public.settlement_entries for update to public
  using (household_id in (select profiles.household_id from profiles where profiles.id = auth.uid()));

-- ---------------------------------------------------------------------
-- Beheer / audit — service-role writes, superadmin- of deny-reads (ADR 0006)
-- ---------------------------------------------------------------------

-- tier_assignments_log: audit van tier-toewijzingen. Bewuste deny-all policies
-- (using/with check false): toegang uitsluitend via service-role beheerroutes.
create table if not exists public.tier_assignments_log (
  id uuid primary key default gen_random_uuid(),
  target_user uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  old_tier text,
  new_tier text not null,
  created_at timestamptz not null default now()
);
alter table public.tier_assignments_log enable row level security;
drop policy if exists "Admins can view tier log" on public.tier_assignments_log;
create policy "Admins can view tier log" on public.tier_assignments_log for select to public using (false);
drop policy if exists "Admins can insert tier log" on public.tier_assignments_log;
create policy "Admins can insert tier log" on public.tier_assignments_log for insert to public with check (false);

-- admin_actions_log: audit-trail superadmin-beheeracties. Superadmin leest/schrijft.
create table if not exists public.admin_actions_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text not null,
  target_user uuid,
  target_label text,
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_actions_log enable row level security;
create index if not exists admin_actions_log_created_idx on public.admin_actions_log using btree (created_at desc);
drop policy if exists "admin_actions superadmin select" on public.admin_actions_log;
create policy "admin_actions superadmin select" on public.admin_actions_log for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'));
drop policy if exists "admin_actions superadmin insert" on public.admin_actions_log;
create policy "admin_actions superadmin insert" on public.admin_actions_log for insert to authenticated
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'));

-- ai_usage: per-actie AI-creditverbruik per gebruiker. Eigen-rij read + insert;
-- superadmin mag ook alles lezen (beheer).
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  feature text not null,
  credits integer not null default 1,
  created_at timestamptz not null default now()
);
alter table public.ai_usage enable row level security;
create index if not exists ai_usage_user_created_idx on public.ai_usage using btree (user_id, created_at desc);
create index if not exists ai_usage_created_idx on public.ai_usage using btree (created_at desc);
drop policy if exists "ai_usage own select" on public.ai_usage;
create policy "ai_usage own select" on public.ai_usage for select to authenticated using (user_id = auth.uid());
drop policy if exists "ai_usage own insert" on public.ai_usage;
create policy "ai_usage own insert" on public.ai_usage for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "ai_usage superadmin select" on public.ai_usage;
create policy "ai_usage superadmin select" on public.ai_usage for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'));

-- error_logs: zelf-gehost client-side foutlogboek. Auth-gebruiker schrijft eigen
-- rij (user_id mag null zijn bij anonieme fouten → insert dan via service-role);
-- alleen superadmin leest. Inhoudelijke RLS-hygiëne: aparte F3-kaart.
create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  context text,
  message text not null,
  stack text,
  url text,
  level text not null default 'error',
  created_at timestamptz not null default now()
);
alter table public.error_logs enable row level security;
create index if not exists error_logs_created_idx on public.error_logs using btree (created_at desc);
drop policy if exists "error_logs auth insert" on public.error_logs;
create policy "error_logs auth insert" on public.error_logs for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "error_logs superadmin select" on public.error_logs;
create policy "error_logs superadmin select" on public.error_logs for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'));

-- mail_log: logboek transactionele e-mailpogingen. Systeem-write via service-role
-- (geen interactieve insert-policy); alleen superadmin leest.
create table if not exists public.mail_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  status text not null check (status = any (array['sent','failed','skipped'])),
  provider text,
  error text,
  created_at timestamptz not null default now()
);
alter table public.mail_log enable row level security;
create index if not exists mail_log_created_idx on public.mail_log using btree (created_at desc);
drop policy if exists "mail_log superadmin select" on public.mail_log;
create policy "mail_log superadmin select" on public.mail_log for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'));

-- ---------------------------------------------------------------------
-- Bank-koppelingen (GoCardless/TrueLayer) — eigenaar = gebruiker
-- ---------------------------------------------------------------------

-- bank_connections: koppeling met een bankprovider. Tokens uitsluitend encrypted
-- opgeslagen (plaintext-kolommen elders gedropt). Eigen-rij RLS.
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  provider_id text not null,
  provider_name text not null,
  provider_logo text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  status text not null default 'pending',
  authorized_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  access_token_encrypted text,
  refresh_token_encrypted text
);
alter table public.bank_connections enable row level security;
drop policy if exists "Users can manage own connections" on public.bank_connections;
create policy "Users can manage own connections" on public.bank_connections for all to public using (auth.uid() = user_id);

-- bank_connection_accounts: bankrekeningen binnen een koppeling. IBAN encrypted +
-- hash voor lookup. Eigen-rij RLS.
create table if not exists public.bank_connection_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  connection_id uuid not null references public.bank_connections(id) on delete cascade,
  bank_account_id uuid references public.bank_accounts(id),
  external_account_id text not null,
  iban text,
  account_name text,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  sync_cursor text,
  daily_requests integer not null default 0,
  rate_limit_reset_date text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  iban_encrypted text,
  iban_hash text
);
alter table public.bank_connection_accounts enable row level security;
create index if not exists bank_connection_accounts_iban_hash_idx on public.bank_connection_accounts using btree (user_id, iban_hash) where (iban_hash is not null);
drop policy if exists "Users can manage own connection accounts" on public.bank_connection_accounts;
create policy "Users can manage own connection accounts" on public.bank_connection_accounts for all to public using (auth.uid() = user_id);

-- bank_sync_log: synchronisatielog per gekoppelde rekening. Eigen-rij RLS.
create table if not exists public.bank_sync_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  connection_account_id uuid not null references public.bank_connection_accounts(id),
  sync_type text not null,
  status text not null,
  transactions_new integer,
  transactions_dup integer,
  error_message text,
  created_at timestamptz not null default now()
);
alter table public.bank_sync_log enable row level security;
drop policy if exists "Users can view own sync logs" on public.bank_sync_log;
create policy "Users can view own sync logs" on public.bank_sync_log for all to public using (auth.uid() = user_id);

-- user_own_ibans: eigen IBANs/namen voor eigen-rekening-transferdetectie. Eigen-rij RLS.
create table if not exists public.user_own_ibans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  iban text,
  label text,
  created_at timestamptz default now(),
  match_type text not null default 'iban' check (match_type = any (array['iban','name'])),
  match_value text not null,
  unique (user_id, iban)
);
alter table public.user_own_ibans enable row level security;
create index if not exists user_own_ibans_user_id_idx on public.user_own_ibans using btree (user_id);
create unique index if not exists user_own_ibans_user_match_uniq on public.user_own_ibans using btree (user_id, match_type, match_value);
drop policy if exists "own" on public.user_own_ibans;
create policy "own" on public.user_own_ibans for all to public using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Nieuws (krant) — eigenaar = gebruiker
-- ---------------------------------------------------------------------

-- news_editions: gegenereerde krant-edities per gebruiker.
create table if not exists public.news_editions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_nr integer not null,
  jaargang integer not null,
  articles jsonb not null,
  article_count integer not null,
  hero_headline text not null,
  created_at timestamptz not null default now(),
  unique (user_id, edition_nr)
);
alter table public.news_editions enable row level security;
create index if not exists idx_news_editions_user on public.news_editions using btree (user_id, edition_nr desc);
drop policy if exists "Users can view own editions" on public.news_editions;
create policy "Users can view own editions" on public.news_editions for select to public using (auth.uid() = user_id);
drop policy if exists "Users can insert own editions" on public.news_editions;
create policy "Users can insert own editions" on public.news_editions for insert to public with check (auth.uid() = user_id);
drop policy if exists "Users can delete own editions" on public.news_editions;
create policy "Users can delete own editions" on public.news_editions for delete to public using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- _legacy_* holdings — gedeprecceerde beleggingstabellen, own-row RLS behouden
-- ---------------------------------------------------------------------

-- _legacy_holdings: oude holdings-tabel (opgevolgd door investment_holdings).
create table if not exists public._legacy_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  ticker text,
  isin text,
  name text not null,
  units numeric not null default 0,
  avg_purchase_price numeric not null default 0,
  current_price numeric,
  last_price_update timestamptz,
  purchase_date date,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  asset_class text,
  sector text,
  geography text,
  previous_close numeric,
  daily_change_percent numeric,
  is_favorite boolean default false,
  currency text not null default 'EUR',
  ter numeric,
  ter_source text,
  constraint holdings_ter_range check ((ter is null) or ((ter >= 0) and (ter <= 0.10))),
  constraint holdings_ter_source_values check ((ter_source is null) or (ter_source = any (array['manual','lookup'])))
);
alter table public._legacy_holdings enable row level security;
drop policy if exists "Users can view own holdings" on public._legacy_holdings;
create policy "Users can view own holdings" on public._legacy_holdings for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert own holdings" on public._legacy_holdings;
create policy "Users can insert own holdings" on public._legacy_holdings for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own holdings" on public._legacy_holdings;
create policy "Users can update own holdings" on public._legacy_holdings for update to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can delete own holdings" on public._legacy_holdings;
create policy "Users can delete own holdings" on public._legacy_holdings for delete to authenticated using (auth.uid() = user_id);

-- _legacy_holding_transactions: transacties bij de oude holdings.
create table if not exists public._legacy_holding_transactions (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references public._legacy_holdings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type = any (array['buy','sell','dividend','split'])),
  units numeric not null,
  price_per_unit numeric not null,
  total_amount numeric not null,
  date date not null,
  notes text,
  created_at timestamptz not null default now(),
  external_source text,
  external_trade_id text
);
alter table public._legacy_holding_transactions enable row level security;
create index if not exists holding_transactions_external_source_idx on public._legacy_holding_transactions using btree (external_source) where (external_source is not null);
create unique index if not exists holding_transactions_external_dedup_uidx on public._legacy_holding_transactions using btree (external_source, external_trade_id) where (external_source is not null);
drop policy if exists "Users can view own holding transactions" on public._legacy_holding_transactions;
create policy "Users can view own holding transactions" on public._legacy_holding_transactions for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert own holding transactions" on public._legacy_holding_transactions;
create policy "Users can insert own holding transactions" on public._legacy_holding_transactions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own holding transactions" on public._legacy_holding_transactions;
create policy "Users can update own holding transactions" on public._legacy_holding_transactions for update to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can delete own holding transactions" on public._legacy_holding_transactions;
create policy "Users can delete own holding transactions" on public._legacy_holding_transactions for delete to authenticated using (auth.uid() = user_id);

-- _legacy_holding_prices: prijshistorie bij de oude holdings. Toegang via holding-ownership.
create table if not exists public._legacy_holding_prices (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references public._legacy_holdings(id) on delete cascade,
  date date not null,
  close_price numeric not null,
  currency text not null default 'EUR',
  source text default 'yahoo_finance',
  created_at timestamptz not null default now(),
  unique (holding_id, date)
);
alter table public._legacy_holding_prices enable row level security;
create index if not exists idx_holding_prices_holding_date on public._legacy_holding_prices using btree (holding_id, date desc);
drop policy if exists "Users can view own holding prices" on public._legacy_holding_prices;
create policy "Users can view own holding prices" on public._legacy_holding_prices for select to authenticated
  using (holding_id in (select _legacy_holdings.id from _legacy_holdings where _legacy_holdings.user_id = auth.uid()));
drop policy if exists "Users can insert own holding prices" on public._legacy_holding_prices;
create policy "Users can insert own holding prices" on public._legacy_holding_prices for insert to authenticated
  with check (holding_id in (select _legacy_holdings.id from _legacy_holdings where _legacy_holdings.user_id = auth.uid()));
drop policy if exists "Users can delete own holding prices" on public._legacy_holding_prices;
create policy "Users can delete own holding prices" on public._legacy_holding_prices for delete to authenticated
  using (holding_id in (select _legacy_holdings.id from _legacy_holdings where _legacy_holdings.user_id = auth.uid()));
