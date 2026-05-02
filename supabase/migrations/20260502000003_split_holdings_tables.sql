-- ============================================================
-- P1 — Split polymorphic `holdings` into typed tables
--      (P1 from plans/wil-je-een-diepgaand-unified-wilkes.md)
--
-- The legacy `holdings` table is polymorphic: aandelen/ETF rows and
-- crypto-coin rows live side-by-side, with the bucket only knowable via
-- `holdings.asset_id -> assets.asset_type`. That coupling makes it
-- impossible to add type-specific columns (chain/contract for crypto,
-- ISIN/exchange-suffix for investments) without bloating one schema with
-- nullable cruft, and makes the source-of-data ambiguous (Bitvavo sync vs
-- CSV import vs manual entry all write the same row shape).
--
-- This migration creates two parallel typed schemas
-- (`investment_holdings` + `crypto_holdings`, plus `*_transactions` and
-- `*_holding_prices`), copies the live data into them, and renames the
-- legacy tables to `_legacy_*` so the old code path fails loudly until
-- P2 (writers) and P3 (UI) ship.
--
-- WARNING: This is a CLEAN BREAK. After this migration runs the app code
-- that still queries the `holdings` / `holding_transactions` /
-- `holding_prices` tables will start returning empty results (or fail
-- with "relation does not exist"). P2 must follow immediately to update
-- the writers; P3 to update the UI. Keep the `_legacy_*` tables for one
-- sprint as a rollback safety net, then drop in a future migration.
--
-- IDEMPOTENCY: This migration is partly idempotent (CREATE IF NOT EXISTS
-- on tables, indexes, and policies). The data-migration INSERTs and the
-- ALTER TABLE renames at the end are guarded with existence checks so
-- a re-run is a no-op if it already succeeded.
-- ============================================================

-- ── 1. investment_holdings ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investment_holdings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_id                UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  ticker                  TEXT NOT NULL,
  name                    TEXT,
  isin                    TEXT,
  exchange                TEXT,
  currency                TEXT NOT NULL DEFAULT 'EUR',
  units                   NUMERIC NOT NULL DEFAULT 0,
  avg_purchase_price      NUMERIC,
  current_price           NUMERIC,
  last_price_update       TIMESTAMPTZ,
  previous_close          NUMERIC,
  daily_change_percent    NUMERIC,
  asset_class             TEXT,
  sector                  TEXT,
  geography               TEXT,
  target_allocation_pct   NUMERIC,
  ter                     NUMERIC,
  ter_source              TEXT,
  is_favorite             BOOLEAN DEFAULT false,
  is_active               BOOLEAN DEFAULT true,
  purchase_date           DATE,
  external_source         TEXT,
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT investment_holdings_ter_range CHECK (ter IS NULL OR (ter >= 0 AND ter <= 0.10)),
  CONSTRAINT investment_holdings_ter_source_values CHECK (ter_source IS NULL OR ter_source IN ('manual', 'lookup'))
);

COMMENT ON COLUMN public.investment_holdings.exchange IS
  'Yahoo-Finance suffix component (e.g. "AS", "AMS", "L", "NASDAQ"). Empty/NULL for tickers that need no suffix.';
COMMENT ON COLUMN public.investment_holdings.external_source IS
  'CSV import provider when applicable: degiro|saxo|ing|trading212|etoro. NULL for manual entries.';

CREATE INDEX IF NOT EXISTS investment_holdings_asset_idx
  ON public.investment_holdings(asset_id);
CREATE INDEX IF NOT EXISTS investment_holdings_user_idx
  ON public.investment_holdings(user_id);
CREATE INDEX IF NOT EXISTS investment_holdings_isin_idx
  ON public.investment_holdings(isin) WHERE isin IS NOT NULL;

ALTER TABLE public.investment_holdings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'investment_holdings' AND policyname = 'investment_holdings_select_own') THEN
    CREATE POLICY "investment_holdings_select_own" ON public.investment_holdings
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'investment_holdings' AND policyname = 'investment_holdings_insert_own') THEN
    CREATE POLICY "investment_holdings_insert_own" ON public.investment_holdings
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'investment_holdings' AND policyname = 'investment_holdings_update_own') THEN
    CREATE POLICY "investment_holdings_update_own" ON public.investment_holdings
      FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'investment_holdings' AND policyname = 'investment_holdings_delete_own') THEN
    CREATE POLICY "investment_holdings_delete_own" ON public.investment_holdings
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── 2. crypto_holdings ────────────────────────────────────────────────
-- Holds individual crypto-coin positions. One row per (asset, symbol).
-- Source FK columns let the UI show a "Bitvavo" / "wallet" badge per coin
-- and link back to the connection in /identity/koppelingen. Both source
-- FKs are nullable: a fully manual entry has neither set.
CREATE TABLE IF NOT EXISTS public.crypto_holdings (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_id                        UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  symbol                          TEXT NOT NULL,
  name                            TEXT,
  chain                           TEXT,
  units                           NUMERIC NOT NULL DEFAULT 0,
  units_in_order                  NUMERIC NOT NULL DEFAULT 0,
  avg_purchase_price              NUMERIC,
  current_price                   NUMERIC,
  last_price_update               TIMESTAMPTZ,
  is_fiat_balance                 BOOLEAN DEFAULT false,
  is_favorite                     BOOLEAN DEFAULT false,
  is_active                       BOOLEAN DEFAULT true,
  source_exchange_connection_id   UUID REFERENCES public.exchange_connections(id) ON DELETE SET NULL,
  source_wallet_address_id        UUID REFERENCES public.wallet_addresses(id) ON DELETE SET NULL,
  notes                           TEXT,
  created_at                      TIMESTAMPTZ DEFAULT now(),
  updated_at                      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN public.crypto_holdings.symbol IS
  'Coin ticker, uppercase (BTC, ETH, ADA…). Use ''EUR''/''USD'' when is_fiat_balance is true.';
COMMENT ON COLUMN public.crypto_holdings.chain IS
  'Blockchain the coin sits on (bitcoin, ethereum, solana…). NULL for centralised-exchange holdings.';
COMMENT ON COLUMN public.crypto_holdings.is_fiat_balance IS
  'True for fiat-cash balances held inside an exchange (e.g. EUR balance at Bitvavo). Excluded from crypto-asset valuations.';
COMMENT ON COLUMN public.crypto_holdings.current_price IS
  'Spot price quoted in EUR. Other quote currencies are not supported by the rollup yet.';

CREATE INDEX IF NOT EXISTS crypto_holdings_asset_idx
  ON public.crypto_holdings(asset_id);
CREATE INDEX IF NOT EXISTS crypto_holdings_user_idx
  ON public.crypto_holdings(user_id);
CREATE INDEX IF NOT EXISTS crypto_holdings_exchange_src_idx
  ON public.crypto_holdings(source_exchange_connection_id) WHERE source_exchange_connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crypto_holdings_wallet_src_idx
  ON public.crypto_holdings(source_wallet_address_id) WHERE source_wallet_address_id IS NOT NULL;

-- Idempotent upsert key: exchange-syncs and wallet-syncs MERGE on
-- (asset_id, symbol) so a re-run does not create duplicate coin rows.
CREATE UNIQUE INDEX IF NOT EXISTS crypto_holdings_dedup_uidx
  ON public.crypto_holdings(asset_id, symbol);

ALTER TABLE public.crypto_holdings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crypto_holdings' AND policyname = 'crypto_holdings_select_own') THEN
    CREATE POLICY "crypto_holdings_select_own" ON public.crypto_holdings
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crypto_holdings' AND policyname = 'crypto_holdings_insert_own') THEN
    CREATE POLICY "crypto_holdings_insert_own" ON public.crypto_holdings
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crypto_holdings' AND policyname = 'crypto_holdings_update_own') THEN
    CREATE POLICY "crypto_holdings_update_own" ON public.crypto_holdings
      FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crypto_holdings' AND policyname = 'crypto_holdings_delete_own') THEN
    CREATE POLICY "crypto_holdings_delete_own" ON public.crypto_holdings
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── 3. investment_transactions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investment_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  holding_id          UUID NOT NULL REFERENCES public.investment_holdings(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('buy','sell','dividend','split','transfer_in','transfer_out')),
  units               NUMERIC NOT NULL,
  price_per_unit      NUMERIC NOT NULL,
  total_amount        NUMERIC NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'EUR',
  date                DATE NOT NULL,
  notes               TEXT,
  external_source     TEXT,
  external_trade_id   TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investment_tx_holding_idx
  ON public.investment_transactions(holding_id);
CREATE UNIQUE INDEX IF NOT EXISTS investment_tx_dedup_uidx
  ON public.investment_transactions(external_source, external_trade_id)
  WHERE external_source IS NOT NULL;

ALTER TABLE public.investment_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'investment_transactions' AND policyname = 'investment_transactions_select_own') THEN
    CREATE POLICY "investment_transactions_select_own" ON public.investment_transactions
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'investment_transactions' AND policyname = 'investment_transactions_insert_own') THEN
    CREATE POLICY "investment_transactions_insert_own" ON public.investment_transactions
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'investment_transactions' AND policyname = 'investment_transactions_update_own') THEN
    CREATE POLICY "investment_transactions_update_own" ON public.investment_transactions
      FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'investment_transactions' AND policyname = 'investment_transactions_delete_own') THEN
    CREATE POLICY "investment_transactions_delete_own" ON public.investment_transactions
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── 4. crypto_transactions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crypto_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  holding_id          UUID NOT NULL REFERENCES public.crypto_holdings(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('buy','sell','deposit','withdrawal','fee','reward')),
  units               NUMERIC NOT NULL,
  price_per_unit      NUMERIC,
  total_amount        NUMERIC,
  fee_native          NUMERIC,
  fee_currency        TEXT,
  date                DATE NOT NULL,
  notes               TEXT,
  external_source     TEXT,
  external_trade_id   TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crypto_tx_holding_idx
  ON public.crypto_transactions(holding_id);
CREATE UNIQUE INDEX IF NOT EXISTS crypto_tx_dedup_uidx
  ON public.crypto_transactions(external_source, external_trade_id)
  WHERE external_source IS NOT NULL;

ALTER TABLE public.crypto_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crypto_transactions' AND policyname = 'crypto_transactions_select_own') THEN
    CREATE POLICY "crypto_transactions_select_own" ON public.crypto_transactions
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crypto_transactions' AND policyname = 'crypto_transactions_insert_own') THEN
    CREATE POLICY "crypto_transactions_insert_own" ON public.crypto_transactions
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crypto_transactions' AND policyname = 'crypto_transactions_update_own') THEN
    CREATE POLICY "crypto_transactions_update_own" ON public.crypto_transactions
      FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crypto_transactions' AND policyname = 'crypto_transactions_delete_own') THEN
    CREATE POLICY "crypto_transactions_delete_own" ON public.crypto_transactions
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── 5. investment_holding_prices ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investment_holding_prices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id      UUID NOT NULL REFERENCES public.investment_holdings(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  close_price     NUMERIC NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'EUR',
  source          TEXT DEFAULT 'yahoo_finance',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(holding_id, date)
);

CREATE INDEX IF NOT EXISTS idx_investment_holding_prices_holding_date
  ON public.investment_holding_prices(holding_id, date DESC);

ALTER TABLE public.investment_holding_prices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'investment_holding_prices' AND policyname = 'investment_holding_prices_select_own') THEN
    CREATE POLICY "investment_holding_prices_select_own" ON public.investment_holding_prices
      FOR SELECT TO authenticated
      USING (holding_id IN (SELECT id FROM public.investment_holdings WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'investment_holding_prices' AND policyname = 'investment_holding_prices_insert_own') THEN
    CREATE POLICY "investment_holding_prices_insert_own" ON public.investment_holding_prices
      FOR INSERT TO authenticated
      WITH CHECK (holding_id IN (SELECT id FROM public.investment_holdings WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'investment_holding_prices' AND policyname = 'investment_holding_prices_update_own') THEN
    CREATE POLICY "investment_holding_prices_update_own" ON public.investment_holding_prices
      FOR UPDATE TO authenticated
      USING (holding_id IN (SELECT id FROM public.investment_holdings WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'investment_holding_prices' AND policyname = 'investment_holding_prices_delete_own') THEN
    CREATE POLICY "investment_holding_prices_delete_own" ON public.investment_holding_prices
      FOR DELETE TO authenticated
      USING (holding_id IN (SELECT id FROM public.investment_holdings WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ── 6. crypto_holding_prices ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crypto_holding_prices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id      UUID NOT NULL REFERENCES public.crypto_holdings(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  close_price     NUMERIC NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'EUR',
  source          TEXT DEFAULT 'coingecko',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(holding_id, date)
);

CREATE INDEX IF NOT EXISTS idx_crypto_holding_prices_holding_date
  ON public.crypto_holding_prices(holding_id, date DESC);

ALTER TABLE public.crypto_holding_prices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crypto_holding_prices' AND policyname = 'crypto_holding_prices_select_own') THEN
    CREATE POLICY "crypto_holding_prices_select_own" ON public.crypto_holding_prices
      FOR SELECT TO authenticated
      USING (holding_id IN (SELECT id FROM public.crypto_holdings WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crypto_holding_prices' AND policyname = 'crypto_holding_prices_insert_own') THEN
    CREATE POLICY "crypto_holding_prices_insert_own" ON public.crypto_holding_prices
      FOR INSERT TO authenticated
      WITH CHECK (holding_id IN (SELECT id FROM public.crypto_holdings WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crypto_holding_prices' AND policyname = 'crypto_holding_prices_update_own') THEN
    CREATE POLICY "crypto_holding_prices_update_own" ON public.crypto_holding_prices
      FOR UPDATE TO authenticated
      USING (holding_id IN (SELECT id FROM public.crypto_holdings WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crypto_holding_prices' AND policyname = 'crypto_holding_prices_delete_own') THEN
    CREATE POLICY "crypto_holding_prices_delete_own" ON public.crypto_holding_prices
      FOR DELETE TO authenticated
      USING (holding_id IN (SELECT id FROM public.crypto_holdings WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ── 7. Data migration ────────────────────────────────────────────────
-- Only runs if the legacy `holdings` table still exists AND the new
-- typed tables are still empty. The two guards together make a re-run
-- a no-op once the rename below has executed.
DO $$
DECLARE
  v_legacy_exists BOOLEAN;
  v_inv_count     INT;
  v_cry_count     INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'holdings'
  ) INTO v_legacy_exists;

  IF NOT v_legacy_exists THEN
    RAISE NOTICE 'split_holdings: legacy `holdings` already renamed — skipping data copy.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_inv_count FROM public.investment_holdings;
  SELECT COUNT(*) INTO v_cry_count FROM public.crypto_holdings;

  IF v_inv_count > 0 OR v_cry_count > 0 THEN
    RAISE NOTICE 'split_holdings: target tables already populated (investment=%, crypto=%) — skipping data copy.', v_inv_count, v_cry_count;
    RETURN;
  END IF;

  -- 7a. Investment holdings — preserve `holdings.id` so downstream FKs
  -- (transactions, prices) can be moved verbatim. The `external_source`
  -- column is left NULL for now; P2 will start writing it for fresh CSV
  -- imports.
  INSERT INTO public.investment_holdings (
    id, user_id, asset_id, ticker, name, isin, exchange, currency, units,
    avg_purchase_price, current_price, last_price_update,
    previous_close, daily_change_percent,
    asset_class, sector, geography, ter, ter_source,
    is_favorite, is_active, purchase_date, notes, created_at, updated_at
  )
  SELECT
    h.id, h.user_id, h.asset_id,
    COALESCE(h.ticker, h.name),  -- ticker is nullable in legacy schema; new schema requires it
    h.name, h.isin, NULL,         -- exchange unknown for legacy rows
    h.currency, h.units,
    NULLIF(h.avg_purchase_price, 0),  -- legacy default is 0; treat as "unknown"
    h.current_price, h.last_price_update,
    h.previous_close, h.daily_change_percent,
    h.asset_class, h.sector, h.geography, h.ter, h.ter_source,
    COALESCE(h.is_favorite, false), h.is_active, h.purchase_date, h.notes,
    h.created_at, h.updated_at
  FROM public.holdings h
  JOIN public.assets a ON a.id = h.asset_id
  WHERE a.asset_type = 'investment';

  -- 7b. Crypto holdings — strip "-EUR" suffix from legacy tickers to get
  -- the canonical symbol, derive `is_fiat_balance` for cash positions,
  -- and look up the source connection via the asset's
  -- `linked_asset_id` reverse-FK on exchange_connections / wallet_addresses.
  -- (At most one of each can exist per asset thanks to the 1-on-1
  -- unique indexes from migration 20260502000001.)
  INSERT INTO public.crypto_holdings (
    id, user_id, asset_id, symbol, name, units,
    avg_purchase_price, current_price, last_price_update,
    is_fiat_balance, is_favorite, is_active,
    source_exchange_connection_id, source_wallet_address_id,
    notes, created_at, updated_at
  )
  SELECT
    h.id, h.user_id, h.asset_id,
    UPPER(REGEXP_REPLACE(COALESCE(h.ticker, h.name), '-EUR$', '')) AS symbol,
    h.name, h.units,
    NULLIF(h.avg_purchase_price, 0),
    h.current_price, h.last_price_update,
    (UPPER(REGEXP_REPLACE(COALESCE(h.ticker, h.name), '-EUR$', '')) IN ('EUR','USD','GBP')) AS is_fiat_balance,
    COALESCE(h.is_favorite, false), h.is_active,
    (SELECT ec.id FROM public.exchange_connections ec WHERE ec.linked_asset_id = h.asset_id LIMIT 1),
    (SELECT wa.id FROM public.wallet_addresses wa WHERE wa.linked_asset_id = h.asset_id LIMIT 1),
    h.notes, h.created_at, h.updated_at
  FROM public.holdings h
  JOIN public.assets a ON a.id = h.asset_id
  WHERE a.asset_type = 'crypto';

  -- 7c. Transactions — split by parent holding's bucket. The legacy IDs
  -- of the holdings were preserved above so `holding_id` keeps pointing
  -- at the right row.
  INSERT INTO public.investment_transactions (
    id, user_id, holding_id, type, units, price_per_unit, total_amount,
    date, notes, external_source, external_trade_id, created_at
  )
  SELECT
    ht.id, ht.user_id, ht.holding_id, ht.type, ht.units, ht.price_per_unit,
    ht.total_amount, ht.date, ht.notes, ht.external_source, ht.external_trade_id,
    ht.created_at
  FROM public.holding_transactions ht
  JOIN public.holdings h ON h.id = ht.holding_id
  JOIN public.assets a ON a.id = h.asset_id
  WHERE a.asset_type = 'investment';

  -- Crypto-side: legacy `holding_transactions.type` allows
  -- ('buy','sell','dividend','split'); the new crypto check accepts
  -- ('buy','sell','deposit','withdrawal','fee','reward'). Map dividend
  -- and split to 'reward' and 'transfer-equivalent' respectively — no
  -- crypto rows currently exist with those types (legacy data is 100%
  -- buy/sell from Bitvavo F2 work-in-progress) so the CASE is purely
  -- defensive.
  INSERT INTO public.crypto_transactions (
    id, user_id, holding_id, type, units, price_per_unit, total_amount,
    date, notes, external_source, external_trade_id, created_at
  )
  SELECT
    ht.id, ht.user_id, ht.holding_id,
    CASE ht.type
      WHEN 'buy'      THEN 'buy'
      WHEN 'sell'     THEN 'sell'
      WHEN 'dividend' THEN 'reward'
      WHEN 'split'    THEN 'deposit'
      ELSE 'buy'
    END,
    ht.units, ht.price_per_unit, ht.total_amount, ht.date, ht.notes,
    ht.external_source, ht.external_trade_id, ht.created_at
  FROM public.holding_transactions ht
  JOIN public.holdings h ON h.id = ht.holding_id
  JOIN public.assets a ON a.id = h.asset_id
  WHERE a.asset_type = 'crypto';

  -- 7d. Holding prices — split by the same bucket as the parent holding.
  INSERT INTO public.investment_holding_prices (
    id, holding_id, date, close_price, currency, source, created_at
  )
  SELECT hp.id, hp.holding_id, hp.date, hp.close_price, hp.currency, hp.source, hp.created_at
  FROM public.holding_prices hp
  JOIN public.holdings h ON h.id = hp.holding_id
  JOIN public.assets a ON a.id = h.asset_id
  WHERE a.asset_type = 'investment';

  INSERT INTO public.crypto_holding_prices (
    id, holding_id, date, close_price, currency, source, created_at
  )
  SELECT hp.id, hp.holding_id, hp.date, hp.close_price, hp.currency, hp.source, hp.created_at
  FROM public.holding_prices hp
  JOIN public.holdings h ON h.id = hp.holding_id
  JOIN public.assets a ON a.id = h.asset_id
  WHERE a.asset_type = 'crypto';

  RAISE NOTICE 'split_holdings: data copy complete.';
END $$;

-- ── 8. Drop holding_alerts FK (currently empty) ─────────────────────
-- holding_alerts.holding_id references the legacy table. The table is
-- empty in production (verified pre-migration). Drop the FK so the
-- rename below does not fail; P3 will repoint this constraint at the
-- correct typed table once the alert UI is rebuilt.
ALTER TABLE public.holding_alerts
  DROP CONSTRAINT IF EXISTS holding_alerts_holding_id_fkey;

-- ── 9. Rename legacy tables ──────────────────────────────────────────
-- After this step any code still touching `holdings`/`holding_transactions`
-- /`holding_prices` will receive "relation does not exist" errors. P2
-- (writers) and P3 (UI) MUST follow before the next deploy.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='holdings') THEN
    ALTER TABLE public.holdings RENAME TO _legacy_holdings;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='holding_transactions') THEN
    ALTER TABLE public.holding_transactions RENAME TO _legacy_holding_transactions;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='holding_prices') THEN
    ALTER TABLE public.holding_prices RENAME TO _legacy_holding_prices;
  END IF;
END $$;
