-- Bring the production-only auto-link trigger into source control.
-- Originally created via Supabase Dashboard; never had a migration file.
-- This migration creates the trigger AND the function with the search_path
-- fix already applied (see migration 20260407000002 for the standalone fix).

CREATE OR REPLACE FUNCTION public.fn_auto_link_bank_account_asset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_asset_id UUID;
BEGIN
  -- Only act if no linked asset yet
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

DROP TRIGGER IF EXISTS trg_bank_account_auto_cash_asset ON public.bank_accounts;
CREATE TRIGGER trg_bank_account_auto_cash_asset
  BEFORE INSERT ON public.bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_link_bank_account_asset();
