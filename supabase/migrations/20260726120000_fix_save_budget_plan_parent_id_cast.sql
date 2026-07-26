-- Fix WF-BUDGET-06 (S1): save_budget_plan crasht bij "deelbudget onder een
-- bestaand hoofdbudget".
--
-- Oorzaak: de "referenced parent_ids"-query deed
--   SELECT array_agg(DISTINCT (value)::uuid) INTO v_owned_count   -- v_owned_count INT
-- Dat levert een uuid[] op, dat PL/pgSQL impliciet via de tekstrepresentatie
-- naar het gedeclareerde INT-doeltype probeert te casten. Zodra to_insert /
-- to_update een echt parent_id bevatten (een deelbudget onder een BESTAAND
-- hoofdbudget), faalt de cast van de array-literal '{<uuid>}' naar integer met
-- exact de gemelde fout: invalid input syntax for type integer: "{<uuid>}".
-- De hele transactie rolde daardoor terug (geen data-corruptie), maar de
-- gebruiker kon geen deelbudget toevoegen via de planeditor.
--
-- Deze query was bovendien een dode no-op: het resultaat werd nergens gebruikt,
-- terwijl het oorspronkelijke commentaar aannam dat de FK-constraint impliciet
-- ownership zou valideren. Dat klopt niet: save_budget_plan is SECURITY DEFINER
-- (RLS geldt hier niet) en een kale FK toetst alleen dat het UUID *ergens* in
-- budgets bestaat, niet dat het bij de aanroeper hoort.
--
-- Fix:
--  1. Ken de uuid[] toe aan een apart UUID[]-gedeclareerde variabele
--     (v_parent_ids) — de cast-crash verdwijnt.
--  2. Maak er een ECHTE ownership-check van (analoog aan de update/delete-guards
--     hierboven): elk referenced parent_id moet van de aanroeper zijn OF een
--     'shared' huishoudbudget in het eigen huishouden (zodat een partner een
--     deelbudget onder een gedeeld hoofdbudget kan hangen — spiegelt
--     20260611000000_household_budget_shared_write.sql). Anders 403 met een
--     client-veilige tekst 'Forbidden (parent ids)'.
--
-- Backward-compatibel: signatuur, returns en payload-vorm zijn ongewijzigd;
-- geen client-wijziging nodig. Gebaseerd op de meest recente definitie in
-- 20260615000000_extend_save_budget_plan_detail_fields.sql.

CREATE OR REPLACE FUNCTION save_budget_plan(p_plan JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_to_insert JSONB;
  v_to_update JSONB;
  v_to_delete JSONB;
  v_amounts JSONB;
  v_rec RECORD;
  v_id_map JSONB := '{}'::jsonb;
  v_new_id UUID;
  v_resolved_parent UUID;
  v_first_of_month DATE;
  v_delete_ids UUID[];
  v_update_ids UUID[];
  v_amount_ids UUID[];
  v_parent_ids UUID[];
  v_owned_count INT;
  v_inserted INT := 0;
  v_updated INT := 0;
  v_deleted INT := 0;
  v_amounts_upserted INT := 0;
  v_rollovers_deleted INT := 0;
  v_amounts_deleted INT := 0;
  v_transactions_unlinked INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized', 'status', 401);
  END IF;

  v_to_insert := COALESCE(p_plan->'to_insert', '[]'::jsonb);
  v_to_update := COALESCE(p_plan->'to_update', '[]'::jsonb);
  v_to_delete := COALESCE(p_plan->'to_delete', '[]'::jsonb);
  v_amounts   := COALESCE(p_plan->'amounts',   '[]'::jsonb);
  v_first_of_month := date_trunc('month', now())::date;

  -- ── Ownership guards ────────────────────────────────────────────────
  SELECT array_agg((value)::uuid) INTO v_update_ids
    FROM jsonb_array_elements_text(
      (SELECT jsonb_agg(elem->>'id') FROM jsonb_array_elements(v_to_update) elem
       WHERE elem ? 'id')
    );
  IF v_update_ids IS NOT NULL AND array_length(v_update_ids, 1) > 0 THEN
    SELECT count(*) INTO v_owned_count
      FROM budgets WHERE id = ANY(v_update_ids) AND user_id = v_user_id;
    IF v_owned_count <> array_length(v_update_ids, 1) THEN
      RETURN jsonb_build_object('error', 'Forbidden (update ids)', 'status', 403);
    END IF;
  END IF;

  SELECT array_agg((value)::uuid) INTO v_delete_ids
    FROM jsonb_array_elements_text(v_to_delete);
  IF v_delete_ids IS NOT NULL AND array_length(v_delete_ids, 1) > 0 THEN
    SELECT count(*) INTO v_owned_count
      FROM budgets WHERE id = ANY(v_delete_ids) AND user_id = v_user_id;
    IF v_owned_count <> array_length(v_delete_ids, 1) THEN
      RETURN jsonb_build_object('error', 'Forbidden (delete ids)', 'status', 403);
    END IF;
  END IF;

  -- Referenced parent_ids in to_insert / to_update that are real UUIDs must be
  -- owned by the caller OR a 'shared' budget in the caller's household. The
  -- array is assigned to a UUID[] variable (not the INT v_owned_count) — that
  -- mismatch was the WF-BUDGET-06 cast-crash.
  SELECT array_agg(DISTINCT (value)::uuid) INTO v_parent_ids
    FROM (
      SELECT elem->>'parent_id' AS value FROM jsonb_array_elements(v_to_insert) elem
      UNION ALL
      SELECT elem->>'parent_id' FROM jsonb_array_elements(v_to_update) elem
    ) s
    WHERE value IS NOT NULL AND value ~ '^[0-9a-f-]{36}$';
  IF v_parent_ids IS NOT NULL AND array_length(v_parent_ids, 1) > 0 THEN
    SELECT count(*) INTO v_owned_count
      FROM budgets
     WHERE id = ANY(v_parent_ids)
       AND (
         user_id = v_user_id
         OR (ownership = 'shared' AND household_id IS NOT NULL
             AND household_id = user_household_id())
       );
    IF v_owned_count <> array_length(v_parent_ids, 1) THEN
      RETURN jsonb_build_object('error', 'Forbidden (parent ids)', 'status', 403);
    END IF;
  END IF;

  -- ── 1) Deletes (cascade clean-up identical to /api/budgets/[id]) ────
  IF v_delete_ids IS NOT NULL AND array_length(v_delete_ids, 1) > 0 THEN
    WITH family AS (
      SELECT id FROM budgets
       WHERE user_id = v_user_id
         AND (id = ANY(v_delete_ids) OR parent_id = ANY(v_delete_ids))
    )
    SELECT array_agg(id) INTO v_delete_ids FROM family;

    DELETE FROM budget_rollovers WHERE budget_id = ANY(v_delete_ids);
    GET DIAGNOSTICS v_rollovers_deleted = ROW_COUNT;

    DELETE FROM budget_amounts WHERE budget_id = ANY(v_delete_ids);
    GET DIAGNOSTICS v_amounts_deleted = ROW_COUNT;

    UPDATE transactions SET budget_id = NULL
      WHERE budget_id = ANY(v_delete_ids) AND user_id = v_user_id;
    GET DIAGNOSTICS v_transactions_unlinked = ROW_COUNT;

    DELETE FROM budgets WHERE id = ANY(v_delete_ids) AND user_id = v_user_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  -- ── 2) Inserts — parents first, then children referencing a client_id ──
  FOR v_rec IN
    SELECT * FROM jsonb_array_elements(v_to_insert) WITH ORDINALITY AS t(value, ord)
    WHERE (value->>'parent_client_id') IS NULL
  LOOP
    v_resolved_parent := NULLIF(v_rec.value->>'parent_id', '')::uuid;

    INSERT INTO budgets (
      user_id, parent_id, name, slug, icon, description,
      default_limit, budget_type, interval, rollover_type,
      limit_type, alert_threshold, max_single_transaction_amount,
      is_essential, priority_score, is_inflation_indexed, sort_order,
      goal_type, goal_amount, goal_date, goal_frequency
    ) VALUES (
      v_user_id,
      v_resolved_parent,
      v_rec.value->>'name',
      NULLIF(v_rec.value->>'slug', ''),
      COALESCE(v_rec.value->>'icon', 'Circle'),
      v_rec.value->>'description',
      COALESCE((v_rec.value->>'default_limit')::numeric, 0),
      v_rec.value->>'budget_type',
      COALESCE(v_rec.value->>'interval', 'monthly'),
      COALESCE(v_rec.value->>'rollover_type', 'reset'),
      COALESCE(v_rec.value->>'limit_type', 'soft'),
      COALESCE((v_rec.value->>'alert_threshold')::int, 80),
      COALESCE((v_rec.value->>'max_single_transaction_amount')::numeric, 0),
      COALESCE((v_rec.value->>'is_essential')::boolean, false),
      COALESCE((v_rec.value->>'priority_score')::int, 3),
      COALESCE((v_rec.value->>'is_inflation_indexed')::boolean, false),
      COALESCE((v_rec.value->>'sort_order')::int, 0),
      NULLIF(v_rec.value->>'goal_type', ''),
      NULLIF(v_rec.value->>'goal_amount', '')::numeric,
      NULLIF(v_rec.value->>'goal_date', '')::date,
      NULLIF(v_rec.value->>'goal_frequency', '')
    ) RETURNING id INTO v_new_id;

    v_inserted := v_inserted + 1;
    IF v_rec.value ? 'client_id' THEN
      v_id_map := v_id_map || jsonb_build_object(v_rec.value->>'client_id', v_new_id::text);
    END IF;
  END LOOP;

  FOR v_rec IN
    SELECT * FROM jsonb_array_elements(v_to_insert) AS t(value)
    WHERE (value->>'parent_client_id') IS NOT NULL
  LOOP
    v_resolved_parent := NULLIF(v_id_map->>(v_rec.value->>'parent_client_id'), '')::uuid;
    IF v_resolved_parent IS NULL THEN
      RAISE EXCEPTION 'Unknown parent_client_id: %', v_rec.value->>'parent_client_id';
    END IF;

    INSERT INTO budgets (
      user_id, parent_id, name, slug, icon, description,
      default_limit, budget_type, interval, rollover_type,
      limit_type, alert_threshold, max_single_transaction_amount,
      is_essential, priority_score, is_inflation_indexed, sort_order,
      goal_type, goal_amount, goal_date, goal_frequency
    ) VALUES (
      v_user_id,
      v_resolved_parent,
      v_rec.value->>'name',
      NULLIF(v_rec.value->>'slug', ''),
      COALESCE(v_rec.value->>'icon', 'Circle'),
      v_rec.value->>'description',
      COALESCE((v_rec.value->>'default_limit')::numeric, 0),
      v_rec.value->>'budget_type',
      COALESCE(v_rec.value->>'interval', 'monthly'),
      COALESCE(v_rec.value->>'rollover_type', 'reset'),
      COALESCE(v_rec.value->>'limit_type', 'soft'),
      COALESCE((v_rec.value->>'alert_threshold')::int, 80),
      COALESCE((v_rec.value->>'max_single_transaction_amount')::numeric, 0),
      COALESCE((v_rec.value->>'is_essential')::boolean, false),
      COALESCE((v_rec.value->>'priority_score')::int, 3),
      COALESCE((v_rec.value->>'is_inflation_indexed')::boolean, false),
      COALESCE((v_rec.value->>'sort_order')::int, 0),
      NULLIF(v_rec.value->>'goal_type', ''),
      NULLIF(v_rec.value->>'goal_amount', '')::numeric,
      NULLIF(v_rec.value->>'goal_date', '')::date,
      NULLIF(v_rec.value->>'goal_frequency', '')
    ) RETURNING id INTO v_new_id;

    v_inserted := v_inserted + 1;
    IF v_rec.value ? 'client_id' THEN
      v_id_map := v_id_map || jsonb_build_object(v_rec.value->>'client_id', v_new_id::text);
    END IF;
  END LOOP;

  -- ── 3) Updates (structure + detail fields) ──────────────────────────
  FOR v_rec IN SELECT * FROM jsonb_array_elements(v_to_update) AS t(value)
  LOOP
    UPDATE budgets SET
      name                 = COALESCE(v_rec.value->>'name', name),
      icon                 = COALESCE(v_rec.value->>'icon', icon),
      description          = COALESCE(v_rec.value->>'description', description),
      budget_type          = COALESCE(v_rec.value->>'budget_type', budget_type),
      default_limit        = COALESCE((v_rec.value->>'default_limit')::numeric, default_limit),
      is_essential         = COALESCE((v_rec.value->>'is_essential')::boolean, is_essential),
      parent_id            = CASE
                               WHEN v_rec.value ? 'parent_id'
                                 THEN NULLIF(v_rec.value->>'parent_id', '')::uuid
                               ELSE parent_id
                             END,
      sort_order           = COALESCE((v_rec.value->>'sort_order')::int, sort_order),
      interval             = COALESCE(v_rec.value->>'interval', interval),
      rollover_type        = COALESCE(v_rec.value->>'rollover_type', rollover_type),
      priority_score       = COALESCE((v_rec.value->>'priority_score')::int, priority_score),
      limit_type           = COALESCE(v_rec.value->>'limit_type', limit_type),
      alert_threshold      = COALESCE((v_rec.value->>'alert_threshold')::int, alert_threshold),
      is_inflation_indexed = COALESCE((v_rec.value->>'is_inflation_indexed')::boolean, is_inflation_indexed),
      goal_type            = CASE WHEN v_rec.value ? 'goal_type'
                                  THEN NULLIF(v_rec.value->>'goal_type', '') ELSE goal_type END,
      goal_amount          = CASE WHEN v_rec.value ? 'goal_amount'
                                  THEN NULLIF(v_rec.value->>'goal_amount', '')::numeric ELSE goal_amount END,
      goal_date            = CASE WHEN v_rec.value ? 'goal_date'
                                  THEN NULLIF(v_rec.value->>'goal_date', '')::date ELSE goal_date END,
      goal_frequency       = CASE WHEN v_rec.value ? 'goal_frequency'
                                  THEN NULLIF(v_rec.value->>'goal_frequency', '') ELSE goal_frequency END,
      updated_at           = now()
    WHERE id = (v_rec.value->>'id')::uuid
      AND user_id = v_user_id;

    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  -- ── 4) Amount upserts (historical rows are invariant) ───────────────
  FOR v_rec IN SELECT * FROM jsonb_array_elements(v_amounts) AS t(value)
  LOOP
    CONTINUE WHEN (v_rec.value->>'effective_from')::date < v_first_of_month;

    IF (v_rec.value->>'budget_id') LIKE 'tmp-%' THEN
      v_new_id := NULLIF(v_id_map->>(v_rec.value->>'budget_id'), '')::uuid;
    ELSE
      v_new_id := NULLIF(v_rec.value->>'budget_id', '')::uuid;
    END IF;
    IF v_new_id IS NULL THEN
      CONTINUE;
    END IF;

    PERFORM 1 FROM budgets WHERE id = v_new_id AND user_id = v_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Forbidden amount target: %', v_new_id;
    END IF;

    INSERT INTO budget_amounts (budget_id, effective_from, amount)
    VALUES (
      v_new_id,
      (v_rec.value->>'effective_from')::date,
      (v_rec.value->>'amount')::numeric
    )
    ON CONFLICT (budget_id, effective_from)
    DO UPDATE SET amount = EXCLUDED.amount;

    v_amounts_upserted := v_amounts_upserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'counts', jsonb_build_object(
      'inserted', v_inserted,
      'updated', v_updated,
      'deleted', v_deleted,
      'amounts_upserted', v_amounts_upserted,
      'rollovers_deleted', v_rollovers_deleted,
      'amounts_deleted', v_amounts_deleted,
      'transactions_unlinked', v_transactions_unlinked
    ),
    'id_map', v_id_map
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'error', SQLERRM,
    'status', 500,
    'detail', SQLSTATE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION save_budget_plan(JSONB) TO authenticated;
