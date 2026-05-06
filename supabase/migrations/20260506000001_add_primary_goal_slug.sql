-- Add primary_goal_slug TEXT column to profiles for storing the user's chosen
-- onboarding goal. Replaces the role of `onboarding_intent` as the primary
-- driver for goal-guide cards on /will. `onboarding_intent` blijft bestaan
-- voor backward compat voor users die de oude flow doorliepen.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_goal_slug TEXT;
