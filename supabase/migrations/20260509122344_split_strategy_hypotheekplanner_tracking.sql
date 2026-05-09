-- Split Debt.has_strategy_tracking into Debt.has_hypotheekplanner_tracking.
--
-- Context: `has_strategy_tracking` was a shared opt-in for two unrelated apps:
--   1. Aflosstrategie (snowball/avalanche-engine) — by definition global over
--      the whole portfolio, so a per-debt opt-in was friction without
--      calculation rationale. It now becomes a global card on /core/debts.
--   2. Hypotheekplanner — equity buildup, oversluit-scenarios, hypotheek-vs-
--      beleggen. Per-debt opt-in is meaningful here: the planner is only
--      relevant for users with a mortgage and (optionally) a linked house.
--
-- Migration: add the new mortgage-only column, backfill from the old column
-- on mortgage rows (only mortgage rows carried Hypotheekplanner-state; for
-- other debt types the flag was purely Aflosstrategie = now global), then
-- drop the old column.
--
-- Naam-patroon volgt 20260321100001_add_assets_has_holdings_tracking.sql.

ALTER TABLE debts ADD COLUMN IF NOT EXISTS has_hypotheekplanner_tracking BOOLEAN NOT NULL DEFAULT false;

UPDATE debts SET has_hypotheekplanner_tracking = true
WHERE debt_type = 'mortgage' AND has_strategy_tracking = true;

ALTER TABLE debts DROP COLUMN has_strategy_tracking;
