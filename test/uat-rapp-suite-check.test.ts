/**
 * CI-bewaking van de in-app regressie-suite voor de UAT-Rapp engine-checks
 * (lib/regression-tests/suites/uat-rapp.ts).
 *
 * Voert alle geregistreerde tests uit onder vitest, zodat een regressie in
 * RAPP_ENGINE_CHECKS al bij `npm run test:run` rood wordt — niet pas op
 * /beheer/regressietest. Alle checks zijn pure/gemirrorde functies op
 * deterministische invoer (geen netwerk), dus er is niets om over te slaan.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/uat-rapp'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'
import { RAPP_ACCEPTANCE } from '@/lib/uat/acceptance/rapp'

describe('uat-rapp regressie-suite', () => {
  it('registreert precies één test per exact-criterium in RAPP_ACCEPTANCE', () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.rapp')
    const exactCount = RAPP_ACCEPTANCE.criteria.filter((c) => c.assertion.kind === 'exact').length
    expect(tests.length).toBe(exactCount)
  })

  it('alle geregistreerde tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.rapp')
    expect(tests.length).toBeGreaterThan(0)

    for (const t of tests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
