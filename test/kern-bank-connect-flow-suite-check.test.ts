/**
 * CI-bewaking van de in-app regressie-suite voor de gebruikerskant van de
 * bank-connect flow (/core/cash/connect — OAuth select/confirm/redirect,
 * callback, success, foutafhandeling)
 * (lib/regression-tests/suites/kern-bank-connect-flow.ts).
 *
 * Voert alle NIET-netwerk suite-tests ook onder vitest uit, zodat een
 * regressie in de statische fixtures (foutmeldingen, state-encoding,
 * redirect-URI-opbouw) al bij `npm run test:run` rood wordt — niet pas op
 * /beheer/regressietest.
 *
 * LET OP (bevinding, niet hier opgelost): de meeste niet-netwerk cases in
 * deze suite importeren GEEN productiecode — ze herbouwen het verwachte
 * formaat (bv. CONNECT_ERROR_MESSAGES, state-string, redirect-URI) als
 * lokale fixture en toetsen die tegen zichzelf. Deze wrapper vergrendelt dus
 * vooral de suite zelf tegen per-ongeluk-wijzigen, niet een garantie dat
 * app/api/bank-connect/** dat gedrag ook echt levert — dat blijft de taak
 * van de 6 netwerk-tests (overgeslagen hieronder) plus de bestaande
 * bank-connectie-flow-suite-check.test.ts.
 *
 * De 6 tests die echte HTTP-aanroepen doen (via authenticatedFetch/
 * unauthenticatedFetch) worden overgeslagen: die zijn niet deterministisch
 * in CI zonder een lopende server.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/kern-bank-connect-flow'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

const NETWORK_TEST_IDS = new Set([
  'bank-connect-page-route-accessible',
  'bank-connect-auth-link-auth-guard',
  'bank-connect-callback-api-auth-guard',
  'bank-connect-success-page-route',
  'bank-connect-status-auth-guard',
  'bank-connect-auth-consistency',
])

describe('kern-bank-connect-flow regressie-suite (zonder netwerk)', () => {
  it('alle statische suite-tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('kern.bank-connect')

    // 21 tests geregistreerd; 6 zijn netwerk-only (overgeslagen in vitest CI)
    expect(tests.length).toBe(21)

    const staticTests = tests.filter(t => !NETWORK_TEST_IDS.has(t.id))
    expect(staticTests.length).toBe(15)

    for (const t of staticTests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
