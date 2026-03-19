-- Formalize the idx_budgets_user_slug constraint that exists in production
-- but was never captured in migrations.
--
-- The OLD constraint (user_id, slug) is too strict: it prevents the same
-- slug (e.g. 'overig') from existing under different parent categories for
-- the same user.
--
-- The NEW constraint uses a composite of (user_id, slug, parent_id) via
-- COALESCE to handle NULL parent_id (top-level budgets) correctly, since
-- PostgreSQL treats NULLs as distinct in unique indexes.

-- 1. Drop the old simple constraint if it exists
DROP INDEX IF EXISTS idx_budgets_user_slug;

-- 2. Create new composite unique index that allows same slug under different parents
-- COALESCE maps NULL parent_id → sentinel UUID so that top-level budgets are
-- properly deduplicated (two top-level budgets with the same slug would conflict).
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_user_slug_parent
  ON budgets (user_id, slug, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid));
