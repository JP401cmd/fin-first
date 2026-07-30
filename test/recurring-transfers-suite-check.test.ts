/**
 * CI-bewaking van de in-app regressie-suite voor terugkerende-transactie-
 * detectie en overboeking-matching
 * (lib/regression-tests/suites/recurring-transfers.ts).
 *
 * Voert alle geregistreerde tests uit onder vitest, zodat een regressie in
 * @/lib/recurring-detection (detectRecurringTransactions, detectFrequency,
 * detectCategory, normalizeCounterparty, detectedToRecurring) al bij
 * `npm run test:run` rood wordt — niet pas op /beheer/regressietest. Alle
 * cases roepen die productiefuncties rechtstreeks aan op synthetische
 * transactie-fixtures (geen netwerk/Supabase), dus er is niets over te
 * slaan.
 *
 * BEKENDE RODE STATUS (2026-07-29, niet hier opgelost — buiten scope van
 * het bankkoppeling-werk van vandaag): 'recurring-yearly-payments' geeft
 * maar 2 fixture-transacties mee, terwijl detectRecurringTransactions()
 * (@/lib/recurring-detection.ts:526) een harde minimum-eis van 3
 * transacties hanteert voordat er iets gedetecteerd wordt — de test kan
 * dus nooit geslaagd zijn sinds hij geschreven is. Los op door een derde
 * jaarlijkse ANWB-betaling aan de fixture toe te voegen.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/recurring-transfers'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

describe('recurring-transfers regressie-suite (kern.transactie-analyse)', () => {
  it('alle geregistreerde cases slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('kern.transactie-analyse')

    // Vergrendel het aantal: een stille wijziging (test verwijderd/vergeten
    // te registreren) moet hier zichtbaar worden, niet pas op de beheerpagina.
    expect(tests.length).toBe(21)

    for (const t of tests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
