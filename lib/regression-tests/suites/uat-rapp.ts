/**
 * In-app regressie-suite: UAT-Rapp engine-checks.
 *
 * Draait `RAPP_ENGINE_CHECKS` (lib/uat/acceptance/rapp-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/rapp.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `rapp-checks.ts`; deze suite roept
 * alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * RAPP combineert twee échte productiefuncties (`lookupAowAge`,
 * `resolveFireParams`/`computeEffectiveSwr`, `deriveCohort`) met vier
 * gemirrorde server-route-berekeningen (vermogensgroei/balans/budget/
 * vermogenoverzicht — de routes zelf zijn Supabase-afhankelijke API-routes,
 * niet client-bundelbaar). Alle checks zijn pure functies op deterministische
 * invoer — geen netwerk, geen auth-afhankelijkheid, vandaar `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { RAPP_ENGINE_CHECKS } from '@/lib/uat/acceptance/rapp-checks'

const CAT = 'uat.rapp'

const tests: TestCase[] = RAPP_ENGINE_CHECKS.map((check) => ({
  id: `uat-rapp-${check.workflow.toLowerCase()}`,
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
    label: 'UAT — Rapportages (engine)',
    description:
      'Acceptatiecriteria domein Rapportages: vermogensgroei (periodiek rapport), balansformules (solvabiliteit/schuldgraad/liquiditeit), budgetrapport-Begroot-som, vermogensoverzicht-eigenVermogen, AOW-leeftijd + effectieve SWR/marginaal tarief (persoonlijk plan) en benchmark-cohort (leeftijdsband/huishoudtype). Gedeeld met rapp.engine.test.ts.',
    icon: 'FileText',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
