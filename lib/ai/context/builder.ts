import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSharedContext } from './shared-context'
import { buildKernContext } from './kern-context'
import { buildWilContext } from './wil-context'
import { buildHorizonContext } from './horizon-context'

/**
 * Build the full financial context for Will.
 * Combines all context sources: shared overview + budgets + actions + assets/projections.
 */
export async function buildContext(supabase: SupabaseClient): Promise<string> {
  const [shared, kern, wil, horizon] = await Promise.all([
    buildSharedContext(supabase),
    buildKernContext(supabase),
    buildWilContext(supabase),
    buildHorizonContext(supabase),
  ])

  return [shared, kern, wil, horizon].filter(Boolean).join('\n')
}
