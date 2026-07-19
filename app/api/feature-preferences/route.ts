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

  // Get user's subscriptions for server-side validation
  const { data: profile } = await supabase
    .from('profiles')
    .select('active_subscriptions')
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

  const { error } = await supabase
    .from('profiles')
    .update({ feature_preferences: validatedPrefs })
    .eq('id', user.id)

  if (error) {
    return serverError(error, 'feature-preferences:PUT')
  }

  return NextResponse.json({ success: true, preferences: validatedPrefs })
}
