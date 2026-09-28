/**
 * In-app regressie-suite: UAT-Krant engine-checks.
 *
 * Draait `KRANT_ENGINE_CHECKS` (lib/uat/acceptance/krant-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/krant.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de logica en de
 * "expected"-waarden leven UITSLUITEND in `krant-checks.ts` / `krant.ts`; deze
 * suite roept alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * Alle checks zijn pure beslisfuncties van de Krant-grens (landing, redirect,
 * navigatie per product, Fin-mount, briefing, productpresets) — geen netwerk,
 * geen auth-afhankelijkheid, vandaar `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { KRANT_ENGINE_CHECKS } from '@/lib/uat/acceptance/krant-checks'

const CAT = 'uat.krant'

const tests: TestCase[] = KRANT_ENGINE_CHECKS.map((check) => ({
  id: `uat-krant-${check.workflow.toLowerCase()}`,
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
    label: 'UAT — Krant-product (engine)',
    description:
      'Acceptatiecriteria domein Krant-product (Krant 2B + 2A fase 2): landing op /nieuws, de routegrens (redirect, grensroutes, beheer voor een superadmin), navigatie per product, geen briefingmail/horizon-meldingen, de productpresets van PUT /api/modules en de regressie voor elk niet-Krant-account. Gedeeld met krant.engine.test.ts.',
    icon: 'Newspaper',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
