-- Add partner assignment columns to actions table
ALTER TABLE actions ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);
ALTER TABLE actions ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id);

-- Index for querying actions assigned to a specific user
CREATE INDEX IF NOT EXISTS idx_actions_assigned_to ON actions(assigned_to) WHERE assigned_to IS NOT NULL;

-- Drop existing restrictive policies if they exist (safe to ignore errors)
DROP POLICY IF EXISTS "Users can view own actions" ON actions;
DROP POLICY IF EXISTS "Users can update own actions" ON actions;
DROP POLICY IF EXISTS "Users can view actions assigned to them" ON actions;
DROP POLICY IF EXISTS "Users can update actions assigned to them" ON actions;

-- Recreate policies to include assigned actions
-- SELECT: own actions OR actions assigned to me
CREATE POLICY "Users can view own actions"
  ON actions FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = assigned_to);

-- UPDATE: own actions OR actions assigned to me
CREATE POLICY "Users can update own actions"
  ON actions FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = assigned_to);
