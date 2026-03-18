-- Add withdrawal strategy columns to profiles table
-- NOT NULL + DEFAULT ensures existing users get standard values automatically
-- IF NOT EXISTS makes this migration idempotent
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS withdrawal_strategy TEXT NOT NULL DEFAULT 'static';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guardrail_floor NUMERIC NOT NULL DEFAULT 0.80;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guardrail_ceiling NUMERIC NOT NULL DEFAULT 1.20;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guardrail_cut_step NUMERIC NOT NULL DEFAULT 0.10;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guardrail_raise_step NUMERIC NOT NULL DEFAULT 0.10;
