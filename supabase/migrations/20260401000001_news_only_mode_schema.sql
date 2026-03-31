-- Schema changes for News Only mode
-- Adds source tracking to assets/debts (for AI extraction vs manual entry)
-- Adds financial context and onboarding step tracking to profiles

-- assets.source: how the asset was created ('manual', 'ai_extracted', 'bank_sync')
-- NULL means legacy/manual entry (existing rows keep NULL)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE assets ADD CONSTRAINT assets_source_values
  CHECK (source IS NULL OR source IN ('manual', 'ai_extracted', 'bank_sync'));

-- debts.source: how the debt was created ('manual', 'ai_extracted', 'bank_sync')
-- NULL means legacy/manual entry (existing rows keep NULL)
ALTER TABLE debts ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE debts ADD CONSTRAINT debts_source_values
  CHECK (source IS NULL OR source IN ('manual', 'ai_extracted', 'bank_sync'));

-- profiles.financial_context: free-text financial situation description
-- Used by AI extraction to understand user context for news personalisation
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS financial_context TEXT;

-- profiles.completed_onboarding_steps: tracks which onboarding steps a user has finished
-- Enables progressive onboarding where users can complete steps in any order
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS completed_onboarding_steps TEXT[] DEFAULT '{}';
