-- Huishoud-brede "uitgave na pensioen" — aanpasbaar door BEIDE partners.
-- Default (NULL method) = automatische 'samen'-berekening (gedeelde lasten 1×).
-- Methodes: auto_shared (default) | sum_partners (som van beide individuen) | custom_amount.
-- Reeds toegepast op remote via apply_migration (household_retirement_expense_settings).

ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS retirement_expense_method text,
  ADD COLUMN IF NOT EXISTS retirement_expense_custom_amount numeric,
  ADD COLUMN IF NOT EXISTS retirement_aspirations jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'households_retirement_expense_method_check'
  ) THEN
    ALTER TABLE public.households
      ADD CONSTRAINT households_retirement_expense_method_check
      CHECK (retirement_expense_method IS NULL
        OR retirement_expense_method IN ('auto_shared', 'sum_partners', 'custom_amount'));
  END IF;
END $$;

-- Write-RPC: leden (niet alleen owner) mogen de gedeelde huishoud-uitgave zetten.
-- De households UPDATE-RLS is owner-only; deze SECURITY DEFINER-functie staat
-- elk lid van hetzelfde huishouden toe deze 3 kolommen (en alleen deze) te zetten.
CREATE OR REPLACE FUNCTION public.set_household_retirement_expense(
  p_method text,
  p_amount numeric,
  p_aspirations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_household uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_method IS NOT NULL AND p_method NOT IN ('auto_shared', 'sum_partners', 'custom_amount') THEN
    RAISE EXCEPTION 'invalid_method';
  END IF;

  SELECT household_id INTO v_household
  FROM household_members WHERE user_id = v_uid LIMIT 1;

  IF v_household IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_member');
  END IF;

  UPDATE households
    SET retirement_expense_method = p_method,
        retirement_expense_custom_amount = p_amount,
        retirement_aspirations = p_aspirations
    WHERE id = v_household;

  RETURN jsonb_build_object(
    'success', true,
    'method', p_method,
    'customAmount', p_amount,
    'aspirations', p_aspirations
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_household_retirement_expense(text, numeric, jsonb) TO authenticated;
