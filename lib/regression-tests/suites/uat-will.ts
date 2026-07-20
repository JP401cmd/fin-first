/**
 * In-app regressie-suite: UAT-Fin engine-checks.
 *
 * Draait `WILL_ENGINE_CHECKS` (lib/uat/acceptance/will-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/will.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `will-checks.ts`; deze suite roept
 * alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * WILL combineert AI-gegenereerde oppervlakken (chat, krant — niet-deterministisch,
 * dus hier niet vertegenwoordigd; procesgeborgd via de live UAT-run) met volledig
 * deterministische meldingen/coach-selectie/krant-administratie (12 checks). Alle
 * checks zijn pure functies — geen netwerk, geen auth-afhankelijkheid, vandaar
 * `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { WILL_ENGINE_CHECKS } from '@/lib/uat/acceptance/will-checks'

const CAT = 'uat.will'

const tests: TestCase[] = WILL_ENGINE_CHECKS.map((check) => ({
  id: `uat-will-${check.workflow.toLowerCase()}`,
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
    label: 'UAT — Fin & berichten (engine)',
    description:
      'Acceptatiecriteria domein Fin/berichten/krant: échte en gemirrorde deterministische functies (tip-postpone-termijn, coach-regelselectie, bel-badge-cap, budgetmelding-tekst, ongelezen-teller, notificatievoorkeuren-filter, briefing-weeksleutel, krant-editienummer/jaargang/ververs-limiet/archief, nieuws-actie-defaults, "minder hierover"-demotiedrempel). Gedeeld met will.engine.test.ts.',
    icon: 'MessageCircle',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
