/**
 * Apply the roadmap_features table migration via Supabase Management API
 * Uses the SUPABASE_URL and anon key to check, and needs access_token or db_password for DDL.
 * Falls back to direct Supabase REST API if possible.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// First check if table exists
const { error } = await supabase.from('roadmap_features').select('id').limit(0)

if (!error) {
  console.log('roadmap_features table already exists!')
  process.exit(0)
}

console.log('Table does not exist yet. Error:', error.message)
console.log('')
console.log('Please run the following SQL in Supabase Dashboard > SQL Editor:')
console.log('================================================================')
console.log(`
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

DROP TRIGGER IF EXISTS roadmap_features_updated_at ON roadmap_features;
CREATE TRIGGER roadmap_features_updated_at BEFORE UPDATE ON roadmap_features FOR EACH ROW EXECUTE FUNCTION update_roadmap_features_updated_at();

NOTIFY pgrst, 'reload schema';
`)
process.exit(1)
