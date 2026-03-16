-- Add 'split' to the holding_transactions type CHECK constraint
-- A stock split changes units and avg_purchase_price but not total value.
-- The 'units' field stores the split multiplier (e.g., 2 for a 2:1 split).

ALTER TABLE holding_transactions
  DROP CONSTRAINT IF EXISTS holding_transactions_type_check;

ALTER TABLE holding_transactions
  ADD CONSTRAINT holding_transactions_type_check
  CHECK (type IN ('buy', 'sell', 'dividend', 'split'));
