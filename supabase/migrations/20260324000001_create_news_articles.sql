-- Persistent news article database — stores all ingested articles from RSS/web sources
-- This is the single source of truth for news generation

CREATE TABLE IF NOT EXISTS news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  category TEXT, -- nullable, matches news categories: fiscaal, rente, woningmarkt, beleggingen, pensioen, macro
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  potential_impact TEXT, -- AI-assessed potential impact for TriFinity users
  raw_content TEXT, -- full article text if available
  is_used BOOLEAN NOT NULL DEFAULT false, -- whether this article has been used in a news generation

  -- Prevent duplicate articles from the same source
  CONSTRAINT news_articles_source_url_unique UNIQUE (source_url)
);

-- Index for efficient querying by date and unused status
CREATE INDEX idx_news_articles_fetched_at ON news_articles (fetched_at DESC);
CREATE INDEX idx_news_articles_unused ON news_articles (is_used, fetched_at DESC) WHERE is_used = false;
CREATE INDEX idx_news_articles_category ON news_articles (category);

-- RLS policies
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;

-- Only superadmins can read/write news_articles (it's a system table, not user-scoped)
CREATE POLICY "superadmin_all" ON news_articles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin')
  );

-- Service role can do everything (for cron/API ingestion)
CREATE POLICY "service_role_all" ON news_articles
  FOR ALL USING (auth.role() = 'service_role');
