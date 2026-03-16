import { NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * POST /api/apply-badges-migration
 * Creates badges, user_badges, user_streaks tables using Supabase SQL Editor API.
 * Requires: db_password query param (Supabase database password)
 */

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT,
    category TEXT NOT NULL,
    criteria_type TEXT NOT NULL,
    criteria_value JSONB,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMPTZ DEFAULT now(),
    notified BOOLEAN DEFAULT false,
    UNIQUE(user_id, badge_id)
  )`,
  `CREATE TABLE IF NOT EXISTS user_streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    streak_type TEXT NOT NULL,
    current_count INT DEFAULT 0,
    longest_count INT DEFAULT 0,
    last_activity_date DATE,
    started_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  )`,
  `DO $$ BEGIN ALTER TABLE badges ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Anyone can read badges" ON badges FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Users can read own badges" ON user_badges FOR SELECT TO authenticated USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Users can insert own badges" ON user_badges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Users can update own badges" ON user_badges FOR UPDATE TO authenticated USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Users can read own streaks" ON user_streaks FOR SELECT TO authenticated USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Users can insert own streaks" ON user_streaks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Users can update own streaks" ON user_streaks FOR UPDATE TO authenticated USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_streaks_user ON user_streaks(user_id)`,
]

export async function POST(request: Request) {
  try {
    const { db_password } = await request.json()

    if (!db_password) {
      return NextResponse.json({
        error: 'db_password required',
        hint: 'POST with {"db_password":"your-supabase-db-password"}'
      }, { status: 400 })
    }

    const ref = 'pnnuqwdcgoympgddrvze'
    const connectionString = `postgresql://postgres.${ref}:${encodeURIComponent(db_password)}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
    const postgres = (await import('postgres')).default
    const sql = postgres(connectionString, { ssl: 'require', connect_timeout: 10, idle_timeout: 5 })

    const results: Array<{ stmt: string; ok: boolean; err?: string }> = []

    for (const stmt of STATEMENTS) {
      const preview = stmt.substring(0, 60).replace(/\n/g, ' ').trim()
      try {
        await sql.unsafe(stmt)
        results.push({ stmt: preview, ok: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('already exists')) {
          results.push({ stmt: preview, ok: true, err: 'already exists' })
        } else {
          results.push({ stmt: preview, ok: false, err: msg })
        }
      }
    }

    await sql.end()

    return NextResponse.json({
      status: 'done',
      ok: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function GET() {
  // Check if the 3 tables exist
  const checks: Record<string, boolean> = {}
  for (const t of ['badges', 'user_badges', 'user_streaks']) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=id&limit=0`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    })
    checks[t] = resp.status === 200
  }
  const allExist = Object.values(checks).every(Boolean)
  return NextResponse.json({ allExist, tables: checks })
}
