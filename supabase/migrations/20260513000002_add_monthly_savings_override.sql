-- Add monthly_savings_override to profiles.
--
-- Nullable numeric. NULL = derive savings from assets.monthly_contribution × 12
-- (current behaviour). When set, the Horizon FIRE-simulation uses this value
-- instead of the asset aggregate — fallback for users who have the Budgetteren
-- module turned off or no monthly_contribution recorded on assets.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS monthly_savings_override numeric NULL;

COMMENT ON COLUMN profiles.monthly_savings_override IS
  'Override for monthly savings in FIRE simulation. NULL = use asset aggregate.';
