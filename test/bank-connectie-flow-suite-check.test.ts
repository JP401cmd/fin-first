/**
 * CI-bewaking van de in-app regressie-suite voor de bank-connect/TrueLayer-flow
 * (lib/regression-tests/suites/bank-connectie-flow.ts).
 *
 * Voert alle NIET-netwerk suite-tests ook onder vitest uit, zodat een
 * regressie in de callback-/sync-logica (o.a. de meta-tegenpartij-fallback via
 * mapTransaction() en de verweesde-verbindingen-opruiming) al bij
 * `npm run test:run` rood wordt — niet pas op /beheer/regressietest.
 *
 * De 7 tests die echte HTTP-aanroepen doen (via unauthenticatedFetch) worden
 * overgeslagen: die zijn niet deterministisch in CI zonder een lopende server.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/bank-connectie-flow'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

const NETWORK_TEST_IDS = new Set([
  'ob-bank-auth-link-redirect',
  'ob-bank-sync-transactions',
  'ob-bank-status-display',
  'ob-bank-providers-list',
  'ob-bank-disconnect-soft',
  'ob-bank-balances-sync',
  'ob-bank-auth-consistency',
])

describe('bank-connectie-flow regressie-suite (zonder netwerk)', () => {
  it('alle statische suite-tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('onboarding.bank-connectie')

    // 18 tests geregistreerd; 7 zijn netwerk-only (overgeslagen in vitest CI).
    // 17e = ob-bank-sync-cross-source-dedup (fase 2, cross-bron dedup-laag 2).
    // 18e = ob-bank-target-account-select-encrypted-iban (30 juli): de
    // keuzelijst-SELECT moet iban_encrypted lezen, niet de plaintext-kolom die
    // Stage B dropt — anders 500t de keuzelijst en degradeert de wizard stil naar
    // "alleen een nieuwe rekening".
    expect(tests.length).toBe(18)

    const staticTests = tests.filter(t => !NETWORK_TEST_IDS.has(t.id))
    expect(staticTests.length).toBe(11)

    for (const t of staticTests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
