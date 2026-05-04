-- Performance: composite indexes for hot query patterns.
--
-- All five indexes target queries that filter by user_id (RLS) AND a second
-- column (date range or active flag) used in WHERE / ORDER BY. Single-column
-- indexes already exist on user_id; with a composite, Postgres can do an
-- index range scan in one step instead of bitmap-and'ing two indexes and
-- then sorting.
--
-- IF NOT EXISTS keeps this idempotent on environments where someone has
-- created the same index by hand. CONCURRENTLY isn't usable inside a
-- migration transaction; the indexes are sub-second on current data volume,
-- so a regular CREATE INDEX is fine. Re-run on production when ready.

-- transactions(user_id, date) — used by 6 data loaders for monthly /
-- 6-month / 12-month range queries. Hottest query in the app.
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions(user_id, date DESC);

-- net_worth_snapshots(user_id, snapshot_date) — used by core, dashboard,
-- horizon and resilience charts. Avoids in-memory sort on time-series.
CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_user_date
  ON net_worth_snapshots(user_id, snapshot_date DESC);

-- valuations(user_id, entity_type, valuation_date) — per-asset history
-- queries always filter on entity_type='asset' and order by date.
CREATE INDEX IF NOT EXISTS idx_valuations_user_type_date
  ON valuations(user_id, entity_type, valuation_date DESC);

-- goals(user_id, is_completed, sort_order) — active-goals lookup with
-- sort, used by doelen-widget and /will.
CREATE INDEX IF NOT EXISTS idx_goals_user_active
  ON goals(user_id, is_completed, sort_order);

-- life_events(user_id, is_active, sort_order) — FIRE simulation and
-- horizon-page query active events ordered by user-set sort.
CREATE INDEX IF NOT EXISTS idx_life_events_user_active_sort
  ON life_events(user_id, is_active, sort_order);
