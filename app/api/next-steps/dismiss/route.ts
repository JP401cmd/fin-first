import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/next-steps/dismiss — Dismiss a next step suggestion.
 *
 * Expected body: { step_key: string }
 *
 * Stores a dismissal record in the next_step_completions table.
 * If the table doesn't exist, returns success anyway (dismiss is UI-only in that case).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Parse and validate request body
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig JSON-formaat in request body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body moet een JSON-object zijn' }, { status: 400 })
  }

  const { step_key } = body

  if (!step_key || typeof step_key !== 'string' || step_key.trim().length === 0) {
    return NextResponse.json(
      { error: 'step_key is verplicht en moet een niet-lege string zijn' },
      { status: 400 }
    )
  }

  try {
    // Try to upsert into next_step_completions with dismissed=true
    const { error } = await supabase
      .from('next_step_completions')
      .upsert(
        {
          user_id: user.id,
          step_key,
          completed_at: new Date().toISOString(),
          dismissed: true,
        },
        { onConflict: 'user_id,step_key' }
      )

    if (error) {
      // Table doesn't exist yet — return success anyway (dismiss still works in UI state)
      return NextResponse.json({
        success: true,
        step_key,
        source: 'session',
        message: 'Suggestie genegeerd (sessie-gebaseerd)',
      })
    }

    return NextResponse.json({
      success: true,
      step_key,
      source: 'database',
      message: 'Suggestie succesvol genegeerd',
    })
  } catch {
    return NextResponse.json({
      success: true,
      step_key,
      source: 'session',
      message: 'Suggestie genegeerd (sessie-gebaseerd)',
    })
  }
}
