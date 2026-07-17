-- =============================================
-- Migration: net_worth_history (timestamped) + eerste-open-van-de-dag prijs-sync-gate
-- Datum: 2026-07-16
-- =============================================
--
-- WAAROM (kaart "snapshot in netto vermogen en bezittingen en schulden"):
--   De gebruiker wil (1) bij de eerste app-open van de dag automatisch de
--   marktprijzen syncen, en (2) bij ELKE sync het netto vermogen + de totalen
--   van bezittingen/schulden vastleggen MET DATUM EN TIJD, om een historie van
--   prijs-/vermogensontwikkeling op te bouwen.
--
--   De bestaande `net_worth_snapshots` is DATE-gekeyd (1 rij/dag, idempotente
--   upsert op (user_id, snapshot_date)) en overschrijft dus binnen dezelfde dag —
--   twee syncs op één dag laten geen twee tijdstippen achter. Voor een intraday,
--   tijdstip-gekeyde historie is een APPEND-ONLY tabel nodig. Dat is deze tabel;
--   ze vervangt `net_worth_snapshots` niet (die blijft de dag-cadans + score-
--   velden), maar vult 'm aan met een tijdstempel-curve.
--
--   net_worth (incl. niet-liquide assets, huis meegerekend) is BEWUST de enige
--   vermogensgrootheid hier; er wordt géén liquide/FIRE-eligible grootheid in
--   dezelfde rij gemengd (CLAUDE.md: nooit nettoVermogen en liquideVermogen op
--   één as/marker mengen). Een latere liquide-curve krijgt desgewenst een eigen
--   kolom.

-- 1. Append-only tijdstempel-historie van het netto vermogen + component-totalen.
CREATE TABLE IF NOT EXISTS net_worth_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_assets NUMERIC NOT NULL DEFAULT 0,
  total_debts NUMERIC NOT NULL DEFAULT 0,
  net_worth NUMERIC NOT NULL DEFAULT 0,
  -- Herkomst van het punt: 'daily-open' (eerste-open-sync), 'manual'
  -- (handmatige sync-knop), 'sync' (overig). Puur informatief/analytisch.
  source TEXT NOT NULL DEFAULT 'sync',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE net_worth_history IS
  'Append-only, tijdstip-gekeyde historie van het netto vermogen + totalen bezittingen/schulden, vastgelegd bij elke prijs-sync. Aanvulling op het DATE-gekeyde net_worth_snapshots (dag-cadans): bouwt een intraday prijs-/vermogensontwikkelingscurve op. net_worth = incl. niet-liquide assets; geen liquide grootheid gemengd (CLAUDE.md).';

-- 2. Row-Level Security — eigen-rij (spiegelt balance_snapshots).
ALTER TABLE net_worth_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own net worth history" ON net_worth_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own net worth history" ON net_worth_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access to net worth history" ON net_worth_history
  FOR ALL TO service_role USING (true);

-- 3. Index voor de gangbare query (recente historie per gebruiker).
CREATE INDEX IF NOT EXISTS idx_networth_history_user_time
  ON net_worth_history (user_id, captured_at DESC);

-- 4. Dag-gate voor de 'eerste-open-van-de-dag' prijs-sync.
--    Cross-device (server-side, i.t.t. localStorage): één tijdstempel per
--    gebruiker die aangeeft wanneer de dag-sync het laatst geclaimd is. Valt
--    onder de bestaande profiles eigen-rij policy (FOR ALL USING auth.uid() = id);
--    geschreven via own-row anon RLS-client (nooit service-role) — spiegelt
--    app/api/appearance.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_price_sync_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.last_price_sync_at IS
  'Tijdstempel van de laatst geclaimde eerste-open-van-de-dag prijs-sync. Dag-gate (cross-device): is de opgeslagen UTC-datum < vandaag, dan claimt /api/sync/daily-open de dag (atomische conditionele UPDATE) en start de client een prijs-sync + history-punt. Eigen-rij, own-row anon RLS-write (nooit service-role).';
