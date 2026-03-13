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
 * When budgeting_active is false, budget-related context sections are skipped.
 */
export async function buildContext(supabase: SupabaseClient): Promise<string> {
  // Check budgeting_active first
  const { data: { user } } = await supabase.auth.getUser()
  let budgetingActive = true
  if (user) {
    const { data: budgetProfile } = await supabase
      .from('profiles')
      .select('budgeting_active')
      .eq('id', user.id)
      .single()
    budgetingActive = budgetProfile?.budgeting_active !== false
  }

  const [shared, kern, wil, horizon, patterns, budgetInsights] = await Promise.all([
    buildSharedContext(supabase),
    budgetingActive ? buildKernContext(supabase) : Promise.resolve(''),
    buildWilContext(supabase, budgetingActive),
    buildHorizonContext(supabase),
    budgetingActive ? buildSpendingPatternsContext(supabase) : Promise.resolve(''),
    budgetingActive ? buildBudgetInsightsContext(supabase) : Promise.resolve(''),
  ])

  return [shared, kern, wil, horizon, patterns, budgetInsights].filter(Boolean).join('\n')
}
