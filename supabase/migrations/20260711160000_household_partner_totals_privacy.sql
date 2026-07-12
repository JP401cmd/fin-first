-- Partner-privacy op één plek afdwingen (Notion: Partner-privacy op één plek afdwingen).
--
-- household_partner_totals() (SECURITY DEFINER) gaf partner-totalen tot nu toe
-- ONVOORWAARDELIJK terug: elke consument moest de privacy-instelling 'hidden'
-- zelf hertoepassen (dashboard-data-loader deed dit hand-gerold). Eén vergeten
-- poort = partner-nettovermogen lekt. Dit is dezelfde faalklasse als het
-- eerdere superadmin-RLS-lek (ADR 0006): privacy die per afnemer ligt i.p.v.
-- structureel.
--
-- Oplossing (Richting 1 uit de kaart): dwing de privacy IN de functie zelf af,
-- via get_partner_privacy_level() — precies zoals household_partner_items() dat
-- al doet. Een nieuwe consument kán daardoor niet meer lekken.
--
-- Semantiek (geverifieerd tegen household_partner_items): per categorie
-- onafhankelijk. 'hidden' => categorie volledig 0 tellen; 'full'/'totals' zijn
-- equivalent voor een scalar-totalen-functie (geen itemisatie). net_worth =
-- gated_assets − gated_debts, dus assets hidden + debts totals => 0 − debts.
--
-- CREATE OR REPLACE (géén DROP): bestaande grants (authenticated, service_role;
-- revoke public/anon uit 20260611130000) blijven behouden. Identieke
-- returnsignatuur — geen consument-type wijzigt.
--
-- Drift-noot: household_partner_items() bestaat alléén remote (nooit in een
-- repo-migratie CREATE't, enkel grants). Deze functie stond nog in
-- 20260218000001 met de oude, ongegate definitie; deze migratie wint op
-- volgorde.

CREATE OR REPLACE FUNCTION public.household_partner_totals()
RETURNS TABLE (
  partner_total_assets NUMERIC,
  partner_total_debts NUMERIC,
  partner_net_worth NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_household AS (
    SELECT household_id FROM household_members WHERE user_id = auth.uid() LIMIT 1
  ),
  partner AS (
    SELECT hm.user_id
    FROM household_members hm
    JOIN my_household mh ON hm.household_id = mh.household_id
    WHERE hm.user_id != auth.uid()
    LIMIT 1
  ),
  gated AS (
    SELECT
      p.user_id,
      get_partner_privacy_level((SELECT household_id FROM my_household), p.user_id, 'assets') AS lvl_assets,
      get_partner_privacy_level((SELECT household_id FROM my_household), p.user_id, 'debts')  AS lvl_debts,
      -- 'hidden' => 0; 'full'/'totals' => echte som (equivalent voor scalar-totaal).
      CASE WHEN get_partner_privacy_level((SELECT household_id FROM my_household), p.user_id, 'assets') = 'hidden'
        THEN 0
        ELSE COALESCE((SELECT SUM(a.current_value) FROM assets a WHERE a.user_id = p.user_id AND a.is_active = true AND a.ownership = 'personal'), 0)
      END AS assets_val,
      CASE WHEN get_partner_privacy_level((SELECT household_id FROM my_household), p.user_id, 'debts') = 'hidden'
        THEN 0
        ELSE COALESCE((SELECT SUM(d.current_balance) FROM debts d WHERE d.user_id = p.user_id AND d.is_active = true AND d.ownership = 'personal'), 0)
      END AS debts_val
    FROM partner p
  )
  SELECT
    g.assets_val AS partner_total_assets,
    g.debts_val  AS partner_total_debts,
    g.assets_val - g.debts_val AS partner_net_worth
  FROM gated g;
$$;

COMMENT ON FUNCTION public.household_partner_totals() IS
  'Privacy-afdwingende partner-totalen: gate''t assets/debts per categorie via get_partner_privacy_level (''hidden'' => 0). Consumenten hoeven niet meer zelf te gaten.';
