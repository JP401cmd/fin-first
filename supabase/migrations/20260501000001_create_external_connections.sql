-- ============================================================
-- External data integrations — foundation tables (W1.1)
--
-- Adds three user-scoped tables that unblock crypto exchange + on-chain
-- wallet sync features (W1.2, W1.3, W2.*) and provide a generic audit
-- log for all external data syncs.
--
-- Encryption: API keys/secrets are stored in `*_encrypted` columns using
-- the same AES-256-GCM wire format as bank_connections (see
-- lib/crypto/field-encryption.ts, format `v1:<base64>`). The `api_key_hash`
-- column is a HMAC-SHA256 blind index over the normalised plaintext key —
-- used to detect duplicate connections without storing the key in clear.
-- The `api_key_last4` column holds the last 4 chars of the plaintext key
-- for safe display in the UI ("•••• 1234").
--
-- Wallet addresses are PUBLIC blockchain identifiers and are NOT encrypted.
-- ============================================================

-- ── exchange_connections: encrypted API credentials per exchange ────────
CREATE TABLE IF NOT EXISTS public.exchange_connections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exchange             TEXT NOT NULL CHECK (exchange IN ('bitvavo', 'kraken', 'coinbase')),
  api_key_encrypted    TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  api_key_hash         TEXT NOT NULL,
  api_key_last4        TEXT,
  label                TEXT,
  last_synced_at       TIMESTAMPTZ,
  last_sync_error      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.exchange_connections.api_key_encrypted IS
  'AES-256-GCM ciphertext of the API key (format v1:<base64>). See lib/crypto/field-encryption.ts.';
COMMENT ON COLUMN public.exchange_connections.api_secret_encrypted IS
  'AES-256-GCM ciphertext of the API secret (format v1:<base64>).';
COMMENT ON COLUMN public.exchange_connections.api_key_hash IS
  'HMAC-SHA256 blind index of normalised api_key — used to prevent duplicate connections per user.';
COMMENT ON COLUMN public.exchange_connections.api_key_last4 IS
  'Last 4 plaintext characters of api_key for masked UI display ("•••• 1234"). Safe to expose to client.';

CREATE UNIQUE INDEX IF NOT EXISTS exchange_connections_user_exchange_keyhash_uidx
  ON public.exchange_connections (user_id, exchange, api_key_hash);

CREATE INDEX IF NOT EXISTS exchange_connections_user_idx
  ON public.exchange_connections (user_id);

ALTER TABLE public.exchange_connections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'exchange_connections' AND policyname = 'exchange_connections_select_own'
  ) THEN
    CREATE POLICY "exchange_connections_select_own" ON public.exchange_connections
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'exchange_connections' AND policyname = 'exchange_connections_insert_own'
  ) THEN
    CREATE POLICY "exchange_connections_insert_own" ON public.exchange_connections
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'exchange_connections' AND policyname = 'exchange_connections_update_own'
  ) THEN
    CREATE POLICY "exchange_connections_update_own" ON public.exchange_connections
      FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'exchange_connections' AND policyname = 'exchange_connections_delete_own'
  ) THEN
    CREATE POLICY "exchange_connections_delete_own" ON public.exchange_connections
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── wallet_addresses: public on-chain addresses (no encryption) ────────
CREATE TABLE IF NOT EXISTS public.wallet_addresses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chain                TEXT NOT NULL CHECK (chain IN ('bitcoin', 'ethereum', 'polygon', 'arbitrum', 'base', 'solana')),
  address              TEXT NOT NULL,
  label                TEXT,
  linked_asset_id      UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  last_synced_at       TIMESTAMPTZ,
  last_balance_native  NUMERIC,
  last_balance_eur     NUMERIC,
  last_sync_error      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, chain, address)
);

CREATE INDEX IF NOT EXISTS wallet_addresses_user_idx
  ON public.wallet_addresses (user_id);

CREATE INDEX IF NOT EXISTS wallet_addresses_linked_asset_idx
  ON public.wallet_addresses (linked_asset_id) WHERE linked_asset_id IS NOT NULL;

ALTER TABLE public.wallet_addresses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wallet_addresses' AND policyname = 'wallet_addresses_select_own'
  ) THEN
    CREATE POLICY "wallet_addresses_select_own" ON public.wallet_addresses
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wallet_addresses' AND policyname = 'wallet_addresses_insert_own'
  ) THEN
    CREATE POLICY "wallet_addresses_insert_own" ON public.wallet_addresses
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wallet_addresses' AND policyname = 'wallet_addresses_update_own'
  ) THEN
    CREATE POLICY "wallet_addresses_update_own" ON public.wallet_addresses
      FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wallet_addresses' AND policyname = 'wallet_addresses_delete_own'
  ) THEN
    CREATE POLICY "wallet_addresses_delete_own" ON public.wallet_addresses
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── external_data_sources: polymorphic audit log of sync runs ──────────
-- source_ref_id is intentionally NOT a foreign key — it can point at either
-- exchange_connections.id or wallet_addresses.id (or be null for market-data
-- runs). Cleanup of orphaned audit rows is handled at the application level
-- in the disconnect routes.
CREATE TABLE IF NOT EXISTS public.external_data_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type     TEXT NOT NULL CHECK (source_type IN ('exchange', 'wallet', 'market_data')),
  source_ref_id   UUID,
  run_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial')),
  items_synced    INT NOT NULL DEFAULT 0,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS external_data_sources_user_runat_idx
  ON public.external_data_sources (user_id, run_at DESC);

CREATE INDEX IF NOT EXISTS external_data_sources_user_source_idx
  ON public.external_data_sources (user_id, source_type, source_ref_id);

ALTER TABLE public.external_data_sources ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'external_data_sources' AND policyname = 'external_data_sources_select_own'
  ) THEN
    CREATE POLICY "external_data_sources_select_own" ON public.external_data_sources
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'external_data_sources' AND policyname = 'external_data_sources_insert_own'
  ) THEN
    CREATE POLICY "external_data_sources_insert_own" ON public.external_data_sources
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'external_data_sources' AND policyname = 'external_data_sources_update_own'
  ) THEN
    CREATE POLICY "external_data_sources_update_own" ON public.external_data_sources
      FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'external_data_sources' AND policyname = 'external_data_sources_delete_own'
  ) THEN
    CREATE POLICY "external_data_sources_delete_own" ON public.external_data_sources
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
