-- Performance-sanering fase 1 — Migratie 2: RLS initplan-rewrite + policy-consolidatie
--
-- NB: alle `drop policy` hieronder staan op `if exists` — een deel van deze policies bestond
-- alleen op de remote database (historische drift, nooit in een lokale migratie aangemaakt).
-- Zonder `if exists` breekt een verse `supabase db reset` hier middenin de keten.
--
-- WAAROM: Supabase performance-advisor meldde 148× auth_rls_initplan (policies die auth.uid()/
-- auth.role()/auth.email() PER RIJ evalueren) en 269× multiple_permissive_policies (meerdere
-- permissive policies per (rol, actie) worden alle geevalueerd). Elke /overzicht-SSR doet ~90-105
-- queries; deze per-query- en per-rij-overhead telt direct door in de TTFB.
--
-- TWEE INGREPEN, BEIDE GEDRAGSNEUTRAAL:
--  1. initplan-rewrite: `auth.uid()` -> `(select auth.uid())` (idem auth.role()/auth.email()).
--     Postgres cachet de subquery-uitkomst per query i.p.v. per rij. Identieke semantiek.
--  2. consolidatie: waar meerdere PERMISSIVE policies dezelfde (rol, actie) dekken worden ze tot
--     EEN policy samengevoegd met OR-verbonden condities. Permissive policies zijn al OR-verbonden,
--     dus OR-samenvoegen is per definitie gedragsneutraal. Redundante "manage own" (FOR ALL)-policies
--     die volledig gedekt worden door granulaire per-actie-policies worden gedropt (geen toegang
--     gaat verloren). Merged SELECT-policies staan bewust op `to public`: de huishouden-tak is
--     onwaar voor anon (user_household_id() = null), dus de bredere public-rolset blijft exact.
--
-- NIET AANGERAAKT / BEWUSTE UITZONDERINGEN (zie report + ADR):
--  - RESTRICTIVE policies: geen aanwezig, niets aangeraakt.
--  - Beheer/service-role paden (ADR 0006): beheer leest via service-client die RLS passeert; dat
--    blijft zo. service_role-policies blijven functioneel (via OR meegenomen bij merges).
--  - app_settings: alleen initplan-rewrite; multiple_permissive NIET geconsolideerd (gemengde
--    public/authenticated-rolsets + security-gevoelige API-key-filtering -> niet 1-op-1 te bewijzen).
--  - household_members: alleen initplan-rewrite; UPDATE-overlap NIET samengevoegd (RLS-recursie-
--    historie, afwijkende with_check-semantiek).
--  - questionnaire_questions/questionnaires: service+superadmin samengevoegd; de losse
--    `authenticated_read`-SELECT (=true) blijft, dus 1 residual SELECT-overlap per tabel (bewust).

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTIE A — initplan-rewrite (ALTER POLICY) voor eigenaar-tabellen zonder consolidatie
-- ═══════════════════════════════════════════════════════════════════════════

-- _legacy_holding_prices
alter policy "Users can delete own holding prices" on public._legacy_holding_prices using (holding_id in ( select _legacy_holdings.id from _legacy_holdings where (_legacy_holdings.user_id = (select auth.uid()))));
alter policy "Users can insert own holding prices" on public._legacy_holding_prices with check (holding_id in ( select _legacy_holdings.id from _legacy_holdings where (_legacy_holdings.user_id = (select auth.uid()))));
alter policy "Users can view own holding prices" on public._legacy_holding_prices using (holding_id in ( select _legacy_holdings.id from _legacy_holdings where (_legacy_holdings.user_id = (select auth.uid()))));

-- _legacy_holding_transactions
alter policy "Users can delete own holding transactions" on public._legacy_holding_transactions using ((select auth.uid()) = user_id);
alter policy "Users can insert own holding transactions" on public._legacy_holding_transactions with check ((select auth.uid()) = user_id);
alter policy "Users can view own holding transactions" on public._legacy_holding_transactions using ((select auth.uid()) = user_id);
alter policy "Users can update own holding transactions" on public._legacy_holding_transactions using ((select auth.uid()) = user_id);

-- _legacy_holdings
alter policy "Users can delete own holdings" on public._legacy_holdings using ((select auth.uid()) = user_id);
alter policy "Users can insert own holdings" on public._legacy_holdings with check ((select auth.uid()) = user_id);
alter policy "Users can view own holdings" on public._legacy_holdings using ((select auth.uid()) = user_id);
alter policy "Users can update own holdings" on public._legacy_holdings using ((select auth.uid()) = user_id);

-- admin_actions_log
alter policy "admin_actions superadmin insert" on public.admin_actions_log with check (exists ( select 1 from profiles p where ((p.id = (select auth.uid())) and (p.role = 'superadmin'::text))));
alter policy "admin_actions superadmin select" on public.admin_actions_log using (exists ( select 1 from profiles p where ((p.id = (select auth.uid())) and (p.role = 'superadmin'::text))));

-- ai_calculator_usage
alter policy "Users manage own usage" on public.ai_calculator_usage using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- balance_snapshots
alter policy "Users can delete own balance snapshots" on public.balance_snapshots using ((select auth.uid()) = user_id);
alter policy "Users can insert own balance snapshots" on public.balance_snapshots with check ((select auth.uid()) = user_id);
alter policy "Users can view own balance snapshots" on public.balance_snapshots using ((select auth.uid()) = user_id);
alter policy "Users can update own balance snapshots" on public.balance_snapshots using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- bank_connection_accounts
alter policy "Users can manage own connection accounts" on public.bank_connection_accounts using ((select auth.uid()) = user_id);

-- bank_connections
alter policy "Users can manage own connections" on public.bank_connections using ((select auth.uid()) = user_id);

-- bank_sync_log
alter policy "Users can view own sync logs" on public.bank_sync_log using ((select auth.uid()) = user_id);

-- broker_connections
alter policy "broker_connections_delete_own" on public.broker_connections using ((select auth.uid()) = user_id);
alter policy "broker_connections_insert_own" on public.broker_connections with check ((select auth.uid()) = user_id);
alter policy "broker_connections_select_own" on public.broker_connections using ((select auth.uid()) = user_id);
alter policy "broker_connections_update_own" on public.broker_connections using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- calculator_reports
alter policy "Users can submit reports" on public.calculator_reports with check ((select auth.uid()) = reporter_id);
alter policy "Users can read own reports" on public.calculator_reports using ((select auth.uid()) = reporter_id);

-- category_corrections
alter policy "Users can manage their own corrections" on public.category_corrections using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- crypto_holding_prices (via crypto_holdings)
alter policy "crypto_holding_prices_delete_own" on public.crypto_holding_prices using (holding_id in ( select crypto_holdings.id from crypto_holdings where (crypto_holdings.user_id = (select auth.uid()))));
alter policy "crypto_holding_prices_insert_own" on public.crypto_holding_prices with check (holding_id in ( select crypto_holdings.id from crypto_holdings where (crypto_holdings.user_id = (select auth.uid()))));
alter policy "crypto_holding_prices_select_own" on public.crypto_holding_prices using (holding_id in ( select crypto_holdings.id from crypto_holdings where (crypto_holdings.user_id = (select auth.uid()))));
alter policy "crypto_holding_prices_update_own" on public.crypto_holding_prices using (holding_id in ( select crypto_holdings.id from crypto_holdings where (crypto_holdings.user_id = (select auth.uid())))) with check (holding_id in ( select crypto_holdings.id from crypto_holdings where (crypto_holdings.user_id = (select auth.uid()))));

-- crypto_holdings
alter policy "crypto_holdings_delete_own" on public.crypto_holdings using ((select auth.uid()) = user_id);
alter policy "crypto_holdings_insert_own" on public.crypto_holdings with check ((select auth.uid()) = user_id);
alter policy "crypto_holdings_select_own" on public.crypto_holdings using ((select auth.uid()) = user_id);
alter policy "crypto_holdings_update_own" on public.crypto_holdings using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- crypto_transactions
alter policy "crypto_transactions_delete_own" on public.crypto_transactions using ((select auth.uid()) = user_id);
alter policy "crypto_transactions_insert_own" on public.crypto_transactions with check ((select auth.uid()) = user_id);
alter policy "crypto_transactions_select_own" on public.crypto_transactions using ((select auth.uid()) = user_id);
alter policy "crypto_transactions_update_own" on public.crypto_transactions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- error_logs (alleen de superadmin-select; de insert is al gewrapt)
alter policy "error_logs superadmin select" on public.error_logs using (exists ( select 1 from profiles p where ((p.id = (select auth.uid())) and (p.role = 'superadmin'::text))));

-- exchange_connections
alter policy "exchange_connections_delete_own" on public.exchange_connections using ((select auth.uid()) = user_id);
alter policy "exchange_connections_insert_own" on public.exchange_connections with check ((select auth.uid()) = user_id);
alter policy "exchange_connections_select_own" on public.exchange_connections using ((select auth.uid()) = user_id);
alter policy "exchange_connections_update_own" on public.exchange_connections using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- external_data_sources
alter policy "external_data_sources_delete_own" on public.external_data_sources using ((select auth.uid()) = user_id);
alter policy "external_data_sources_insert_own" on public.external_data_sources with check ((select auth.uid()) = user_id);
alter policy "external_data_sources_select_own" on public.external_data_sources using ((select auth.uid()) = user_id);
alter policy "external_data_sources_update_own" on public.external_data_sources using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- feedback
alter policy "feedback own insert" on public.feedback with check (user_id = (select auth.uid()));

-- goal_contributions
alter policy "Users can manage own goal contributions" on public.goal_contributions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- holding_alerts
alter policy "Users can delete own alerts" on public.holding_alerts using ((select auth.uid()) = user_id);
alter policy "Users can insert own alerts" on public.holding_alerts with check ((select auth.uid()) = user_id);
alter policy "Users can view own alerts" on public.holding_alerts using ((select auth.uid()) = user_id);
alter policy "Users can update own alerts" on public.holding_alerts using ((select auth.uid()) = user_id);

-- household_invitations
alter policy "Owner can delete invitations" on public.household_invitations using (invited_by = (select auth.uid()));
alter policy "Owner can create invitations" on public.household_invitations with check ((invited_by = (select auth.uid())) and (household_id = user_owned_household_id()));
alter policy "Owner or invitee can update invitations" on public.household_invitations using ((invited_by = (select auth.uid())) or (lower(invited_email) = lower(coalesce((select auth.email()), ''::text))));

-- households
alter policy "Owner can delete household" on public.households using (created_by = (select auth.uid()));
alter policy "Authenticated users can create households" on public.households with check (created_by = (select auth.uid()));
alter policy "Members can view own household" on public.households using ((id = user_household_id()) or (created_by = (select auth.uid())));

-- investment_holding_prices (via investment_holdings)
alter policy "investment_holding_prices_delete_own" on public.investment_holding_prices using (holding_id in ( select investment_holdings.id from investment_holdings where (investment_holdings.user_id = (select auth.uid()))));
alter policy "investment_holding_prices_insert_own" on public.investment_holding_prices with check (holding_id in ( select investment_holdings.id from investment_holdings where (investment_holdings.user_id = (select auth.uid()))));
alter policy "investment_holding_prices_select_own" on public.investment_holding_prices using (holding_id in ( select investment_holdings.id from investment_holdings where (investment_holdings.user_id = (select auth.uid()))));
alter policy "investment_holding_prices_update_own" on public.investment_holding_prices using (holding_id in ( select investment_holdings.id from investment_holdings where (investment_holdings.user_id = (select auth.uid())))) with check (holding_id in ( select investment_holdings.id from investment_holdings where (investment_holdings.user_id = (select auth.uid()))));

-- investment_holdings
alter policy "investment_holdings_delete_own" on public.investment_holdings using ((select auth.uid()) = user_id);
alter policy "investment_holdings_insert_own" on public.investment_holdings with check ((select auth.uid()) = user_id);
alter policy "investment_holdings_select_own" on public.investment_holdings using ((select auth.uid()) = user_id);
alter policy "investment_holdings_update_own" on public.investment_holdings using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- investment_transactions
alter policy "investment_transactions_delete_own" on public.investment_transactions using ((select auth.uid()) = user_id);
alter policy "investment_transactions_insert_own" on public.investment_transactions with check ((select auth.uid()) = user_id);
alter policy "investment_transactions_select_own" on public.investment_transactions using ((select auth.uid()) = user_id);
alter policy "investment_transactions_update_own" on public.investment_transactions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- job_runs
alter policy "job_runs superadmin select" on public.job_runs using (exists ( select 1 from profiles p where ((p.id = (select auth.uid())) and (p.role = 'superadmin'::text))));

-- mail_log
alter policy "mail_log superadmin select" on public.mail_log using (exists ( select 1 from profiles p where ((p.id = (select auth.uid())) and (p.role = 'superadmin'::text))));

-- net_worth_history
alter policy "Users can insert own net worth history" on public.net_worth_history with check ((select auth.uid()) = user_id);
alter policy "Users can view own net worth history" on public.net_worth_history using ((select auth.uid()) = user_id);

-- news_editions
alter policy "Users can delete own editions" on public.news_editions using ((select auth.uid()) = user_id);
alter policy "Users can insert own editions" on public.news_editions with check ((select auth.uid()) = user_id);
alter policy "Users can view own editions" on public.news_editions using ((select auth.uid()) = user_id);

-- news_feedback
alter policy "news_feedback own rows" on public.news_feedback using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- next_step_completions
alter policy "Users can insert own next step completions" on public.next_step_completions with check ((select auth.uid()) = user_id);
alter policy "Users can view own next step completions" on public.next_step_completions using ((select auth.uid()) = user_id);
alter policy "Users can update own next step completions" on public.next_step_completions using ((select auth.uid()) = user_id);

-- report_configs
alter policy "Users manage own report configs" on public.report_configs using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- settlement_entries
alter policy "Users can insert settlement entries for their household" on public.settlement_entries with check ((household_id in ( select profiles.household_id from profiles where (profiles.id = (select auth.uid())))) and ((from_user_id = (select auth.uid())) or (to_user_id = (select auth.uid()))));
alter policy "Users can view settlement entries for their household" on public.settlement_entries using (household_id in ( select profiles.household_id from profiles where (profiles.id = (select auth.uid()))));
alter policy "Users can update settlement entries for their household" on public.settlement_entries using (household_id in ( select profiles.household_id from profiles where (profiles.id = (select auth.uid()))));

-- target_allocations
alter policy "Users can delete own target allocations" on public.target_allocations using ((select auth.uid()) = user_id);
alter policy "Users can insert own target allocations" on public.target_allocations with check ((select auth.uid()) = user_id);
alter policy "Users can view own target allocations" on public.target_allocations using ((select auth.uid()) = user_id);
alter policy "Users can update own target allocations" on public.target_allocations using ((select auth.uid()) = user_id);

-- user_feature_visits
alter policy "Users can insert own feature visits" on public.user_feature_visits with check ((select auth.uid()) = user_id);
alter policy "Users can view own feature visits" on public.user_feature_visits using ((select auth.uid()) = user_id);
alter policy "Users can update own feature visits" on public.user_feature_visits using ((select auth.uid()) = user_id);

-- user_own_ibans
alter policy "own" on public.user_own_ibans using ((select auth.uid()) = user_id);

-- wallet_addresses
alter policy "wallet_addresses_delete_own" on public.wallet_addresses using ((select auth.uid()) = user_id);
alter policy "wallet_addresses_insert_own" on public.wallet_addresses with check ((select auth.uid()) = user_id);
alter policy "wallet_addresses_select_own" on public.wallet_addresses using ((select auth.uid()) = user_id);
alter policy "wallet_addresses_update_own" on public.wallet_addresses using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTIE B — consolidatie + initplan-rewrite per tabel (DROP/CREATE/ALTER)
-- ═══════════════════════════════════════════════════════════════════════════

-- ai_usage: eigen SELECT + superadmin SELECT samenvoegen; insert wrappen
alter policy "ai_usage own insert" on public.ai_usage with check (user_id = (select auth.uid()));
drop policy if exists "ai_usage own select" on public.ai_usage;
drop policy if exists "ai_usage superadmin select" on public.ai_usage;
create policy "ai_usage select own or superadmin" on public.ai_usage for select to authenticated
  using ((user_id = (select auth.uid())) or (exists ( select 1 from profiles p where ((p.id = (select auth.uid())) and (p.role = 'superadmin'::text)))));

-- app_settings: ALLEEN initplan-rewrite (superadmin-policies); consolidatie = uitzondering
alter policy "Superadmins can read app_settings" on public.app_settings using (exists ( select 1 from profiles where ((profiles.id = (select auth.uid())) and (profiles.role = 'superadmin'::text))));
alter policy "Superadmins can insert app_settings" on public.app_settings with check (exists ( select 1 from profiles where ((profiles.id = (select auth.uid())) and (profiles.role = 'superadmin'::text))));
alter policy "Superadmins can update app_settings" on public.app_settings using (exists ( select 1 from profiles where ((profiles.id = (select auth.uid())) and (profiles.role = 'superadmin'::text)))) with check (exists ( select 1 from profiles where ((profiles.id = (select auth.uid())) and (profiles.role = 'superadmin'::text))));

-- assets: redundante FOR ALL droppen; owner+household SELECT samenvoegen
drop policy if exists "Users can manage own assets" on public.assets;
drop policy if exists "Users can view own assets" on public.assets;
drop policy if exists "Household members can view shared assets" on public.assets;
create policy "Users can view own or shared assets" on public.assets for select to public
  using (((select auth.uid()) = user_id) or ((ownership = 'shared'::text) and (household_id is not null) and (household_id = user_household_id())));

-- bank_accounts: twee FOR ALL + household SELECT -> per-commando; SELECT owner+household
drop policy if exists "Users can manage own bank_accounts" on public.bank_accounts;
drop policy if exists "Users manage own accounts" on public.bank_accounts;
drop policy if exists "Household members can view shared bank_accounts" on public.bank_accounts;
create policy "Users insert own bank_accounts" on public.bank_accounts for insert to public with check ((select auth.uid()) = user_id);
create policy "Users update own bank_accounts" on public.bank_accounts for update to public using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own bank_accounts" on public.bank_accounts for delete to public using ((select auth.uid()) = user_id);
create policy "Users view own or shared bank_accounts" on public.bank_accounts for select to public
  using (((select auth.uid()) = user_id) or ((ownership = 'shared'::text) and (household_id is not null) and (household_id = user_household_id())));

-- budget_amounts: eigen + gedeeld (twee FOR ALL) samenvoegen
drop policy if exists "Household members manage shared budget amounts" on public.budget_amounts;
drop policy if exists "Users manage own budget amounts" on public.budget_amounts;
create policy "Manage own or shared budget amounts" on public.budget_amounts for all to public
  using ((budget_id in ( select budgets.id from budgets where (budgets.user_id = (select auth.uid())))) or (budget_id in ( select budgets.id from budgets where ((budgets.ownership = 'shared'::text) and (budgets.household_id = user_household_id())))))
  with check ((budget_id in ( select budgets.id from budgets where (budgets.user_id = (select auth.uid())))) or (budget_id in ( select budgets.id from budgets where ((budgets.ownership = 'shared'::text) and (budgets.household_id = user_household_id())))));

-- budget_rollovers: owner+household SELECT samenvoegen (rest al gewrapt)
drop policy if exists "Users can view own budget rollovers" on public.budget_rollovers;
drop policy if exists "Household members view shared budget rollovers" on public.budget_rollovers;
create policy "View own or shared budget rollovers" on public.budget_rollovers for select to public
  using (((select auth.uid()) = user_id) or (budget_id in ( select budgets.id from budgets where ((budgets.ownership = 'shared'::text) and (budgets.household_id = user_household_id())))));

-- budgets: twee FOR ALL + household SELECT + household UPDATE -> per-commando
drop policy if exists "Users can manage own budgets" on public.budgets;
drop policy if exists "Users manage own budgets" on public.budgets;
drop policy if exists "Household members can view shared budgets" on public.budgets;
drop policy if exists "Household members can update shared budgets" on public.budgets;
create policy "Users insert own budgets" on public.budgets for insert to public with check ((select auth.uid()) = user_id);
create policy "Users delete own budgets" on public.budgets for delete to public using ((select auth.uid()) = user_id);
create policy "View own or shared budgets" on public.budgets for select to public
  using (((select auth.uid()) = user_id) or ((ownership = 'shared'::text) and (household_id is not null) and (household_id = user_household_id())));
create policy "Update own or shared budgets" on public.budgets for update to public
  using (((select auth.uid()) = user_id) or ((ownership = 'shared'::text) and (household_id is not null) and (household_id = user_household_id())))
  with check (((select auth.uid()) = user_id) or ((ownership = 'shared'::text) and (household_id = user_household_id())));

-- calculator_likes: redundante SELECT droppen; FOR ALL wrappen
drop policy if exists "calculator_likes own select" on public.calculator_likes;
alter policy "Users manage own likes" on public.calculator_likes using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- custom_calculators: FOR ALL + public-readable SELECT -> per-commando
drop policy if exists "Users can manage own calculators" on public.custom_calculators;
drop policy if exists "Public calculators are readable" on public.custom_calculators;
create policy "Users insert own calculators" on public.custom_calculators for insert to public with check ((select auth.uid()) = user_id);
create policy "Users update own calculators" on public.custom_calculators for update to public using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own calculators" on public.custom_calculators for delete to public using ((select auth.uid()) = user_id);
create policy "Public or own calculators readable" on public.custom_calculators for select to public
  using ((is_public = true) or ((select auth.uid()) = user_id));

-- debts: redundante FOR ALL droppen; owner+household SELECT samenvoegen
drop policy if exists "Users can manage own debts" on public.debts;
drop policy if exists "Users can view own debts" on public.debts;
drop policy if exists "Household members can view shared debts" on public.debts;
create policy "View own or shared debts" on public.debts for select to public
  using (((select auth.uid()) = user_id) or ((ownership = 'shared'::text) and (household_id is not null) and (household_id = user_household_id())));

-- goals: redundante FOR ALL droppen; owner+household SELECT samenvoegen
drop policy if exists "Users can manage own goals" on public.goals;
drop policy if exists "Users can view own goals" on public.goals;
drop policy if exists "Household members can view shared goals" on public.goals;
create policy "View own or shared goals" on public.goals for select to public
  using (((select auth.uid()) = user_id) or ((ownership = 'shared'::text) and (household_id is not null) and (household_id = user_household_id())));

-- household_members: ALLEEN initplan-rewrite; UPDATE-overlap = uitzondering
alter policy "Members can leave or owner can remove" on public.household_members using ((user_id = (select auth.uid())) or (household_id = user_owned_household_id()));
alter policy "Can insert household members" on public.household_members with check (((user_id = (select auth.uid())) and (role = 'owner'::text) and user_created_household(household_id)) or ((user_id = (select auth.uid())) and (role = 'member'::text) and has_pending_household_invite(household_id)));
alter policy "Users can update own privacy settings" on public.household_members using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- life_events: redundante FOR ALL droppen; granulaire wrappen; owner+household SELECT samenvoegen
drop policy if exists "Users can manage own life_events" on public.life_events;
alter policy "Users can delete own life events" on public.life_events using ((select auth.uid()) = user_id);
alter policy "Users can insert own life events" on public.life_events with check ((select auth.uid()) = user_id);
alter policy "Users can update own life events" on public.life_events using ((select auth.uid()) = user_id);
drop policy if exists "Users can view own life events" on public.life_events;
drop policy if exists "Household members can view shared life_events" on public.life_events;
create policy "View own or shared life_events" on public.life_events for select to public
  using (((select auth.uid()) = user_id) or ((ownership = 'shared'::text) and (household_id is not null) and (household_id = user_household_id())));

-- net_worth_snapshots: redundante FOR ALL droppen; owner+household SELECT samenvoegen
drop policy if exists "Users can manage own snapshots" on public.net_worth_snapshots;
drop policy if exists "Users can view own net worth snapshots" on public.net_worth_snapshots;
drop policy if exists "Household members can view shared net_worth_snapshots" on public.net_worth_snapshots;
create policy "View own or shared net worth snapshots" on public.net_worth_snapshots for select to public
  using (((select auth.uid()) = user_id) or ((ownership = 'shared'::text) and (household_id is not null) and (household_id = user_household_id())));

-- news_articles: service_role + superadmin samenvoegen tot een FOR ALL
drop policy if exists "service_role_all" on public.news_articles;
drop policy if exists "superadmin_all" on public.news_articles;
create policy "news_articles service or superadmin" on public.news_articles for all to public
  using (((select auth.role()) = 'service_role'::text) or (exists ( select 1 from profiles where ((profiles.id = (select auth.uid())) and (profiles.role = 'superadmin'::text)))));

-- profiles: granulaire (dup van FOR ALL) droppen; FOR ALL wrappen (behoudt DELETE)
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
alter policy "Users can manage own profile" on public.profiles using ((select auth.uid()) = id);

-- questionnaire_questions: service+superadmin samenvoegen; authenticated_read blijft (1 residual)
drop policy if exists "service_role_all_questions" on public.questionnaire_questions;
drop policy if exists "superadmin_all_questions" on public.questionnaire_questions;
create policy "questionnaire_questions admin all" on public.questionnaire_questions for all to public
  using (((select auth.role()) = 'service_role'::text) or (exists ( select 1 from profiles where ((profiles.id = (select auth.uid())) and (profiles.role = 'superadmin'::text)))))
  with check (((select auth.role()) = 'service_role'::text) or (exists ( select 1 from profiles where ((profiles.id = (select auth.uid())) and (profiles.role = 'superadmin'::text)))));

-- questionnaire_responses: service + superadmin + eigen-sessie samenvoegen tot een FOR ALL
drop policy if exists "service_role_all_responses" on public.questionnaire_responses;
drop policy if exists "superadmin_all_responses" on public.questionnaire_responses;
drop policy if exists "users_own_responses" on public.questionnaire_responses;
create policy "questionnaire_responses access" on public.questionnaire_responses for all to public
  using (((select auth.role()) = 'service_role'::text) or (exists ( select 1 from profiles where ((profiles.id = (select auth.uid())) and (profiles.role = 'superadmin'::text)))) or (exists ( select 1 from questionnaire_sessions s where ((s.id = questionnaire_responses.session_id) and (s.user_id = (select auth.uid()))))))
  with check (((select auth.role()) = 'service_role'::text) or (exists ( select 1 from profiles where ((profiles.id = (select auth.uid())) and (profiles.role = 'superadmin'::text)))) or (exists ( select 1 from questionnaire_sessions s where ((s.id = questionnaire_responses.session_id) and (s.user_id = (select auth.uid()))))));

-- questionnaire_sessions: service + superadmin + eigen samenvoegen tot een FOR ALL
drop policy if exists "service_role_all_sessions" on public.questionnaire_sessions;
drop policy if exists "superadmin_all_sessions" on public.questionnaire_sessions;
drop policy if exists "users_own_sessions" on public.questionnaire_sessions;
create policy "questionnaire_sessions access" on public.questionnaire_sessions for all to public
  using (((select auth.role()) = 'service_role'::text) or (exists ( select 1 from profiles where ((profiles.id = (select auth.uid())) and (profiles.role = 'superadmin'::text)))) or ((select auth.uid()) = user_id))
  with check (((select auth.role()) = 'service_role'::text) or (exists ( select 1 from profiles where ((profiles.id = (select auth.uid())) and (profiles.role = 'superadmin'::text)))) or ((select auth.uid()) = user_id));

-- questionnaires: service+superadmin samenvoegen; authenticated_read_active blijft (1 residual)
drop policy if exists "service_role_all_questionnaires" on public.questionnaires;
drop policy if exists "superadmin_all_questionnaires" on public.questionnaires;
create policy "questionnaires admin all" on public.questionnaires for all to public
  using (((select auth.role()) = 'service_role'::text) or (exists ( select 1 from profiles where ((profiles.id = (select auth.uid())) and (profiles.role = 'superadmin'::text)))))
  with check (((select auth.role()) = 'service_role'::text) or (exists ( select 1 from profiles where ((profiles.id = (select auth.uid())) and (profiles.role = 'superadmin'::text)))));

-- recurring_transactions: redundante FOR ALL droppen; owner+household SELECT samenvoegen
drop policy if exists "Users can manage own recurring_transactions" on public.recurring_transactions;
drop policy if exists "Users can view own recurring transactions" on public.recurring_transactions;
drop policy if exists "Household members can view shared recurring_transactions" on public.recurring_transactions;
create policy "View own or shared recurring transactions" on public.recurring_transactions for select to public
  using (((select auth.uid()) = user_id) or ((ownership = 'shared'::text) and (household_id is not null) and (household_id = user_household_id())));

-- transaction_splits: granulaire wrappen; owner+household SELECT samenvoegen
alter policy "Users can delete own splits" on public.transaction_splits using (transaction_id in ( select transactions.id from transactions where (transactions.user_id = (select auth.uid()))));
alter policy "Users can insert own splits" on public.transaction_splits with check (transaction_id in ( select transactions.id from transactions where (transactions.user_id = (select auth.uid()))));
alter policy "Users can update own splits" on public.transaction_splits using (transaction_id in ( select transactions.id from transactions where (transactions.user_id = (select auth.uid()))));
drop policy if exists "Users can view own splits" on public.transaction_splits;
drop policy if exists "Household members view shared transaction splits" on public.transaction_splits;
create policy "View own or shared transaction splits" on public.transaction_splits for select to public
  using ((transaction_id in ( select transactions.id from transactions where (transactions.user_id = (select auth.uid())))) or (transaction_id in ( select transactions.id from transactions where ((transactions.ownership = 'shared'::text) and (transactions.household_id = user_household_id())))));

-- transactions: twee FOR ALL + household SELECT -> per-commando; SELECT owner+household
drop policy if exists "Users can manage own transactions" on public.transactions;
drop policy if exists "Users manage own transactions" on public.transactions;
drop policy if exists "Household members can view shared transactions" on public.transactions;
create policy "Users insert own transactions" on public.transactions for insert to public with check ((select auth.uid()) = user_id);
create policy "Users update own transactions" on public.transactions for update to public using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own transactions" on public.transactions for delete to public using ((select auth.uid()) = user_id);
create policy "View own or shared transactions" on public.transactions for select to public
  using (((select auth.uid()) = user_id) or ((ownership = 'shared'::text) and (household_id is not null) and (household_id = user_household_id())));

-- valuations: redundante FOR ALL droppen; granulaire wrappen; owner+household SELECT samenvoegen
drop policy if exists "Users can manage own valuations" on public.valuations;
alter policy "Users can delete own valuations" on public.valuations using ((select auth.uid()) = user_id);
alter policy "Users can insert own valuations" on public.valuations with check ((select auth.uid()) = user_id);
alter policy "Users can update own valuations" on public.valuations using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can view own valuations" on public.valuations;
drop policy if exists "Household members can view shared valuations" on public.valuations;
create policy "View own or shared valuations" on public.valuations for select to public
  using (((select auth.uid()) = user_id) or ((ownership = 'shared'::text) and (household_id is not null) and (household_id = user_household_id())));
