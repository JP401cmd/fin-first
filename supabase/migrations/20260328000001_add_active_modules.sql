-- Add active_modules column to profiles
-- Replaces sovereignty-based feature gating with user-selectable modules.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS active_modules text[]
  DEFAULT ARRAY['budgetteren','vermogensregistratie','aandelenregistratie','inzicht_acties','toekomstplannen','nieuws']::text[];

-- Migrate existing users: give all current users all modules (preserve current behaviour)
UPDATE profiles
SET active_modules = ARRAY['budgetteren','vermogensregistratie','aandelenregistratie','inzicht_acties','toekomstplannen','nieuws']::text[]
WHERE active_modules IS NULL;

-- Users who had budgeting disabled: remove budgetteren from their modules
UPDATE profiles
SET active_modules = array_remove(active_modules, 'budgetteren')
WHERE budgeting_active = false;

COMMENT ON COLUMN profiles.active_modules IS 'User-selected active modules. Replaces sovereignty-based feature gating.';
