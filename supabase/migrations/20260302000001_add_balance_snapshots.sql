-- =============================================
-- Migration: Balance Snapshots (per-entity tracking)
-- Tracks individual asset/debt balances at each snapshot point
-- Date: 2026-03-02
-- =============================================

-- 1. Create balance_snapshots table
CREATE TABLE IF NOT EXISTS balance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('asset', 'debt')),
  entity_id UUID NOT NULL,
  entity_name TEXT NOT NULL,
  entity_subtype TEXT,
  balance NUMERIC NOT NULL,
  net_worth_inclusion_pct NUMERIC NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date, entity_type, entity_id)
);

-- 2. Row-Level Security
ALTER TABLE balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own balance snapshots" ON balance_snapshots
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own balance snapshots" ON balance_snapshots
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access to balance snapshots" ON balance_snapshots
  FOR ALL TO service_role USING (true);

-- 3. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_user_date
  ON balance_snapshots (user_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_entity
  ON balance_snapshots (user_id, entity_type, entity_id, snapshot_date DESC);
