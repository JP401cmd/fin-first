/**
 * CI-bewaking van de in-app regressie-suite voor generieke asset-liquidatie:
 * voert alle suite-tests (lib/regression-tests/suites/horizon-asset-liquidatie)
 * ook onder vitest uit, zodat een regressie in de generieke liquidatie-logica
 * al bij `npm run test:run` rood wordt — niet pas op /beheer/regressietest.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/horizon-asset-liquidatie'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

describe('horizon-asset-liquidatie regressie-suite', () => {
  it('alle suite-tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('horizon.asset-liquidatie')
    expect(tests.length).toBe(9)
    for (const t of tests) {
      await t.fn()
    }
  })
})
