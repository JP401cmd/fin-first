/**
 * In-app regressie-suite: UAT-Cash engine-checks.
 *
 * Draait `CASH_ENGINE_CHECKS` (lib/uat/acceptance/cash-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/cash.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `cash-checks.ts`; deze suite roept
 * alleen `check.run()` aan (async, want de bankimport-parsers zijn async) en
 * vergelijkt met `assertEqual`.
 *
 * CASH combineert échte productiefuncties (cashflow-kaartstatussen,
 * maandgrenzen, periodevensters, tegenpartij-analyse, forecast, bankimport-
 * parsers, eigen-rekening-detectie, sleepmodus) met een paar kleine mirrors
 * van client-inline formules — 21 exacte checks in totaal. Alle checks zijn
 * pure/synthetische functies — geen netwerk, geen auth-afhankelijkheid,
 * vandaar `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { CASH_ENGINE_CHECKS } from '@/lib/uat/acceptance/cash-checks'

const CAT = 'uat.cash'

const tests: TestCase[] = CASH_ENGINE_CHECKS.map((check) => ({
  id: `uat-cash-${check.workflow.toLowerCase()}`,
  name: `${check.workflow} (${check.scenarioId}): ${check.label}`,
  category: CAT,
  description: check.label,
  priority: 'high',
  estimatedDurationMs: 10,
  requiredRole: 'any',
  async fn() {
    const { expected, actual } = await check.run()
    assertEqual(actual, expected, `${check.workflow} — ${check.label}`)
  },
}))

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'UAT — Cashflow (engine)',
    description:
      'Acceptatiecriteria domein Cashflow/transacties/bankimport: cashflow-kaartstatussen, maandgrenzen, periode-/heatmap-vensters, tegenpartij-analyse, vaste-lasten-/forecast-berekeningen, MT940/OFX/CSV-bankimport-parsers, eigen-rekening-detectie en sleepmodus-toewijzing. Gedeeld met cash.engine.test.ts.',
    icon: 'Landmark',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
