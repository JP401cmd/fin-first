/**
 * CI-bewaking van de in-app regressie-suite voor het dashboard-widget systeem
 * (lib/regression-tests/suites/dashboard-widgets.ts).
 *
 * Voert alle NIET-netwerk suite-tests ook onder vitest uit, zodat een
 * regressie in catalog/merge/ordering/builder al bij `npm run test:run`
 * rood wordt — niet pas op /beheer/regressietest.
 *
 * De twee API-tests (`dw-api-widgets-auth` en `dw-api-widgets-validation`)
 * worden overgeslagen: ze doen echte HTTP-aanroepen naar de lopende app en
 * zijn daarmee niet deterministisch in CI zonder running server.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/dashboard-widgets'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

const NETWORK_TEST_IDS = new Set([
  'dw-api-widgets-auth',
  'dw-api-widgets-validation',
])

describe('dashboard-widgets regressie-suite (zonder netwerk)', () => {
  it('alle statische suite-tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('widgets.systeem')

    // 39 tests geregistreerd; 2 zijn netwerk-only (overgeslagen in vitest CI)
    expect(tests.length).toBe(39)

    const staticTests = tests.filter(t => !NETWORK_TEST_IDS.has(t.id))
    expect(staticTests.length).toBe(37)

    for (const t of staticTests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
