import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

// Migration SQL statements - each must be executed individually
const MIGRATION_STATEMENTS = [
  // 1. user_feature_visits table
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
    const body = await request.json()
    const { db_password, service_role_key, access_token } = body

    if (!db_password && !service_role_key && !access_token) {
      return NextResponse.json({
        error: 'Provide one of: db_password, service_role_key, or access_token',
        usage: {
          option1: 'curl -X POST http://localhost:PORT/api/apply-migration -H "Content-Type: application/json" -d \'{"db_password":"YOUR_DB_PASSWORD"}\'',
          option2: 'curl -X POST http://localhost:PORT/api/apply-migration -H "Content-Type: application/json" -d \'{"service_role_key":"YOUR_SERVICE_ROLE_KEY"}\'',
          option3: 'curl -X POST http://localhost:PORT/api/apply-migration -H "Content-Type: application/json" -d \'{"access_token":"YOUR_SUPABASE_ACCESS_TOKEN"}\'',
          where_to_find: {
            db_password: 'Supabase Dashboard > Settings > Database > Connection string',
            service_role_key: 'Supabase Dashboard > Settings > API > service_role key',
            access_token: 'https://supabase.com/dashboard/account/tokens',
          }
        }
      }, { status: 400 })
    }

    const ref = 'pnnuqwdcgoympgddrvze'
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

    // Method 1: Direct PostgreSQL connection with db_password
    if (db_password) {
      const connectionString = `postgresql://postgres.${ref}:${encodeURIComponent(db_password)}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
      const postgres = (await import('postgres')).default
      const sql = postgres(connectionString, {
        ssl: 'require',
        connect_timeout: 10,
        idle_timeout: 5,
      })

      const testResult = await sql`SELECT current_database(), current_user`
      const dbInfo = testResult[0]

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

      const verifyResult = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
      const tables = verifyResult.map((r: any) => r.table_name)
      const columnsResult = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'net_worth_snapshots' ORDER BY ordinal_position`
      await sql.end()

      return NextResponse.json({
        status: 'success',
        method: 'direct_postgres',
        connection: dbInfo,
        summary: { total: results.length, success: results.filter(r => r.status === 'ok').length, skipped: results.filter(r => r.status === 'skip').length, errors: results.filter(r => r.status === 'error').length },
        results,
        tables,
        net_worth_snapshots_columns: columnsResult.map((r: any) => ({ name: r.column_name, type: r.data_type })),
      })
    }

    // Method 2: Supabase Management API with access_token
    if (access_token) {
      const fullSQL = MIGRATION_STATEMENTS.join(';\n\n') + ';'
      const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: fullSQL }),
      })

      const text = await response.text()
      if (!response.ok) {
        return NextResponse.json({ status: 'error', method: 'management_api', error: text }, { status: response.status })
      }

      return NextResponse.json({ status: 'success', method: 'management_api', response: text })
    }

    // Method 3: Service role key - use rpc or admin endpoints
    if (service_role_key) {
      // The service role key bypasses RLS but still can't do DDL via PostgREST.
      // However, we can try creating an admin client and using the pg-meta endpoint.
      const response = await fetch(`${supabaseUrl}/pg/query`, {
        method: 'POST',
        headers: {
          'apikey': service_role_key,
          'Authorization': `Bearer ${service_role_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: MIGRATION_STATEMENTS.join(';\n\n') + ';' }),
      })

      if (response.ok) {
        const data = await response.json()
        return NextResponse.json({ status: 'success', method: 'service_role_pg', data })
      }

      // Fallback: try each statement individually
      const results: Array<{ statement: string; status: string; message?: string }> = []
      for (const stmt of MIGRATION_STATEMENTS) {
        const preview = stmt.substring(0, 80).replace(/\n/g, ' ').trim()
        try {
          const r = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
            method: 'POST',
            headers: {
              'apikey': service_role_key,
              'Authorization': `Bearer ${service_role_key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: stmt }),
          })
          results.push({ statement: preview, status: r.ok ? 'ok' : 'error', message: r.ok ? undefined : await r.text() })
        } catch (err) {
          results.push({ statement: preview, status: 'error', message: err instanceof Error ? err.message : String(err) })
        }
      }

      return NextResponse.json({
        status: 'partial',
        method: 'service_role_rpc',
        note: 'Service role key cannot execute DDL via PostgREST. Use db_password or access_token instead, or apply migration SQL manually via Supabase Dashboard SQL Editor.',
        results,
      })
    }

    return NextResponse.json({ error: 'Unexpected state' }, { status: 500 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ status: 'error', error: message }, { status: 500 })
  }
}

// GET returns migration status
export async function GET() {
  const supabase = await createClient()

  const requiredTables = ['user_feature_visits', 'holdings', 'holding_transactions', 'next_step_completions']
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
