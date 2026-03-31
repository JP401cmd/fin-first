import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/nudges/dismiss — Dismiss a module nudge.
 *
 * Expected body: { key: string }
 *
 * Stores dismissal in next_step_completions table with 'nudge_' prefix.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig JSON-formaat' }, { status: 400 })
  }

  const { key } = body
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    return NextResponse.json(
      { error: 'key is verplicht en moet een niet-lege string zijn' },
      { status: 400 }
    )
  }

  try {
    const { error } = await supabase
      .from('next_step_completions')
      .upsert(
        {
          user_id: user.id,
          step_key: `nudge_${key}`,
          completed_at: new Date().toISOString(),
          dismissed: true,
        },
        { onConflict: 'user_id,step_key' }
      )

    if (error) {
      return NextResponse.json({ success: true, key, source: 'session' })
    }

    return NextResponse.json({ success: true, key, source: 'database' })
  } catch {
    return NextResponse.json({ success: true, key, source: 'session' })
  }
}
