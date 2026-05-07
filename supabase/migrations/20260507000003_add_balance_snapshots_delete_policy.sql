-- =============================================
-- Migration: balance_snapshots — authenticated DELETE policy
--
-- Achtergrond: `20260302000001_add_balance_snapshots.sql` definieert SELECT
-- en INSERT policies voor `authenticated` plus een `FOR ALL` policy voor
-- `service_role`, maar geen DELETE-policy voor `authenticated`. Daardoor
-- werd een `.delete()` via de user-session client stilzwijgend door RLS
-- geweigerd (geen error — RLS USING op nul rijen evalueert naar empty
-- result). Concrete impact:
--
--   - `app/api/onboarding/aangifte-import/route.ts` compensating-delete
--     bij rollback liet snapshot-rows als orphan achter.
--   - Datzelfde route's bulk-delete handler (verwijder alle aangifte-imports
--     van peildatum X) wist ook de snapshots niet, ook al rapporteerde de
--     query success.
--
-- Fix: voeg DELETE policy toe via dezelfde idempotente DO-block-patroon dat
-- in dit project elders gebruikt wordt (zie `20260316100001_add_holdings_
-- classification_and_target_allocations.sql`). Re-runnen van de migratie
-- doet niets als de policy al bestaat.
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'balance_snapshots'
       AND policyname = 'Users can delete own balance snapshots'
  ) THEN
    CREATE POLICY "Users can delete own balance snapshots" ON balance_snapshots
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
