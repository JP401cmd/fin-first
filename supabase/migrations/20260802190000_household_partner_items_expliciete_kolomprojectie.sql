-- household_partner_items(): hele-rij-projectie vervangen door expliciete
-- kolomlijsten.
--
-- WAAROM
-- ------
-- `public.household_partner_items(p_category text)` is SECURITY DEFINER en
-- levert bij privacyniveau 'full' de PERSOONLIJKE items van de partner. Vier
-- takken deden dat met `to_jsonb(<alias>)` — de VOLLEDIGE rij. Het resultaat
-- gaat via `loadPerspectiveData` / `loadPerspectiveTransactions`
-- (lib/household/perspective-loader.ts) door naar clientcomponenten en dus de
-- browser. Daarmee lekte de functie stelselmatig meer partnerdata dan enig
-- scherm nodig heeft:
--
--   assets       • account_number            plaintext rekeningnummer van de
--                                            partner
--                • account_number_encrypted  ciphertext (browser kan er niets
--                                            mee; de sleutel is server-only)
--                • account_number_hash       blind index (HMAC-SHA256 onder een
--                                            server-only sleutel) = een STABIELE
--                                            correlatiesleutel op de partner
--                • linked_bank_account_id    interne koppeling, geen clientlezer
--
--   transactions • import_hash               dedup-hash over de bankregel =
--                                            correlatiesleutel per transactie
--                • running_balance           het saldoverloop van de rekening
--                                            van de partner, per regel
--                • notes / reference         vrije tekst van de partner
--                • bank_code / bank_seq      bank- en volgnummer-identificatie
--                • creditor_id, linked_transfer_id, category_source, currency,
--                  fx_amount, fx_currency, fx_rate, source, household_id,
--                  created_at, updated_at   — door geen enkele consument gelezen
--
-- Dit is dezelfde faalklasse als het `select('*')`-lek op `assets` in de
-- clientlezers (zie ASSET_CLIENT_COLUMNS in lib/asset-data.ts): een wildcard
-- die stilzwijgend meegroeit met het schema. Een kolom die morgen wordt
-- toegevoegd, lekt dan vanzelf mee.
--
-- WAT WIJZIGT (en wat NIET)
-- -------------------------
-- ALLEEN de projectie. Ongewijzigd overgenomen, letterlijk:
--   • de categorie-whitelist (assets/debts/budgets/transactions/income)
--   • user_household_id() + de partner-lookup
--   • get_partner_privacy_level() en de 'hidden'-kortsluiting
--   • ELKE WHERE-clausule (ownership='personal', is_active, de 13-/12-maands
--     vensters) — onaangeraakt gekopieerd; deze functie draait met verhoogde
--     rechten, dus een tikfout in een WHERE is een direct lek
--   • de 'totals'-aggregaten en de 'income'-tak (bouwden hun object al
--     expliciet op)
--   • signatuur, LANGUAGE plpgsql, STABLE, SECURITY DEFINER,
--     SET search_path TO 'public'
--
-- KOLOMKEUZE per categorie
-- ------------------------
--   assets       één-op-één ASSET_CLIENT_COLUMNS (lib/asset-data.ts). Dat is de
--                al gecureerde, getoetste lijst voor "wat mag een browser van
--                een asset zien"; partneritems horen daar niet ruimer te zijn
--                dan eigen items. Drie kolommen minder + linked_bank_account_id.
--   transactions één-op-één de kolomlijst die perspective-loader al voor de
--                EIGEN transacties opvraagt. Partnerrijen worden in dezelfde
--                array gemengd en naar hetzelfde type gecast, dus alles daar-
--                buiten is per definitie ongebruikt. 17 kolommen minder.
--   debts        volledige kolomlijst, expliciet uitgeschreven. Geen enkele
--                debt-kolom is ciphertext/blind index of correlatiemateriaal,
--                en de schulden-UI (kaart + detail + hypotheekplanner) leest
--                het hele Debt-contract. Winst hier is dus niet minder data
--                vandaag, maar dat een TOEKOMSTIGE kolom bewust toegevoegd
--                moet worden i.p.v. automatisch mee te lekken.
--   budgets      idem: volledige lijst, expliciet.
--
-- Retourvorm blijft een jsonb-array van objecten met exact dezelfde sleutels
-- minus de hierboven genoemde. Geen consument leest een weggelaten sleutel —
-- geverifieerd tegen lib/household/perspective-loader.ts en de loaders die
-- daarop zitten (core/horizon/assets/cashflow/lever-scores/household-tax).
--
-- CREATE OR REPLACE (géén DROP): bestaande grants blijven staan. De REVOKE's
-- onderaan zijn idempotent en leggen de huidige situatie vast (EXECUTE alleen
-- voor authenticated/service_role; anon en PUBLIC hebben niets).

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
        'imported_peildatum', a.imported_peildatum
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
