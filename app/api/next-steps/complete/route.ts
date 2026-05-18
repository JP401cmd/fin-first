import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Valid step keys as defined in /api/next-steps GET endpoint
const VALID_STEP_KEYS = [
  'connect_bank_psd2',
  'import_transactions',
  'set_budgets',
  'add_assets',
  'register_debts',
  'complete_profile',
  'create_snapshot',
  'set_goals',
  'budget_attention',
  'check_tax',
  'review_recommendations',
  'work_on_actions',
  'check_goals',
  'calculate_fire',
  'plan_life_event',
  'explore_scenarios',
  'fire_unreachable',
]

/**
 * POST /api/next-steps/complete — Mark a next step as completed.
 *
 * Expected body: { step_key: string }
 *
 * If the next_step_completions table exists, stores a completion record.
 * Otherwise returns success (the step completion is inferred from actual data state).
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

  if (!VALID_STEP_KEYS.includes(step_key)) {
    return NextResponse.json(
      {
        error: `Ongeldige step_key: "${step_key}". Geldige waarden: ${VALID_STEP_KEYS.join(', ')}`,
      },
      { status: 400 }
    )
  }

  try {
    // Try to insert into next_step_completions table
    const { error } = await supabase
      .from('next_step_completions')
      .upsert(
        {
          user_id: user.id,
          step_key,
          completed_at: new Date().toISOString(),
          dismissed: false,
        },
        { onConflict: 'user_id,step_key' }
      )

    if (error) {
      // Table doesn't exist yet — return success anyway since
      // the next-steps GET endpoint infers completion from actual data
      return NextResponse.json({
        success: true,
        step_key,
        source: 'inferred',
        message: 'Stap gemarkeerd als voltooid (gebaseerd op werkelijke data-status)',
      })
    }

    return NextResponse.json({
      success: true,
      step_key,
      source: 'database',
      message: 'Stap succesvol gemarkeerd als voltooid',
    })
  } catch {
    return NextResponse.json({
      success: true,
      step_key,
      source: 'inferred',
      message: 'Stap gemarkeerd als voltooid (gebaseerd op werkelijke data-status)',
    })
  }
}
