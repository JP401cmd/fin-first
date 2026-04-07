-- Fix: trigger function fn_auto_link_bank_account_asset() inherited an empty
-- search_path when called from save_onboarding_data (which has SET search_path = '').
-- This caused "relation 'assets' does not exist" errors during onboarding.
-- 12 of 19 production profiles never completed onboarding because of this.
--
-- Two-part defensive fix:
--   1) Schema-qualify all references in the function body (public.assets)
--   2) SET search_path = public on the function itself
--
-- Note: this CREATE OR REPLACE is idempotent — if the previous migration already
-- created the corrected function, this is a no-op. Kept as a separate migration
-- to preserve the historical record of the production hotfix applied 2026-04-07.

CREATE OR REPLACE FUNCTION public.fn_auto_link_bank_account_asset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_asset_id UUID;
BEGIN
  IF NEW.linked_asset_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.assets (
    user_id, name, asset_type, current_value, purchase_value,
    expected_return, monthly_contribution, institution, account_number,
    is_active, sort_order, ownership, household_id, net_worth_inclusion_pct,
    is_liquid, subtype, has_budget_tracking
  ) VALUES (
    NEW.user_id, NEW.name, 'cash', NEW.balance, NEW.balance,
    0, 0, NEW.bank_name, NEW.iban,
    true, COALESCE(NEW.sort_order, 0), COALESCE(NEW.ownership, 'personal'),
    NEW.household_id, 100, true, NEW.account_type, true
  ) RETURNING id INTO new_asset_id;

  NEW.linked_asset_id := new_asset_id;
  RETURN NEW;
END;
$function$;
