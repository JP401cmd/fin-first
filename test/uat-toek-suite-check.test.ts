/**
 * CI-bewaking van de in-app regressie-suite voor de UAT-Toekomst engine-checks
 * (lib/regression-tests/suites/uat-toek.ts).
 *
 * Voert alle geregistreerde tests uit onder vitest, zodat een regressie in
 * TOEK_ENGINE_CHECKS al bij `npm run test:run` rood wordt — niet pas op
 * /beheer/regressietest. Alle checks zijn pure functies op statische
 * persona-brondata (geen netwerk), dus er is niets om over te slaan.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/uat-toek'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'
import { TOEK_ACCEPTANCE } from '@/lib/uat/acceptance/toek'

describe('uat-toek regressie-suite', () => {
  it('registreert precies één test per exact-criterium in TOEK_ACCEPTANCE', () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.toek')
    const exactCount = TOEK_ACCEPTANCE.criteria.filter((c) => c.assertion.kind === 'exact').length
    expect(tests.length).toBe(exactCount)
  })

  it('alle geregistreerde tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('uat.toek')
    expect(tests.length).toBeGreaterThan(0)

    for (const t of tests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
