-- ============================================================
-- Connections refactor: strict 1-on-1 with assets/debts (R1)
--
-- Pre-refactor, exchange_connections had no link to assets at all — the
-- connect-route auto-created an asset by name ("Bitvavo — {label}") via
-- exchange-sync.ts.upsertExchangeAsset(). wallet_addresses already had a
-- nullable linked_asset_id but the wallet-sync path also auto-created a
-- standalone asset when the column was NULL.
--
-- This migration enforces the contract that every connection points at
-- exactly one user-owned asset (and optionally one debt — reserved for
-- future-use). The data-migration step backfills linked_asset_id for any
-- pre-existing rows by matching on the auto-generated asset name; rows
-- that cannot be matched are deleted (they are orphaned syncs that the
-- new flow cannot represent — the user can re-couple via the UI).
-- ============================================================

-- ── exchange_connections: add linked_asset_id + linked_debt_id ──────────
ALTER TABLE public.exchange_connections
  ADD COLUMN IF NOT EXISTS linked_asset_id UUID,
  ADD COLUMN IF NOT EXISTS linked_debt_id  UUID;

-- Backfill linked_asset_id by matching the historical name pattern produced
-- by lib/integrations/exchange-sync.ts: "{Display} — {label}" or just
-- "{Display}" when no label was set. Display strings are static so we hard-
-- code them here. We pick the OLDEST matching crypto asset per user so
-- multiple connections with the same label collapse onto the asset that
-- was first created (deterministic).
UPDATE public.exchange_connections AS c
SET linked_asset_id = a.id
FROM (
  SELECT DISTINCT ON (a.user_id, a.name) a.id, a.user_id, a.name
  FROM public.assets a
  WHERE a.asset_type = 'crypto'
  ORDER BY a.user_id, a.name, a.created_at NULLS LAST, a.id
) AS a
WHERE c.linked_asset_id IS NULL
  AND c.user_id = a.user_id
  AND a.name = (
    CASE c.exchange
      WHEN 'bitvavo'  THEN 'Bitvavo'
      WHEN 'kraken'   THEN 'Kraken'
      WHEN 'coinbase' THEN 'Coinbase'
      ELSE c.exchange
    END
    || CASE WHEN c.label IS NOT NULL AND length(btrim(c.label)) > 0
            THEN ' — ' || btrim(c.label)
            ELSE ''
       END
  );

-- Drop any exchange_connections rows we could not match — they would
-- violate the upcoming NOT NULL + FK constraints. The user can re-create
-- the coupling via the new connect-flow which now requires a target
-- linkedAssetId up-front.
DELETE FROM public.exchange_connections WHERE linked_asset_id IS NULL;

ALTER TABLE public.exchange_connections
  ALTER COLUMN linked_asset_id SET NOT NULL;

ALTER TABLE public.exchange_connections
  ADD CONSTRAINT exchange_connections_linked_asset_fk
    FOREIGN KEY (linked_asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;

ALTER TABLE public.exchange_connections
  ADD CONSTRAINT exchange_connections_linked_debt_fk
    FOREIGN KEY (linked_debt_id) REFERENCES public.debts(id) ON DELETE CASCADE;

-- One-on-one: every asset can only own ONE exchange connection. Partial
-- unique index because linked_debt_id is nullable on this table (debt
-- variants get the same protection via wallet_addresses on the debt side).
CREATE UNIQUE INDEX IF NOT EXISTS exchange_connections_linked_asset_uidx
  ON public.exchange_connections (linked_asset_id);

CREATE INDEX IF NOT EXISTS exchange_connections_linked_debt_idx
  ON public.exchange_connections (linked_debt_id) WHERE linked_debt_id IS NOT NULL;

-- ── wallet_addresses: enforce non-null linked_asset_id + uniqueness ────
ALTER TABLE public.wallet_addresses
  ADD COLUMN IF NOT EXISTS linked_debt_id UUID;

-- Backfill: for any wallet_addresses row where linked_asset_id IS NULL,
-- match the auto-generated standalone-asset name produced by
-- lib/integrations/wallet-sync.ts: "{Chain} wallet — {label}" or
-- "{Chain} wallet" when no label was set.
UPDATE public.wallet_addresses AS w
SET linked_asset_id = a.id
FROM (
  SELECT DISTINCT ON (a.user_id, a.name) a.id, a.user_id, a.name
  FROM public.assets a
  WHERE a.asset_type = 'crypto'
  ORDER BY a.user_id, a.name, a.created_at NULLS LAST, a.id
) AS a
WHERE w.linked_asset_id IS NULL
  AND w.user_id = a.user_id
  AND a.name = (
    CASE w.chain
      WHEN 'bitcoin'  THEN 'Bitcoin'
      WHEN 'ethereum' THEN 'Ethereum'
      WHEN 'polygon'  THEN 'Polygon'
      WHEN 'arbitrum' THEN 'Arbitrum'
      WHEN 'base'     THEN 'Base'
      WHEN 'solana'   THEN 'Solana'
      ELSE w.chain
    END
    || ' wallet'
    || CASE WHEN w.label IS NOT NULL AND length(btrim(w.label)) > 0
            THEN ' — ' || btrim(w.label)
            ELSE ''
       END
  );

-- Drop any wallet_addresses rows we could not backfill — same reasoning.
DELETE FROM public.wallet_addresses WHERE linked_asset_id IS NULL;

-- The previous ON DELETE SET NULL is incompatible with NOT NULL — drop the
-- existing FK and re-add it as ON DELETE CASCADE.
ALTER TABLE public.wallet_addresses
  DROP CONSTRAINT IF EXISTS wallet_addresses_linked_asset_id_fkey;

ALTER TABLE public.wallet_addresses
  ALTER COLUMN linked_asset_id SET NOT NULL;

ALTER TABLE public.wallet_addresses
  ADD CONSTRAINT wallet_addresses_linked_asset_fk
    FOREIGN KEY (linked_asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;

ALTER TABLE public.wallet_addresses
  ADD CONSTRAINT wallet_addresses_linked_debt_fk
    FOREIGN KEY (linked_debt_id) REFERENCES public.debts(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_addresses_linked_asset_uidx
  ON public.wallet_addresses (linked_asset_id);

CREATE INDEX IF NOT EXISTS wallet_addresses_linked_debt_idx
  ON public.wallet_addresses (linked_debt_id) WHERE linked_debt_id IS NOT NULL;
