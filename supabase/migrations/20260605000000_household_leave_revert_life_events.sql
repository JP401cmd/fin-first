-- household_leave(): ook gedeelde life_events terugzetten naar personal.
--
-- De functie zette bij verlaten van een huishouden alle gedeelde items terug
-- naar 'personal' (assets/debts/budgets/transactions/bank_accounts/
-- recurring_transactions/net_worth_snapshots/valuations/goals), maar de
-- UPDATE-lijst miste `life_events`. Gevolg: een gedeelde gebeurtenis bleef na
-- verlaten `ownership='shared'` met een household_id dat naar het verwijderde
-- huishouden wees. Geen datalek (user_household_id() wordt NULL → de shared-
-- SELECT-RLS matcht nooit; de eigenaar ziet 'm via de owner-clause), maar wel
-- mislabeled. Toegevoegd zodat verlaten alles netjes terugzet naar solo.
--
-- Reeds toegepast op remote via apply_migration (household_leave_revert_life_events);
-- dit bestand houdt de lokale migratiemap in sync. Geverifieerd via synthetische
-- 2-account fixture: na leave → ownership='personal', household_id=NULL.

CREATE OR REPLACE FUNCTION public.household_leave()
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

  -- Revert every shared item of this household back to personal (creator keeps it).
  UPDATE assets                 SET ownership='personal', household_id=NULL WHERE household_id=v_household AND ownership='shared';
  UPDATE debts                  SET ownership='personal', household_id=NULL, partner_split_pct=NULL WHERE household_id=v_household AND ownership='shared';
  UPDATE budgets                SET ownership='personal', household_id=NULL WHERE household_id=v_household AND ownership='shared';
  UPDATE transactions           SET ownership='personal', household_id=NULL WHERE household_id=v_household AND ownership='shared';
  UPDATE bank_accounts          SET ownership='personal', household_id=NULL WHERE household_id=v_household AND ownership='shared';
  UPDATE recurring_transactions SET ownership='personal', household_id=NULL WHERE household_id=v_household AND ownership='shared';
  UPDATE net_worth_snapshots    SET ownership='personal', household_id=NULL WHERE household_id=v_household AND ownership='shared';
  UPDATE valuations             SET ownership='personal', household_id=NULL WHERE household_id=v_household AND ownership='shared';
  UPDATE goals                  SET ownership='personal', household_id=NULL WHERE household_id=v_household AND ownership='shared';
  UPDATE life_events            SET ownership='personal', household_id=NULL WHERE household_id=v_household AND ownership='shared';

  -- Reset BOTH members' profiles to solo.
  UPDATE profiles
    SET household_id=NULL, household_type='solo', selected_perspective='personal'
    WHERE id IN (SELECT user_id FROM household_members WHERE household_id=v_household);

  -- Tear down the household.
  DELETE FROM household_members     WHERE household_id=v_household;
  DELETE FROM household_invitations WHERE household_id=v_household;
  DELETE FROM households            WHERE id=v_household;

  RETURN jsonb_build_object('success', true, 'dissolved_household', v_household);
END;
$function$;
