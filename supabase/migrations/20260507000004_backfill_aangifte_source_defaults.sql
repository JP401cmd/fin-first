-- =============================================
-- Migration: Backfill aangifte source defaults
--
-- Achtergrond: bij de eerste apply van `add_aangifte_source` waren de
-- kolommen `source` en `imported_peildatum` op `assets`/`debts` op de
-- productiedatabase al aanwezig als nullable kolommen zonder default
-- (vermoedelijk uit een eerdere preview-run). `ADD COLUMN IF NOT EXISTS`
-- is no-op bij een bestaande kolom, dus de `NOT NULL DEFAULT 'manual'`
-- clause werd overgeslagen. Bestaande rijen hadden hierdoor `source IS NULL`.
--
-- Deze migratie corrigeert dat: backfill NULL → 'manual', zet de DEFAULT,
-- en maakt de kolom NOT NULL — zodat nieuwe manual rows van de QuickAdd
-- Wizard ook automatisch 'manual' krijgen, en de partial index op
-- `source <> 'manual'` correct werkt.
--
-- Op een schone database is deze migratie no-op — `add_aangifte_source`
-- creëert dan de kolom al met de juiste constraints en deze backfill
-- vindt geen NULL rijen om bij te werken.
--
-- IDEMPOTENCY: UPDATE is no-op als geen NULL bestaat. ALTER SET DEFAULT
-- is idempotent. ALTER SET NOT NULL is guarded met een attnotnull check
-- in een DO-block.
-- =============================================

-- ── assets ────────────────────────────────────────────────────────
UPDATE public.assets SET source = 'manual' WHERE source IS NULL;

ALTER TABLE public.assets
  ALTER COLUMN source SET DEFAULT 'manual';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'assets'
      AND a.attname = 'source'
      AND a.attnotnull = false
  ) THEN
    ALTER TABLE public.assets ALTER COLUMN source SET NOT NULL;
  END IF;
END $$;

-- ── debts ─────────────────────────────────────────────────────────
UPDATE public.debts SET source = 'manual' WHERE source IS NULL;

ALTER TABLE public.debts
  ALTER COLUMN source SET DEFAULT 'manual';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'debts'
      AND a.attname = 'source'
      AND a.attnotnull = false
  ) THEN
    ALTER TABLE public.debts ALTER COLUMN source SET NOT NULL;
  END IF;
END $$;
