-- Add budgeting_active boolean to profiles
-- When false, user chose 'none' for budgettering during onboarding
-- Budgets still exist (so the app works), but UI shows activation hints
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS budgeting_active BOOLEAN NOT NULL DEFAULT true;
