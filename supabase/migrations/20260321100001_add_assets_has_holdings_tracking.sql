-- Add has_holdings_tracking column to assets table
-- Mirrors has_budget_tracking: indicates the asset's value is managed by the holdings tracker
ALTER TABLE assets ADD COLUMN IF NOT EXISTS has_holdings_tracking BOOLEAN NOT NULL DEFAULT false;

-- Auto-detect: set true for assets that already have active holdings
UPDATE assets SET has_holdings_tracking = true
WHERE id IN (SELECT DISTINCT asset_id FROM holdings WHERE is_active = true);
