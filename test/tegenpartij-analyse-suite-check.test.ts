/**
 * CI-bewaking van de in-app regressie-suite voor tegenpartij-analyse
 * (lib/regression-tests/suites/tegenpartij-analyse.ts).
 *
 * Voert alle geregistreerde tests uit onder vitest, zodat een regressie in
 * @/lib/counterparty-analysis (computeCounterpartyStats,
 * computeMonthCategoryBreakdown) al bij `npm run test:run` rood wordt —
 * niet pas op /beheer/regressietest. Alle cases roepen die
 * productiefuncties rechtstreeks aan op synthetische transactie-fixtures
 * (geen netwerk/Supabase), dus er is niets over te slaan.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/tegenpartij-analyse'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

describe('tegenpartij-analyse regressie-suite (kern.tegenpartij-analyse)', () => {
  it('alle geregistreerde cases slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('kern.tegenpartij-analyse')

    // Vergrendel het aantal: een stille wijziging (test verwijderd/vergeten
    // te registreren) moet hier zichtbaar worden, niet pas op de beheerpagina.
    expect(tests.length).toBe(10)

    for (const t of tests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
