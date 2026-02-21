import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSharedContext } from './shared-context'
import { buildKernContext } from './kern-context'
import { buildWilContext } from './wil-context'
import { buildHorizonContext } from './horizon-context'
import { buildSpendingPatternsContext } from './spending-patterns-context'
import { buildBudgetInsightsContext } from './budget-insights-context'

/**
 * Build the full financial context for Will.
 * Combines all context sources: shared overview + budgets + actions + assets/projections + spending patterns + budget insights.
 */
export async function buildContext(supabase: SupabaseClient): Promise<string> {
  const [shared, kern, wil, horizon, patterns, budgetInsights] = await Promise.all([
    buildSharedContext(supabase),
    buildKernContext(supabase),
    buildWilContext(supabase),
    buildHorizonContext(supabase),
    buildSpendingPatternsContext(supabase),
    buildBudgetInsightsContext(supabase),
  ])

  return [shared, kern, wil, horizon, patterns, budgetInsights].filter(Boolean).join('\n')
}
