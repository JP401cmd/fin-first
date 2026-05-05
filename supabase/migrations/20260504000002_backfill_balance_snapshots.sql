-- Backfill balance_snapshots from existing valuations + holding price history
--
-- Achtergrond: de sparkline-overlay op categoriekaarten (CardTintOverlay)
-- en de per-entiteit sparkline op categorie-pagina's lezen uit
-- balance_snapshots. Tot nu toe werd die tabel alleen geschreven door:
--   * /core/assets/revalue (bulk-herwaarderen)
--   * /api/snapshots/{route,cron,auto}
--
-- Individuele herwaarderingen (asset-edit, debt-edit, ValuationModal,
-- check-in) schreven alleen naar `valuations`. Daardoor bleef de sparkline
-- op de categoriekaart vlak voor types als eigen_huis, real_estate,
-- vordering, levensverzekering, persoonlijke_lening etc.
--
-- Deze migratie vult balance_snapshots eenmalig met:
--   1) Alle bestaande valuations (één rij per (entity, valuation_date)).
--   2) Maand-snapshots afgeleid uit de holding-prijshistorie (per holding
--      per maand de laatste close_price × huidige units, gegroepeerd per
--      asset). Dit geeft crypto- en investment-categorieën een sparkline
--      die de prijscurve volgt — ook voor users zonder lange snapshot-
--      historie.
--
-- Bestaande snapshot-rijen blijven intact (ON CONFLICT DO NOTHING).

-- ── 1. Backfill uit valuations ──────────────────────────────────────
INSERT INTO balance_snapshots (
  user_id, snapshot_date, entity_type, entity_id, entity_name,
  entity_subtype, balance, net_worth_inclusion_pct
)
SELECT
  v.user_id,
  v.valuation_date,
  v.entity_type,
  v.entity_id,
  COALESCE(a.name, d.name)                                            AS entity_name,
  COALESCE(a.asset_type, d.debt_type)                                 AS entity_subtype,
  v.value                                                             AS balance,
  COALESCE(a.net_worth_inclusion_pct, d.net_worth_inclusion_pct, 100) AS net_worth_inclusion_pct
FROM valuations v
LEFT JOIN assets a ON v.entity_type = 'asset' AND a.id = v.entity_id
LEFT JOIN debts  d ON v.entity_type = 'debt'  AND d.id = v.entity_id
WHERE COALESCE(a.id, d.id) IS NOT NULL
ON CONFLICT (user_id, snapshot_date, entity_type, entity_id) DO NOTHING;

-- ── 2. Backfill uit holding-prijshistorie (investment + crypto) ─────
-- Per (asset_id, maand) → som over holdings van (units × laatste close_price
-- van die maand). Caveat: gebruikt huidige `units`, niet historische units
-- per maand. Voor holdings met aankopen/verkopen in het verleden geeft dit
-- een vereenvoudigde trend (de prijscurve, niet de werkelijke portefeuille-
-- waarde-curve). Acceptabel voor de visuele sparkline; voor exacte
-- rapportages blijven snapshot-cron + valuations leidend.
WITH monthly_investment AS (
  SELECT
    h.asset_id,
    DATE_TRUNC('month', p.date)::DATE AS month_start,
    SUM(h.units * p.close_price)      AS asset_value
  FROM investment_holdings h
  JOIN investment_holding_prices p ON p.holding_id = h.id
  JOIN LATERAL (
    SELECT MAX(date) AS last_date
    FROM investment_holding_prices p2
    WHERE p2.holding_id = h.id
      AND DATE_TRUNC('month', p2.date) = DATE_TRUNC('month', p.date)
  ) lm ON p.date = lm.last_date
  WHERE h.is_active = true
  GROUP BY h.asset_id, DATE_TRUNC('month', p.date)
),
monthly_crypto AS (
  SELECT
    h.asset_id,
    DATE_TRUNC('month', p.date)::DATE AS month_start,
    SUM(h.units * p.close_price)      AS asset_value
  FROM crypto_holdings h
  JOIN crypto_holding_prices p ON p.holding_id = h.id
  JOIN LATERAL (
    SELECT MAX(date) AS last_date
    FROM crypto_holding_prices p2
    WHERE p2.holding_id = h.id
      AND DATE_TRUNC('month', p2.date) = DATE_TRUNC('month', p.date)
  ) lm ON p.date = lm.last_date
  WHERE h.is_active = true AND h.is_fiat_balance = false
  GROUP BY h.asset_id, DATE_TRUNC('month', p.date)
),
combined AS (
  SELECT * FROM monthly_investment
  UNION ALL
  SELECT * FROM monthly_crypto
)
INSERT INTO balance_snapshots (
  user_id, snapshot_date, entity_type, entity_id, entity_name,
  entity_subtype, balance, net_worth_inclusion_pct
)
SELECT
  a.user_id,
  c.month_start,
  'asset',
  a.id,
  a.name,
  a.asset_type,
  c.asset_value,
  COALESCE(a.net_worth_inclusion_pct, 100)
FROM combined c
JOIN assets a ON a.id = c.asset_id
WHERE a.is_active = true
ON CONFLICT (user_id, snapshot_date, entity_type, entity_id) DO NOTHING;
