import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSharedContext } from './shared-context'
import { buildKernContext } from './kern-context'
import { buildWilContext } from './wil-context'
import { buildHorizonContext } from './horizon-context'
import { buildSpendingPatternsContext } from './spending-patterns-context'
import { buildBudgetInsightsContext } from './budget-insights-context'
import { buildTaxContext } from './tax-context'
import { buildAandachtspuntenContext } from './aandachtspunten-context'
import { ALL_MODULES, MODULE_CATALOG, type ModuleId } from '@/lib/module-registry'

/**
 * Build the full financial context for Will.
 * Combines all context sources: shared overview + budgets + actions + assets/projections + spending patterns + budget insights.
 * When budgeting_active is false, budget-related context sections are skipped.
 * Includes module awareness section so the AI knows which modules are active.
 */
export async function buildContext(supabase: SupabaseClient): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  let budgetingActive = true
  let activeModules: ModuleId[] = ALL_MODULES
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('budgeting_active, active_modules')
      .eq('id', user.id)
      .single()
    budgetingActive = profile?.budgeting_active !== false
    activeModules = (profile?.active_modules as ModuleId[] | null) ?? ALL_MODULES
  }

  const [shared, kern, wil, horizon, patterns, budgetInsights, tax, aandachtspunten] = await Promise.all([
    buildSharedContext(supabase),
    budgetingActive ? buildKernContext(supabase) : Promise.resolve(''),
    buildWilContext(supabase, budgetingActive, activeModules),
    buildHorizonContext(supabase),
    budgetingActive ? buildSpendingPatternsContext(supabase) : Promise.resolve(''),
    budgetingActive ? buildBudgetInsightsContext(supabase) : Promise.resolve(''),
    buildTaxContext(supabase),
    buildAandachtspuntenContext(supabase),
  ])

  const moduleSection = buildModuleAwarenessSection(activeModules)

  return [moduleSection, shared, kern, wil, horizon, patterns, budgetInsights, tax, aandachtspunten].filter(Boolean).join('\n')
}

/**
 * Build a context section listing which modules the user has active/inactive.
 * This allows the AI to tailor responses to the user's enabled functionality.
 */
function buildModuleAwarenessSection(activeModules: ModuleId[]): string {
  const lines: string[] = ['== ACTIEVE MODULES ==']
  lines.push('De gebruiker heeft de volgende modules aan/uit staan:')

  for (const mod of MODULE_CATALOG) {
    const active = activeModules.includes(mod.id)
    lines.push(`- ${mod.label} (${mod.id}): ${active ? 'AAN' : 'UIT'}`)
  }

  lines.push('')
  lines.push('Houd hier rekening mee in je antwoorden. Verwijs niet naar functionaliteit van uitgeschakelde modules alsof de gebruiker daar toegang toe heeft.')

  return lines.join('\n')
}
