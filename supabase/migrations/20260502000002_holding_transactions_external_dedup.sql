-- Adds external_source / external_trade_id columns + dedup index to
-- holding_transactions, so exchange-driven trade imports (Bitvavo first,
-- Kraken/Coinbase later) can be replayed idempotently without creating
-- duplicate rows. The unique partial index only covers rows that actually
-- have an external_source set, so manual entries (NULL source) are not
-- constrained.

ALTER TABLE public.holding_transactions
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_trade_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS holding_transactions_external_dedup_uidx
  ON public.holding_transactions (external_source, external_trade_id)
  WHERE external_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS holding_transactions_external_source_idx
  ON public.holding_transactions (external_source) WHERE external_source IS NOT NULL;
