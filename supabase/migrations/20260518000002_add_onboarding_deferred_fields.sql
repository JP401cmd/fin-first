-- Add column to track fields users skipped during onboarding ("Later invullen")
-- Stored as a JSONB array of string keys, e.g. ["income", "assets", "spaardoel"]
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS onboarding_deferred_fields jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN profiles.onboarding_deferred_fields IS
  'Array of field keys the user deferred ("Later invullen") during onboarding. Used to surface targeted post-onboarding suggestions via the coach-bubble.';
