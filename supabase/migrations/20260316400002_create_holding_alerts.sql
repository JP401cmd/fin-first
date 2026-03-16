-- Create holding_alerts table for price alerts and rebalancing notifications
CREATE TABLE IF NOT EXISTS holding_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holding_id UUID REFERENCES holdings(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('price_above', 'price_below', 'return_threshold', 'rebalance_drift')),
  threshold NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE holding_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts"
  ON holding_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alerts"
  ON holding_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts"
  ON holding_alerts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own alerts"
  ON holding_alerts FOR DELETE
  USING (auth.uid() = user_id);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_holding_alerts_user_active
  ON holding_alerts(user_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_holding_alerts_holding
  ON holding_alerts(holding_id) WHERE is_active = true;
