import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Migration SQL statements - each must be executed individually
// Ordered chronologically by migration file date
const MIGRATION_STATEMENTS = [
  // NOTE: badges, user_badges, user_streaks tables have been dropped
  // (gamification system removed — see migration 20260316600001)

  // ── 20260215: Original tables ──────────────────────────────────────

  // 1. user_feature_visits table
  `CREATE TABLE IF NOT EXISTS user_feature_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feature_slug TEXT NOT NULL,
    first_visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    visit_count INT NOT NULL DEFAULT 1,
    UNIQUE(user_id, feature_slug)
  )`,
  `ALTER TABLE user_feature_visits ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_feature_visits' AND policyname='Users can view own feature visits') THEN CREATE POLICY "Users can view own feature visits" ON user_feature_visits FOR SELECT TO authenticated USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_feature_visits' AND policyname='Users can insert own feature visits') THEN CREATE POLICY "Users can insert own feature visits" ON user_feature_visits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_feature_visits' AND policyname='Users can update own feature visits') THEN CREATE POLICY "Users can update own feature visits" ON user_feature_visits FOR UPDATE TO authenticated USING (auth.uid() = user_id); END IF; END $$`,

  // 2. holdings table
  `CREATE TABLE IF NOT EXISTS holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    ticker TEXT, isin TEXT,
    name TEXT NOT NULL,
    units NUMERIC NOT NULL DEFAULT 0,
    avg_purchase_price NUMERIC NOT NULL DEFAULT 0,
    current_price NUMERIC,
    last_price_update TIMESTAMPTZ,
    purchase_date DATE,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE holdings ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holdings' AND policyname='Users can view own holdings') THEN CREATE POLICY "Users can view own holdings" ON holdings FOR SELECT TO authenticated USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holdings' AND policyname='Users can insert own holdings') THEN CREATE POLICY "Users can insert own holdings" ON holdings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holdings' AND policyname='Users can update own holdings') THEN CREATE POLICY "Users can update own holdings" ON holdings FOR UPDATE TO authenticated USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holdings' AND policyname='Users can delete own holdings') THEN CREATE POLICY "Users can delete own holdings" ON holdings FOR DELETE TO authenticated USING (auth.uid() = user_id); END IF; END $$`,

  // 3. holding_transactions table
  `CREATE TABLE IF NOT EXISTS holding_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holding_id UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend')),
    units NUMERIC NOT NULL,
    price_per_unit NUMERIC NOT NULL,
    total_amount NUMERIC NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE holding_transactions ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holding_transactions' AND policyname='Users can view own holding transactions') THEN CREATE POLICY "Users can view own holding transactions" ON holding_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holding_transactions' AND policyname='Users can insert own holding transactions') THEN CREATE POLICY "Users can insert own holding transactions" ON holding_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holding_transactions' AND policyname='Users can update own holding transactions') THEN CREATE POLICY "Users can update own holding transactions" ON holding_transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holding_transactions' AND policyname='Users can delete own holding transactions') THEN CREATE POLICY "Users can delete own holding transactions" ON holding_transactions FOR DELETE TO authenticated USING (auth.uid() = user_id); END IF; END $$`,

  // 4. next_step_completions table
  `CREATE TABLE IF NOT EXISTS next_step_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    step_key TEXT NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dismissed BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(user_id, step_key)
  )`,
  `ALTER TABLE next_step_completions ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='next_step_completions' AND policyname='Users can view own next step completions') THEN CREATE POLICY "Users can view own next step completions" ON next_step_completions FOR SELECT TO authenticated USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='next_step_completions' AND policyname='Users can insert own next step completions') THEN CREATE POLICY "Users can insert own next step completions" ON next_step_completions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='next_step_completions' AND policyname='Users can update own next step completions') THEN CREATE POLICY "Users can update own next step completions" ON next_step_completions FOR UPDATE TO authenticated USING (auth.uid() = user_id); END IF; END $$`,

  // 5. net_worth_snapshots columns
  `ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS freedom_percentage NUMERIC`,
  `ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS fire_age NUMERIC`,
  `ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS sovereignty_level INT`,
  `ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS savings_rate NUMERIC`,
  `ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS resilience_score INT`,

  // ── 20260316100001: Holdings classification + target_allocations ────

  `ALTER TABLE holdings ADD COLUMN IF NOT EXISTS asset_class TEXT`,
  `ALTER TABLE holdings ADD COLUMN IF NOT EXISTS sector TEXT`,
  `ALTER TABLE holdings ADD COLUMN IF NOT EXISTS geography TEXT`,
  `ALTER TABLE holdings ADD COLUMN IF NOT EXISTS previous_close NUMERIC`,
  `ALTER TABLE holdings ADD COLUMN IF NOT EXISTS daily_change_percent NUMERIC`,

  `CREATE TABLE IF NOT EXISTS target_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    view_mode TEXT NOT NULL CHECK (view_mode IN ('asset_class', 'sector', 'geography')),
    category TEXT NOT NULL,
    target_pct NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, view_mode, category)
  )`,
  `ALTER TABLE target_allocations ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='target_allocations' AND policyname='Users can view own target allocations') THEN CREATE POLICY "Users can view own target allocations" ON target_allocations FOR SELECT TO authenticated USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='target_allocations' AND policyname='Users can insert own target allocations') THEN CREATE POLICY "Users can insert own target allocations" ON target_allocations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='target_allocations' AND policyname='Users can update own target allocations') THEN CREATE POLICY "Users can update own target allocations" ON target_allocations FOR UPDATE TO authenticated USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='target_allocations' AND policyname='Users can delete own target allocations') THEN CREATE POLICY "Users can delete own target allocations" ON target_allocations FOR DELETE TO authenticated USING (auth.uid() = user_id); END IF; END $$`,

  // ── 20260316100002: Holdings is_favorite ────────────────────────────
  `ALTER TABLE holdings ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false`,

  // ── 20260316200001: Holdings currency ───────────────────────────────
  `ALTER TABLE holdings ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR'`,

  // ── 20260316300001: Holding prices table ────────────────────────────
  `CREATE TABLE IF NOT EXISTS holding_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holding_id UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    close_price NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    source TEXT DEFAULT 'yahoo_finance',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(holding_id, date)
  )`,
  `ALTER TABLE holding_prices ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holding_prices' AND policyname='Users can view own holding prices') THEN CREATE POLICY "Users can view own holding prices" ON holding_prices FOR SELECT TO authenticated USING (holding_id IN (SELECT id FROM holdings WHERE user_id = auth.uid())); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holding_prices' AND policyname='Users can insert own holding prices') THEN CREATE POLICY "Users can insert own holding prices" ON holding_prices FOR INSERT TO authenticated WITH CHECK (holding_id IN (SELECT id FROM holdings WHERE user_id = auth.uid())); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holding_prices' AND policyname='Users can delete own holding prices') THEN CREATE POLICY "Users can delete own holding prices" ON holding_prices FOR DELETE TO authenticated USING (holding_id IN (SELECT id FROM holdings WHERE user_id = auth.uid())); END IF; END $$`,
  `CREATE INDEX IF NOT EXISTS idx_holding_prices_holding_date ON holding_prices(holding_id, date DESC)`,

  // ── 20260316400001: Holding transaction split type ──────────────────
  `ALTER TABLE holding_transactions DROP CONSTRAINT IF EXISTS holding_transactions_type_check`,
  `ALTER TABLE holding_transactions ADD CONSTRAINT holding_transactions_type_check CHECK (type IN ('buy', 'sell', 'dividend', 'split'))`,

  // ── 20260316400002: Holding alerts table ────────────────────────────
  `CREATE TABLE IF NOT EXISTS holding_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    holding_id UUID REFERENCES holdings(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('price_above', 'price_below', 'return_threshold', 'rebalance_drift')),
    threshold NUMERIC NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE holding_alerts ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holding_alerts' AND policyname='Users can view own alerts') THEN CREATE POLICY "Users can view own alerts" ON holding_alerts FOR SELECT USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holding_alerts' AND policyname='Users can insert own alerts') THEN CREATE POLICY "Users can insert own alerts" ON holding_alerts FOR INSERT WITH CHECK (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holding_alerts' AND policyname='Users can update own alerts') THEN CREATE POLICY "Users can update own alerts" ON holding_alerts FOR UPDATE USING (auth.uid() = user_id); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holding_alerts' AND policyname='Users can delete own alerts') THEN CREATE POLICY "Users can delete own alerts" ON holding_alerts FOR DELETE USING (auth.uid() = user_id); END IF; END $$`,
  `CREATE INDEX IF NOT EXISTS idx_holding_alerts_user_active ON holding_alerts(user_id, is_active) WHERE is_active = true`,
  `CREATE INDEX IF NOT EXISTS idx_holding_alerts_holding ON holding_alerts(holding_id) WHERE is_active = true`,

  // ── 20260316500001: Pension documents bucket ────────────────────────
  `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('pension-documents', 'pension-documents', false, 10485760, ARRAY['application/pdf']) ON CONFLICT (id) DO NOTHING`,

  // ── 20260316600001: Drop gamification tables ────────────────────────
  `DROP TABLE IF EXISTS user_streaks CASCADE`,
  `DROP TABLE IF EXISTS user_badges CASCADE`,
  `DROP TABLE IF EXISTS badges CASCADE`,

  // ── 20260319000001: Budgets unique index (user_id, slug, parent_id) ─
  `DROP INDEX IF EXISTS idx_budgets_user_slug`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_user_slug_parent ON budgets (user_id, slug, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid))`,

  // ── 20260319000002: Save onboarding RPC + idempotency key column ────
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_idempotency_key TEXT`,
  `CREATE OR REPLACE FUNCTION save_onboarding_data(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_idempotency_key TEXT;
  v_profile JSONB;
  v_budget_amounts JSONB;
  v_budgettering_mode TEXT;
  v_parent_rows JSONB;
  v_child_rows JSONB;
  v_bank_accounts JSONB;
  v_assets JSONB;
  v_debts JSONB;
  v_widget_prefs JSONB;
  v_aow_target_age INT;
  v_aow_monthly NUMERIC;
  v_parent_rec RECORD;
  v_child_rec RECORD;
  v_parent_id UUID;
  v_bank_rec RECORD;
  v_asset_rec RECORD;
  v_debt_rec RECORD;
  v_bank_id UUID;
  v_existing_completed BOOLEAN;
  v_existing_key TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized', 'status', 401);
  END IF;

  v_idempotency_key := payload->>'idempotency_key';
  v_profile := payload->'profile';
  v_budget_amounts := COALESCE(payload->'budget_amounts', '{}'::jsonb);
  v_budgettering_mode := COALESCE(payload->>'budgettering_mode', 'manual');
  v_parent_rows := COALESCE(payload->'parent_budgets', '[]'::jsonb);
  v_child_rows := COALESCE(payload->'child_budgets', '[]'::jsonb);
  v_bank_accounts := COALESCE(payload->'bank_accounts', '[]'::jsonb);
  v_assets := COALESCE(payload->'assets', '[]'::jsonb);
  v_debts := COALESCE(payload->'debts', '[]'::jsonb);
  v_widget_prefs := payload->'widget_prefs';
  v_aow_target_age := COALESCE((payload->>'aow_target_age')::int, 67);
  v_aow_monthly := COALESCE((payload->>'aow_monthly')::numeric, 1341);

  SELECT onboarding_completed, onboarding_idempotency_key
    INTO v_existing_completed, v_existing_key
    FROM profiles WHERE id = v_user_id;

  IF v_existing_completed = true THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;
  IF v_idempotency_key IS NOT NULL AND v_existing_key = v_idempotency_key THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  INSERT INTO profiles (
    id, full_name, date_of_birth, household_type, number_of_children,
    net_monthly_income, estimated_monthly_expenses,
    expected_return, inflation_rate,
    retirement_expense_method, retirement_expense_custom_amount,
    fire_end_strategy, fire_legacy_amount, fire_end_age,
    temporal_balance, widget_prefs,
    onboarding_completed, is_demo_user, budgeting_active,
    onboarding_idempotency_key, updated_at
  ) VALUES (
    v_user_id,
    v_profile->>'full_name', (v_profile->>'date_of_birth')::date,
    v_profile->>'household_type',
    COALESCE((v_profile->>'number_of_children')::int, 0),
    (v_profile->>'net_monthly_income')::numeric,
    (v_profile->>'estimated_monthly_expenses')::numeric,
    (v_profile->>'expected_return')::numeric,
    (v_profile->>'inflation_rate')::numeric,
    v_profile->>'retirement_expense_method',
    (v_profile->>'retirement_expense_custom_amount')::numeric,
    v_profile->>'fire_end_strategy',
    (v_profile->>'fire_legacy_amount')::numeric,
    (v_profile->>'fire_end_age')::int,
    (v_profile->>'temporal_balance')::int,
    v_widget_prefs, false, false,
    v_budgettering_mode <> 'none',
    v_idempotency_key, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    date_of_birth = EXCLUDED.date_of_birth,
    household_type = EXCLUDED.household_type,
    number_of_children = EXCLUDED.number_of_children,
    net_monthly_income = EXCLUDED.net_monthly_income,
    estimated_monthly_expenses = EXCLUDED.estimated_monthly_expenses,
    expected_return = COALESCE(EXCLUDED.expected_return, profiles.expected_return),
    inflation_rate = COALESCE(EXCLUDED.inflation_rate, profiles.inflation_rate),
    retirement_expense_method = COALESCE(EXCLUDED.retirement_expense_method, profiles.retirement_expense_method),
    retirement_expense_custom_amount = COALESCE(EXCLUDED.retirement_expense_custom_amount, profiles.retirement_expense_custom_amount),
    fire_end_strategy = COALESCE(EXCLUDED.fire_end_strategy, profiles.fire_end_strategy),
    fire_legacy_amount = COALESCE(EXCLUDED.fire_legacy_amount, profiles.fire_legacy_amount),
    fire_end_age = COALESCE(EXCLUDED.fire_end_age, profiles.fire_end_age),
    temporal_balance = COALESCE(EXCLUDED.temporal_balance, profiles.temporal_balance),
    widget_prefs = COALESCE(EXCLUDED.widget_prefs, profiles.widget_prefs),
    onboarding_completed = false, is_demo_user = false,
    budgeting_active = EXCLUDED.budgeting_active,
    onboarding_idempotency_key = EXCLUDED.onboarding_idempotency_key,
    updated_at = now();

  DELETE FROM budgets WHERE user_id = v_user_id;

  FOR v_parent_rec IN SELECT * FROM jsonb_array_elements(v_parent_rows)
  LOOP
    INSERT INTO budgets (
      user_id, parent_id, name, slug, icon, description,
      default_limit, budget_type, interval, rollover_type,
      limit_type, alert_threshold, max_single_transaction_amount,
      is_essential, priority_score, is_inflation_indexed, sort_order
    ) VALUES (
      v_user_id, NULL,
      v_parent_rec.value->>'name', v_parent_rec.value->>'slug',
      v_parent_rec.value->>'icon', v_parent_rec.value->>'description',
      (v_parent_rec.value->>'default_limit')::numeric,
      v_parent_rec.value->>'budget_type',
      COALESCE(v_parent_rec.value->>'interval', 'monthly'),
      COALESCE(v_parent_rec.value->>'rollover_type', 'reset'),
      COALESCE(v_parent_rec.value->>'limit_type', 'soft'),
      COALESCE((v_parent_rec.value->>'alert_threshold')::int, 80),
      (v_parent_rec.value->>'max_single_transaction_amount')::numeric,
      COALESCE((v_parent_rec.value->>'is_essential')::boolean, false),
      COALESCE((v_parent_rec.value->>'priority_score')::int, 0),
      false, COALESCE((v_parent_rec.value->>'sort_order')::int, 0)
    );
  END LOOP;

  FOR v_child_rec IN SELECT * FROM jsonb_array_elements(v_child_rows)
  LOOP
    SELECT id INTO v_parent_id FROM budgets
     WHERE user_id = v_user_id AND slug = v_child_rec.value->>'parent_slug' AND parent_id IS NULL LIMIT 1;
    IF v_parent_id IS NOT NULL THEN
      INSERT INTO budgets (
        user_id, parent_id, name, slug, icon, description,
        default_limit, budget_type, interval, rollover_type,
        limit_type, alert_threshold, max_single_transaction_amount,
        is_essential, priority_score, is_inflation_indexed, sort_order
      ) VALUES (
        v_user_id, v_parent_id,
        v_child_rec.value->>'name', v_child_rec.value->>'slug',
        v_child_rec.value->>'icon', v_child_rec.value->>'description',
        (v_child_rec.value->>'default_limit')::numeric,
        v_child_rec.value->>'budget_type',
        COALESCE(v_child_rec.value->>'interval', 'monthly'),
        COALESCE(v_child_rec.value->>'rollover_type', 'reset'),
        COALESCE(v_child_rec.value->>'limit_type', 'soft'),
        COALESCE((v_child_rec.value->>'alert_threshold')::int, 80),
        (v_child_rec.value->>'max_single_transaction_amount')::numeric,
        COALESCE((v_child_rec.value->>'is_essential')::boolean, false),
        COALESCE((v_child_rec.value->>'priority_score')::int, 0),
        false, COALESCE((v_child_rec.value->>'sort_order')::int, 0)
      );
    END IF;
  END LOOP;

  DELETE FROM bank_accounts WHERE user_id = v_user_id AND iban = '';
  DELETE FROM assets WHERE user_id = v_user_id AND asset_type = 'cash';

  FOR v_bank_rec IN SELECT * FROM jsonb_array_elements(v_bank_accounts)
  LOOP
    INSERT INTO bank_accounts (
      user_id, name, bank_name, account_type, balance, iban, is_active, sort_order
    ) VALUES (
      v_user_id, v_bank_rec.value->>'name', v_bank_rec.value->>'bank_name',
      v_bank_rec.value->>'account_type', (v_bank_rec.value->>'balance')::numeric,
      '', true, COALESCE((v_bank_rec.value->>'sort_order')::int, 0)
    ) RETURNING id INTO v_bank_id;

    INSERT INTO assets (
      user_id, name, asset_type, current_value, purchase_value,
      purchase_date, expected_return, monthly_contribution,
      is_active, sort_order, linked_bank_account_id
    ) VALUES (
      v_user_id, v_bank_rec.value->>'name', 'cash',
      (v_bank_rec.value->>'balance')::numeric, (v_bank_rec.value->>'balance')::numeric,
      CURRENT_DATE, 0, 0, true,
      COALESCE((v_bank_rec.value->>'sort_order')::int, 0), v_bank_id
    );
  END LOOP;

  IF jsonb_array_length(v_assets) > 0 THEN
    DELETE FROM assets WHERE user_id = v_user_id AND asset_type <> 'cash';
    FOR v_asset_rec IN SELECT * FROM jsonb_array_elements(v_assets)
    LOOP
      INSERT INTO assets (
        user_id, name, asset_type, current_value, purchase_value,
        purchase_date, expected_return, monthly_contribution,
        institution, is_active, sort_order,
        subtype, risk_profile, tax_benefit, is_liquid,
        lock_end_date, ticker_symbol, rental_income, woz_value,
        retirement_provider_type, depreciation_rate,
        address_postcode, address_house_number
      ) VALUES (
        v_user_id, v_asset_rec.value->>'name', v_asset_rec.value->>'asset_type',
        (v_asset_rec.value->>'current_value')::numeric,
        COALESCE((v_asset_rec.value->>'purchase_value')::numeric, (v_asset_rec.value->>'current_value')::numeric),
        CURRENT_DATE,
        COALESCE((v_asset_rec.value->>'expected_return')::numeric, 0),
        COALESCE((v_asset_rec.value->>'monthly_contribution')::numeric, 0),
        v_asset_rec.value->>'institution', true,
        COALESCE((v_asset_rec.value->>'sort_order')::int, 0),
        v_asset_rec.value->>'subtype', v_asset_rec.value->>'risk_profile',
        (v_asset_rec.value->>'tax_benefit')::boolean,
        (v_asset_rec.value->>'is_liquid')::boolean,
        (v_asset_rec.value->>'lock_end_date')::date,
        v_asset_rec.value->>'ticker_symbol',
        (v_asset_rec.value->>'rental_income')::numeric,
        (v_asset_rec.value->>'woz_value')::numeric,
        v_asset_rec.value->>'retirement_provider_type',
        (v_asset_rec.value->>'depreciation_rate')::numeric,
        v_asset_rec.value->>'address_postcode',
        v_asset_rec.value->>'address_house_number'
      );
    END LOOP;
  END IF;

  IF jsonb_array_length(v_debts) > 0 THEN
    DELETE FROM debts WHERE user_id = v_user_id;
    FOR v_debt_rec IN SELECT * FROM jsonb_array_elements(v_debts)
    LOOP
      INSERT INTO debts (
        user_id, name, debt_type, original_amount, current_balance,
        interest_rate, minimum_payment, monthly_payment,
        start_date, creditor, is_active, sort_order,
        subtype, repayment_type, is_tax_deductible,
        fixed_rate_end_date, nhg, credit_limit, draagkrachtmeting_date
      ) VALUES (
        v_user_id, v_debt_rec.value->>'name', v_debt_rec.value->>'debt_type',
        COALESCE((v_debt_rec.value->>'original_amount')::numeric, (v_debt_rec.value->>'current_balance')::numeric),
        (v_debt_rec.value->>'current_balance')::numeric,
        COALESCE((v_debt_rec.value->>'interest_rate')::numeric, 0),
        COALESCE((v_debt_rec.value->>'minimum_payment')::numeric, (v_debt_rec.value->>'monthly_payment')::numeric),
        COALESCE((v_debt_rec.value->>'monthly_payment')::numeric, 0),
        CURRENT_DATE, v_debt_rec.value->>'creditor', true,
        COALESCE((v_debt_rec.value->>'sort_order')::int, 0),
        v_debt_rec.value->>'subtype', v_debt_rec.value->>'repayment_type',
        (v_debt_rec.value->>'is_tax_deductible')::boolean,
        (v_debt_rec.value->>'fixed_rate_end_date')::date,
        (v_debt_rec.value->>'nhg')::boolean,
        (v_debt_rec.value->>'credit_limit')::numeric,
        (v_debt_rec.value->>'draagkrachtmeting_date')::date
      );
    END LOOP;
  END IF;

  DELETE FROM life_events WHERE user_id = v_user_id AND event_type = 'aow';
  INSERT INTO life_events (
    user_id, name, event_type, target_age,
    monthly_income_change, monthly_cost_change, one_time_cost,
    duration_months, is_indexed, is_active, icon, sort_order, metadata
  ) VALUES (
    v_user_id, 'AOW', 'aow', v_aow_target_age,
    v_aow_monthly, 0, 0, 0, true, true, 'Landmark', 0,
    '{"leefsituatie": "alleenstaand", "jarenBuitenNL": 0}'::jsonb
  );

  UPDATE profiles SET onboarding_completed = true, updated_at = now() WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'status', 500, 'detail', SQLSTATE);
END;
$$`,

  // ── 20260318000001: Withdrawal strategy columns ────────────────────
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS withdrawal_strategy TEXT NOT NULL DEFAULT 'static'`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guardrail_floor NUMERIC NOT NULL DEFAULT 0.80`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guardrail_ceiling NUMERIC NOT NULL DEFAULT 1.20`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guardrail_cut_step NUMERIC NOT NULL DEFAULT 0.10`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guardrail_raise_step NUMERIC NOT NULL DEFAULT 0.10`,

  // ── 20260319000003: Invulfase active flag ───────────────────────────
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invulfase_active boolean NOT NULL DEFAULT false`,

  // ── 20260319000004: Roadmap features table ─────────────────────────
  `CREATE TABLE IF NOT EXISTS roadmap_features (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_nr int NOT NULL,
    fase text NOT NULL CHECK (fase IN ('a', 'b', 'c', 'd')),
    status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'in_ontwikkeling', 'testen', 'afgerond')),
    opmerkingen text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (feature_nr, fase)
  )`,
  `ALTER TABLE roadmap_features ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='roadmap_features' AND policyname='Authenticated can read roadmap features') THEN CREATE POLICY "Authenticated can read roadmap features" ON roadmap_features FOR SELECT TO authenticated USING (true); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='roadmap_features' AND policyname='Authenticated can insert roadmap features') THEN CREATE POLICY "Authenticated can insert roadmap features" ON roadmap_features FOR INSERT TO authenticated WITH CHECK (true); END IF; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='roadmap_features' AND policyname='Authenticated can update roadmap features') THEN CREATE POLICY "Authenticated can update roadmap features" ON roadmap_features FOR UPDATE TO authenticated USING (true) WITH CHECK (true); END IF; END $$`,
  `CREATE OR REPLACE FUNCTION update_roadmap_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS roadmap_features_updated_at ON roadmap_features`,
  `CREATE TRIGGER roadmap_features_updated_at BEFORE UPDATE ON roadmap_features FOR EACH ROW EXECUTE FUNCTION update_roadmap_features_updated_at()`,

  // ── 20260319100001: Marginaal tarief column ────────────────────────
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marginaal_tarief numeric DEFAULT NULL`,

  // ── 20260319100001: Holdings TER column ───────────────────────────
  `ALTER TABLE holdings ADD COLUMN IF NOT EXISTS ter numeric`,

  // ── 20260321000001: Allow 'pensioen' in fire_end_strategy CHECK constraint ──
  `DO $$ BEGIN
    -- Drop existing fire_end_strategy CHECK if it exists
    IF EXISTS (
      SELECT 1 FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE rel.relname = 'profiles' AND nsp.nspname = 'public'
        AND con.contype = 'c' AND pg_get_constraintdef(con.oid) LIKE '%fire_end_strategy%'
    ) THEN
      EXECUTE (
        SELECT format('ALTER TABLE public.profiles DROP CONSTRAINT %I', con.conname)
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'profiles' AND nsp.nspname = 'public'
          AND con.contype = 'c' AND pg_get_constraintdef(con.oid) LIKE '%fire_end_strategy%'
        LIMIT 1
      );
    END IF;
  END $$`,
  `ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_fire_end_strategy_check`,
  `ALTER TABLE public.profiles ADD CONSTRAINT profiles_fire_end_strategy_check
    CHECK (fire_end_strategy IS NULL OR fire_end_strategy IN ('perpetual', 'legacy', 'deplete', 'pensioen'))`,

  // ── PostgREST schema cache reload ───────────────────────────────────
  `NOTIFY pgrst, 'reload schema'`,
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { db_password: bodyPw, service_role_key: bodySrk, access_token: bodyToken } = body
    // Allow credentials from env vars as fallback
    const db_password = bodyPw || process.env.SUPABASE_DB_PASSWORD
    const service_role_key = bodySrk || process.env.SUPABASE_SERVICE_ROLE_KEY
    const access_token = bodyToken || process.env.SUPABASE_ACCESS_TOKEN

    if (!db_password && !service_role_key && !access_token) {
      return NextResponse.json({
        error: 'Provide one of: db_password, service_role_key, or access_token',
        usage: {
          option1: 'curl -X POST http://localhost:3000/api/apply-migration -H "Content-Type: application/json" -d \'{"db_password":"YOUR_DB_PASSWORD"}\'',
          option2: 'curl -X POST http://localhost:3000/api/apply-migration -H "Content-Type: application/json" -d \'{"access_token":"YOUR_SUPABASE_ACCESS_TOKEN"}\'',
          option3: 'Set SUPABASE_DB_PASSWORD, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ACCESS_TOKEN in .env.local, then POST with empty body: curl -X POST http://localhost:3000/api/apply-migration -H "Content-Type: application/json" -d \'{}\'',
          where_to_find: {
            db_password: 'Supabase Dashboard > Settings > Database > Connection string',
            service_role_key: 'Supabase Dashboard > Settings > API > service_role key',
            access_token: 'https://supabase.com/dashboard/account/tokens',
          }
        }
      }, { status: 400 })
    }

    const ref = 'pnnuqwdcgoympgddrvze'
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

    // Method 1: Direct PostgreSQL connection with db_password
    if (db_password) {
      const connectionString = `postgresql://postgres.${ref}:${encodeURIComponent(db_password)}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
      const postgres = (await import('postgres')).default
      const sql = postgres(connectionString, {
        ssl: 'require',
        connect_timeout: 10,
        idle_timeout: 5,
      })

      const testResult = await sql`SELECT current_database(), current_user`
      const dbInfo = testResult[0]

      const results: Array<{ statement: string; status: 'ok' | 'skip' | 'error'; message?: string }> = []
      for (const stmt of MIGRATION_STATEMENTS) {
        const preview = stmt.substring(0, 100).replace(/\n/g, ' ').trim()
        try {
          await sql.unsafe(stmt)
          results.push({ statement: preview, status: 'ok' })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (message.includes('already exists')) {
            results.push({ statement: preview, status: 'skip', message: 'Already exists' })
          } else {
            results.push({ statement: preview, status: 'error', message })
          }
        }
      }

      const verifyResult = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
      const tables = verifyResult.map((r: any) => r.table_name)
      await sql.end()

      return NextResponse.json({
        status: 'success',
        method: 'direct_postgres',
        connection: dbInfo,
        summary: {
          total: results.length,
          success: results.filter(r => r.status === 'ok').length,
          skipped: results.filter(r => r.status === 'skip').length,
          errors: results.filter(r => r.status === 'error').length,
        },
        results,
        tables,
      })
    }

    // Method 2: Supabase Management API with access_token
    if (access_token) {
      const fullSQL = MIGRATION_STATEMENTS.join(';\n\n') + ';'
      const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: fullSQL }),
      })

      const text = await response.text()
      if (!response.ok) {
        return NextResponse.json({ status: 'error', method: 'management_api', error: text }, { status: response.status })
      }

      return NextResponse.json({ status: 'success', method: 'management_api', response: text })
    }

    // Method 3: Service role key
    if (service_role_key) {
      const response = await fetch(`${supabaseUrl}/pg/query`, {
        method: 'POST',
        headers: {
          'apikey': service_role_key,
          'Authorization': `Bearer ${service_role_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: MIGRATION_STATEMENTS.join(';\n\n') + ';' }),
      })

      if (response.ok) {
        const data = await response.json()
        return NextResponse.json({ status: 'success', method: 'service_role_pg', data })
      }

      return NextResponse.json({
        status: 'error',
        method: 'service_role_rpc',
        note: 'Service role key cannot execute DDL via PostgREST. Use db_password or access_token instead.',
      }, { status: 400 })
    }

    return NextResponse.json({ error: 'Unexpected state' }, { status: 500 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ status: 'error', error: message }, { status: 500 })
  }
}

// GET returns comprehensive migration status
export async function GET() {
  const supabase = await createClient()

  // Check all required tables
  const requiredTables = [
    'user_feature_visits', 'holdings', 'holding_transactions', 'next_step_completions',
    'target_allocations', 'holding_prices', 'holding_alerts', 'roadmap_features',
  ]

  const tableStatus: Record<string, boolean> = {}
  for (const table of requiredTables) {
    const { error } = await supabase.from(table).select('*').limit(0)
    tableStatus[table] = !error || !error.message.includes('Could not find')
  }

  // Check holdings classification columns
  const holdingsColumns = ['asset_class', 'sector', 'geography', 'previous_close', 'daily_change_percent', 'is_favorite', 'currency']
  const holdingsColumnStatus: Record<string, boolean> = {}
  for (const col of holdingsColumns) {
    const { error } = await supabase.from('holdings').select(col).limit(0)
    holdingsColumnStatus[col] = !error || !error.message.includes('does not exist')
  }

  // Check net_worth_snapshots columns
  const snapshotColumns = ['freedom_percentage', 'fire_age', 'sovereignty_level', 'savings_rate', 'resilience_score']
  const snapshotColumnStatus: Record<string, boolean> = {}
  for (const col of snapshotColumns) {
    const { error } = await supabase.from('net_worth_snapshots').select(col).limit(0)
    snapshotColumnStatus[col] = !error || !error.message.includes('does not exist')
  }

  // Check profiles columns
  const profileColumns = ['onboarding_idempotency_key', 'invulfase_active', 'withdrawal_strategy', 'guardrail_floor', 'guardrail_ceiling', 'guardrail_cut_step', 'guardrail_raise_step', 'marginaal_tarief']
  const profileColumnStatus: Record<string, boolean> = {}
  for (const col of profileColumns) {
    const { error } = await supabase.from('profiles').select(col).limit(0)
    profileColumnStatus[col] = !error || !error.message.includes('does not exist')
  }

  // Check save_onboarding_data RPC
  const { error: rpcError } = await supabase.rpc('save_onboarding_data', { payload: {} })
  const rpcExists = !rpcError || !rpcError.message.includes('Could not find the function')

  const allTablesExist = Object.values(tableStatus).every(Boolean)
  const allHoldingsColumnsExist = Object.values(holdingsColumnStatus).every(Boolean)
  const allSnapshotColumnsExist = Object.values(snapshotColumnStatus).every(Boolean)
  const allProfileColumnsExist = Object.values(profileColumnStatus).every(Boolean)
  const allComplete = allTablesExist && allHoldingsColumnsExist && allSnapshotColumnsExist && allProfileColumnsExist && rpcExists

  return NextResponse.json({
    status: allComplete ? 'complete' : 'incomplete',
    tables: tableStatus,
    holdings_columns: holdingsColumnStatus,
    snapshot_columns: snapshotColumnStatus,
    profile_columns: profileColumnStatus,
    rpc: { save_onboarding_data: rpcExists },
    all_tables_exist: allTablesExist,
    all_holdings_columns_exist: allHoldingsColumnsExist,
    all_snapshot_columns_exist: allSnapshotColumnsExist,
    all_profile_columns_exist: allProfileColumnsExist,
    rpc_exists: rpcExists,
  })
}
