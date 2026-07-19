-- Performance-sanering fase 1 — Migratie 1: foreign-key-indexen + duplicaat-indexen opruimen
--
-- WAAROM: Supabase performance-advisor meldde 43× unindexed_foreign_keys en 11× duplicate_index.
-- Elke /overzicht-SSR doet ~90-105 queries; ontbrekende FK-indexen dwingen sequential scans bij
-- joins/`on delete cascade`-checks en dubbele indexen kosten schrijf- en onderhoudstijd zonder baat.
-- Deze migratie voegt ontbrekende FK-indexen toe (IF NOT EXISTS, idempotent) en dropt exact één
-- van elk duplicaat-paar. Alleen indexen — géén data-mutaties, geen policy-wijzigingen.
--
-- Duplicaat-keuze: bij elk paar behouden we de duidelijkst benoemde/constraint-gedragen index en
-- droppen de kopie. budget_amounts_budget_id_effective_from_key IS constraint-gedragen (UNIQUE
-- constraint) → behouden; budget_amounts_unique is een losse dubbele UNIQUE-index → droppen.

-- ── 43 ontbrekende foreign-key-indexen ───────────────────────────────────────
create index if not exists idx_legacy_holding_transactions_holding_id on public._legacy_holding_transactions (holding_id);
create index if not exists idx_legacy_holding_transactions_user_id on public._legacy_holding_transactions (user_id);
create index if not exists idx_legacy_holdings_asset_id on public._legacy_holdings (asset_id);
create index if not exists idx_legacy_holdings_user_id on public._legacy_holdings (user_id);
create index if not exists idx_app_settings_updated_by on public.app_settings (updated_by);
create index if not exists idx_assets_linked_asset_id on public.assets (linked_asset_id);
create index if not exists idx_assets_linked_bank_account_id on public.assets (linked_bank_account_id);
create index if not exists idx_bank_connection_accounts_bank_account_id on public.bank_connection_accounts (bank_account_id);
create index if not exists idx_bank_connection_accounts_connection_id on public.bank_connection_accounts (connection_id);
create index if not exists idx_bank_connections_user_id on public.bank_connections (user_id);
create index if not exists idx_bank_sync_log_connection_account_id on public.bank_sync_log (connection_account_id);
create index if not exists idx_bank_sync_log_user_id on public.bank_sync_log (user_id);
create index if not exists idx_calculator_reports_calculator_id on public.calculator_reports (calculator_id);
create index if not exists idx_calculator_reports_reporter_id on public.calculator_reports (reporter_id);
create index if not exists idx_category_corrections_budget_id on public.category_corrections (budget_id);
create index if not exists idx_crypto_transactions_user_id on public.crypto_transactions (user_id);
create index if not exists idx_debts_linked_asset_id on public.debts (linked_asset_id);
create index if not exists idx_goal_contributions_user_id on public.goal_contributions (user_id);
create index if not exists idx_goals_budget_id on public.goals (budget_id);
create index if not exists idx_goals_household_id on public.goals (household_id);
create index if not exists idx_household_invitations_household_id on public.household_invitations (household_id);
create index if not exists idx_household_invitations_invited_by on public.household_invitations (invited_by);
create index if not exists idx_households_created_by on public.households (created_by);
create index if not exists idx_households_primary_payer_id on public.households (primary_payer_id);
create index if not exists idx_investment_transactions_user_id on public.investment_transactions (user_id);
create index if not exists idx_lead_intakes_converted_user_id on public.lead_intakes (converted_user_id);
create index if not exists idx_life_events_linked_asset_id on public.life_events (linked_asset_id);
create index if not exists idx_questionnaire_responses_question_id on public.questionnaire_responses (question_id);
create index if not exists idx_questionnaire_sessions_questionnaire_id on public.questionnaire_sessions (questionnaire_id);
create index if not exists idx_recommendation_feedback_recommendation_id on public.recommendation_feedback (recommendation_id);
create index if not exists idx_recommendations_related_asset_id on public.recommendations (related_asset_id);
create index if not exists idx_recommendations_related_debt_id on public.recommendations (related_debt_id);
create index if not exists idx_report_configs_user_id on public.report_configs (user_id);
create index if not exists idx_settlement_entries_from_user_id on public.settlement_entries (from_user_id);
create index if not exists idx_settlement_entries_household_id on public.settlement_entries (household_id);
create index if not exists idx_settlement_entries_related_transaction_id on public.settlement_entries (related_transaction_id);
create index if not exists idx_settlement_entries_to_user_id on public.settlement_entries (to_user_id);
create index if not exists idx_signup_email_allowlist_created_by on public.signup_email_allowlist (created_by);
create index if not exists idx_tier_assignments_log_assigned_by on public.tier_assignments_log (assigned_by);
create index if not exists idx_tier_assignments_log_target_user on public.tier_assignments_log (target_user);
create index if not exists idx_transactions_linked_transfer_id on public.transactions (linked_transfer_id);
create index if not exists idx_uat_results_tester on public.uat_results (tester);
create index if not exists idx_uat_rounds_created_by on public.uat_rounds (created_by);

-- ── 11 duplicaat-indexen droppen (exacte kopie behouden: één per paar) ────────
drop index if exists public.bank_accounts_user_id_idx;              -- kopie van idx_bank_accounts_user_id
drop index if exists public.budget_amounts_unique;                  -- losse dubbele UNIQUE; constraint-index budget_amounts_budget_id_effective_from_key blijft
drop index if exists public.budgets_parent_id_idx;                  -- kopie van idx_budgets_parent_id
drop index if exists public.budgets_user_id_idx;                    -- kopie van idx_budgets_user_id
drop index if exists public.idx_snapshots_date;                     -- kopie van idx_net_worth_snapshots_date
drop index if exists public.idx_snapshots_user_id;                  -- kopie van idx_net_worth_snapshots_user_id
drop index if exists public.idx_recurring_user_id;                  -- kopie van idx_recurring_transactions_user_id
drop index if exists public.transactions_budget_id_idx;             -- kopie van idx_transactions_budget_id
drop index if exists public.transactions_date_idx;                  -- kopie van idx_transactions_date
drop index if exists public.transactions_user_id_idx;               -- kopie van idx_transactions_user_id
drop index if exists public.idx_valuations_user;                    -- kopie van idx_valuations_user_id
