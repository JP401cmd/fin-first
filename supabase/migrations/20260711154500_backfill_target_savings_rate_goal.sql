-- =============================================
-- Migratie: backfill spaarquote-doel (profiles.target_savings_rate → goals)
-- Ronde 4 (doelsituatie), besluit 3 — samenvoeging: de goals-rij (parameter-doel)
--   wordt dé bron voor het spaarquote-doel. Deze migratie migreert bestaande
--   waarden uit de DEPRECATED profielkolom `target_savings_rate` naar een gewone
--   goals-rij, zodat het leespad (loadParameterSavingsRateTarget) ze meteen ziet.
--   De kolom blijft bestaan (fallback + audittrail) maar wordt niet meer geschreven.
-- Volgorde in het plan: leespad → BACKFILL → schrijfpad dicht.
-- Plan: zie-plan-van-het-stateless-horizon.md §H
-- Datum: 2026-07-11
-- Afhankelijk van: 20260711151755_add_goals_metadata (metadata-kolom + uniek-index)
-- =============================================

-- 1. BACKFILL — één parameter-spaarquote-doel per profiel met een niet-NULL kolomwaarde.
--    Idempotent via WHERE NOT EXISTS (draai-2× = no-op); de partial unique index
--    `idx_goals_parameter_uniek (user_id, goal_type) WHERE bron='parameter'` vangt races.
--    Waarden spiegelen exact wat de lab-builder (`buildParameterGoalRows`) zou schrijven:
--      name          'Spaarquote-doel'   (backfill-variant; lab schrijft "Spaarquote naar X%")
--      goal_type     'savings_rate'
--      target_value  target_savings_rate, geclamped op de META-range 0–100
--      current_value 0                     (runtime-injectie vult de live-spaarquote, stap 4)
--      icon          'Activity'            (letterlijk = GOAL_TYPE_ICONS.savings_rate)
--      color         'purple'              (letterlijk = PARAMETER_GOAL_COLOR, horizon-familie)
--      ownership     'personal'            (parameter-doelen zijn persoonlijk)
--      metadata      bron=parameter, oorsprong=backfill
INSERT INTO public.goals
  (user_id, name, goal_type, target_value, current_value, icon, color, ownership, metadata)
SELECT
  p.id,
  'Spaarquote-doel',
  'savings_rate',
  LEAST(100, GREATEST(0, p.target_savings_rate)),
  0,
  'Activity',
  'purple',
  'personal',
  jsonb_build_object('bron', 'parameter', 'oorsprong', 'backfill')
FROM public.profiles p
WHERE p.target_savings_rate IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.goals g
    WHERE g.user_id = p.id
      AND g.goal_type = 'savings_rate'
      AND g.metadata->>'bron' = 'parameter'
  );

-- 2. DEPRECATIE-markering op de kolom (niet droppen — fallback + historie).
COMMENT ON COLUMN public.profiles.target_savings_rate IS
  'DEPRECATED (jul 2026): bron is goals (savings_rate, metadata.bron=parameter). Niet meer via PUT geschreven; alleen nog fallback-lees zolang er geen parameter-doel-rij bestaat.';
