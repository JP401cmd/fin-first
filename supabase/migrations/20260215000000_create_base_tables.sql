-- ============================================================
-- Baseline schema: creates core tables that were originally
-- set up via the Supabase dashboard and never committed as a
-- migration.  All later migrations (20260215000001+) ALTER
-- these tables, so this file MUST run first.
--
-- Safe to run on an existing database: every statement uses
-- IF NOT EXISTS.
-- ============================================================

-- ── PROFILES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT,
  date_of_birth   TEXT,
  household_type  TEXT DEFAULT 'single',
  number_of_children INT DEFAULT 0,
  net_monthly_income    NUMERIC DEFAULT 0,
  estimated_monthly_expenses NUMERIC DEFAULT 0,
  expected_return       NUMERIC DEFAULT 7,
  inflation_rate        NUMERIC DEFAULT 2,
  retirement_expense_method TEXT DEFAULT 'essential_budgets',
  retirement_expense_custom_amount NUMERIC DEFAULT 0,
  fire_end_strategy     TEXT DEFAULT 'perpetual',
  fire_legacy_amount    NUMERIC DEFAULT 0,
  fire_end_age          INT DEFAULT 90,
  temporal_balance      INT DEFAULT 50,
  widget_prefs          JSONB DEFAULT '[]'::jsonb,
  onboarding_completed  BOOLEAN DEFAULT false,
  is_demo_user          BOOLEAN DEFAULT false,
  onboarding_idempotency_key TEXT,
  withdrawal_strategy   TEXT DEFAULT 'static',
  guardrail_floor       NUMERIC DEFAULT 0,
  guardrail_ceiling     NUMERIC DEFAULT 0,
  guardrail_cut_step    NUMERIC DEFAULT 0,
  guardrail_raise_step  NUMERIC DEFAULT 0,
  feature_preferences   JSONB DEFAULT '{}'::jsonb,
  marginaal_tarief      NUMERIC,
  rebalance_threshold   NUMERIC,
  selected_perspective  TEXT,
  invulfase_active      BOOLEAN DEFAULT false,
  ai_enabled            BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can manage own profile') THEN
    CREATE POLICY "Users can manage own profile" ON profiles FOR ALL USING (auth.uid() = id);
  END IF;
END $$;

-- ── ASSETS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  asset_type      TEXT NOT NULL CHECK (asset_type IN (
    'cash','savings','investment','retirement','eigen_huis',
    'real_estate','crypto','vehicle','physical','deelneming',
    'levensverzekering','vordering','other'
  )),
  current_value   NUMERIC DEFAULT 0,
  purchase_value  NUMERIC DEFAULT 0,
  purchase_date   DATE,
  expected_return NUMERIC DEFAULT 0,
  monthly_contribution NUMERIC DEFAULT 0,
  institution     TEXT,
  account_number  TEXT,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  sort_order      INT DEFAULT 0,
  -- type-specific
  subtype             TEXT,
  risk_profile        TEXT CHECK (risk_profile IS NULL OR risk_profile IN ('laag','middel','hoog')),
  tax_benefit         BOOLEAN,
  is_liquid           BOOLEAN,
  lock_end_date       DATE,
  ticker_symbol       TEXT,
  rental_income       NUMERIC,
  woz_value           NUMERIC,
  retirement_provider_type TEXT,
  depreciation_rate   NUMERIC,
  address_postcode    TEXT,
  address_house_number TEXT,
  expiry_date         DATE,
  beneficiary         TEXT,
  kvk_number          TEXT,
  ownership_percentage NUMERIC,
  annual_dividend     NUMERIC,
  linked_asset_id     UUID,
  net_worth_inclusion_pct NUMERIC DEFAULT 100,
  has_budget_tracking BOOLEAN DEFAULT false,
  has_holdings_tracking BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assets' AND policyname = 'Users can manage own assets') THEN
    CREATE POLICY "Users can manage own assets" ON assets FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── DEBTS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  debt_type       TEXT NOT NULL CHECK (debt_type IN (
    'mortgage','personal_loan','student_loan','car_loan',
    'credit_card','revolving_credit','payment_plan',
    'belastingschuld','familielening','dga_schuld','other'
  )),
  original_amount  NUMERIC DEFAULT 0,
  current_balance  NUMERIC DEFAULT 0,
  interest_rate    NUMERIC DEFAULT 0,
  minimum_payment  NUMERIC DEFAULT 0,
  monthly_payment  NUMERIC DEFAULT 0,
  start_date       DATE DEFAULT CURRENT_DATE,
  end_date         DATE,
  creditor         TEXT,
  notes            TEXT,
  is_active        BOOLEAN DEFAULT true,
  sort_order       INT DEFAULT 0,
  -- type-specific
  subtype               TEXT,
  is_tax_deductible     BOOLEAN,
  fixed_rate_end_date   DATE,
  nhg                   BOOLEAN,
  linked_asset_id       UUID REFERENCES assets(id) ON DELETE SET NULL,
  credit_limit          NUMERIC,
  repayment_type        TEXT CHECK (repayment_type IS NULL OR repayment_type IN ('aflossingsvrij','annuiteit','lineair')),
  draagkrachtmeting_date DATE,
  tax_year              INT,
  has_payment_plan      BOOLEAN DEFAULT false,
  has_written_agreement BOOLEAN DEFAULT false,
  net_worth_inclusion_pct NUMERIC DEFAULT 100,
  include_aflossing_in_savings BOOLEAN DEFAULT false,
  custom_aflossing_amount NUMERIC,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'debts' AND policyname = 'Users can manage own debts') THEN
    CREATE POLICY "Users can manage own debts" ON debts FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── BANK_ACCOUNTS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  bank_name       TEXT,
  account_type    TEXT DEFAULT 'checking',
  balance         NUMERIC DEFAULT 0,
  iban            TEXT,
  is_active       BOOLEAN DEFAULT true,
  sort_order      INT DEFAULT 0,
  linked_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  account_number  TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'Users can manage own bank_accounts') THEN
    CREATE POLICY "Users can manage own bank_accounts" ON bank_accounts FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── BUDGETS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES budgets(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT,
  icon            TEXT DEFAULT '📦',
  description     TEXT,
  default_limit   NUMERIC DEFAULT 0,
  budget_type     TEXT DEFAULT 'expense' CHECK (budget_type IN ('income','expense','savings','debt','archive')),
  interval        TEXT DEFAULT 'monthly' CHECK (interval IN ('monthly','quarterly','yearly')),
  rollover_type   TEXT DEFAULT 'reset',
  limit_type      TEXT DEFAULT 'soft',
  alert_threshold INT DEFAULT 80,
  max_single_transaction_amount NUMERIC,
  is_essential    BOOLEAN DEFAULT false,
  priority_score  INT DEFAULT 0,
  is_inflation_indexed BOOLEAN DEFAULT false,
  sort_order      INT DEFAULT 0,
  goal_type       TEXT,
  goal_amount     NUMERIC,
  goal_date       DATE,
  goal_frequency  TEXT,
  is_favorite     BOOLEAN DEFAULT false,
  monthly_limit   NUMERIC,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'budgets' AND policyname = 'Users can manage own budgets') THEN
    CREATE POLICY "Users can manage own budgets" ON budgets FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── TRANSACTIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  account_id      UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  budget_id       UUID REFERENCES budgets(id) ON DELETE SET NULL,
  date            DATE NOT NULL,
  amount          NUMERIC NOT NULL,
  description     TEXT,
  counterparty_name TEXT,
  counterparty_iban TEXT,
  reference       TEXT,
  transaction_type TEXT,
  import_hash     TEXT,
  is_income       BOOLEAN DEFAULT false,
  category_source TEXT,
  method          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Users can manage own transactions') THEN
    CREATE POLICY "Users can manage own transactions" ON transactions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── VALUATIONS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS valuations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  valuation_date  DATE NOT NULL,
  value           NUMERIC NOT NULL,
  notes           TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE valuations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'valuations' AND policyname = 'Users can manage own valuations') THEN
    CREATE POLICY "Users can manage own valuations" ON valuations FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── RECURRING_TRANSACTIONS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  account_id      UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  budget_id       UUID REFERENCES budgets(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  amount          NUMERIC DEFAULT 0,
  description     TEXT,
  counterparty_name TEXT,
  frequency       TEXT DEFAULT 'monthly',
  day_of_month    INT,
  day_of_week     INT,
  start_date      DATE,
  end_date        DATE,
  is_active       BOOLEAN DEFAULT true,
  last_generated  TIMESTAMPTZ,
  sort_order      INT DEFAULT 0,
  category_override TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recurring_transactions' AND policyname = 'Users can manage own recurring_transactions') THEN
    CREATE POLICY "Users can manage own recurring_transactions" ON recurring_transactions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── NET_WORTH_SNAPSHOTS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  snapshot_date   DATE NOT NULL,
  total_assets    NUMERIC DEFAULT 0,
  total_debts     NUMERIC DEFAULT 0,
  net_worth       NUMERIC DEFAULT 0,
  freedom_percentage NUMERIC,
  fire_age        NUMERIC,
  sovereignty_level INT,
  savings_rate    NUMERIC,
  resilience_score INT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE net_worth_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'net_worth_snapshots' AND policyname = 'Users can manage own snapshots') THEN
    CREATE POLICY "Users can manage own snapshots" ON net_worth_snapshots FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── GOALS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  goal_type       TEXT DEFAULT 'savings',
  target_value    NUMERIC DEFAULT 0,
  current_value   NUMERIC DEFAULT 0,
  target_date     DATE,
  linked_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  linked_debt_id  UUID REFERENCES debts(id) ON DELETE SET NULL,
  budget_id       UUID REFERENCES budgets(id) ON DELETE SET NULL,
  custom_unit     TEXT,
  icon            TEXT DEFAULT '🎯',
  color           TEXT DEFAULT '#6366f1',
  is_completed    BOOLEAN DEFAULT false,
  completed_at    TIMESTAMPTZ,
  sort_order      INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'goals' AND policyname = 'Users can manage own goals') THEN
    CREATE POLICY "Users can manage own goals" ON goals FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── LIFE_EVENTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS life_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  event_type      TEXT DEFAULT 'milestone',
  target_age      INT,
  target_date     DATE,
  one_time_cost   NUMERIC DEFAULT 0,
  monthly_cost_change   NUMERIC DEFAULT 0,
  monthly_income_change NUMERIC DEFAULT 0,
  duration_months INT DEFAULT 0,
  icon            TEXT DEFAULT '📅',
  is_active       BOOLEAN DEFAULT true,
  sort_order      INT DEFAULT 0,
  is_indexed      BOOLEAN DEFAULT false,
  metadata        JSONB,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE life_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'life_events' AND policyname = 'Users can manage own life_events') THEN
    CREATE POLICY "Users can manage own life_events" ON life_events FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── APP_SETTINGS (key-value store) ──────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key       TEXT PRIMARY KEY,
  value     JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_settings' AND policyname = 'Authenticated users can read app_settings') THEN
    CREATE POLICY "Authenticated users can read app_settings" ON app_settings FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_settings' AND policyname = 'Authenticated users can manage app_settings') THEN
    CREATE POLICY "Authenticated users can manage app_settings" ON app_settings FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_debts_user_id ON debts(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_parent_id ON budgets(parent_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_budget_id ON transactions(budget_id);
CREATE INDEX IF NOT EXISTS idx_transactions_import_hash ON transactions(import_hash);
CREATE INDEX IF NOT EXISTS idx_valuations_user_id ON valuations(user_id);
CREATE INDEX IF NOT EXISTS idx_valuations_entity ON valuations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_recurring_user_id ON recurring_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_user_id ON net_worth_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON net_worth_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_life_events_user_id ON life_events(user_id);
