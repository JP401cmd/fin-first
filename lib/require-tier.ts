import { hasSubscription, type CommercialTier, type ActiveSubscriptions } from '@/lib/feature-registry'
import { KRANT_GEEN_AI_MESSAGE, isKrantProfile } from '@/lib/modules/krant-grens'
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
 * KRANT-GRENS (Krant 2B, besluit B11): een Krant-account (`active_modules` is
 * precies `['nieuws']`) krijgt op 'ai' altijd een weigering, óók met 'ai' in
 * zijn abonnementen. Dit is DE centrale AI-poort: élke AI-route — cloud én de
 * lokale `local-*`-routes — roept `checkTierGate(…, 'ai')` aan en geeft bij een
 * weigering een 403 (`aiSubscriptionRequired()`). Eén check hier dekt ze dus
 * allemaal; `reason: 'krant'` laat een route desgewenst het verschil zien.
 * Geen extra query: `active_modules` gaat mee in de bestaande profiel-select.
 * Voor elk ander account (null, alle zes, elke andere subset) is de uitkomst
 * exact die van vóór Krant 2B.
 *
 * Usage:
 *   const gate = await checkTierGate(supabase, userId, 'ai')
 *   if (gate) return NextResponse.json({ error: gate.error }, { status: 403 })
 */
export async function checkTierGate(
  supabase: SupabaseClient,
  userId: string,
  requiredTier: CommercialTier,
): Promise<{ subscriptions: ActiveSubscriptions; error: string; reason?: 'krant' } | null> {
  // Gratis features are always accessible
  if (requiredTier === 'gratis') return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_subscriptions, active_modules')
    .eq('id', userId)
    .single()

  const subs: ActiveSubscriptions = (profile?.active_subscriptions as string[]) ?? []

  if (requiredTier === 'ai' && isKrantProfile(profile)) {
    return { subscriptions: subs, error: KRANT_GEEN_AI_MESSAGE, reason: 'krant' }
  }

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
