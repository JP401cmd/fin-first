/**
 * CI-bewaking van de in-app regressie-suite voor de UAT-Budget engine-checks
 * (lib/regression-tests/suites/uat-budget.ts).
 *
 * Voert alle geregistreerde tests uit onder vitest, zodat een regressie in
 * BUDGET_ENGINE_CHECKS al bij `npm run test:run` rood wordt — niet pas op
 * /beheer/regressietest. Alle checks zijn pure functies op persona-brondata of
 * synthetische fixtures (geen netwerk), dus er is niets om over te slaan.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/uat-budget'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'
import { BUDGET_ACCEPTANCE } from '@/lib/uat/acceptance/budget'

describe('uat-budget regressie-suite', () => {
  it('registreert precies één test per exact-criterium in BUDGET_ACCEPTANCE', () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.budget')
    const exactCount = BUDGET_ACCEPTANCE.criteria.filter((c) => c.assertion.kind === 'exact').length
    expect(tests.length).toBe(exactCount)
  })

  it('alle geregistreerde tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.budget')
    expect(tests.length).toBeGreaterThan(0)

    for (const t of tests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
