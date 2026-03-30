ALTER TABLE profiles ADD COLUMN IF NOT EXISTS news_description TEXT;
COMMENT ON COLUMN profiles.news_description IS 'Free-text financial situation description for news-only users';
