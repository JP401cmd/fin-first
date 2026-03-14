import { hasSubscription, type CommercialTier, type ActiveSubscriptions } from '@/lib/feature-registry'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side subscription gate for API routes.
 * Returns null if the user has the required subscription, or an error object if not.
 *
 * Subscriptions are independent add-ons (not hierarchical):
 * - 'gratis' = always passes
 * - 'connected' = requires 'connected' in active_subscriptions
 * - 'ai' = requires 'ai' in active_subscriptions
 *
 * Usage:
 *   const gate = await checkTierGate(supabase, userId, 'ai')
 *   if (gate) return NextResponse.json({ error: gate.error }, { status: 403 })
 */
export async function checkTierGate(
  supabase: SupabaseClient,
  userId: string,
  requiredTier: CommercialTier,
): Promise<{ subscriptions: ActiveSubscriptions; error: string } | null> {
  // Gratis features are always accessible
  if (requiredTier === 'gratis') return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_subscriptions')
    .eq('id', userId)
    .single()

  const subs: ActiveSubscriptions = (profile?.active_subscriptions as string[]) ?? []

  if (!hasSubscription(subs, requiredTier)) {
    const TIER_LABELS: Record<CommercialTier, string> = {
      gratis: 'Gratis',
      connected: 'Connected',
      ai: 'AI',
    }
    return {
      subscriptions: subs,
      error: `Deze functie vereist een ${TIER_LABELS[requiredTier]} abonnement`,
    }
  }

  return null
}
