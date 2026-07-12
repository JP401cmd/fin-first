/**
 * In-app regressie-suite: UAT-Mijn engine-checks.
 *
 * Draait `MIJN_ENGINE_CHECKS` (lib/uat/acceptance/mijn-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/mijn.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `mijn-checks.ts`; deze suite roept
 * alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * MIJN is een UI/interactie-zware zone: slechts drie criteria zijn exact
 * hand-narekenbaar (jaarruimte per persoon, gedeelde-budget-split, add-on-prijzen).
 * Alle checks zijn pure functies op statische persona-brondata / de canonieke
 * catalogus (`lib/test-personas.ts`, `lib/subscription-catalog.ts`) — geen
 * netwerk, geen auth-afhankelijkheid, vandaar `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { MIJN_ENGINE_CHECKS } from '@/lib/uat/acceptance/mijn-checks'

const CAT = 'uat.mijn'

const tests: TestCase[] = MIJN_ENGINE_CHECKS.map((check) => ({
  id: `uat-mijn-${check.workflow.toLowerCase()}`,
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
    label: 'UAT — Mijn (engine)',
    description:
      'Acceptatiecriteria domein Mijn (profiel, huishouden, account, voorkeuren): de hand-narekenbare kern op persona-brondata/catalogus (jaarruimte per persoon via computeJaarruimte + resolvePensionFactorA, gedeelde-budget-split via computeSharePct, add-on-prijzen uit ADDON_PLANS). De overige, UI/interactie-scenario’s worden live geverifieerd. Gedeeld met mijn.engine.test.ts.',
    icon: 'UserCog',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
