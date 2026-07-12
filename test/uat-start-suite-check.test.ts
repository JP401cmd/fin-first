/**
 * CI-bewaking van de in-app regressie-suite voor de UAT-Start engine-checks
 * (lib/regression-tests/suites/uat-start.ts).
 *
 * Voert alle geregistreerde tests uit onder vitest, zodat een regressie in
 * START_ENGINE_CHECKS al bij `npm run test:run` rood wordt — niet pas op
 * /beheer/regressietest. Alle checks zijn pure functies op de UAT-plan-
 * testpersonen (geen netwerk), dus er is niets om over te slaan.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/uat-start'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'
import { START_ACCEPTANCE } from '@/lib/uat/acceptance/start'

describe('uat-start regressie-suite', () => {
  it('registreert precies één test per exact-criterium in START_ACCEPTANCE', () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.start')
    const exactCount = START_ACCEPTANCE.criteria.filter((c) => c.assertion.kind === 'exact').length
    expect(tests.length).toBe(exactCount)
  })

  it('alle geregistreerde tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.start')
    expect(tests.length).toBeGreaterThan(0)

    for (const t of tests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
