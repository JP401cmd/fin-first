-- =============================================
-- Migration: balance_snapshots — authenticated UPDATE policy
--
-- Achtergrond: `20260302000001_add_balance_snapshots.sql` definieert SELECT
-- en INSERT policies voor `authenticated` plus een `FOR ALL` policy voor
-- `service_role`; `20260507000003_add_balance_snapshots_delete_policy.sql`
-- vulde de ontbrekende DELETE aan. Er bleef echter GEEN UPDATE-policy voor
-- `authenticated` bestaan (geverifieerd remote via pg_policies op 2026-07-17:
-- alleen SELECT/INSERT/DELETE own-row + service_role FOR ALL).
--
-- Impact: elke `INSERT … ON CONFLICT (user_id, snapshot_date, entity_type,
-- entity_id) DO UPDATE` via de user-session client faalt op het UPDATE-pad
-- zodra de rij al bestaat (her-editie van dezelfde maand/dag). Postgres
-- vereist voor het DO-UPDATE-pad een UPDATE-policy (USING op de bestaande
-- rij + WITH CHECK op de nieuwe rij); zonder die policy wordt de hele
-- statement door RLS geweigerd. Concreet:
--
--   - `app/api/snapshots/entity-backfill` (per-entiteit historische backfill,
--     "Netto vermogen — verloop"): de balance_snapshots-mirror is dáár het
--     PRIMAIRE doel, dus een geweigerde upsert is een harde 500 bij het
--     opnieuw invullen van een reeds ingevulde maand.
--   - De LIVE per-entiteit-mirror (`upsertSingleBalanceSnapshot` vanuit
--     components/core/assets-client.tsx, components/app/core/debts/debt-form.tsx,
--     debt-valuation-modal, check-in): dezelfde upsert faalt bij een tweede
--     herwaardering op dezelfde dag, maar wordt stil geslikt (fire-and-forget)
--     → de sparkline/verloopband mist stilzwijgend de laatste correctie.
--
-- De service-role snapshot-cron raakt dit niet (die valt onder de
-- `FOR ALL TO service_role`-policy).
--
-- Fix: voeg een own-row UPDATE-policy voor `authenticated` toe (USING én
-- WITH CHECK `auth.uid() = user_id`), gespiegeld aan de bestaande own-row
-- policies op deze tabel. Idempotent DO-block-patroon, identiek aan
-- `20260507000003_add_balance_snapshots_delete_policy.sql` — re-runnen doet
-- niets als de policy al bestaat. Verruimt de toegang NIET: precies de eigen
-- rijen die de gebruiker al mag lezen/invoegen/verwijderen mag hij nu ook
-- bijwerken.
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'balance_snapshots'
       AND policyname = 'Users can update own balance snapshots'
  ) THEN
    CREATE POLICY "Users can update own balance snapshots" ON balance_snapshots
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
