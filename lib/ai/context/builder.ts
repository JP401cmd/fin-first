import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSharedContext } from './shared-context'
import { buildKernContext } from './kern-context'
import { buildWilContext } from './wil-context'
import { buildHorizonContext } from './horizon-context'
import { buildSpendingPatternsContext } from './spending-patterns-context'

/**
 * Build the full financial context for Will.
 * Combines all context sources: shared overview + budgets + actions + assets/projections + spending patterns.
 */
export async function buildContext(supabase: SupabaseClient): Promise<string> {
  const [shared, kern, wil, horizon, patterns] = await Promise.all([
    buildSharedContext(supabase),
    buildKernContext(supabase),
    buildWilContext(supabase),
    buildHorizonContext(supabase),
    buildSpendingPatternsContext(supabase),
  ])

  return [shared, kern, wil, horizon, patterns].filter(Boolean).join('\n')
}
