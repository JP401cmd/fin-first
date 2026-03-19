import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Lightweight migration endpoint that creates the roadmap_features table
 * using the Supabase JS client (service-role or anon key).
 * Since we can't run DDL via PostgREST, we test if the table exists
 * and provide the SQL needed for manual execution.
 */
export async function POST() {
  const supabase = await createClient()

  // Test if the table already exists
  const { error: testError } = await supabase
    .from('roadmap_features')
    .select('id')
    .limit(0)

  if (!testError) {
    return NextResponse.json({ status: 'already_exists', message: 'roadmap_features table already exists' })
  }

  // Table doesn't exist — provide the SQL for manual execution
  const sql = `
-- Run this in Supabase Dashboard > SQL Editor:
CREATE TABLE IF NOT EXISTS roadmap_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_nr int NOT NULL,
  fase text NOT NULL CHECK (fase IN ('a', 'b', 'c', 'd')),
  status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'in_ontwikkeling', 'testen', 'afgerond')),
  opmerkingen text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_nr, fase)
);

ALTER TABLE roadmap_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read roadmap features" ON roadmap_features FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert roadmap features" ON roadmap_features FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update roadmap features" ON roadmap_features FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_roadmap_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER roadmap_features_updated_at BEFORE UPDATE ON roadmap_features FOR EACH ROW EXECUTE FUNCTION update_roadmap_features_updated_at();

NOTIFY pgrst, 'reload schema';
`

  return NextResponse.json({
    status: 'table_missing',
    message: 'roadmap_features table does not exist. Run the SQL below in Supabase Dashboard SQL Editor.',
    sql: sql.trim(),
  }, { status: 400 })
}

export async function GET() {
  const supabase = await createClient()

  const { error } = await supabase
    .from('roadmap_features')
    .select('id')
    .limit(0)

  return NextResponse.json({
    exists: !error,
    error: error?.message ?? null,
  })
}
