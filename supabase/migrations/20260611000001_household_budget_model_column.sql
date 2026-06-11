-- Huishoudbudget fase 2: budget_model-kolom (slapend tot de consent-flow van
-- fase 3 hem zet) + rollover-leesbaarheid voor gedeelde budgetten.
-- Toegepast op remote via mcp apply_migration (household_budget_model_column);
-- dit bestand is de spiegel voor de lokale historie.

ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS budget_model text NOT NULL DEFAULT 'separate';

DO $$ BEGIN
  ALTER TABLE public.households
    ADD CONSTRAINT households_budget_model_check CHECK (budget_model IN ('separate','household'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Rollover-rijen van gedeelde budgetten leesbaar voor huishoudleden (schrijven
-- blijft creator-only: alleen de aanmaker genereert rollovers, de partner leest).
DO $$ BEGIN
  CREATE POLICY "Household members view shared budget rollovers" ON public.budget_rollovers
    FOR SELECT TO authenticated
    USING (budget_id IN (SELECT id FROM public.budgets
           WHERE ownership = 'shared' AND household_id = user_household_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
