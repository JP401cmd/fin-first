/**
 * In-app regressie-suite: UAT-Start engine-checks.
 *
 * Draait `START_ENGINE_CHECKS` (lib/uat/acceptance/start-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/start.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `start-checks.ts`; deze suite roept
 * alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * START is grotendeels een publieke/auth/onboarding-flow-zone (navigatie,
 * formulieren, redirects) — het merendeel van de 26 workflows is 'ui-only' en
 * dus niet in deze suite vertegenwoordigd. De acht 'exact'-workflows draaien
 * hier op de letterlijke testpersonen uit het UAT-plan (Sanne Bakker/Jan de
 * Vries/Eva Jansen). Alle checks zijn pure functies — geen netwerk, geen
 * auth-afhankelijkheid, vandaar `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { START_ENGINE_CHECKS } from '@/lib/uat/acceptance/start-checks'

const CAT = 'uat.start'

const tests: TestCase[] = START_ENGINE_CHECKS.map((check) => ({
  id: `uat-start-${check.workflow.toLowerCase()}`,
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
    label: 'UAT — Publiek & onboarding (engine)',
    description:
      'Acceptatiecriteria domein Publiek/registratie/onboarding: échte rekenfuncties/constanten op de UAT-plan-testpersonen (Vrijheidscheck-preview + rapportcijfers, spaarquote-conversie, onboarding-prefills en -recap, pensioen-ingangsleeftijd-klem, noodfonds-prefill, prijs-consistentie). Gedeeld met start.engine.test.ts.',
    icon: 'LogIn',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
