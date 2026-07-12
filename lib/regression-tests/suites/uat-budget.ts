/**
 * In-app regressie-suite: UAT-Budget engine-checks.
 *
 * Draait `BUDGET_ENGINE_CHECKS` (lib/uat/acceptance/budget-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/budget.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `budget-checks.ts`; deze suite roept
 * alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * BUDGET is grotendeels hand-narekenbaar op statische budget-limieten en
 * synthetische fixtures (periode-modus, planeditor-diff, rollover, voorspelling,
 * NIBUD-benchmark, gedeeld budgetteren). Alle checks zijn pure functies —
 * geen netwerk, geen auth-afhankelijkheid, vandaar `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { BUDGET_ENGINE_CHECKS } from '@/lib/uat/acceptance/budget-checks'

const CAT = 'uat.budget'

const tests: TestCase[] = BUDGET_ENGINE_CHECKS.map((check) => ({
  id: `uat-budget-${check.workflow.toLowerCase()}`,
  name: `${check.workflow} (${check.scenarioId}): ${check.label}`,
  category: CAT,
  description: check.label,
  priority: 'high',
  estimatedDurationMs: 5,
  requiredRole: 'any',
  fn() {
    const { expected, actual } = check.run()
    assertEqual(actual, expected, `${check.workflow} — ${check.label}`)
  },
}))

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'UAT — Budgetteren (engine)',
    description:
      'Acceptatiecriteria domein Budgetteren: échte rekenfuncties/constanten op persona-brondata en synthetische fixtures (periode-modus, dekkingsgraad/alert-drempels, planeditor-diff, template-seed, rollover, voorspelling, spaardoel-voortgang, gedeeld budgetteren, NIBUD-benchmark). Gedeeld met budget.engine.test.ts.',
    icon: 'Wallet',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
