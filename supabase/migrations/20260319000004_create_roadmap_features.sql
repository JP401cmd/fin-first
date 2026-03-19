-- Create roadmap_features table for persistent status/remarks on roadmap page
CREATE TABLE IF NOT EXISTS public.roadmap_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_nr integer NOT NULL,
  fase text NOT NULL CHECK (fase IN ('a', 'b', 'c', 'd')),
  status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'in_ontwikkeling', 'testen', 'afgerond')),
  opmerkingen text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_nr, fase)
);

-- Enable RLS
ALTER TABLE public.roadmap_features ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users
CREATE POLICY "Authenticated can read roadmap features"
  ON public.roadmap_features FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert roadmap features"
  ON public.roadmap_features FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update roadmap features"
  ON public.roadmap_features FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_roadmap_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roadmap_features_updated_at ON public.roadmap_features;
CREATE TRIGGER roadmap_features_updated_at
  BEFORE UPDATE ON public.roadmap_features
  FOR EACH ROW
  EXECUTE FUNCTION public.update_roadmap_features_updated_at();

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
