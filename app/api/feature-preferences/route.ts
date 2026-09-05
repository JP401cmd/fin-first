import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { UNIFIED_FEATURES, hasSubscription, type ActiveSubscriptions } from '@/lib/feature-registry'
import { unauthorized, serverError } from '@/lib/api/respond'

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

  return NextResponse.json({
    preferences: (profile?.feature_preferences as Record<string, boolean>) ?? {},
  })
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  const body = await req.json()
  const prefs = body.preferences as Record<string, boolean> | undefined

  if (!prefs || typeof prefs !== 'object') {
    return NextResponse.json({ error: 'Invalid preferences' }, { status: 400 })
  }

  // Get user's subscriptions for server-side validation, plus the current
  // column value: the write below must preserve non-feature keys.
  const { data: profile } = await supabase
    .from('profiles')
    .select('active_subscriptions, feature_preferences')
    .eq('id', user.id)
    .single()

  const subs: ActiveSubscriptions = (profile?.active_subscriptions as string[]) ?? []

  // Validate: cannot enable features without required subscription
  const validatedPrefs: Record<string, boolean> = {}
  for (const [featureId, enabled] of Object.entries(prefs)) {
    const feat = UNIFIED_FEATURES.find(f => f.id === featureId)
    if (!feat) continue // ignore unknown features

    if (enabled && !hasSubscription(subs, feat.requiredTier)) {
      // Silently reject — cannot enable subscription-locked features
      continue
    }

    validatedPrefs[featureId] = enabled
  }

  // De kolom draagt náást feature-vlaggen ook niet-feature-sleutels
  // (wealth_widget_selection — ADR 0120, retirement_aspirations,
  // deferred_onboarding_fields). Die overleven élke schrijf:
  // feature-vlaggen zijn vervang-semantiek (de body is de complete set, zodat
  // "reset naar standaard" met een lege body blijft werken), al het andere
  // wordt onvoorwaardelijk uit de huidige waarde meegenomen. Vóór deze merge
  // wiste elke feature-toggle de hele JSONB (concern
  // feature-preferences-volledige-overwrite).
  const current = (profile?.feature_preferences ?? {}) as Record<string, unknown>
  const preserved: Record<string, unknown> = {}
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    for (const [key, value] of Object.entries(current)) {
      if (!UNIFIED_FEATURES.some(f => f.id === key)) preserved[key] = value
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ feature_preferences: { ...preserved, ...validatedPrefs } })
    .eq('id', user.id)

  if (error) {
    return serverError(error, 'feature-preferences:PUT')
  }

  return NextResponse.json({ success: true, preferences: validatedPrefs })
}
