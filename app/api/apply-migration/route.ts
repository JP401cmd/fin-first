import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Migration SQL statements - each must be executed individually
const MIGRATION_STATEMENTS = [
  // 1. badges table
  `CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'trophy',
    color TEXT NOT NULL DEFAULT 'amber',
    category TEXT NOT NULL CHECK (category IN ('onboarding', 'consistency', 'financial_health', 'fire_milestones', 'actions', 'budget', 'exploration', 'sovereignty')),
    criteria_type TEXT NOT NULL CHECK (criteria_type IN ('threshold', 'count', 'streak', 'milestone', 'manual')),
    criteria_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE badges ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY "Badges are viewable by authenticated users" ON badges FOR SELECT TO authenticated USING (true)`,

  // 2. user_badges table
  `CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notified BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(user_id, badge_id)
  )`,
  `ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY "Users can view own badges" ON user_badges FOR SELECT TO authenticated USING (auth.uid() = user_id)`,
  `CREATE POLICY "Users can insert own badges" ON user_badges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)`,
  `CREATE POLICY "Users can update own badges" ON user_badges FOR UPDATE TO authenticated USING (auth.uid() = user_id)`,

  // 3. user_streaks table
  `CREATE TABLE IF NOT EXISTS user_streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    streak_type TEXT NOT NULL CHECK (streak_type IN ('login', 'budget_compliance', 'action_completion')),
    current_count INT NOT NULL DEFAULT 0,
    longest_count INT NOT NULL DEFAULT 0,
    last_activity_date DATE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY "Users can view own streaks" ON user_streaks FOR SELECT TO authenticated USING (auth.uid() = user_id)`,
  `CREATE POLICY "Users can insert own streaks" ON user_streaks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)`,
  `CREATE POLICY "Users can update own streaks" ON user_streaks FOR UPDATE TO authenticated USING (auth.uid() = user_id)`,

  // 4. user_feature_visits table
  `CREATE TABLE IF NOT EXISTS user_feature_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feature_slug TEXT NOT NULL,
    first_visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    visit_count INT NOT NULL DEFAULT 1,
    UNIQUE(user_id, feature_slug)
  )`,
  `ALTER TABLE user_feature_visits ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY "Users can view own feature visits" ON user_feature_visits FOR SELECT TO authenticated USING (auth.uid() = user_id)`,
  `CREATE POLICY "Users can insert own feature visits" ON user_feature_visits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)`,
  `CREATE POLICY "Users can update own feature visits" ON user_feature_visits FOR UPDATE TO authenticated USING (auth.uid() = user_id)`,

  // 5. holdings table
  `CREATE TABLE IF NOT EXISTS holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    ticker TEXT,
    isin TEXT,
    name TEXT NOT NULL,
    units NUMERIC NOT NULL DEFAULT 0,
    avg_purchase_price NUMERIC NOT NULL DEFAULT 0,
    current_price NUMERIC,
    last_price_update TIMESTAMPTZ,
    purchase_date DATE,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE holdings ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY "Users can view own holdings" ON holdings FOR SELECT TO authenticated USING (auth.uid() = user_id)`,
  `CREATE POLICY "Users can insert own holdings" ON holdings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)`,
  `CREATE POLICY "Users can update own holdings" ON holdings FOR UPDATE TO authenticated USING (auth.uid() = user_id)`,
  `CREATE POLICY "Users can delete own holdings" ON holdings FOR DELETE TO authenticated USING (auth.uid() = user_id)`,

  // 6. holding_transactions table
  `CREATE TABLE IF NOT EXISTS holding_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holding_id UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend')),
    units NUMERIC NOT NULL,
    price_per_unit NUMERIC NOT NULL,
    total_amount NUMERIC NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE holding_transactions ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY "Users can view own holding transactions" ON holding_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id)`,
  `CREATE POLICY "Users can insert own holding transactions" ON holding_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)`,
  `CREATE POLICY "Users can update own holding transactions" ON holding_transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id)`,
  `CREATE POLICY "Users can delete own holding transactions" ON holding_transactions FOR DELETE TO authenticated USING (auth.uid() = user_id)`,

  // 7. next_step_completions table
  `CREATE TABLE IF NOT EXISTS next_step_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    step_key TEXT NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dismissed BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(user_id, step_key)
  )`,
  `ALTER TABLE next_step_completions ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY "Users can view own next step completions" ON next_step_completions FOR SELECT TO authenticated USING (auth.uid() = user_id)`,
  `CREATE POLICY "Users can insert own next step completions" ON next_step_completions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)`,
  `CREATE POLICY "Users can update own next step completions" ON next_step_completions FOR UPDATE TO authenticated USING (auth.uid() = user_id)`,

  // 8. Alter net_worth_snapshots: add new columns
  `ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS freedom_percentage NUMERIC`,
  `ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS fire_age NUMERIC`,
  `ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS sovereignty_level INT`,
  `ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS savings_rate NUMERIC`,
  `ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS resilience_score INT`,
]

export async function POST(request: NextRequest) {
  try {
    // Require either admin auth or a db_password in body
    const body = await request.json()
    const { db_password } = body

    if (!db_password) {
      return NextResponse.json(
        { error: 'db_password is required in request body' },
        { status: 400 }
      )
    }

    // Use postgres npm package for direct DDL execution
    const ref = 'pnnuqwdcgoympgddrvze'
    const connectionString = `postgresql://postgres.${ref}:${encodeURIComponent(db_password)}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`

    const postgres = (await import('postgres')).default
    const sql = postgres(connectionString, {
      ssl: 'require',
      connect_timeout: 10,
      idle_timeout: 5,
    })

    // Test connection
    const testResult = await sql`SELECT current_database(), current_user`
    const dbInfo = testResult[0]

    // Execute each migration statement
    const results: Array<{ statement: string; status: 'ok' | 'skip' | 'error'; message?: string }> = []

    for (const stmt of MIGRATION_STATEMENTS) {
      const preview = stmt.substring(0, 80).replace(/\n/g, ' ').trim()
      try {
        await sql.unsafe(stmt)
        results.push({ statement: preview, status: 'ok' })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('already exists')) {
          results.push({ statement: preview, status: 'skip', message: 'Already exists' })
        } else {
          results.push({ statement: preview, status: 'error', message })
        }
      }
    }

    // Verify tables
    const verifyResult = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `
    const tables = verifyResult.map((r: { table_name: string }) => r.table_name)

    // Verify net_worth_snapshots columns
    const columnsResult = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'net_worth_snapshots'
      ORDER BY ordinal_position
    `

    await sql.end()

    const successCount = results.filter(r => r.status === 'ok').length
    const skipCount = results.filter(r => r.status === 'skip').length
    const errorCount = results.filter(r => r.status === 'error').length

    return NextResponse.json({
      status: 'success',
      connection: dbInfo,
      summary: {
        total: results.length,
        success: successCount,
        skipped: skipCount,
        errors: errorCount,
      },
      results,
      tables,
      net_worth_snapshots_columns: columnsResult.map((r: { column_name: string; data_type: string }) => ({
        name: r.column_name,
        type: r.data_type,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { status: 'error', error: message },
      { status: 500 }
    )
  }
}

// GET returns migration status
export async function GET() {
  const supabase = await createClient()

  const requiredTables = ['badges', 'user_badges', 'user_streaks', 'user_feature_visits', 'holdings', 'holding_transactions', 'next_step_completions']
  const requiredColumns = ['freedom_percentage', 'fire_age', 'sovereignty_level', 'savings_rate', 'resilience_score']

  const tableStatus: Record<string, boolean> = {}
  for (const table of requiredTables) {
    const { error } = await supabase.from(table).select('*').limit(0)
    tableStatus[table] = !error || !error.message.includes('Could not find')
  }

  const columnStatus: Record<string, boolean> = {}
  for (const col of requiredColumns) {
    const { error } = await supabase.from('net_worth_snapshots').select(col).limit(0)
    columnStatus[col] = !error || !error.message.includes('does not exist')
  }

  const allTablesExist = Object.values(tableStatus).every(Boolean)
  const allColumnsExist = Object.values(columnStatus).every(Boolean)

  return NextResponse.json({
    status: allTablesExist && allColumnsExist ? 'complete' : 'incomplete',
    tables: tableStatus,
    columns: columnStatus,
    all_tables_exist: allTablesExist,
    all_columns_exist: allColumnsExist,
  })
}
