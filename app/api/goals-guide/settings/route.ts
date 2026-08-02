import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized, forbidden, badRequest, serverError } from '@/lib/api/respond'
import { isSuperAdmin } from '@/lib/admin'
import { GOAL_GUIDE_DISPLAY_ORDER } from '@/lib/briefing/goal-guide-steps'

const SETTINGS_KEY = 'goal_guide_disabled_goals'

// ── GET — Return disabled goals list ──────────────────────────

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const { data: row } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  if (!row?.value) {
    return NextResponse.json({ disabledGoals: [] })
  }

  try {
    const parsed = typeof row.value === 'string'
      ? JSON.parse(row.value)
      : row.value
    const disabledGoals = Array.isArray(parsed) ? parsed : []
    return NextResponse.json({ disabledGoals })
  } catch {
    return NextResponse.json({ disabledGoals: [] })
  }
}

// ── PUT — Save disabled goals list (superadmin only) ──────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  const { disabledGoals } = body as { disabledGoals?: unknown }

  if (!Array.isArray(disabledGoals)) {
    return badRequest('Expected { disabledGoals: string[] }')
  }

  const validIds = new Set<string>(GOAL_GUIDE_DISPLAY_ORDER as readonly string[])
  const filtered = disabledGoals.filter(
    (id): id is string => typeof id === 'string' && validIds.has(id),
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: SETTINGS_KEY,
        value: JSON.stringify(filtered),
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      },
      { onConflict: 'key' },
    )

  if (error) {
    return serverError(error, 'goals-guide-settings:PUT', 'Failed to save configuration')
  }

  return NextResponse.json({ disabledGoals: filtered })
}
