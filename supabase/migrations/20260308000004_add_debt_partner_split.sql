-- Add per-debt partner split percentage override
-- Allows mortgages (and other shared debts) to have their own split,
-- independent of the household-level split mode.
-- NULL means "use household default split".
ALTER TABLE debts ADD COLUMN IF NOT EXISTS partner_split_pct NUMERIC
  CHECK (partner_split_pct >= 0 AND partner_split_pct <= 100);

COMMENT ON COLUMN debts.partner_split_pct IS 'Per-debt split override: percentage for the debt owner. NULL = use household default split.';
