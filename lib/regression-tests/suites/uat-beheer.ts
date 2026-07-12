/**
 * In-app regressie-suite: UAT-Beheer engine-checks.
 *
 * BEHEER is een admin-tooling-zone ZONDER rekenkern: `BEHEER_ENGINE_CHECKS`
 * (lib/uat/acceptance/beheer-checks.ts) is bewust leeg. De categorie wordt tóch
 * geregistreerd (consistent met de andere zones + zichtbaar in
 * `/beheer/regressietest`), maar draait 0 engine-tests: de 33 BEHEER-criteria zijn
 * ui-only/consistency/oracle en worden live (Chrome DevTools) resp. via de
 * horizon-oracle-UI's geverifieerd, niet in een pure vitest.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { BEHEER_ENGINE_CHECKS } from '@/lib/uat/acceptance/beheer-checks'

const CAT = 'uat.beheer'

const tests: TestCase[] = BEHEER_ENGINE_CHECKS.map((check) => ({
  id: `uat-beheer-${check.workflow.toLowerCase()}`,
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
    label: 'UAT — Beheer (engine)',
    description:
      'Acceptatiecriteria domein Beheer (admin-tooling): geen rekenkern, dus 0 engine-checks. De 33 criteria (ui-only/consistency/oracle) worden live via Chrome DevTools en de horizon-transparantie-UI’s geverifieerd. Deze categorie bestaat voor volledigheid van de UAT-plaat.',
    icon: 'Wrench',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
