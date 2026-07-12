/**
 * In-app regressie-suite: UAT-Ovz engine-checks.
 *
 * Draait `OVZ_ENGINE_CHECKS` (lib/uat/acceptance/ovz-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/ovz.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `ovz-checks.ts`; deze suite roept
 * alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * OVZ combineert échte productiefuncties (Box 3, gezondheidspijlers,
 * doel-voortgang, vrijheidsdagen, samengestelde rente) met twee kleine mirrors
 * (schuldratio-pijlerscore, postpone-/uitstel-termijnen) — 10 exacte checks.
 * Alle checks zijn pure functies — geen netwerk, geen auth-afhankelijkheid,
 * vandaar `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { OVZ_ENGINE_CHECKS } from '@/lib/uat/acceptance/ovz-checks'

const CAT = 'uat.ovz'

const tests: TestCase[] = OVZ_ENGINE_CHECKS.map((check) => ({
  id: `uat-ovz-${check.workflow.toLowerCase()}`,
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
    label: 'UAT — Overzicht-hub (engine)',
    description:
      'Acceptatiecriteria domein Overzicht-hub: Box 3-belasting, gezondheidspijler-scores (schuldratio/DSTI/concentratie), doel-voortgang, vrijheidsdagen-totaal (deficit-detectie), briefing-impact-badges, samengestelde rente, tips-/actiebeheer (sortering, postpone-/uitstel-termijnen, cap-op-5). Gedeeld met ovz.engine.test.ts.',
    icon: 'Home',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
