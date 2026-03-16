-- Historical daily closing prices for holdings
-- Used to build realistic value charts instead of straight-line interpolation
CREATE TABLE IF NOT EXISTS holding_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  close_price NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  source TEXT DEFAULT 'yahoo_finance',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(holding_id, date)
);

-- Row level security
ALTER TABLE holding_prices ENABLE ROW LEVEL SECURITY;

-- Users can view prices for their own holdings (join through holdings table)
CREATE POLICY "Users can view own holding prices" ON holding_prices
  FOR SELECT TO authenticated
  USING (
    holding_id IN (SELECT id FROM holdings WHERE user_id = auth.uid())
  );

-- Users can insert prices for their own holdings
CREATE POLICY "Users can insert own holding prices" ON holding_prices
  FOR INSERT TO authenticated
  WITH CHECK (
    holding_id IN (SELECT id FROM holdings WHERE user_id = auth.uid())
  );

-- Users can delete prices for their own holdings
CREATE POLICY "Users can delete own holding prices" ON holding_prices
  FOR DELETE TO authenticated
  USING (
    holding_id IN (SELECT id FROM holdings WHERE user_id = auth.uid())
  );

-- Index for fast date range queries
CREATE INDEX IF NOT EXISTS idx_holding_prices_holding_date
  ON holding_prices(holding_id, date DESC);
