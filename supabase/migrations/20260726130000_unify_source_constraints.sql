-- =============================================
-- Migration: Unify conflicting `source` CHECK constraints on assets + debts
--
-- BUG (WF-MIJN-19-bug1, S0): both `assets` and `debts` carried TWO
-- simultaneously-active, mutually-contradictory CHECK constraints on `source`:
--
--   * assets_source_values / debts_source_values
--       (20260401000001_news_only_mode_schema.sql, never dropped)
--       CHECK (source IS NULL OR source IN ('manual','ai_extracted','bank_sync'))
--
--   * assets_source_check / debts_source_check
--       (20260507000001_add_aangifte_source.sql)
--       CHECK (source IN ('manual','aangifte_import','broker_csv','bank_psd2'))
--
-- Postgres requires an INSERT/UPDATE to satisfy EVERY CHECK constraint on the
-- column, so any value allowed by only one of the two always fails:
--   - `aangifte_import` (aangifte-import flow, app/api/onboarding/aangifte-import)
--       passes *_source_check but is rejected by *_source_values → 500.
--   - `ai_extracted` (news-only AI-extractie onboarding, save-own-data)
--       passes *_source_values but is rejected by *_source_check → 500.
-- Both write paths were broken in opposite directions.
--
-- FIX: drop BOTH legacy constraints per table and reinstate a SINGLE canonical
-- constraint that permits the complete, union set of provenance tags:
--   manual, aangifte_import, broker_csv, bank_psd2, ai_extracted, bank_sync
-- (the three actually-written values `manual` / `aangifte_import` / `ai_extracted`
--  plus the three reserved-for-future tags `broker_csv` / `bank_psd2` / `bank_sync`).
--
-- NULL-gedrag: the older *_source_values tolerated NULL. The column is currently
-- NOT NULL DEFAULT 'manual' (set in 20260507000001), so NULL cannot actually be
-- inserted, but we keep the `source IS NULL OR ...` shape to preserve the historic
-- NULL-tolerance in case the NOT NULL is ever relaxed — this widens nothing.
--
-- DATA RISK: nul. Live count at migration-authoring time: assets 91 rows /
-- debts 38 rows, ALL `source='manual'` — every prior non-manual insert failed and
-- rolled back, so there is no row that would violate the new unified constraint.
-- No backfill needed.
--
-- IDEMPOTENCY: DROP ... IF EXISTS + a pg_constraint guard around ADD CONSTRAINT,
-- matching the idiom of the migrations this one reconciles. Safe to re-run.
-- =============================================

-- ── assets: drop both legacy constraints, add one canonical ──────────
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_source_values;
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_source_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assets_source_check'
  ) THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_source_check
      CHECK (source IS NULL OR source = ANY (ARRAY[
        'manual', 'aangifte_import', 'broker_csv', 'bank_psd2', 'ai_extracted', 'bank_sync'
      ]));
  END IF;
END $$;

COMMENT ON COLUMN public.assets.source IS
  'Provenance tag for this asset row. One of: manual (default, hand-entered), aangifte_import (Belastingdienst-aangifte flow), ai_extracted (news-only AI-extractie onboarding), broker_csv (broker CSV upload, reserved), bank_psd2 (bank PSD2 sync, reserved), bank_sync (legacy/reserved bank sync).';

-- ── debts: drop both legacy constraints, add one canonical ───────────
ALTER TABLE public.debts DROP CONSTRAINT IF EXISTS debts_source_values;
ALTER TABLE public.debts DROP CONSTRAINT IF EXISTS debts_source_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'debts_source_check'
  ) THEN
    ALTER TABLE public.debts
      ADD CONSTRAINT debts_source_check
      CHECK (source IS NULL OR source = ANY (ARRAY[
        'manual', 'aangifte_import', 'broker_csv', 'bank_psd2', 'ai_extracted', 'bank_sync'
      ]));
  END IF;
END $$;

COMMENT ON COLUMN public.debts.source IS
  'Provenance tag for this debt row. One of: manual (default, hand-entered), aangifte_import, ai_extracted (news-only AI-extractie onboarding), broker_csv (reserved), bank_psd2 (reserved), bank_sync (legacy/reserved). See assets.source for the full convention.';
