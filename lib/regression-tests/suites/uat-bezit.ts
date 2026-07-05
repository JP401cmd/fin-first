/**
 * In-app regressie-suite: UAT-Bezit engine-checks.
 *
 * Draait `BEZIT_ENGINE_CHECKS` (lib/uat/acceptance/bezit-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/bezit.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en
 * de "expected"-cijfers leven UITSLUITEND in `bezit-checks.ts`; deze suite
 * roept alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * Alle checks zijn pure functies op statische persona-brondata
 * (`lib/test-personas.ts`) — geen netwerk, geen auth-afhankelijkheid,
 * vandaar `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { BEZIT_ENGINE_CHECKS } from '@/lib/uat/acceptance/bezit-checks'

const CAT = 'uat.bezit'

const tests: TestCase[] = BEZIT_ENGINE_CHECKS.map((check) => ({
  id: `uat-bezit-${check.workflow.toLowerCase()}`,
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
    label: 'UAT — Bezit (engine)',
    description: 'Acceptatiecriteria domein Bezit: échte rekenfuncties op persona-brondata, gedeeld met bezit.engine.test.ts',
    icon: 'Landmark',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
