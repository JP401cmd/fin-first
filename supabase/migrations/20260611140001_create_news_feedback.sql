-- Feedback van gebruikers op gegenereerde nieuwsitems ("Minder hierover").
-- Wordt bij nieuwsgeneratie geaggregeerd: categorieën met herhaalde
-- 'less'-feedback (≥2 in 90 dagen) krijgen alleen nog hoge-impact-items.

CREATE TABLE IF NOT EXISTS news_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL, -- id van het gegenereerde nieuwsitem (geen FK: items leven in cache/edities-jsonb)
  headline TEXT,
  category TEXT,
  verdict TEXT NOT NULL CHECK (verdict IN ('less', 'more')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Eén oordeel per item per gebruiker
  CONSTRAINT news_feedback_unique UNIQUE (user_id, article_id, verdict)
);

CREATE INDEX idx_news_feedback_user ON news_feedback (user_id, created_at DESC);

ALTER TABLE news_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "news_feedback own rows" ON news_feedback
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
