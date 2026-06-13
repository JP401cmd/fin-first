/**
 * CI-bewaking van de in-app regressie-suite voor de huis-strategie:
 * voert alle suite-tests (lib/regression-tests/suites/huis-strategie-trigger)
 * ook onder vitest uit, zodat een regressie in de trigger/grafiek-koppeling
 * al bij `npm run test:run` rood wordt — niet pas op /beheer/regressietest.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/huis-strategie-trigger'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

describe('huis-strategie-trigger regressie-suite', () => {
  it('alle suite-tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('horizon.huis-strategie')
    expect(tests.length).toBe(8)
    for (const t of tests) {
      await t.fn()
    }
  })
})
