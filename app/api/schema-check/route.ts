import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Required tables per app_spec.txt
const REQUIRED_TABLES = [
  'badges',
  'user_badges',
  'user_streaks',
  'user_feature_visits',
  'holdings',
  'holding_transactions',
  'next_step_completions',
]

// Required new columns on net_worth_snapshots
const REQUIRED_SNAPSHOT_COLUMNS = [
  'freedom_percentage',
  'fire_age',
  'sovereignty_level',
  'savings_rate',
  'resilience_score',
]

async function tableExists(supabase: Awaited<ReturnType<typeof createClient>>, tableName: string): Promise<boolean> {
  // Try to select from the table. If it doesn't exist, we get a PGRST error
  const { error } = await supabase.from(tableName).select('*').limit(0)
  return !error || !error.message.includes('Could not find')
}

async function columnExists(supabase: Awaited<ReturnType<typeof createClient>>, tableName: string, columnName: string): Promise<boolean> {
  const { error } = await supabase.from(tableName).select(columnName).limit(0)
  return !error || !error.message.includes('does not exist')
}

export async function GET() {
  try {
    const supabase = await createClient()

    const tableResults: Record<string, boolean> = {}
    for (const table of REQUIRED_TABLES) {
      tableResults[table] = await tableExists(supabase, table)
    }

    const columnResults: Record<string, boolean> = {}
    for (const col of REQUIRED_SNAPSHOT_COLUMNS) {
      columnResults[col] = await columnExists(supabase, 'net_worth_snapshots', col)
    }

    const allTablesExist = Object.values(tableResults).every(Boolean)
    const allColumnsExist = Object.values(columnResults).every(Boolean)

    return NextResponse.json({
      status: allTablesExist && allColumnsExist ? 'complete' : 'incomplete',
      tables: tableResults,
      net_worth_snapshot_columns: columnResults,
      all_tables_exist: allTablesExist,
      all_columns_exist: allColumnsExist,
      migration_file: 'supabase/migrations/20260215000001_create_new_tables.sql',
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ status: 'error', error: message }, { status: 500 })
  }
}
