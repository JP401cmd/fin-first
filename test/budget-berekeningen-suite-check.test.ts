/**
 * CI-bewaking van de in-app regressie-suite voor budget-berekeningen
 * (lib/regression-tests/suites/budget-berekeningen.ts, categorie 'kern.budgets').
 *
 * Voert alle suite-tests ook onder vitest uit, zodat een regressie in
 * computeYearlyMustExpenses/computeRetirementExpenses (secties A+B) of in de
 * forecast/rollover/alert-aritmetiek (sectie C) al bij `npm run test:run`
 * rood wordt — niet pas op /beheer/regressietest.
 *
 * Alle 23 tests zijn puur (geen fetch/supabase/await op I/O), dus er is —
 * anders dan bij dashboard-widgets — geen netwerk-exclude-set nodig.
 *
 * Let op: sectie C (budget-forecast-*, budget-rollover-*, budget-alert-*,
 * budget-interval-calculation) test losstaande inline-aritmetiek, geen
 * budget-utils-functie — dat is een conceptuele check, geen regressie-dekking
 * van productiecode. Zie de kaart-notitie (Notion, Arch F2 bevinding #17).
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/budget-berekeningen'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

describe('budget-berekeningen regressie-suite (kern.budgets)', () => {
  it('alle suite-tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('kern.budgets')

    // 23 tests geregistreerd, allemaal puur (geen netwerk-exclude nodig)
    expect(tests.length).toBe(23)

    for (const t of tests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
