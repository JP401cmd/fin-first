-- =============================================
-- Migration: Add missing columns to holdings table
-- and create target_allocations table
-- Date: 2026-03-16
-- =============================================

-- 1. Add classification columns to holdings (all nullable so existing rows are unaffected)
ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS asset_class TEXT,
  ADD COLUMN IF NOT EXISTS sector TEXT,
  ADD COLUMN IF NOT EXISTS geography TEXT,
  ADD COLUMN IF NOT EXISTS previous_close NUMERIC,
  ADD COLUMN IF NOT EXISTS daily_change_percent NUMERIC;

-- 2. Create target_allocations table
CREATE TABLE IF NOT EXISTS target_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  view_mode TEXT NOT NULL CHECK (view_mode IN ('asset_class', 'sector', 'geography')),
  category TEXT NOT NULL,
  target_pct NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, view_mode, category)
);

-- 3. Enable RLS on target_allocations
ALTER TABLE target_allocations ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for target_allocations (idempotent with DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'target_allocations' AND policyname = 'Users can view own target allocations') THEN
    CREATE POLICY "Users can view own target allocations" ON target_allocations
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'target_allocations' AND policyname = 'Users can insert own target allocations') THEN
    CREATE POLICY "Users can insert own target allocations" ON target_allocations
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'target_allocations' AND policyname = 'Users can update own target allocations') THEN
    CREATE POLICY "Users can update own target allocations" ON target_allocations
      FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'target_allocations' AND policyname = 'Users can delete own target allocations') THEN
    CREATE POLICY "Users can delete own target allocations" ON target_allocations
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
