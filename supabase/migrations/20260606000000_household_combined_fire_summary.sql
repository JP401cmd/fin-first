-- Gecombineerde huishoud-FIRE-samenvatting op households, zodat dashboard-widgets
-- de huishoud-FIRE-cijfers kunnen tonen die EXACT matchen met /toekomst (i.p.v.
-- een tweede, afwijkende berekening in de dashboard-loader). Geschreven door
-- buildHouseholdProjectionInput; idempotent (beide leden berekenen dezelfde combined).
-- Reeds toegepast op remote via apply_migration (household_combined_fire_summary).

ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS combined_fire_summary jsonb;

CREATE OR REPLACE FUNCTION public.set_household_combined_summary(p_summary jsonb)
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
  SELECT household_id INTO v_household
  FROM household_members WHERE user_id = v_uid LIMIT 1;
  IF v_household IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_member');
  END IF;
  UPDATE households SET combined_fire_summary = p_summary WHERE id = v_household;
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_household_combined_summary(jsonb) TO authenticated;
