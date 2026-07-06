/**
 * In-app regressie-suite: UAT-Toekomst engine-checks.
 *
 * Draait `TOEK_ENGINE_CHECKS` (lib/uat/acceptance/toek-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/toek.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `toek-checks.ts`; deze suite roept
 * alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * TOEK is kernel-zwaar; alleen de weinige écht 'exact'-criteria (parameter-/
 * persona-echo's via een pure functie of constante) staan hier. Alle checks zijn
 * pure functies op statische persona-brondata (`lib/test-personas.ts`) — geen
 * netwerk, geen auth-afhankelijkheid, vandaar `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { TOEK_ENGINE_CHECKS } from '@/lib/uat/acceptance/toek-checks'

const CAT = 'uat.toek'

const tests: TestCase[] = TOEK_ENGINE_CHECKS.map((check) => ({
  id: `uat-toek-${check.workflow.toLowerCase()}`,
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
    label: 'UAT — Toekomst (engine)',
    description: 'Acceptatiecriteria domein Toekomst: de weinige exact-narekenbare parameter-/persona-echo\'s (AOW, tekort-lening-rente, strategie-labels, doel-ETA/-voortgang, guardrails) via échte rekenfuncties op persona-brondata. Gedeeld met toek.engine.test.ts.',
    icon: 'CalendarClock',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
