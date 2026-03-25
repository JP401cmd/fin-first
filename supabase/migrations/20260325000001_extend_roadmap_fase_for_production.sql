-- Extend roadmap_features fase CHECK constraint to include 'p' (productie readiness)
ALTER TABLE public.roadmap_features DROP CONSTRAINT IF EXISTS roadmap_features_fase_check;
ALTER TABLE public.roadmap_features ADD CONSTRAINT roadmap_features_fase_check CHECK (fase IN ('a', 'b', 'c', 'd', 'p'));

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
