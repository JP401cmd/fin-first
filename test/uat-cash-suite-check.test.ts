/**
 * CI-bewaking van de in-app regressie-suite voor de UAT-Cash engine-checks
 * (lib/regression-tests/suites/uat-cash.ts).
 *
 * Voert alle geregistreerde tests uit onder vitest, zodat een regressie in
 * CASH_ENGINE_CHECKS al bij `npm run test:run` rood wordt — niet pas op
 * /beheer/regressietest. Checks zijn pure functies/parsers op deterministische
 * of zelf-samengestelde synthetische invoer (geen netwerk), dus er is niets
 * om over te slaan.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/uat-cash'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'
import { CASH_ACCEPTANCE } from '@/lib/uat/acceptance/cash'

describe('uat-cash regressie-suite', () => {
  it('registreert precies één test per exact-criterium in CASH_ACCEPTANCE', () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.cash')
    const exactCount = CASH_ACCEPTANCE.criteria.filter((c) => c.assertion.kind === 'exact').length
    expect(tests.length).toBe(exactCount)
  })

  it('alle geregistreerde tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.cash')
    expect(tests.length).toBeGreaterThan(0)

    for (const t of tests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
