-- Add category override for user classification of recurring transactions
ALTER TABLE recurring_transactions
  ADD COLUMN IF NOT EXISTS category_override TEXT;

-- Valid values: 'subscription', 'vaste_kosten', 'excluded', NULL (null = auto-detect)
COMMENT ON COLUMN recurring_transactions.category_override IS
  'User override for category classification. NULL = auto-detect, subscription = abonnement, vaste_kosten = fixed cost, excluded = not shown';
