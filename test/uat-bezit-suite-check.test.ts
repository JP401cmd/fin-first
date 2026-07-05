/**
 * CI-bewaking van de in-app regressie-suite voor de UAT-Bezit engine-checks
 * (lib/regression-tests/suites/uat-bezit.ts).
 *
 * Voert alle geregistreerde tests uit onder vitest, zodat een regressie in
 * BEZIT_ENGINE_CHECKS al bij `npm run test:run` rood wordt — niet pas op
 * /beheer/regressietest. Alle checks zijn pure functies op statische
 * persona-brondata (geen netwerk), dus er is niets om over te slaan.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/uat-bezit'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'
import { BEZIT_ACCEPTANCE } from '@/lib/uat/acceptance/bezit'

describe('uat-bezit regressie-suite', () => {
  it('registreert precies één test per exact-criterium in BEZIT_ACCEPTANCE', () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.bezit')
    const exactCount = BEZIT_ACCEPTANCE.criteria.filter((c) => c.assertion.kind === 'exact').length
    expect(tests.length).toBe(exactCount)
  })

  it('alle geregistreerde tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.bezit')
    expect(tests.length).toBeGreaterThan(0)

    for (const t of tests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
