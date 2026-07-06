/**
 * In-app regressie-suite: UAT-Schuld engine-checks.
 *
 * Draait `SCHULD_ENGINE_CHECKS` (lib/uat/acceptance/schuld-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/schuld.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `schuld-checks.ts`; deze suite roept
 * alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * SCHULD is grotendeels hand-narekenbaar (schuldtotalen, gewogen rente,
 * maandlasten, aflossing, LTV, Box 1-hypotheekrenteaftrek, Wet excessief lenen).
 * Alle checks zijn pure functies op statische persona-brondata
 * (`lib/test-personas.ts`) — geen netwerk, geen auth-afhankelijkheid, vandaar
 * `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { SCHULD_ENGINE_CHECKS } from '@/lib/uat/acceptance/schuld-checks'

const CAT = 'uat.schuld'

const tests: TestCase[] = SCHULD_ENGINE_CHECKS.map((check) => ({
  id: `uat-schuld-${check.workflow.toLowerCase()}`,
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
    label: 'UAT — Schulden (engine)',
    description:
      'Acceptatiecriteria domein Schulden & hypotheek: échte rekenfuncties/constanten op persona-brondata (schuldtotalen, gewogen rente, rente/aflossing-split, LTV, Box 1-hypotheekrenteaftrek, Wet excessief lenen, DSTI-aandachtspunten). Gedeeld met schuld.engine.test.ts.',
    icon: 'Landmark',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
