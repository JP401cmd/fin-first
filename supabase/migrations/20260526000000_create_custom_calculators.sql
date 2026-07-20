-- ── CUSTOM_CALCULATORS ─────────────────────────────────────────
-- Rekenhulp: door Fin gegenereerde, door de gebruiker opgeslagen
-- custom calculators. De volledige CalculatorDefinition wordt als JSONB
-- bewaard (inputs, scenarios, outputs, compare, assumptions).
CREATE TABLE IF NOT EXISTS custom_calculators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  definition    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_ai BOOLEAN DEFAULT true,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Index voor efficiënte user-specifieke queries.
CREATE INDEX IF NOT EXISTS idx_custom_calculators_user
  ON custom_calculators (user_id, sort_order);

ALTER TABLE custom_calculators ENABLE ROW LEVEL SECURITY;

-- Gebruikers beheren uitsluitend hun eigen calculators (alle DML).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'custom_calculators'
      AND policyname = 'Users can manage own calculators'
  ) THEN
    CREATE POLICY "Users can manage own calculators"
      ON custom_calculators FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
