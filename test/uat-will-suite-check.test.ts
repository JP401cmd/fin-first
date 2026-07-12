/**
 * CI-bewaking van de in-app regressie-suite voor de UAT-Will engine-checks
 * (lib/regression-tests/suites/uat-will.ts).
 *
 * Voert alle geregistreerde tests uit onder vitest, zodat een regressie in
 * WILL_ENGINE_CHECKS al bij `npm run test:run` rood wordt — niet pas op
 * /beheer/regressietest. Alle checks zijn pure/gemirrorde functies op
 * deterministische invoer (geen netwerk), dus er is niets om over te slaan.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/uat-will'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'
import { WILL_ACCEPTANCE } from '@/lib/uat/acceptance/will'

describe('uat-will regressie-suite', () => {
  it('registreert precies één test per exact-criterium in WILL_ACCEPTANCE', () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.will')
    const exactCount = WILL_ACCEPTANCE.criteria.filter((c) => c.assertion.kind === 'exact').length
    expect(tests.length).toBe(exactCount)
  })

  it('alle geregistreerde tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.will')
    expect(tests.length).toBeGreaterThan(0)

    for (const t of tests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
