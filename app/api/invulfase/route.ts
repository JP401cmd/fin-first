import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const INVULFASE_KEY = '_invulfase_active'

/**
 * GET /api/invulfase — Check if invulfase is active for the current user.
 *
 * Stores the flag in profiles.feature_preferences JSONB under the key '_invulfase_active'.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('feature_preferences')
    .eq('id', user.id)
    .single()

  const prefs = (profile?.feature_preferences as Record<string, unknown>) ?? {}
  const active = prefs[INVULFASE_KEY] === true

  return NextResponse.json({ active })
}

/**
 * PUT /api/invulfase — Toggle invulfase active/inactive.
 *
 * Body: { active: boolean }
 */
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: { active?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige body' }, { status: 400 })
  }

  if (typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'active moet een boolean zijn' }, { status: 400 })
  }

  // Read current feature_preferences and merge the invulfase flag
  const { data: profile } = await supabase
    .from('profiles')
    .select('feature_preferences')
    .eq('id', user.id)
    .single()

  const currentPrefs = (profile?.feature_preferences as Record<string, unknown>) ?? {}
  const updatedPrefs = { ...currentPrefs, [INVULFASE_KEY]: body.active }

  const { error } = await supabase
    .from('profiles')
    .update({ feature_preferences: updatedPrefs })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ active: body.active })
}
