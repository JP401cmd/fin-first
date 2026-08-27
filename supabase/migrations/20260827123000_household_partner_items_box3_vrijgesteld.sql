-- M23 · household_partner_items: projecteer de Box 3-vrijstellingsoverschrijving
--
-- AANLEIDING
-- Migratie 20260827120000 voegt `assets.box3_vrijgesteld` +
-- `box3_vrijstelling_reden` toe, en `ASSET_CLIENT_COLUMNS` (lib/asset-data.ts)
-- groeit mee. Deze SECURITY DEFINER-RPC levert PARTNER-rijen aan de browser met
-- een EXPLICIETE kolomprojectie — bewust geen `to_jsonb(rij)`, zodat een nieuwe
-- kolom nooit vanzelf naar de partner lekt. Een nieuwe kolom erin is dus per
-- constructie een expliciet besluit; dit bestand is dat besluit.
--
-- HET BESLUIT: beide kolommen worden geprojecteerd.
--   • `box3_vrijgesteld` is NODIG voor een juiste huishoud-Box 3. Zonder deze
--     kolom classificeert `loadPerspectiveBox3` de bezittingen van de partner
--     puur op afleiding, terwijl de partner zelf zijn overschrijving wél ziet —
--     dan tonen twee schermen een andere heffing over dezelfde bezitting.
--   • `box3_vrijstelling_reden` is door de gebruiker geschreven vrije tekst,
--     maar van dezelfde klasse als `notes` — dat al in deze projectie zit — en
--     staat naast een bezitting waarvan de naam en waarde toch al zichtbaar
--     zijn. De reden is precies de uitleg die het scherm bij de uitsluiting
--     toont; hem weglaten zou de partner een uitkomst zonder verklaring geven.
--
-- WAT VERDER ONVERANDERD BLIJFT: signatuur, LANGUAGE plpgsql, STABLE,
-- SECURITY DEFINER, SET search_path TO 'public', de privacy-niveaus, de
-- aggregatie-tak, en de uitsluiting van account_number / account_number_encrypted
-- / account_number_hash / linked_bank_account_id.
--
-- De functie wordt in z'n geheel opnieuw gedefinieerd (CREATE OR REPLACE): de
-- vorige migratie blijft ongewijzigd staan als historie.

CREATE OR REPLACE FUNCTION public.household_partner_items(p_category text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_household uuid;
  v_partner uuid;
  v_level text;
  v_result jsonb;
  v_priv_cat text;
BEGIN
  IF p_category NOT IN ('assets','debts','budgets','transactions','income') THEN
    RETURN '[]'::jsonb;
  END IF;

  v_household := user_household_id();
  IF v_household IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT hm.user_id INTO v_partner
  FROM household_members hm
  WHERE hm.household_id = v_household AND hm.user_id <> auth.uid()
  LIMIT 1;
  IF v_partner IS NULL THEN RETURN '[]'::jsonb; END IF;

  -- Privacy category: 'income' has its own privacy switch.
  v_priv_cat := p_category;
  v_level := get_partner_privacy_level(v_household, v_partner, v_priv_cat);
  IF v_level = 'hidden' THEN RETURN '[]'::jsonb; END IF;

  IF p_category = 'assets' THEN
    IF v_level = 'full' THEN
      -- Expliciete projectie == ASSET_CLIENT_COLUMNS (lib/asset-data.ts).
      -- BEWUST NIET: account_number, account_number_encrypted,
      -- account_number_hash, linked_bank_account_id.
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'user_id', a.user_id,
        'name', a.name,
        'asset_type', a.asset_type,
        'current_value', a.current_value,
        'purchase_value', a.purchase_value,
        'purchase_date', a.purchase_date,
        'expected_return', a.expected_return,
        'monthly_contribution', a.monthly_contribution,
        'institution', a.institution,
        'notes', a.notes,
        'is_active', a.is_active,
        'sort_order', a.sort_order,
        'created_at', a.created_at,
        'updated_at', a.updated_at,
        'subtype', a.subtype,
        'risk_profile', a.risk_profile,
        'tax_benefit', a.tax_benefit,
        'is_liquid', a.is_liquid,
        'lock_end_date', a.lock_end_date,
        'ticker_symbol', a.ticker_symbol,
        'rental_income', a.rental_income,
        'woz_value', a.woz_value,
        'retirement_provider_type', a.retirement_provider_type,
        'depreciation_rate', a.depreciation_rate,
        'address_postcode', a.address_postcode,
        'address_house_number', a.address_house_number,
        'kvk_number', a.kvk_number,
        'ownership_percentage', a.ownership_percentage,
        'annual_dividend', a.annual_dividend,
        'linked_asset_id', a.linked_asset_id,
        'ownership', a.ownership,
        'household_id', a.household_id,
        'net_worth_inclusion_pct', a.net_worth_inclusion_pct,
        'sale_config', a.sale_config,
        'has_budget_tracking', a.has_budget_tracking,
        'has_holdings_tracking', a.has_holdings_tracking,
        'has_woonbalans_tracking', a.has_woonbalans_tracking,
        'has_rental_tracking', a.has_rental_tracking,
        'monthly_maintenance_cost', a.monthly_maintenance_cost,
        'vva_fee', a.vva_fee,
        'vacancy_log', a.vacancy_log,
        'source', a.source,
        'imported_peildatum', a.imported_peildatum,
        -- M23: Box 3-vrijstellingsoverschrijving. Zie de kop van dit bestand
        -- voor waaróm deze twee wél naar de partner gaan.
        'box3_vrijgesteld', a.box3_vrijgesteld,
        'box3_vrijstelling_reden', a.box3_vrijstelling_reden
      )), '[]'::jsonb) INTO v_result
      FROM assets a
      WHERE a.user_id = v_partner AND a.ownership = 'personal' AND a.is_active = true;
    ELSE
      SELECT jsonb_build_array(jsonb_build_object(
        'id','aggregated_partner_assets','name','Partner vermogen (totaal)',
        'current_value', coalesce(sum(a.current_value),0),
        'ownership','personal','user_id',v_partner,'is_active',true,
        '_aggregated',true,'_aggregatedCount',count(*)
      )) INTO v_result
      FROM assets a
      WHERE a.user_id = v_partner AND a.ownership = 'personal' AND a.is_active = true;
    END IF;

  ELSIF p_category = 'debts' THEN
    IF v_level = 'full' THEN
      -- Volledige, maar EXPLICIETE kolomlijst: geen wildcard die met het schema
      -- meegroeit. Nieuwe kolom => bewuste keuze om 'm hier toe te voegen.
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id,
        'user_id', d.user_id,
        'name', d.name,
        'debt_type', d.debt_type,
        'original_amount', d.original_amount,
        'current_balance', d.current_balance,
        'interest_rate', d.interest_rate,
        'minimum_payment', d.minimum_payment,
        'monthly_payment', d.monthly_payment,
        'start_date', d.start_date,
        'end_date', d.end_date,
        'creditor', d.creditor,
        'notes', d.notes,
        'is_active', d.is_active,
        'sort_order', d.sort_order,
        'created_at', d.created_at,
        'updated_at', d.updated_at,
        'subtype', d.subtype,
        'is_tax_deductible', d.is_tax_deductible,
        'fixed_rate_end_date', d.fixed_rate_end_date,
        'nhg', d.nhg,
        'linked_asset_id', d.linked_asset_id,
        'credit_limit', d.credit_limit,
        'repayment_type', d.repayment_type,
        'draagkrachtmeting_date', d.draagkrachtmeting_date,
        'ownership', d.ownership,
        'household_id', d.household_id,
        'net_worth_inclusion_pct', d.net_worth_inclusion_pct,
        'remaining_term_months', d.remaining_term_months,
        'tax_year', d.tax_year,
        'has_payment_plan', d.has_payment_plan,
        'has_written_agreement', d.has_written_agreement,
        'partner_split_pct', d.partner_split_pct,
        'source', d.source,
        'include_aflossing_in_savings', d.include_aflossing_in_savings,
        'custom_aflossing_amount', d.custom_aflossing_amount,
        'imported_peildatum', d.imported_peildatum,
        'has_hypotheekplanner_tracking', d.has_hypotheekplanner_tracking,
        'hypotheekplanner_strategy', d.hypotheekplanner_strategy
      )), '[]'::jsonb) INTO v_result
      FROM debts d
      WHERE d.user_id = v_partner AND d.ownership = 'personal' AND d.is_active = true;
    ELSE
      SELECT jsonb_build_array(jsonb_build_object(
        'id','aggregated_partner_debts','name','Partner schulden (totaal)',
        'current_balance', coalesce(sum(d.current_balance),0),
        'ownership','personal','user_id',v_partner,'is_active',true,
        '_aggregated',true,'_aggregatedCount',count(*)
      )) INTO v_result
      FROM debts d
      WHERE d.user_id = v_partner AND d.ownership = 'personal' AND d.is_active = true;
    END IF;

  ELSIF p_category = 'budgets' THEN
    IF v_level = 'full' THEN
      -- Volledige, maar EXPLICIETE kolomlijst (zie debts).
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'user_id', b.user_id,
        'parent_id', b.parent_id,
        'name', b.name,
        'icon', b.icon,
        'description', b.description,
        'default_limit', b.default_limit,
        'interval', b.interval,
        'rollover_type', b.rollover_type,
        'limit_type', b.limit_type,
        'alert_threshold', b.alert_threshold,
        'max_single_transaction_amount', b.max_single_transaction_amount,
        'is_essential', b.is_essential,
        'priority_score', b.priority_score,
        'is_inflation_indexed', b.is_inflation_indexed,
        'sort_order', b.sort_order,
        'created_at', b.created_at,
        'updated_at', b.updated_at,
        'budget_type', b.budget_type,
        'slug', b.slug,
        'ownership', b.ownership,
        'household_id', b.household_id,
        'is_archived', b.is_archived,
        'goal_type', b.goal_type,
        'goal_amount', b.goal_amount,
        'goal_date', b.goal_date,
        'goal_frequency', b.goal_frequency,
        'is_favorite', b.is_favorite,
        'merged_into', b.merged_into
      )), '[]'::jsonb) INTO v_result
      FROM budgets b
      WHERE b.user_id = v_partner AND b.ownership = 'personal';
    ELSE
      SELECT jsonb_build_array(jsonb_build_object(
        'id','aggregated_partner_budgets','name','Partner budget (totaal)',
        'default_limit', coalesce(sum(b.default_limit),0),
        'ownership','personal','user_id',v_partner,
        '_aggregated',true,'_aggregatedCount',count(*)
      )) INTO v_result
      FROM budgets b
      WHERE b.user_id = v_partner AND b.ownership = 'personal';
    END IF;

  ELSIF p_category = 'transactions' THEN
    IF v_level = 'full' THEN
      -- Itemized partner-personal transactions (trailing 13 months for cashflow window).
      -- Projectie == de kolomlijst die perspective-loader voor de EIGEN
      -- transacties opvraagt; partnerrijen belanden in dezelfde array.
      -- BEWUST NIET: import_hash, running_balance, notes, reference, bank_code,
      -- bank_seq, creditor_id, linked_transfer_id, category_source, currency,
      -- fx_amount, fx_currency, fx_rate, source, household_id, created_at,
      -- updated_at.
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'date', t.date,
        'amount', t.amount,
        'description', t.description,
        'counterparty_name', t.counterparty_name,
        'counterparty_iban', t.counterparty_iban,
        'budget_id', t.budget_id,
        'account_id', t.account_id,
        'is_income', t.is_income,
        'transaction_type', t.transaction_type,
        'ownership', t.ownership,
        'user_id', t.user_id,
        'is_split', t.is_split
      )), '[]'::jsonb) INTO v_result
      FROM transactions t
      WHERE t.user_id = v_partner AND t.ownership = 'personal'
        AND t.date >= (CURRENT_DATE - INTERVAL '13 months');
    ELSE
      -- 'totals': aggregate expenses vs income so combined cashflow still nets out,
      -- without exposing individual lines.
      SELECT jsonb_build_array(jsonb_build_object(
        'id','aggregated_partner_transactions','ownership','personal','user_id',v_partner,
        '_aggregated',true,'_aggregatedCount',count(*),
        'total_income', coalesce(sum(t.amount) FILTER (WHERE t.is_income),0),
        'total_expense', coalesce(sum(t.amount) FILTER (WHERE NOT t.is_income),0)
      )) INTO v_result
      FROM transactions t
      WHERE t.user_id = v_partner AND t.ownership = 'personal'
        AND t.date >= (CURRENT_DATE - INTERVAL '13 months');
    END IF;

  ELSIF p_category = 'income' THEN
    -- Partner monthly income: trailing-12m transaction income / 12,
    -- falling back to income-budgets when no income transactions exist.
    DECLARE
      v_txn_income numeric;
      v_budget_income numeric;
      v_monthly numeric;
    BEGIN
      SELECT coalesce(sum(t.amount),0) INTO v_txn_income
      FROM transactions t
      WHERE t.user_id = v_partner AND t.is_income = true
        AND t.date >= (CURRENT_DATE - INTERVAL '12 months');

      SELECT coalesce(sum(b.default_limit),0) INTO v_budget_income
      FROM budgets b
      WHERE b.user_id = v_partner AND b.budget_type = 'income';

      v_monthly := CASE WHEN v_txn_income > 0 THEN v_txn_income / 12.0 ELSE v_budget_income END;

      v_result := jsonb_build_array(jsonb_build_object(
        'id','aggregated_partner_income','ownership','personal','user_id',v_partner,
        '_aggregated',true,'monthly_income', v_monthly
      ));
    END;
  END IF;

  RETURN coalesce(v_result, '[]'::jsonb);
END;
$function$;

COMMENT ON FUNCTION public.household_partner_items(text) IS
  'Privacy-gated partner-persoonlijke items (assets/debts/budgets/transactions/income). '
  'SECURITY DEFINER; privacy via get_partner_privacy_level(). Projecteert EXPLICIETE '
  'kolommen — nooit to_jsonb(rij): assets volgt ASSET_CLIENT_COLUMNS (geen account_number*), '
  'transactions volgt de kolomlijst van perspective-loader (geen import_hash/running_balance/notes).';

-- Toegang vastleggen: alleen ingelogde gebruikers en de service-role. anon en
-- PUBLIC krijgen niets (idempotent; dit was al de stand).
REVOKE ALL ON FUNCTION public.household_partner_items(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.household_partner_items(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.household_partner_items(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.household_partner_items(text) TO service_role;
