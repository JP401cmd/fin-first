/**
 * In-app regressie-suite: UAT-KRUIS engine-checks (cross-module consistentie).
 *
 * Draait `KRUIS_ENGINE_CHECKS` (lib/uat/acceptance/kruis-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/kruis.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `kruis-checks.ts`; deze suite roept
 * alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * KRUIS is consistentie/delta; alleen de canonieke, PURE SSoT-functies (spaarquote,
 * vrijheids-%, FIRE-eligible grondslag, SWR, dagtarief) zijn exact toetsbaar en
 * staan hier. Alle checks zijn pure functies op vaste fixture-getallen — geen
 * netwerk, geen auth-afhankelijkheid, vandaar `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { KRUIS_ENGINE_CHECKS } from '@/lib/uat/acceptance/kruis-checks'

const CAT = 'uat.kruis'

const tests: TestCase[] = KRUIS_ENGINE_CHECKS.map((check) => ({
  id: `uat-kruis-${check.workflow.toLowerCase()}`,
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
    label: 'UAT — Cross-module (engine)',
    description: 'Acceptatiecriteria domein KRUIS: de exact-toetsbare consistentie-identiteiten (spaarquote, vrijheids-%, FIRE-eligible grondslag-delta, SWR, één dagtarief) via de canonieke SSoT-functies op vaste fixtures. Gedeeld met kruis.engine.test.ts.',
    icon: 'Network',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
