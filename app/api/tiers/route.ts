import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Valid subscription add-ons that users can toggle */
const VALID_SUBSCRIPTIONS = ['connected', 'ai'] as const
type SubscriptionId = (typeof VALID_SUBSCRIPTIONS)[number]

/**
 * GET /api/tiers — returns the user's active subscription add-ons.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('active_subscriptions')
    .eq('id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const subscriptions = (profile?.active_subscriptions as string[] | null) ?? []

  return NextResponse.json({ subscriptions })
}

/**
 * PUT /api/tiers — update the user's active subscription add-ons.
 * Expects { subscriptions: string[] } with valid values: 'connected', 'ai'.
 */
export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { subscriptions?: unknown }

  if (!Array.isArray(body.subscriptions)) {
    return NextResponse.json({ error: 'Invalid payload: subscriptions must be an array' }, { status: 400 })
  }

  // Strip unknown subscription IDs — only accept known add-ons
  const validSet = new Set<string>(VALID_SUBSCRIPTIONS)
  const sanitized = body.subscriptions.filter(
    (s): s is SubscriptionId => typeof s === 'string' && validSet.has(s),
  )

  // Derive legacy commercial_tier for backward compat
  const legacyTier = sanitized.includes('ai') ? 'ai' : sanitized.includes('connected') ? 'connected' : 'gratis'

  const { error } = await supabase
    .from('profiles')
    .update({
      active_subscriptions: sanitized,
      commercial_tier: legacyTier,
    })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ subscriptions: sanitized })
}
