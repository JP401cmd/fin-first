-- Fix: Remove explicit ensure_companion_cash_asset() call from save_onboarding_data.
-- The BEFORE INSERT trigger trg_bank_account_auto_cash_asset already creates a
-- companion cash asset for every bank account insert. Calling ensure_companion_cash_asset
-- on top of that causes double cash assets per bank account during onboarding.
--
-- This migration re-declares only the relevant portion by replacing the function body.

CREATE OR REPLACE FUNCTION public.save_onboarding_data(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid;
  v_identity      jsonb;
  v_budget_amounts jsonb;
  v_widget_prefs  jsonb;
  v_bank_accounts jsonb;
  v_assets        jsonb;
  v_debts         jsonb;
  v_horizon       jsonb;
  v_active_modules text[];
  v_budgettering_mode text;
  v_news_description text;
  v_idempotency_key text;
  v_existing_key  text;
  v_bank_id       uuid;
  v_bank_rec      record;
  v_asset_rec     record;
  v_debt_rec      record;
  v_child_rec     record;
  v_parent_slug   text;
  v_parent_id     uuid;
  v_monthly_income numeric;
  v_sort          int;
BEGIN
  -- Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Extract payload
  v_identity       := p_payload->'identity';
  v_budget_amounts := COALESCE(p_payload->'budgetAmounts', '{}'::jsonb);
  v_widget_prefs   := COALESCE(p_payload->'widgetPrefs', '{}'::jsonb);
  v_bank_accounts  := COALESCE(p_payload->'bankAccounts', '[]'::jsonb);
  v_assets         := COALESCE(p_payload->'assets', '[]'::jsonb);
  v_debts          := COALESCE(p_payload->'debts', '[]'::jsonb);
  v_horizon        := p_payload->'horizon';
  v_active_modules := ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'activeModules', '[]'::jsonb)));
  v_budgettering_mode := COALESCE(p_payload->>'budgetteringMode', 'none');
  v_news_description  := p_payload->>'newsDescription';
  v_idempotency_key   := p_payload->>'idempotencyKey';

  -- Idempotency check
  IF v_idempotency_key IS NOT NULL THEN
    SELECT onboarding_idempotency_key INTO v_existing_key
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_existing_key IS NOT NULL AND v_existing_key = v_idempotency_key THEN
      RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'duplicate idempotency key');
    END IF;
  END IF;

  -- Monthly income for budget calculations
  v_monthly_income := COALESCE((v_identity->>'net_monthly_income')::numeric, 0);

  -- 1. Update profile
  UPDATE public.profiles SET
    full_name                = COALESCE(v_identity->>'full_name', full_name),
    date_of_birth            = COALESCE((v_identity->>'date_of_birth')::date, date_of_birth),
    household_type           = COALESCE(v_identity->>'household_type', household_type),
    number_of_children       = COALESCE((v_identity->>'number_of_children')::int, number_of_children),
    net_monthly_income       = COALESCE((v_identity->>'net_monthly_income')::numeric, net_monthly_income),
    estimated_monthly_expenses = COALESCE((v_identity->>'estimated_monthly_expenses')::numeric, estimated_monthly_expenses),
    budgettering_mode        = v_budgettering_mode,
    widget_prefs             = COALESCE(v_widget_prefs, widget_prefs),
    active_modules           = CASE WHEN array_length(v_active_modules, 1) > 0 THEN v_active_modules ELSE active_modules END,
    news_description         = COALESCE(v_news_description, news_description),
    fire_end_strategy        = COALESCE(v_horizon->>'fire_end_strategy', fire_end_strategy),
    fire_end_age             = COALESCE((v_horizon->>'fire_end_age')::int, fire_end_age),
    fire_legacy_amount       = COALESCE((v_horizon->>'fire_legacy_amount')::numeric, fire_legacy_amount),
    retirement_expense_method = COALESCE(v_horizon->>'retirement_expense_method', retirement_expense_method),
    retirement_custom_amount = COALESCE((v_horizon->>'retirement_custom_amount')::numeric, retirement_custom_amount),
    temporal_balance         = COALESCE((v_horizon->>'temporal_balance')::int, temporal_balance),
    onboarding_completed     = true,
    onboarding_completed_at  = now(),
    onboarding_idempotency_key = v_idempotency_key,
    updated_at               = now()
  WHERE id = v_user_id;

  -- 2-5. Budgets (unchanged logic — parent + child budget rows)
  DELETE FROM public.budgets WHERE user_id = v_user_id;

  v_sort := 0;
  FOR v_parent_slug IN
    SELECT DISTINCT split_part(key, '.', 1)
    FROM jsonb_each_text(v_budget_amounts)
    WHERE key NOT LIKE '%.%'
    ORDER BY 1
  LOOP
    v_sort := v_sort + 1;
    INSERT INTO public.budgets (user_id, name, slug, monthly_limit, sort_order, is_parent)
    VALUES (
      v_user_id,
      v_parent_slug,
      v_parent_slug,
      COALESCE((v_budget_amounts->>v_parent_slug)::numeric, 0),
      v_sort,
      true
    )
    RETURNING id INTO v_parent_id;

    FOR v_child_rec IN
      SELECT key, value
      FROM jsonb_each(v_budget_amounts)
      WHERE key LIKE v_parent_slug || '.%'
      ORDER BY key
    LOOP
      INSERT INTO public.budgets (user_id, name, slug, monthly_limit, sort_order, parent_id, is_parent)
      VALUES (
        v_user_id,
        split_part(v_child_rec.key, '.', 2),
        v_child_rec.key,
        COALESCE((v_child_rec.value#>>'{}')::numeric, 0),
        COALESCE((v_child_rec.value->>'sort_order')::int, 0),
        v_parent_id,
        false
      );
    END LOOP;
  END LOOP;

  -- 6. Bank accounts
  -- Delete onboarding-created bank accounts and their companion cash assets first
  DELETE FROM public.bank_accounts WHERE user_id = v_user_id AND iban = '';
  DELETE FROM public.assets WHERE user_id = v_user_id AND asset_type = 'cash';

  FOR v_bank_rec IN SELECT * FROM jsonb_array_elements(v_bank_accounts)
  LOOP
    INSERT INTO public.bank_accounts (
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

    -- NOTE: The BEFORE INSERT trigger trg_bank_account_auto_cash_asset
    -- already creates a companion cash asset. Do NOT call
    -- ensure_companion_cash_asset here — that caused double cash assets.
  END LOOP;

  -- 7. Non-cash assets
  IF jsonb_array_length(v_assets) > 0 THEN
    DELETE FROM public.assets WHERE user_id = v_user_id AND asset_type <> 'cash';

    FOR v_asset_rec IN SELECT * FROM jsonb_array_elements(v_assets)
    LOOP
      INSERT INTO public.assets (
        user_id, name, asset_type, current_value, purchase_value,
        purchase_date, expected_return, monthly_contribution,
        institution, is_active, sort_order,
        subtype, risk_profile, tax_benefit, is_liquid,
        net_worth_inclusion_pct
      ) VALUES (
        v_user_id,
        v_asset_rec.value->>'name',
        COALESCE(v_asset_rec.value->>'asset_type', 'other'),
        COALESCE((v_asset_rec.value->>'current_value')::numeric, 0),
        COALESCE((v_asset_rec.value->>'purchase_value')::numeric, 0),
        (v_asset_rec.value->>'purchase_date')::date,
        COALESCE((v_asset_rec.value->>'expected_return')::numeric, 0),
        COALESCE((v_asset_rec.value->>'monthly_contribution')::numeric, 0),
        v_asset_rec.value->>'institution',
        COALESCE((v_asset_rec.value->>'is_active')::boolean, true),
        COALESCE((v_asset_rec.value->>'sort_order')::int, 0),
        v_asset_rec.value->>'subtype',
        v_asset_rec.value->>'risk_profile',
        v_asset_rec.value->>'tax_benefit',
        COALESCE((v_asset_rec.value->>'is_liquid')::boolean, true),
        COALESCE((v_asset_rec.value->>'net_worth_inclusion_pct')::numeric, 100)
      );
    END LOOP;
  END IF;

  -- 8. Debts
  IF jsonb_array_length(v_debts) > 0 THEN
    DELETE FROM public.debts WHERE user_id = v_user_id;

    FOR v_debt_rec IN SELECT * FROM jsonb_array_elements(v_debts)
    LOOP
      INSERT INTO public.debts (
        user_id, name, debt_type, current_balance, original_amount,
        interest_rate, monthly_payment, start_date,
        institution, is_active, sort_order,
        net_worth_inclusion_pct
      ) VALUES (
        v_user_id,
        v_debt_rec.value->>'name',
        COALESCE(v_debt_rec.value->>'debt_type', 'personal_loan'),
        COALESCE((v_debt_rec.value->>'current_balance')::numeric, 0),
        COALESCE((v_debt_rec.value->>'original_amount')::numeric, 0),
        COALESCE((v_debt_rec.value->>'interest_rate')::numeric, 0),
        COALESCE((v_debt_rec.value->>'monthly_payment')::numeric, 0),
        (v_debt_rec.value->>'start_date')::date,
        v_debt_rec.value->>'institution',
        COALESCE((v_debt_rec.value->>'is_active')::boolean, true),
        COALESCE((v_debt_rec.value->>'sort_order')::int, 0),
        COALESCE((v_debt_rec.value->>'net_worth_inclusion_pct')::numeric, 100)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
