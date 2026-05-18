import { createClient } from '@/lib/supabase/server'

/**
 * Verification endpoint for feature #830: Onboarding deferred fields.
 * Stored in profiles.feature_preferences.deferred_onboarding_fields (JSONB sub-key).
 *
 * GET — read the current user's deferred onboarding fields
 * POST — set deferred fields (for testing)
 * DELETE — clear deferred fields
 */

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('feature_preferences, net_monthly_income')
    .eq('id', user.id)
    .single()

  if (error) {
    return Response.json({
      error: error.message,
      deferredFields: [],
      netMonthlyIncome: null,
    }, { status: 500 })
  }

  const prefs = (data?.feature_preferences as Record<string, unknown>) ?? {}
  const deferred = Array.isArray(prefs.deferred_onboarding_fields)
    ? prefs.deferred_onboarding_fields
    : []

  return Response.json({
    deferredFields: deferred,
    netMonthlyIncome: data?.net_monthly_income ?? null,
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const fields = Array.isArray(body.fields) ? body.fields : []

  // Read current feature_preferences, merge deferred fields, write back
  const { data: current } = await supabase
    .from('profiles')
    .select('feature_preferences')
    .eq('id', user.id)
    .single()

  const prefs = (current?.feature_preferences as Record<string, unknown>) ?? {}
  prefs.deferred_onboarding_fields = fields

  const { error } = await supabase
    .from('profiles')
    .update({ feature_preferences: prefs })
    .eq('id', user.id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    success: true,
    deferredFields: fields,
  })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Read current feature_preferences, remove deferred fields key, write back
  const { data: current } = await supabase
    .from('profiles')
    .select('feature_preferences')
    .eq('id', user.id)
    .single()

  const prefs = (current?.feature_preferences as Record<string, unknown>) ?? {}
  delete prefs.deferred_onboarding_fields

  const { error } = await supabase
    .from('profiles')
    .update({ feature_preferences: prefs })
    .eq('id', user.id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ success: true, deferredFields: [] })
}
