-- Add ai_enabled toggle to profiles
-- When false, all AI features (briefing, chat, news) are disabled
-- The app functions as a pure financial dashboard
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true;
