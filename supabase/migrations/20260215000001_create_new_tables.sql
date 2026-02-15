-- =============================================
-- Migration: Create new tables per app_spec.txt
-- Date: 2026-02-15
-- =============================================

-- 1. badges table
CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'trophy',
  color TEXT NOT NULL DEFAULT 'amber',
  category TEXT NOT NULL CHECK (category IN ('onboarding', 'consistency', 'financial_health', 'fire_milestones', 'actions', 'budget', 'exploration', 'sovereignty')),
  criteria_type TEXT NOT NULL CHECK (criteria_type IN ('threshold', 'count', 'streak', 'milestone', 'manual')),
  criteria_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badges are viewable by authenticated users" ON badges
  FOR SELECT TO authenticated USING (true);

-- 2. user_badges table
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, badge_id)
);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own badges" ON user_badges
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own badges" ON user_badges
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own badges" ON user_badges
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 3. user_streaks table
CREATE TABLE IF NOT EXISTS user_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  streak_type TEXT NOT NULL CHECK (streak_type IN ('login', 'budget_compliance', 'action_completion')),
  current_count INT NOT NULL DEFAULT 0,
  longest_count INT NOT NULL DEFAULT 0,
  last_activity_date DATE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own streaks" ON user_streaks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own streaks" ON user_streaks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own streaks" ON user_streaks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 4. user_feature_visits table
CREATE TABLE IF NOT EXISTS user_feature_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_slug TEXT NOT NULL,
  first_visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  visit_count INT NOT NULL DEFAULT 1,
  UNIQUE(user_id, feature_slug)
);

ALTER TABLE user_feature_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own feature visits" ON user_feature_visits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own feature visits" ON user_feature_visits
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own feature visits" ON user_feature_visits
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 5. holdings table
CREATE TABLE IF NOT EXISTS holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  ticker TEXT,
  isin TEXT,
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
);

ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own holdings" ON holdings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own holdings" ON holdings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own holdings" ON holdings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own holdings" ON holdings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 6. holding_transactions table
CREATE TABLE IF NOT EXISTS holding_transactions (
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
);

ALTER TABLE holding_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own holding transactions" ON holding_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own holding transactions" ON holding_transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own holding transactions" ON holding_transactions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own holding transactions" ON holding_transactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 7. next_step_completions table
CREATE TABLE IF NOT EXISTS next_step_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, step_key)
);

ALTER TABLE next_step_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own next step completions" ON next_step_completions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own next step completions" ON next_step_completions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own next step completions" ON next_step_completions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 8. Alter net_worth_snapshots: add new columns
ALTER TABLE net_worth_snapshots
  ADD COLUMN IF NOT EXISTS freedom_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS fire_age NUMERIC,
  ADD COLUMN IF NOT EXISTS sovereignty_level INT,
  ADD COLUMN IF NOT EXISTS savings_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS resilience_score INT;
