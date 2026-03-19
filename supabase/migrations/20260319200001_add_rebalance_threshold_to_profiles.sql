-- Add rebalance_threshold column for configurable drift sensitivity
-- Default 5%, range 1-20%. Used by /api/rebalancing/check and widgets.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rebalance_threshold numeric NOT NULL DEFAULT 5
  CHECK (rebalance_threshold >= 1 AND rebalance_threshold <= 20);
