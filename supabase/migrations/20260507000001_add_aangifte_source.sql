-- =============================================
-- Migration: Aangifte-import provenance on assets + debts
--
-- Adds `source` and `imported_peildatum` columns to the `assets` and `debts`
-- tables so we can distinguish hand-entered records from records imported
-- through the tax-return (aangifte) flow, broker-CSV imports or PSD2 bank
-- syncs. The provenance tag enables three concrete features:
--
--   1. Bulk-delete of "all aangifte-imported items" from /identity/instellingen
--      (data-rights), without affecting manually entered records.
--   2. Stale-data UX: /core can show a "Verifieer"-pill on imported items
--      whose `imported_peildatum` is older than the current quarter.
--   3. Server-side completion-detector for goals-guide steps (vo_first_asset
--      etc.) that should fire as soon as a `source='aangifte_import'` row
--      exists for the user.
--
-- The default `'manual'` keeps existing rows backward compatible with
-- zero application-code changes — every pre-migration row is implicitly
-- manual provenance.
--
-- IDEMPOTENCY: All changes use IF NOT EXISTS so the migration is safe to
-- re-run. The CHECK constraints are added inside DO blocks that look up
-- pg_constraint to avoid the "constraint already exists" error on re-runs.
-- =============================================

-- ── assets: source + imported_peildatum ──────────────────────────────
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS imported_peildatum DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assets_source_check'
  ) THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_source_check
      CHECK (source IN ('manual', 'aangifte_import', 'broker_csv', 'bank_psd2'));
  END IF;
END $$;

COMMENT ON COLUMN public.assets.source IS
  'Provenance tag for this asset row. One of: manual (default, hand-entered), aangifte_import (Belastingdienst-aangifte flow), broker_csv (broker CSV upload), bank_psd2 (bank PSD2 sync).';
COMMENT ON COLUMN public.assets.imported_peildatum IS
  'Reference date of the source from which this record was imported (e.g. 1 January of the tax year for aangifte_import). NULL for manually entered records.';

-- ── debts: source + imported_peildatum ───────────────────────────────
ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS imported_peildatum DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'debts_source_check'
  ) THEN
    ALTER TABLE public.debts
      ADD CONSTRAINT debts_source_check
      CHECK (source IN ('manual', 'aangifte_import', 'broker_csv', 'bank_psd2'));
  END IF;
END $$;

COMMENT ON COLUMN public.debts.source IS
  'Provenance tag for this debt row. One of: manual (default, hand-entered), aangifte_import, broker_csv, bank_psd2. See assets.source for the full convention.';
COMMENT ON COLUMN public.debts.imported_peildatum IS
  'Reference date of the source from which this record was imported. NULL for manually entered records.';

-- ── Indexes — partial, non-manual rows only ──────────────────────────
--
-- The vast majority of rows are `source='manual'` (everything pre-existing
-- and everything created via the QuickAdd wizard). A full index on
-- (user_id, source) would mostly index that one common value and waste
-- space + write-cost. We only need the index for queries that filter on
-- non-manual sources (bulk-delete imports, "imported items" filters,
-- aangifte completion-detector). A partial index keeps it small and hot.

CREATE INDEX IF NOT EXISTS idx_assets_user_source_imported
  ON public.assets (user_id, source)
  WHERE source <> 'manual';

CREATE INDEX IF NOT EXISTS idx_debts_user_source_imported
  ON public.debts (user_id, source)
  WHERE source <> 'manual';
