import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unauthorized, serverError } from '@/lib/api/respond'

const WELCOME_KEY = '_welcome_seen'

/**
 * GET /api/welcome — Check if the welcome krant has been seen.
 *
 * Stores the flag in profiles.feature_preferences JSONB under '_welcome_seen'.
 */
export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return unauthorized()
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('feature_preferences')
    .eq('id', claims.sub)
    .single()

  const prefs = (profile?.feature_preferences as Record<string, unknown>) ?? {}
  const seen = prefs[WELCOME_KEY] === true

  return NextResponse.json({ seen })
}

/**
 * PUT /api/welcome — Mark the welcome krant as seen (or reset).
 *
 * Body: { seen: boolean }
 */
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  let body: { seen?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige body' }, { status: 400 })
  }

  if (typeof body.seen !== 'boolean') {
    return NextResponse.json({ error: 'seen moet een boolean zijn' }, { status: 400 })
  }

  // Read current feature_preferences and merge the welcome flag
  const { data: profile } = await supabase
    .from('profiles')
    .select('feature_preferences')
    .eq('id', user.id)
    .single()

  const currentPrefs = (profile?.feature_preferences as Record<string, unknown>) ?? {}
  const updatedPrefs = { ...currentPrefs, [WELCOME_KEY]: body.seen }

  const { error } = await supabase
    .from('profiles')
    .update({ feature_preferences: updatedPrefs })
    .eq('id', user.id)

  if (error) {
    return serverError(error, 'welcome:PUT')
  }

  return NextResponse.json({ seen: body.seen })
}
