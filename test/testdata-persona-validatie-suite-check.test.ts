/**
 * CI-bewaking van de in-app regressie-suite voor testdata-persona-validatie:
 * voert alle suite-tests (lib/regression-tests/suites/testdata-persona-validatie)
 * ook onder vitest uit, zodat een regressie in persona-structuur, financiële
 * consistentie, metadata-constraints of idempotentie al bij `npm run test:run`
 * rood wordt — niet pas op /beheer/regressietest.
 *
 * Zie CLAUDE.md: "CI-zichtbaarheid (verplicht): een in-app suite draait NIET
 * mee in `npm run test:run` tenzij er een vitest CI-wrapper bestaat."
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/testdata-persona-validatie'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

describe('testdata-persona-validatie regressie-suite', () => {
  it('alle suite-tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('data.testdata')
    // 35 tests geregistreerd in de suite (vastgesteld via runtime-count)
    expect(tests.length).toBe(35)
    for (const t of tests) {
      await t.fn()
    }
  })
})
