-- Atomic onboarding save: wraps all inserts in a single transaction.
-- If ANY step fails, the entire save is rolled back — no partial data.
--
-- Accepts a JSONB blob with all onboarding data and performs:
-- 1. Idempotency check (onboarding_completed or idempotency_key)
-- 2. Profile upsert
-- 3. Budget delete + parent/child insert
-- 4. Bank account insert (with companion cash assets)
-- 5. Asset insert
-- 6. Debt insert
-- 7. AOW life event insert
-- 8. Mark onboarding_completed = true

CREATE OR REPLACE FUNCTION save_onboarding_data(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_idempotency_key TEXT;
  v_profile JSONB;
  v_budget_amounts JSONB;
  v_budgettering_mode TEXT;
  v_parent_rows JSONB;
  v_child_rows JSONB;
  v_bank_accounts JSONB;
  v_assets JSONB;
  v_debts JSONB;
  v_widget_prefs JSONB;
  v_aow_target_age INT;
  v_aow_monthly NUMERIC;
  v_parent_rec RECORD;
  v_child_rec RECORD;
  v_parent_id UUID;
  v_bank_rec RECORD;
  v_asset_rec RECORD;
  v_debt_rec RECORD;
  v_bank_id UUID;
  v_existing_completed BOOLEAN;
  v_existing_key TEXT;
BEGIN
  -- Extract user_id from auth context
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized', 'status', 401);
  END IF;

  -- Extract payload fields
  v_idempotency_key := payload->>'idempotency_key';
  v_profile := payload->'profile';
  v_budget_amounts := COALESCE(payload->'budget_amounts', '{}'::jsonb);
  v_budgettering_mode := COALESCE(payload->>'budgettering_mode', 'manual');
  v_parent_rows := COALESCE(payload->'parent_budgets', '[]'::jsonb);
  v_child_rows := COALESCE(payload->'child_budgets', '[]'::jsonb);
  v_bank_accounts := COALESCE(payload->'bank_accounts', '[]'::jsonb);
  v_assets := COALESCE(payload->'assets', '[]'::jsonb);
  v_debts := COALESCE(payload->'debts', '[]'::jsonb);
  v_widget_prefs := payload->'widget_prefs';
  v_aow_target_age := COALESCE((payload->>'aow_target_age')::int, 67);
  v_aow_monthly := COALESCE((payload->>'aow_monthly')::numeric, 1341);

  -- 1. Idempotency check: already completed?
  SELECT onboarding_completed, onboarding_idempotency_key
    INTO v_existing_completed, v_existing_key
    FROM profiles
   WHERE id = v_user_id;

  IF v_existing_completed = true THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  IF v_idempotency_key IS NOT NULL AND v_existing_key = v_idempotency_key THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  -- 2. Profile upsert (onboarding_completed = false first, set true at end)
  INSERT INTO profiles (
    id, full_name, date_of_birth, household_type, number_of_children,
    net_monthly_income, estimated_monthly_expenses,
    expected_return, inflation_rate,
    retirement_expense_method, retirement_expense_custom_amount,
    fire_end_strategy, fire_legacy_amount, fire_end_age,
    temporal_balance, widget_prefs,
    onboarding_completed, is_demo_user, budgeting_active,
    onboarding_idempotency_key, updated_at
  ) VALUES (
    v_user_id,
    v_profile->>'full_name',
    v_profile->>'date_of_birth',
    v_profile->>'household_type',
    COALESCE((v_profile->>'number_of_children')::int, 0),
    (v_profile->>'net_monthly_income')::numeric,
    (v_profile->>'estimated_monthly_expenses')::numeric,
    (v_profile->>'expected_return')::numeric,
    (v_profile->>'inflation_rate')::numeric,
    v_profile->>'retirement_expense_method',
    (v_profile->>'retirement_expense_custom_amount')::numeric,
    v_profile->>'fire_end_strategy',
    (v_profile->>'fire_legacy_amount')::numeric,
    (v_profile->>'fire_end_age')::int,
    (v_profile->>'temporal_balance')::int,
    v_widget_prefs,
    false,
    false,
    v_budgettering_mode <> 'none',
    v_idempotency_key,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    date_of_birth = EXCLUDED.date_of_birth,
    household_type = EXCLUDED.household_type,
    number_of_children = EXCLUDED.number_of_children,
    net_monthly_income = EXCLUDED.net_monthly_income,
    estimated_monthly_expenses = EXCLUDED.estimated_monthly_expenses,
    expected_return = COALESCE(EXCLUDED.expected_return, profiles.expected_return),
    inflation_rate = COALESCE(EXCLUDED.inflation_rate, profiles.inflation_rate),
    retirement_expense_method = COALESCE(EXCLUDED.retirement_expense_method, profiles.retirement_expense_method),
    retirement_expense_custom_amount = COALESCE(EXCLUDED.retirement_expense_custom_amount, profiles.retirement_expense_custom_amount),
    fire_end_strategy = COALESCE(EXCLUDED.fire_end_strategy, profiles.fire_end_strategy),
    fire_legacy_amount = COALESCE(EXCLUDED.fire_legacy_amount, profiles.fire_legacy_amount),
    fire_end_age = COALESCE(EXCLUDED.fire_end_age, profiles.fire_end_age),
    temporal_balance = COALESCE(EXCLUDED.temporal_balance, profiles.temporal_balance),
    widget_prefs = COALESCE(EXCLUDED.widget_prefs, profiles.widget_prefs),
    onboarding_completed = false,
    is_demo_user = false,
    budgeting_active = EXCLUDED.budgeting_active,
    onboarding_idempotency_key = EXCLUDED.onboarding_idempotency_key,
    updated_at = now();

  -- 3. Delete existing budgets (clean slate for onboarding)
  DELETE FROM budgets WHERE user_id = v_user_id;

  -- 4. Insert parent budgets
  FOR v_parent_rec IN SELECT * FROM jsonb_array_elements(v_parent_rows)
  LOOP
    INSERT INTO budgets (
      user_id, parent_id, name, slug, icon, description,
      default_limit, budget_type, interval, rollover_type,
      limit_type, alert_threshold, max_single_transaction_amount,
      is_essential, priority_score, is_inflation_indexed, sort_order
    ) VALUES (
      v_user_id,
      NULL,
      v_parent_rec.value->>'name',
      v_parent_rec.value->>'slug',
      v_parent_rec.value->>'icon',
      v_parent_rec.value->>'description',
      (v_parent_rec.value->>'default_limit')::numeric,
      v_parent_rec.value->>'budget_type',
      COALESCE(v_parent_rec.value->>'interval', 'monthly'),
      COALESCE(v_parent_rec.value->>'rollover_type', 'reset'),
      COALESCE(v_parent_rec.value->>'limit_type', 'soft'),
      COALESCE((v_parent_rec.value->>'alert_threshold')::int, 80),
      (v_parent_rec.value->>'max_single_transaction_amount')::numeric,
      COALESCE((v_parent_rec.value->>'is_essential')::boolean, false),
      COALESCE((v_parent_rec.value->>'priority_score')::int, 0),
      false,
      COALESCE((v_parent_rec.value->>'sort_order')::int, 0)
    );
  END LOOP;

  -- 5. Insert child budgets (need parent_id lookup by slug)
  FOR v_child_rec IN SELECT * FROM jsonb_array_elements(v_child_rows)
  LOOP
    SELECT id INTO v_parent_id
      FROM budgets
     WHERE user_id = v_user_id
       AND slug = v_child_rec.value->>'parent_slug'
       AND parent_id IS NULL
     LIMIT 1;

    IF v_parent_id IS NOT NULL THEN
      INSERT INTO budgets (
        user_id, parent_id, name, slug, icon, description,
        default_limit, budget_type, interval, rollover_type,
        limit_type, alert_threshold, max_single_transaction_amount,
        is_essential, priority_score, is_inflation_indexed, sort_order
      ) VALUES (
        v_user_id,
        v_parent_id,
        v_child_rec.value->>'name',
        v_child_rec.value->>'slug',
        v_child_rec.value->>'icon',
        v_child_rec.value->>'description',
        (v_child_rec.value->>'default_limit')::numeric,
        v_child_rec.value->>'budget_type',
        COALESCE(v_child_rec.value->>'interval', 'monthly'),
        COALESCE(v_child_rec.value->>'rollover_type', 'reset'),
        COALESCE(v_child_rec.value->>'limit_type', 'soft'),
        COALESCE((v_child_rec.value->>'alert_threshold')::int, 80),
        (v_child_rec.value->>'max_single_transaction_amount')::numeric,
        COALESCE((v_child_rec.value->>'is_essential')::boolean, false),
        COALESCE((v_child_rec.value->>'priority_score')::int, 0),
        false,
        COALESCE((v_child_rec.value->>'sort_order')::int, 0)
      );
    END IF;
  END LOOP;

  -- 6. Bank accounts (delete onboarding-created ones first)
  DELETE FROM bank_accounts WHERE user_id = v_user_id AND iban = '';
  DELETE FROM assets WHERE user_id = v_user_id AND asset_type = 'cash';

  FOR v_bank_rec IN SELECT * FROM jsonb_array_elements(v_bank_accounts)
  LOOP
    INSERT INTO bank_accounts (
      user_id, name, bank_name, account_type, balance, iban, is_active, sort_order
    ) VALUES (
      v_user_id,
      v_bank_rec.value->>'name',
      v_bank_rec.value->>'bank_name',
      v_bank_rec.value->>'account_type',
      (v_bank_rec.value->>'balance')::numeric,
      '',
      true,
      COALESCE((v_bank_rec.value->>'sort_order')::int, 0)
    )
    RETURNING id INTO v_bank_id;

    -- Companion cash asset for each bank account
    INSERT INTO assets (
      user_id, name, asset_type, current_value, purchase_value,
      purchase_date, expected_return, monthly_contribution,
      is_active, sort_order, linked_bank_account_id
    ) VALUES (
      v_user_id,
      v_bank_rec.value->>'name',
      'cash',
      (v_bank_rec.value->>'balance')::numeric,
      (v_bank_rec.value->>'balance')::numeric,
      CURRENT_DATE,
      0,
      0,
      true,
      COALESCE((v_bank_rec.value->>'sort_order')::int, 0),
      v_bank_id
    );
  END LOOP;

  -- 7. Assets (delete existing user assets if new ones provided)
  IF jsonb_array_length(v_assets) > 0 THEN
    DELETE FROM assets WHERE user_id = v_user_id AND asset_type <> 'cash';

    FOR v_asset_rec IN SELECT * FROM jsonb_array_elements(v_assets)
    LOOP
      INSERT INTO assets (
        user_id, name, asset_type, current_value, purchase_value,
        purchase_date, expected_return, monthly_contribution,
        institution, is_active, sort_order,
        subtype, risk_profile, tax_benefit, is_liquid,
        lock_end_date, ticker_symbol, rental_income, woz_value,
        retirement_provider_type, depreciation_rate,
        address_postcode, address_house_number
      ) VALUES (
        v_user_id,
        v_asset_rec.value->>'name',
        v_asset_rec.value->>'asset_type',
        (v_asset_rec.value->>'current_value')::numeric,
        COALESCE((v_asset_rec.value->>'purchase_value')::numeric, (v_asset_rec.value->>'current_value')::numeric),
        CURRENT_DATE,
        COALESCE((v_asset_rec.value->>'expected_return')::numeric, 0),
        COALESCE((v_asset_rec.value->>'monthly_contribution')::numeric, 0),
        v_asset_rec.value->>'institution',
        true,
        COALESCE((v_asset_rec.value->>'sort_order')::int, 0),
        v_asset_rec.value->>'subtype',
        v_asset_rec.value->>'risk_profile',
        (v_asset_rec.value->>'tax_benefit')::boolean,
        (v_asset_rec.value->>'is_liquid')::boolean,
        (v_asset_rec.value->>'lock_end_date')::date,
        v_asset_rec.value->>'ticker_symbol',
        (v_asset_rec.value->>'rental_income')::numeric,
        (v_asset_rec.value->>'woz_value')::numeric,
        v_asset_rec.value->>'retirement_provider_type',
        (v_asset_rec.value->>'depreciation_rate')::numeric,
        v_asset_rec.value->>'address_postcode',
        v_asset_rec.value->>'address_house_number'
      );
    END LOOP;
  END IF;

  -- 8. Debts (delete existing if new ones provided)
  IF jsonb_array_length(v_debts) > 0 THEN
    DELETE FROM debts WHERE user_id = v_user_id;

    FOR v_debt_rec IN SELECT * FROM jsonb_array_elements(v_debts)
    LOOP
      INSERT INTO debts (
        user_id, name, debt_type, original_amount, current_balance,
        interest_rate, minimum_payment, monthly_payment,
        start_date, creditor, is_active, sort_order,
        subtype, repayment_type, is_tax_deductible,
        fixed_rate_end_date, nhg, credit_limit, draagkrachtmeting_date
      ) VALUES (
        v_user_id,
        v_debt_rec.value->>'name',
        v_debt_rec.value->>'debt_type',
        COALESCE((v_debt_rec.value->>'original_amount')::numeric, (v_debt_rec.value->>'current_balance')::numeric),
        (v_debt_rec.value->>'current_balance')::numeric,
        COALESCE((v_debt_rec.value->>'interest_rate')::numeric, 0),
        COALESCE((v_debt_rec.value->>'minimum_payment')::numeric, (v_debt_rec.value->>'monthly_payment')::numeric),
        COALESCE((v_debt_rec.value->>'monthly_payment')::numeric, 0),
        CURRENT_DATE,
        v_debt_rec.value->>'creditor',
        true,
        COALESCE((v_debt_rec.value->>'sort_order')::int, 0),
        v_debt_rec.value->>'subtype',
        v_debt_rec.value->>'repayment_type',
        (v_debt_rec.value->>'is_tax_deductible')::boolean,
        (v_debt_rec.value->>'fixed_rate_end_date')::date,
        (v_debt_rec.value->>'nhg')::boolean,
        (v_debt_rec.value->>'credit_limit')::numeric,
        (v_debt_rec.value->>'draagkrachtmeting_date')::date
      );
    END LOOP;
  END IF;

  -- 9. AOW life event
  DELETE FROM life_events WHERE user_id = v_user_id AND event_type = 'aow';
  INSERT INTO life_events (
    user_id, name, event_type, target_age,
    monthly_income_change, monthly_cost_change, one_time_cost,
    duration_months, is_indexed, is_active, icon, sort_order, metadata
  ) VALUES (
    v_user_id, 'AOW', 'aow', v_aow_target_age,
    v_aow_monthly, 0, 0,
    0, true, true, 'Landmark', 0,
    '{"leefsituatie": "alleenstaand", "jarenBuitenNL": 0}'::jsonb
  );

  -- 10. Mark onboarding completed LAST
  UPDATE profiles
     SET onboarding_completed = true,
         updated_at = now()
   WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  -- Any error triggers automatic ROLLBACK of the entire transaction
  RETURN jsonb_build_object(
    'error', SQLERRM,
    'status', 500,
    'detail', SQLSTATE
  );
END;
$$;

-- Add idempotency key column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_idempotency_key TEXT;
