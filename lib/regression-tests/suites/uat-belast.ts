/**
 * In-app regressie-suite: UAT-Belasting engine-checks.
 *
 * Draait `BELAST_ENGINE_CHECKS` (lib/uat/acceptance/belast-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/belast.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `belast-checks.ts`; deze suite roept
 * alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * BELAST is grotendeels hand-narekenbaar (Box 1 eigenwoningforfait/renteaftrek/
 * Hillen/marginaal, jaarruimte, Box 2 staffel/Wet excessief lenen/Vpb,
 * Box 3 forfaitair/tegenbewijs/partner-split). Alle checks zijn pure functies op
 * statische brondata (`lib/test-personas.ts` + representatieve bedragen) — geen
 * netwerk, geen auth-afhankelijkheid, vandaar `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { BELAST_ENGINE_CHECKS } from '@/lib/uat/acceptance/belast-checks'

const CAT = 'uat.belast'

const tests: TestCase[] = BELAST_ENGINE_CHECKS.map((check) => ({
  id: `uat-belast-${check.workflow.toLowerCase()}`,
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
    label: 'UAT — Belasting (engine)',
    description:
      'Acceptatiecriteria domein Belasting: échte rekenmotoren/constanten op brondata (Box 1 eigenwoningforfait/renteaftrek/Hillen/marginaal + jaarruimte, Box 2 staffel/Wet excessief lenen/Vpb, Box 3 forfaitair/tegenbewijs/partner-split). Gedeeld met belast.engine.test.ts.',
    icon: 'Landmark',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
