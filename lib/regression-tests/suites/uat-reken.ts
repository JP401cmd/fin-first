/**
 * In-app regressie-suite: UAT-Reken engine-checks.
 *
 * Draait `REKEN_ENGINE_CHECKS` (lib/uat/acceptance/reken-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/reken.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `reken-checks.ts`; deze suite roept
 * alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * REKEN toetst alleen échte, pure productiefuncties (rekenhulp-evaluator,
 * inflatie-/samengestelde-interest-grafiekmotoren, aspiraties-optelsom,
 * budget-/schuldrente-helpers, currency-formatter) — geen mirrors nodig in
 * deze zone. Alle checks zijn deterministisch — geen netwerk, geen auth-
 * afhankelijkheid, vandaar `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { REKEN_ENGINE_CHECKS } from '@/lib/uat/acceptance/reken-checks'

const CAT = 'uat.reken'

const tests: TestCase[] = REKEN_ENGINE_CHECKS.map((check) => ({
  id: `uat-reken-${check.workflow.toLowerCase()}`,
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
    label: 'UAT — Rekentools (engine)',
    description:
      'Acceptatiecriteria domein Rekentools & wat-als: de rekenhulp-evaluator (fvAnnuity op de échte "Aflossen vs. beleggen"-prefab), rekenhulp→levensgebeurtenis-vertaling, saldo-gewogen schuldrente, de actie-impact-badge, en de drie exacte losse rekentools (inflatie & koopkracht, samengestelde interest, uitgave na pensioen incl. aspiraties-vragenlijst). Gedeeld met reken.engine.test.ts.',
    icon: 'Calculator',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
