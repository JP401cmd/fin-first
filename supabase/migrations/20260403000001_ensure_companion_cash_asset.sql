-- =============================================
-- Migration: ensure_companion_cash_asset function + data repair
-- Date: 2026-04-03
--
-- Fixes 3 gaps in the bank_account → cash asset linking chain:
-- 1. No DB trigger existed to auto-create companion cash assets
-- 2. Onboarding RPC set assets.linked_bank_account_id but NOT bank_accounts.linked_asset_id
-- 3. Module activation modal created bank_accounts without companion assets
--
-- This migration:
-- A. Creates a reusable function ensure_companion_cash_asset()
-- B. Repairs all existing bank_accounts with broken/missing links
-- =============================================

-- ── A. Reusable function ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ensure_companion_cash_asset(
  p_bank_account_id UUID,
  p_has_budget_tracking BOOLEAN DEFAULT false,
  p_skip_auth_check BOOLEAN DEFAULT false
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ba RECORD;
  v_existing_asset_id UUID;
  v_new_asset_id UUID;
BEGIN
  -- Fetch the bank account
  SELECT * INTO v_ba FROM bank_accounts WHERE id = p_bank_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank_account % not found', p_bank_account_id;
  END IF;

  -- Ownership check: prevent IDOR via RPC endpoint
  -- Skipped only for internal callers (data repair migrations, other SECURITY DEFINER functions)
  IF NOT p_skip_auth_check AND v_ba.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'bank_account % does not belong to current user', p_bank_account_id;
  END IF;

  -- If already correctly linked, return existing asset
  IF v_ba.linked_asset_id IS NOT NULL THEN
    -- Ensure budget tracking flag is up-to-date
    IF p_has_budget_tracking THEN
      UPDATE assets SET has_budget_tracking = true WHERE id = v_ba.linked_asset_id;
    END IF;
    RETURN v_ba.linked_asset_id;
  END IF;

  -- Check if an orphan companion asset exists via linked_bank_account_id (stale column from RPC)
  SELECT id INTO v_existing_asset_id
    FROM assets
    WHERE linked_bank_account_id = p_bank_account_id
      AND asset_type = 'cash'
    LIMIT 1;

  IF v_existing_asset_id IS NOT NULL THEN
    -- Link the existing orphan asset
    UPDATE bank_accounts SET linked_asset_id = v_existing_asset_id WHERE id = p_bank_account_id;
    IF p_has_budget_tracking THEN
      UPDATE assets SET has_budget_tracking = true WHERE id = v_existing_asset_id;
    END IF;
    RETURN v_existing_asset_id;
  END IF;

  -- Create new companion cash asset
  INSERT INTO assets (
    user_id, name, asset_type, current_value, purchase_value,
    expected_return, monthly_contribution, institution,
    is_active, sort_order, ownership, household_id,
    net_worth_inclusion_pct, is_liquid, subtype,
    has_budget_tracking, linked_bank_account_id
  ) VALUES (
    v_ba.user_id, v_ba.name, 'cash', v_ba.balance, v_ba.balance,
    0, 0, v_ba.bank_name,
    v_ba.is_active, v_ba.sort_order,
    COALESCE(v_ba.ownership, 'personal'), v_ba.household_id,
    100, true, v_ba.account_type,
    p_has_budget_tracking, p_bank_account_id
  ) RETURNING id INTO v_new_asset_id;

  -- Set the canonical backlink
  UPDATE bank_accounts SET linked_asset_id = v_new_asset_id WHERE id = p_bank_account_id;

  RETURN v_new_asset_id;
END;
$$;

COMMENT ON FUNCTION ensure_companion_cash_asset IS
  'Ensures a bank_account has a companion cash asset with bidirectional linking. '
  'Idempotent: returns existing asset if already linked, repairs orphans, or creates new.';


-- ── B. Data repair: fix all existing broken links ───────────────────────────

DO $$
DECLARE
  v_ba RECORD;
BEGIN
  -- Find all bank_accounts where linked_asset_id is NULL (broken link)
  -- Includes inactive accounts to prevent broken links on reactivation
  FOR v_ba IN
    SELECT id FROM bank_accounts WHERE linked_asset_id IS NULL
  LOOP
    PERFORM ensure_companion_cash_asset(v_ba.id, false, true);
  END LOOP;
END $$;
