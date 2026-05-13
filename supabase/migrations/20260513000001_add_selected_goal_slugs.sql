-- Add selected_goal_slugs TEXT[] for multi-select goals from onboarding step 1.
-- primary_goal_slug blijft de "eerste keuze"-bron voor first-win-routing en
-- backward-compat (DEFAULT_GOAL_GUIDE_STEPS-resolver, briefing-card-grid).
-- selected_goal_slugs[0] is altijd gelijk aan primary_goal_slug — afgedwongen
-- door de save-route, niet door een DB-constraint (kolom kan nog null zijn
-- voor pre-migration users).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS selected_goal_slugs TEXT[];
