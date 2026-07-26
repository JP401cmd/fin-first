-- cleanup-orphaned-holdings.sql
-- Eenmalig OPSCHOON/DETECTIE-script voor WF-BEZIT-14-bug2.
--
-- Context: vóór de fix kon POST /api/holdings (zonder asset_id) via een
-- niet-deterministische fallback-query een VERKEERD of SOFT-DELETED asset kiezen.
-- Zo'n holding hangt dan aan een asset zonder `has_holdings_tracking = true`
-- en/of met `is_active = false`, en is daardoor PERMANENT onzichtbaar in de UI
-- (GET /api/holdings joint altijd op `assets.has_holdings_tracking = true`).
--
-- ⚠️ NIET automatisch uitvoeren tegen productie. Dit is een RELEASE-stap:
--    draai eerst STAP 1 (read-only detectie), beoordeel de treffers per
--    gebruiker, en pas daarna eventueel een gerichte remediatie toe. Er wordt
--    hier bewust NIETS verwijderd of automatisch herkoppeld — dat is een
--    product-/data-beslissing per geval.

-- ─────────────────────────────────────────────────────────────────────────────
-- STAP 1 — DETECTIE (read-only): actieve investment-holdings die onzichtbaar zijn
--          omdat hun asset ontbreekt, gearchiveerd is, of geen holdings-tracking
--          heeft.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  h.id                       AS holding_id,
  h.user_id,
  h.name                     AS holding_name,
  h.ticker,
  h.asset_id,
  a.id                       AS asset_exists,
  a.name                     AS asset_name,
  a.asset_type,
  a.is_active                AS asset_is_active,
  a.has_holdings_tracking,
  CASE
    WHEN a.id IS NULL                               THEN 'asset_missing'
    WHEN a.is_active IS DISTINCT FROM TRUE          THEN 'asset_archived'
    WHEN a.has_holdings_tracking IS DISTINCT FROM TRUE THEN 'asset_not_tracking'
  END                        AS orphan_reason
FROM investment_holdings h
LEFT JOIN assets a
  ON a.id = h.asset_id
 AND a.user_id = h.user_id
WHERE h.is_active = TRUE
  AND (
        h.asset_id IS NULL
     OR a.id IS NULL
     OR a.is_active IS DISTINCT FROM TRUE
     OR a.has_holdings_tracking IS DISTINCT FROM TRUE
  )
ORDER BY h.user_id, h.created_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- STAP 2 — REMEDIATIE (handmatig, per geval — NIET blind draaien)
-- ─────────────────────────────────────────────────────────────────────────────
-- Optie A — herkoppelen aan het beoogde, actieve, holdings-tracked asset van
-- DEZELFDE gebruiker (alleen als er precies één eenduidige kandidaat is):
--
--   UPDATE investment_holdings h
--      SET asset_id = :target_asset_id,
--          updated_at = now()
--    WHERE h.id = :holding_id
--      AND h.user_id = :user_id
--      AND EXISTS (
--            SELECT 1 FROM assets a
--             WHERE a.id = :target_asset_id
--               AND a.user_id = :user_id
--               AND a.is_active = TRUE
--               AND a.has_holdings_tracking = TRUE
--          );
--   -- Draai hierna de asset-waarde-sync (syncAssetValueFromInvestmentHoldings)
--   -- of laat de eerstvolgende holding-mutatie dat doen, zodat current_value klopt.
--
-- Optie B — soft-delete de onherstelbare orphan (bv. asset onvindbaar en geen
-- eenduidige kandidaat), zodat 'ie niet als verborgen "actieve" rij blijft staan:
--
--   UPDATE investment_holdings
--      SET is_active = FALSE, updated_at = now()
--    WHERE id = :holding_id AND user_id = :user_id;
