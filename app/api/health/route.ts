import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/health — publiek bereikbaar (publicPaths in lib/supabase/proxy.ts).
 *
 * Juist dáárom mag hier nooit een rauwe `error.message` de body in (ADR 0044):
 * dit was de enige route die ZONDER sessie DB-/driver-tekst lekte
 * (security-sweep 3 sep 2026). De echte fout gaat server-side het log in met
 * een grep-bare tag; de client krijgt een vaste tekst. De body-vorm
 * (`status`/`database`/`supabase`/`timestamp`) blijft, want de dev-scripts
 * (scripts/check-health.js e.a.) en de navigatie-regressiesuite lezen 'm.
 *
 * De vroegere `?persistence_test=`-schrijfproef op `app_settings` is weg: een
 * publieke route hoort geen schrijfpad naar een instellingentabel te dragen —
 * ook niet één dat RLS toch weigert, want precies die weigering lekte als
 * DB-tekst naar een anonieme aanroeper.
 */

function unhealthy(err: unknown): NextResponse {
  // PostgrestError is geen Error-instantie maar een plat object met `message`.
  const message =
    err instanceof Error
      ? err.message
      : ((err as { message?: unknown } | null)?.message as string | undefined) ?? String(err)
  console.error('[health:GET] databasecheck mislukt:', message)
  return NextResponse.json(
    {
      status: 'error',
      database: 'disconnected',
      supabase: 'error',
      error: 'Database niet bereikbaar',
      timestamp: new Date().toISOString(),
    },
    { status: 503 },
  )
}

export async function GET() {
  try {
    const supabase = await createClient()

    // Verbindingscheck met de goedkoopst mogelijke query (RLS-gescoped, dus
    // zonder sessie gewoon een lege set — het gaat om het bereiken van de DB).
    const { error } = await supabase.from('profiles').select('id').limit(1)
    if (error) return unhealthy(error)

    return NextResponse.json(
      {
        status: 'healthy',
        database: 'connected',
        supabase: 'connected',
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    )
  } catch (err) {
    return unhealthy(err)
  }
}
