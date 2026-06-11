-- Huishoudbudget fase 1: beide partners kunnen gedeelde budgetten bewerken,
-- plus twee bestaande zichtbaarheidsgaten (budget_amounts, transaction_splits).
-- Toegepast op remote via mcp apply_migration (household_budget_shared_write);
-- dit bestand is de spiegel voor de lokale historie.

-- 1. Shared-budget UPDATE-policy: partner mag naam/limiet/goal van een gedeeld
--    budget bewerken, maar kan ownership NIET terugzetten naar 'personal'
--    (WITH CHECK eist shared; de eigen ALL-policy dekt alleen eigen rijen).
DO $$ BEGIN
  CREATE POLICY "Household members can update shared budgets" ON public.budgets
    FOR UPDATE TO authenticated
    USING (ownership = 'shared' AND household_id IS NOT NULL
           AND household_id = user_household_id())
    WITH CHECK (ownership = 'shared' AND household_id = user_household_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Guard: WITH CHECK kan OLD niet zien, dus zonder deze trigger zou een
--    partner user_id kunnen herschrijven zolang ownership 'shared' blijft.
CREATE OR REPLACE FUNCTION public.guard_budget_owner_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'budget owner is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_guard_budget_owner ON public.budgets;
CREATE TRIGGER zz_guard_budget_owner BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.guard_budget_owner_immutable();

-- 3. budget_amounts: limiet-overrides van gedeelde budgetten waren onzichtbaar
--    voor de partner (policy was creator-only via budgets.user_id).
DO $$ BEGIN
  CREATE POLICY "Household members manage shared budget amounts" ON public.budget_amounts
    FOR ALL TO authenticated
    USING (budget_id IN (SELECT id FROM public.budgets
           WHERE ownership = 'shared' AND household_id = user_household_id()))
    WITH CHECK (budget_id IN (SELECT id FROM public.budgets
           WHERE ownership = 'shared' AND household_id = user_household_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. transaction_splits: splits van gedeelde transacties leesbaar voor de
--    partner (anders klopt huishoud-besteding via splits niet). Schrijven
--    blijft eigenaar-only: niet-eigenaar bewerkt nooit andermans transacties.
DO $$ BEGIN
  CREATE POLICY "Household members view shared transaction splits" ON public.transaction_splits
    FOR SELECT TO authenticated
    USING (transaction_id IN (SELECT id FROM public.transactions
           WHERE ownership = 'shared' AND household_id = user_household_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
