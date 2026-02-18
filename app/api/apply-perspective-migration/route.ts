import { NextRequest, NextResponse } from 'next/server'

const MIGRATION_STATEMENTS = [
  // Add selected_perspective column to profiles
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS selected_perspective TEXT NOT NULL DEFAULT 'personal'`,
  // Add check constraint (safe if already exists)
  `DO $$ BEGIN ALTER TABLE profiles ADD CONSTRAINT profiles_selected_perspective_check CHECK (selected_perspective IN ('personal', 'household', 'partner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { db_password, access_token } = body

    if (!db_password && !access_token) {
      return NextResponse.json({
        error: 'Provide db_password or access_token',
      }, { status: 400 })
    }

    const ref = 'pnnuqwdcgoympgddrvze'

    if (db_password) {
      const connectionString = `postgresql://postgres.${ref}:${encodeURIComponent(db_password)}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
      const postgres = (await import('postgres')).default
      const sql = postgres(connectionString, {
        ssl: 'require',
        connect_timeout: 10,
        idle_timeout: 5,
      })

      const results: Array<{ statement: string; status: 'ok' | 'skip' | 'error'; message?: string }> = []
      for (const stmt of MIGRATION_STATEMENTS) {
        const preview = stmt.substring(0, 100).replace(/\n/g, ' ').trim()
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

      // Verify column exists
      const verify = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'selected_perspective'
      `
      const columnExists = verify.length > 0

      await sql.end()

      return NextResponse.json({
        status: columnExists ? 'success' : 'partial',
        column_exists: columnExists,
        results,
      })
    }

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
        return NextResponse.json({ status: 'error', error: text }, { status: response.status })
      }

      return NextResponse.json({ status: 'success', response: text })
    }

    return NextResponse.json({ error: 'Unexpected state' }, { status: 500 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ status: 'error', error: message }, { status: 500 })
  }
}

export async function GET() {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { error } = await supabase.from('profiles').select('selected_perspective').limit(0)
  const columnExists = !error

  return NextResponse.json({
    status: columnExists ? 'complete' : 'missing',
    column_exists: columnExists,
    error: error?.message ?? null,
  })
}
