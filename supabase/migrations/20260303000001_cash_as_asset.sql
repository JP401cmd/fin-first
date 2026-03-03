-- =============================================
-- Migration: Cash as Asset — link bank_accounts to assets
-- Date: 2026-03-03
-- =============================================

-- 0. Fix CHECK constraint to include 'cash' type
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_asset_type_check;
ALTER TABLE assets ADD CONSTRAINT assets_asset_type_check
  CHECK (asset_type = ANY (ARRAY['cash','savings','investment','retirement',
    'eigen_huis','real_estate','crypto','vehicle','physical','other']));

-- 1. Add linked_asset_id FK to bank_accounts (UNIQUE = max 1 bank_account per asset)
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS linked_asset_id UUID UNIQUE REFERENCES assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_linked_asset
  ON bank_accounts (linked_asset_id) WHERE linked_asset_id IS NOT NULL;

-- 2. Add has_budget_tracking flag to assets (explicit toggle state)
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS has_budget_tracking BOOLEAN NOT NULL DEFAULT false;

-- 3. Auto-migrate: create asset records for existing active bank_accounts
DO $$
DECLARE
  ba RECORD;
  new_asset_id UUID;
BEGIN
  FOR ba IN
    SELECT * FROM bank_accounts
    WHERE linked_asset_id IS NULL AND is_active = true
  LOOP
    INSERT INTO assets (
      user_id, name, asset_type, current_value, purchase_value,
      expected_return, monthly_contribution, institution, account_number,
      is_active, sort_order, ownership, household_id, net_worth_inclusion_pct,
      is_liquid, subtype, has_budget_tracking
    ) VALUES (
      ba.user_id, ba.name, 'cash', ba.balance, ba.balance,
      0, 0, ba.bank_name, ba.iban,
      true, ba.sort_order, COALESCE(ba.ownership, 'personal'),
      ba.household_id, 100, true, ba.account_type, true
    ) RETURNING id INTO new_asset_id;

    UPDATE bank_accounts SET linked_asset_id = new_asset_id WHERE id = ba.id;
  END LOOP;
END $$;
