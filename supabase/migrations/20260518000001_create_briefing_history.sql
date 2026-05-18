-- ── BRIEFING_HISTORY ───────────────────────────────────────────
-- Stores completed AI briefings per user for historical review.
CREATE TABLE IF NOT EXISTS briefing_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cards       JSONB NOT NULL DEFAULT '[]'::jsonb,
  composed_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient user-specific queries ordered by date
CREATE INDEX IF NOT EXISTS idx_briefing_history_user_composed
  ON briefing_history (user_id, composed_at DESC);

ALTER TABLE briefing_history ENABLE ROW LEVEL SECURITY;

-- Users can only read their own briefing history
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'briefing_history' AND policyname = 'Users can read own briefing history') THEN
    CREATE POLICY "Users can read own briefing history"
      ON briefing_history FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Users can insert their own briefing history
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'briefing_history' AND policyname = 'Users can insert own briefing history') THEN
    CREATE POLICY "Users can insert own briefing history"
      ON briefing_history FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Users can delete their own briefing history
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'briefing_history' AND policyname = 'Users can delete own briefing history') THEN
    CREATE POLICY "Users can delete own briefing history"
      ON briefing_history FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
