-- Huishoudbudget fase 3: budget_model-keuze met wederzijdse instemming,
-- merge van dubbele budgetten (remap historie), revert en household_leave.
-- Toegepast op remote via mcp apply_migration (household_budget_model_consent);
-- dit bestand is de spiegel voor de lokale historie.

-- 1. Merge-spoor op budgets (idempotentie + revert)
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.budgets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_merged_into ON public.budgets (merged_into) WHERE merged_into IS NOT NULL;

-- 2. Voorstellen-tabel (payload + audit + exactly-once)
CREATE TABLE IF NOT EXISTS public.household_budget_model_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL,
  target_model text NOT NULL CHECK (target_model IN ('household','separate')),
  merge_mapping jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  resolved_by uuid,
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_budget_model_proposal_per_household
  ON public.household_budget_model_proposals (household_id) WHERE status = 'pending';
ALTER TABLE public.household_budget_model_proposals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Members view own household budget proposals" ON public.household_budget_model_proposals
    FOR SELECT TO authenticated USING (household_id = user_household_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Géén INSERT/UPDATE-policies: alle writes lopen via de RPC's hieronder.

-- 3. Interne unmerge-routine (NIET voor clients; alleen door definer-functies aangeroepen)
CREATE OR REPLACE FUNCTION public._unmerge_household_budgets(p_household uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  d RECORD; b RECORD;
  n int; v_restored int := 0; v_remapped_back int := 0; v_orphaned int := 0;
BEGIN
  -- 3a. Herstel elk gearchiveerd duplicaat waarvan de canonical in dit huishouden
  --     gedeeld is, en hang de rijen van de duplicaat-eigenaar terug.
  FOR d IN
    SELECT dup.id, dup.user_id, dup.slug, dup.merged_into
    FROM budgets dup
    JOIN budgets can ON can.id = dup.merged_into
    WHERE can.household_id = p_household AND can.ownership = 'shared'
      AND dup.merged_into IS NOT NULL
  LOOP
    UPDATE transactions SET budget_id = d.id
      WHERE budget_id = d.merged_into AND user_id = d.user_id;
    GET DIAGNOSTICS n = ROW_COUNT; v_remapped_back := v_remapped_back + n;
    UPDATE transaction_splits s SET budget_id = d.id
      FROM transactions t
      WHERE s.transaction_id = t.id AND s.budget_id = d.merged_into AND t.user_id = d.user_id;
    UPDATE recurring_transactions SET budget_id = d.id
      WHERE budget_id = d.merged_into AND user_id = d.user_id;
    UPDATE goals SET budget_id = d.id
      WHERE budget_id = d.merged_into AND user_id = d.user_id;
    UPDATE category_corrections SET budget_id = d.id
      WHERE budget_id = d.merged_into AND user_id = d.user_id;

    -- De-archiveer + slug-suffix strippen; bij botsing (gebruiker maakte
    -- intussen een nieuw budget met dezelfde slug) blijft de suffix staan.
    BEGIN
      UPDATE budgets SET is_archived = false, merged_into = NULL,
        slug = CASE WHEN slug IS NULL THEN NULL
                    ELSE regexp_replace(slug, '~merged-[0-9a-f]{8}$', '') END
        WHERE id = d.id;
    EXCEPTION WHEN unique_violation THEN
      UPDATE budgets SET is_archived = false, merged_into = NULL WHERE id = d.id;
    END;
    v_restored := v_restored + 1;
  END LOOP;

  -- 3b. Resterende partner-rijen op gedeelde budgetten zónder merge-spoor
  --     (rechtstreeks op een handmatig gedeeld budget geboekt) → ongecategoriseerd.
  FOR b IN
    SELECT id, user_id FROM budgets
    WHERE household_id = p_household AND ownership = 'shared'
  LOOP
    UPDATE transaction_splits s SET budget_id = NULL
      FROM transactions t
      WHERE s.transaction_id = t.id AND s.budget_id = b.id AND t.user_id <> b.user_id;
    UPDATE transactions SET budget_id = NULL WHERE budget_id = b.id AND user_id <> b.user_id;
    GET DIAGNOSTICS n = ROW_COUNT; v_orphaned := v_orphaned + n;
    UPDATE recurring_transactions SET budget_id = NULL WHERE budget_id = b.id AND user_id <> b.user_id;
    UPDATE goals SET budget_id = NULL WHERE budget_id = b.id AND user_id <> b.user_id;
    UPDATE category_corrections SET budget_id = NULL WHERE budget_id = b.id AND user_id <> b.user_id;
  END LOOP;

  -- 3c. Gedeelde budgetten terug naar aanmaker-persoonlijk.
  UPDATE budgets SET ownership = 'personal', household_id = NULL
    WHERE household_id = p_household AND ownership = 'shared';

  RETURN jsonb_build_object(
    'restored_budgets', v_restored,
    'remapped_back', v_remapped_back,
    'orphaned_transactions', v_orphaned
  );
END;
$func$;
REVOKE ALL ON FUNCTION public._unmerge_household_budgets(uuid) FROM PUBLIC, anon, authenticated;

-- 4. Voorstel indienen
CREATE OR REPLACE FUNCTION public.propose_budget_model(p_target_model text, p_merge_mapping jsonb DEFAULT '[]')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_household uuid;
  v_current text;
  v_members int;
  v_id uuid;
  elem jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_household := user_household_id();
  IF v_household IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_member');
  END IF;
  SELECT count(*) INTO v_members FROM household_members WHERE household_id = v_household;
  IF v_members <> 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'needs_two_members');
  END IF;
  SELECT budget_model INTO v_current FROM households WHERE id = v_household;
  IF p_target_model NOT IN ('household','separate') OR p_target_model = coalesce(v_current,'separate') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_target');
  END IF;
  IF EXISTS (SELECT 1 FROM household_budget_model_proposals WHERE household_id = v_household AND status = 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'pending_exists');
  END IF;
  -- Vormvalidatie mapping (volledige validatie gebeurt bij resolve).
  IF p_target_model = 'separate' THEN
    p_merge_mapping := '[]'::jsonb;
  ELSE
    IF jsonb_typeof(coalesce(p_merge_mapping, '[]'::jsonb)) <> 'array' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_mapping');
    END IF;
    FOR elem IN SELECT * FROM jsonb_array_elements(coalesce(p_merge_mapping,'[]'::jsonb)) LOOP
      IF jsonb_typeof(elem) <> 'object'
         OR NOT (elem ? 'canonical_budget_id') OR NOT (elem ? 'duplicate_budget_id') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_mapping');
      END IF;
    END LOOP;
  END IF;

  INSERT INTO household_budget_model_proposals (household_id, proposed_by, target_model, merge_mapping)
    VALUES (v_household, v_uid, p_target_model, coalesce(p_merge_mapping,'[]'::jsonb))
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'proposal_id', v_id);
END;
$func$;
GRANT EXECUTE ON FUNCTION public.propose_budget_model(text, jsonb) TO authenticated;

-- 5. Voorstel afhandelen: dé consent-poort én uitvoerder, in één transactie.
CREATE OR REPLACE FUNCTION public.resolve_budget_model_proposal(p_proposal_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_uid uuid := auth.uid();
  v_household uuid;
  prop RECORD;
  pair RECORD; can RECORD; dup RECORD;
  v_can_parent_of_dup uuid;
  n int; v_pairs int := 0; v_remapped int := 0;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_action NOT IN ('accept','decline','cancel') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;
  v_household := user_household_id();
  IF v_household IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_member');
  END IF;

  SELECT * INTO prop FROM household_budget_model_proposals
    WHERE id = p_proposal_id AND household_id = v_household
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF prop.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pending');
  END IF;
  IF prop.expires_at < now() THEN
    UPDATE household_budget_model_proposals
      SET status = 'expired', resolved_at = now() WHERE id = prop.id;
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  IF p_action = 'cancel' THEN
    IF prop.proposed_by <> v_uid THEN
      RETURN jsonb_build_object('success', false, 'error', 'only_proposer_cancels');
    END IF;
    UPDATE household_budget_model_proposals
      SET status = 'cancelled', resolved_by = v_uid, resolved_at = now() WHERE id = prop.id;
    RETURN jsonb_build_object('success', true, 'status', 'cancelled');
  END IF;

  -- accept/decline: alléén het ándere lid — beide-instemming is structureel.
  IF prop.proposed_by = v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'proposer_cannot_resolve');
  END IF;

  IF p_action = 'decline' THEN
    UPDATE household_budget_model_proposals
      SET status = 'declined', resolved_by = v_uid, resolved_at = now() WHERE id = prop.id;
    RETURN jsonb_build_object('success', true, 'status', 'declined');
  END IF;

  -- ── ACCEPT ──
  IF prop.target_model = 'separate' THEN
    v_result := _unmerge_household_budgets(v_household);
    UPDATE households SET budget_model = 'separate' WHERE id = v_household;
  ELSE
    -- Valideer ALLE paren server-side (client-mapping nooit vertrouwen).
    FOR pair IN
      SELECT (e->>'canonical_budget_id')::uuid AS can_id,
             (e->>'duplicate_budget_id')::uuid AS dup_id
      FROM jsonb_array_elements(prop.merge_mapping) e
    LOOP
      SELECT * INTO can FROM budgets WHERE id = pair.can_id;
      SELECT * INTO dup FROM budgets WHERE id = pair.dup_id;
      IF can IS NULL OR dup IS NULL THEN RAISE EXCEPTION 'merge: budget bestaat niet'; END IF;
      IF can.is_archived OR dup.is_archived THEN RAISE EXCEPTION 'merge: budget is gearchiveerd'; END IF;
      IF can.merged_into IS NOT NULL OR dup.merged_into IS NOT NULL THEN RAISE EXCEPTION 'merge: budget al gemerged'; END IF;
      IF can.user_id = dup.user_id THEN RAISE EXCEPTION 'merge: paren moeten van verschillende leden zijn'; END IF;
      IF NOT EXISTS (SELECT 1 FROM household_members WHERE household_id = v_household AND user_id = can.user_id)
         OR NOT EXISTS (SELECT 1 FROM household_members WHERE household_id = v_household AND user_id = dup.user_id) THEN
        RAISE EXCEPTION 'merge: budget hoort niet bij dit huishouden';
      END IF;
      IF can.slug IS DISTINCT FROM dup.slug OR can.budget_type IS DISTINCT FROM dup.budget_type THEN
        RAISE EXCEPTION 'merge: slug/type komt niet overeen';
      END IF;
      IF can.budget_type = 'income' THEN RAISE EXCEPTION 'merge: income-budgetten worden niet samengevoegd'; END IF;
      -- Ouder-consistentie: beide root, óf het duplicaat-ouderpaar zit in de
      -- mapping / is eerder al naar de canonical-ouder gemerged.
      IF (dup.parent_id IS NULL) <> (can.parent_id IS NULL) THEN
        RAISE EXCEPTION 'merge: ouder-structuur komt niet overeen';
      END IF;
      IF dup.parent_id IS NOT NULL THEN
        SELECT (e->>'canonical_budget_id')::uuid INTO v_can_parent_of_dup
          FROM jsonb_array_elements(prop.merge_mapping) e
          WHERE (e->>'duplicate_budget_id')::uuid = dup.parent_id;
        IF v_can_parent_of_dup IS DISTINCT FROM can.parent_id
           AND (SELECT merged_into FROM budgets WHERE id = dup.parent_id) IS DISTINCT FROM can.parent_id THEN
          RAISE EXCEPTION 'merge: ouderpaar ontbreekt in mapping';
        END IF;
      END IF;
    END LOOP;

    -- Voer uit: ouders eerst (roots vóór kinderen).
    FOR pair IN
      SELECT (e->>'canonical_budget_id')::uuid AS can_id,
             (e->>'duplicate_budget_id')::uuid AS dup_id,
             ((SELECT parent_id FROM budgets WHERE id = (e->>'duplicate_budget_id')::uuid) IS NOT NULL) AS is_child
      FROM jsonb_array_elements(prop.merge_mapping) e
      ORDER BY 3 ASC
    LOOP
      UPDATE budgets SET ownership = 'shared', household_id = v_household WHERE id = pair.can_id;

      UPDATE transactions SET budget_id = pair.can_id WHERE budget_id = pair.dup_id;
      GET DIAGNOSTICS n = ROW_COUNT; v_remapped := v_remapped + n;
      UPDATE transaction_splits SET budget_id = pair.can_id WHERE budget_id = pair.dup_id;
      UPDATE recurring_transactions SET budget_id = pair.can_id WHERE budget_id = pair.dup_id;
      UPDATE goals SET budget_id = pair.can_id WHERE budget_id = pair.dup_id;
      UPDATE category_corrections SET budget_id = pair.can_id WHERE budget_id = pair.dup_id;

      -- Stale carry van het duplicaat zou dubbel tellen; client regenereert op canonical.
      DELETE FROM budget_rollovers WHERE budget_id = pair.dup_id
        AND period >= to_char(current_date, 'YYYY-MM');

      -- Archiveer mét slug-hernoeming: seedBudgets upsert op (user_id, slug)
      -- zou het duplicaat anders laten herrijzen.
      UPDATE budgets SET is_archived = true, merged_into = pair.can_id,
        slug = CASE WHEN slug IS NULL THEN NULL
                    ELSE slug || '~merged-' || left(pair.dup_id::text, 8) END
        WHERE id = pair.dup_id;
      v_pairs := v_pairs + 1;
    END LOOP;

    -- Niet-gemapte kinderen van duplicaten (eigen subcategorieën van de partner)
    -- verhuizen als persoonlijke potjes onder de gedeelde canonical-ouder.
    FOR pair IN
      SELECT (e->>'canonical_budget_id')::uuid AS can_id,
             (e->>'duplicate_budget_id')::uuid AS dup_id
      FROM jsonb_array_elements(prop.merge_mapping) e
    LOOP
      UPDATE budgets SET parent_id = pair.can_id
        WHERE parent_id = pair.dup_id AND is_archived = false;
    END LOOP;

    UPDATE households SET budget_model = 'household' WHERE id = v_household;
    v_result := jsonb_build_object('merged_pairs', v_pairs, 'remapped_transactions', v_remapped);
  END IF;

  UPDATE household_budget_model_proposals
    SET status = 'accepted', resolved_by = v_uid, resolved_at = now(), result = v_result
    WHERE id = prop.id;
  RETURN jsonb_build_object('success', true, 'status', 'accepted', 'result', v_result);
END;
$func$;
GRANT EXECUTE ON FUNCTION public.resolve_budget_model_proposal(uuid, text) TO authenticated;

-- 6. household_leave: eerst unmergen, anders stranden ge-remapte transacties
--    van de partner op budgetten die diegene niet meer kan zien.
--    (volledige definitie incl. bestaande revert-lijst — zie remote functie)
-- NB: de gewijzigde household_leave staat volledig in de remote migratie;
-- wijziging t.o.v. 20260605000000: PERFORM _unmerge_household_budgets(v_household)
-- direct vóór de blanket shared→personal reverts.
