-- =============================================
-- Migratie: goals — metadata + parameter-doel-anker
-- Ronde 4 (doelsituatie): het /toekomst-lab kan een verkende stand promoveren
--   tot vastgelegde parameter-doelen (spaarquote, salaris, rendement, FIRE-leeftijd).
--   Die doelen landen als gewone goals-rijen; deze migratie legt het fundament.
-- Plan: zie-plan-van-het-stateless-horizon.md §B
-- Datum: 2026-07-11
-- =============================================

-- 1. SPIEGEL-CODIFICATIE (no-op op remote — dicht lokale migratie-drift)
--    ownership/household_id bestaan al op remote (out-of-band toegepast als
--    remote-migratie 20260308220818_add_ownership_and_household_to_goals, waarvan
--    het lokale bestand ontbrak). Exact afgekeken van de feitelijke remote-kolommen:
--      ownership    text NOT NULL DEFAULT 'personal'   (géén CHECK op remote — bewust
--                                                        NIET toegevoegd om exact te matchen)
--      household_id uuid NULL  FK households(id) ON DELETE SET NULL
--    IF NOT EXISTS ⇒ op remote een pure no-op; op een verse lokale DB reproduceert
--    het de remote-vorm zodat local == remote.
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id) ON DELETE SET NULL;

-- 2. NIEUWE KOLOM: metadata (systeembeheerd, alleen server-side gezet)
--    Draagt de herkomst van een doel-rij:
--      bron:          'parameter'  (door het lab gegenereerd parameter-doel)
--      oorsprong:     'lab' | 'backfill'
--      margeDoelJaren: number       (alleen op het FIRE-leeftijd-doel — marge als criterium)
--    Default '{}' zodat alle bestaande en handmatige doelen ongemoeid blijven.
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.goals.metadata IS
  'Systeembeheerde velden (server-side gezet): bron (bv. ''parameter''), oorsprong (''lab''|''backfill''), margeDoelJaren (FIRE-doel). Default {} voor handmatige doelen.';

-- 3. IDEMPOTENTIE-ANKER: partial unique index voor parameter-doelen
--    Eén parameter-doel per (gebruiker, goal_type); dé conflict-target voor de
--    vastleggen-upsert (2× vastleggen mag nooit dupliceren). Alleen actief voor
--    rijen met metadata.bron='parameter' — handmatige doelen blijven vrij dupliceerbaar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_parameter_uniek
  ON public.goals (user_id, goal_type)
  WHERE metadata->>'bron' = 'parameter';

-- 4. RLS: GEEN nieuwe policy.
--    De nieuwe kolommen erven de bestaande own-row-policies op public.goals:
--      - "Users can manage own goals"  (ALL,   auth.uid() = user_id)
--      - "Users can view own goals"    (SELECT, (select auth.uid()) = user_id)
--      - "Users can insert own goals"  (INSERT, WITH CHECK (select auth.uid()) = user_id)
--      - "Users can update own goals"  (UPDATE, (select auth.uid()) = user_id)
--      - "Users can delete own goals"  (DELETE, (select auth.uid()) = user_id)
--      - "Household members can view shared goals" (SELECT, gedeelde-lees op household)
--    Schrijfpad = own-row via de anon RLS-client, server-side (metadata alleen door
--    de toekomst-doel-route gezet — kleiner security-oppervlak, spiegelt app/api/appearance).
--    Geen nieuwe of verbrede using/with_check nodig; RLS blijft ingeschakeld.
