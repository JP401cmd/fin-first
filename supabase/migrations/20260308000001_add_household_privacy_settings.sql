-- Add privacy_settings JSONB column to household_members
-- Stores per-user per-category privacy level
-- Categories: assets, debts, budgets, transactions, income
-- Levels: full, totals, hidden
ALTER TABLE household_members
ADD COLUMN IF NOT EXISTS privacy_settings JSONB NOT NULL DEFAULT '{
  "assets": "totals",
  "debts": "totals",
  "budgets": "totals",
  "transactions": "totals",
  "income": "totals"
}'::jsonb;

-- Helper function: get a partner's privacy level for a given category
-- Returns 'totals' as default if not set
CREATE OR REPLACE FUNCTION get_partner_privacy_level(
  p_household_id UUID,
  p_partner_user_id UUID,
  p_category TEXT
) RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT privacy_settings->>p_category
     FROM household_members
     WHERE household_id = p_household_id
       AND user_id = p_partner_user_id),
    'totals'
  );
$$;

-- RLS policy: users can only update their own privacy_settings row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'household_members'
    AND policyname = 'Users can update own privacy settings'
  ) THEN
    CREATE POLICY "Users can update own privacy settings"
    ON household_members
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  END IF;
END
$$;
