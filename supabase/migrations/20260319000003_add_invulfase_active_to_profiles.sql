-- Add invulfase_active flag to profiles
-- Controls whether the guided data-entry phase is active for a user
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invulfase_active boolean NOT NULL DEFAULT false;
