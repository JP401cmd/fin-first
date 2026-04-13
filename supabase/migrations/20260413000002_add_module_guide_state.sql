-- Add module_guide_state JSONB column to profiles
-- Stores per-module guide progress: { [moduleKey]: { completedSteps: string[], dismissedAt: string | null } }
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS module_guide_state JSONB NOT NULL DEFAULT '{}';
