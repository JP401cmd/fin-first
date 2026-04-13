-- Add onboarding_intent column to profiles table.
-- Nullable TEXT, no default — only set for new users who go through the intent flow.
-- Existing profiles are not affected (column is NULL for them).

ALTER TABLE public.profiles ADD COLUMN onboarding_intent text;

COMMENT ON COLUMN public.profiles.onboarding_intent IS 'Captures the user intent selected during onboarding (e.g. "fire", "budget", "overview"). NULL for users who did not go through the intent flow.';
