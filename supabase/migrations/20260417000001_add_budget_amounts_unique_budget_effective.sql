-- Add a unique constraint on (budget_id, effective_from) in budget_amounts.
--
-- This enables INSERT ... ON CONFLICT (budget_id, effective_from) DO UPDATE
-- semantics for the new save_budget_plan RPC. Without it the RPC would have to
-- fall back to delete-then-insert per row, which is exactly the non-atomic
-- pattern we are replacing.
--
-- Pre-migration check confirmed there are no duplicate (budget_id, effective_from)
-- rows, so this can be added without cleanup.

CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_amounts_budget_effective
  ON budget_amounts (budget_id, effective_from);

ALTER TABLE budget_amounts
  ADD CONSTRAINT budget_amounts_budget_id_effective_from_key
  UNIQUE USING INDEX idx_budget_amounts_budget_effective;
