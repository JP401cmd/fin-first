-- ── REKENHULP-BIBLIOTHEEK ──────────────────────────────────────
-- Marktplaats-laag bovenop `custom_calculators` plus rate-limiting van
-- AI-generaties. Vijf stukken in één migratie:
--   1. Publicatie-velden + indexes + RLS-uitbreiding op custom_calculators
--   2. Triggers die like_count en duplicate_count synchroon houden
--   3. calculator_likes (één per user per calculator)
--   4. calculator_reports (low-mod inbox naar admins)
--   5. ai_calculator_usage (flat 10 generaties + 5 verfijningen / week)
--   6. profiles.marketplace_display_name (opt-in displayname)
--
-- Alle filters op de publieke lijst lopen via de partial index
-- (idx_custom_calculators_public). Counters zijn denormalized voor
-- snelle reads — single-source-of-truth blijft de aparte tabel(en).

-- ── 1. Publicatie-velden op bestaande tabel ────────────────────
ALTER TABLE custom_calculators
  ADD COLUMN IF NOT EXISTS is_public        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS forked_from      UUID REFERENCES custom_calculators(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS like_count       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_count  INT NOT NULL DEFAULT 0;

-- Snelle "publieke lijst" sortering: like_count desc, dan published_at desc.
CREATE INDEX IF NOT EXISTS idx_custom_calculators_public
  ON custom_calculators (is_public, like_count DESC, published_at DESC)
  WHERE is_public = true;

-- Forked-from-lookup voor "afstammingsketens" en auteur-stats.
CREATE INDEX IF NOT EXISTS idx_custom_calculators_forked_from
  ON custom_calculators (forked_from)
  WHERE forked_from IS NOT NULL;

-- Publieke calculators zijn lezbaar voor alle ingelogde gebruikers; eigen
-- DML blijft beperkt tot de eigenaar (bestaande policy).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'custom_calculators'
      AND policyname = 'Public calculators are readable'
  ) THEN
    CREATE POLICY "Public calculators are readable"
      ON custom_calculators FOR SELECT
      USING (is_public = true OR auth.uid() = user_id);
  END IF;
END $$;

-- ── 2. calculator_likes ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calculator_likes (
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  calculator_id  UUID NOT NULL REFERENCES custom_calculators(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, calculator_id)
);

CREATE INDEX IF NOT EXISTS idx_calculator_likes_calculator
  ON calculator_likes (calculator_id);

ALTER TABLE calculator_likes ENABLE ROW LEVEL SECURITY;

-- Iedereen mag de like-rijen lezen (publiek aggregatieoptie), insert/delete
-- alleen eigen rij.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'calculator_likes'
      AND policyname = 'Likes are publicly readable'
  ) THEN
    CREATE POLICY "Likes are publicly readable"
      ON calculator_likes FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'calculator_likes'
      AND policyname = 'Users manage own likes'
  ) THEN
    CREATE POLICY "Users manage own likes"
      ON calculator_likes FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Trigger: houd custom_calculators.like_count synchroon.
CREATE OR REPLACE FUNCTION sync_calculator_like_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE custom_calculators
       SET like_count = like_count + 1
     WHERE id = NEW.calculator_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE custom_calculators
       SET like_count = GREATEST(0, like_count - 1)
     WHERE id = OLD.calculator_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_calculator_like_count ON calculator_likes;
CREATE TRIGGER trg_sync_calculator_like_count
  AFTER INSERT OR DELETE ON calculator_likes
  FOR EACH ROW EXECUTE FUNCTION sync_calculator_like_count();

-- ── 3. calculator_reports ──────────────────────────────────────
-- Low-mod inbox: gebruiker meldt misleidende/ongepaste publicatie. Lezen
-- mag alleen door admins (we gebruiken hier de simpele variant: alleen
-- inserts toegestaan, SELECT via service-role of admin-view).
CREATE TABLE IF NOT EXISTS calculator_reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculator_id  UUID NOT NULL REFERENCES custom_calculators(id) ON DELETE CASCADE,
  reporter_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calculator_reports_open
  ON calculator_reports (created_at DESC)
  WHERE status = 'open';

ALTER TABLE calculator_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'calculator_reports'
      AND policyname = 'Users can submit reports'
  ) THEN
    CREATE POLICY "Users can submit reports"
      ON calculator_reports FOR INSERT
      WITH CHECK (auth.uid() = reporter_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'calculator_reports'
      AND policyname = 'Users can read own reports'
  ) THEN
    CREATE POLICY "Users can read own reports"
      ON calculator_reports FOR SELECT
      USING (auth.uid() = reporter_id);
  END IF;
END $$;

-- ── 4. ai_calculator_usage (rate-limit) ────────────────────────
-- Flat 10 generaties + 5 verfijningen per ISO-week voor iedere user.
-- Week-start = maandag 00:00 in Europe/Amsterdam — opslaan als DATE
-- (Postgres heeft geen native timezone in DATE; conversie gebeurt in de
-- applicatie via lib/calculator/rate-limit.ts).
CREATE TABLE IF NOT EXISTS ai_calculator_usage (
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start   DATE NOT NULL,
  generations  INT NOT NULL DEFAULT 0,
  refinements  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, week_start)
);

ALTER TABLE ai_calculator_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_calculator_usage'
      AND policyname = 'Users manage own usage'
  ) THEN
    CREATE POLICY "Users manage own usage"
      ON ai_calculator_usage FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 5. profiles.marketplace_display_name ───────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS marketplace_display_name TEXT;
