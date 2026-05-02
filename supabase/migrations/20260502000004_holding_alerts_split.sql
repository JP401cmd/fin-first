-- ============================================================
-- P3 — Repoint `holding_alerts` at the typed holding-tables.
--
-- Migration 20260502000003 dropped the FK on `holding_alerts.holding_id`
-- so the legacy `holdings` table could be renamed (the alerts table was
-- empty in production, so no data was lost). This migration finishes the
-- job by:
--
--   1. Adding two new typed columns:
--        - `crypto_holding_id`     → REFERENCES crypto_holdings(id)
--        - `investment_holding_id` → REFERENCES investment_holdings(id)
--      Both nullable on the row level; the CHECK below enforces that
--      precisely one is set so an alert always belongs to exactly one
--      typed holding.
--
--   2. Dropping the legacy `holding_id` column. It was orphaned (no FK,
--      no data, no readers in the new code path).
--
-- The table is empty (verified pre-migration), so we do not migrate any
-- rows. Future alert UI in P3+ writes to the typed columns directly.
--
-- IDEMPOTENCY: All ADD/DROP statements are guarded — re-running this
-- migration after a successful apply is a no-op.
-- ============================================================

-- ── 1. Add typed FK columns ─────────────────────────────────────────
ALTER TABLE public.holding_alerts
  ADD COLUMN IF NOT EXISTS crypto_holding_id     UUID REFERENCES public.crypto_holdings(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS investment_holding_id UUID REFERENCES public.investment_holdings(id) ON DELETE CASCADE;

-- ── 2. CHECK: precisely one of the two FKs must be set ──────────────
-- Drop-then-add so the constraint name is stable across re-applies.
ALTER TABLE public.holding_alerts
  DROP CONSTRAINT IF EXISTS holding_alerts_one_typed_fk;
ALTER TABLE public.holding_alerts
  ADD CONSTRAINT holding_alerts_one_typed_fk
  CHECK (
    (crypto_holding_id IS NOT NULL AND investment_holding_id IS NULL)
    OR (crypto_holding_id IS NULL AND investment_holding_id IS NOT NULL)
  );

-- ── 3. Indexes for efficient lookups per typed holding ──────────────
CREATE INDEX IF NOT EXISTS holding_alerts_crypto_idx
  ON public.holding_alerts(crypto_holding_id) WHERE crypto_holding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS holding_alerts_investment_idx
  ON public.holding_alerts(investment_holding_id) WHERE investment_holding_id IS NOT NULL;

-- ── 4. Drop the legacy `holding_id` column ──────────────────────────
-- Was orphaned by migration 20260502000003 (FK dropped, table empty).
ALTER TABLE public.holding_alerts
  DROP COLUMN IF EXISTS holding_id;
