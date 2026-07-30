/**
 * CI-bewaking van de in-app regressie-suite voor de vaste-kosten-analyse
 * (lib/regression-tests/suites/vaste-kosten-analyse.ts): categorie-split
 * tussen abonnementen en vaste lasten, maandbedrag-normalisatie en
 * subtotalen op transactiedata.
 *
 * Voert alle geregistreerde tests uit onder vitest, zodat een regressie in
 * @/lib/vaste-lasten-insights (buildVasteLastenInsights) en
 * @/lib/cashflow-cards (vasteLastenCardStatus) al bij `npm run test:run`
 * rood wordt — niet pas op /beheer/regressietest. Alle cases zijn
 * synchrone, netwerkloze functies op synthetische fixtures — niets om
 * over te slaan.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/vaste-kosten-analyse'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

describe('vaste-kosten-analyse regressie-suite (wil.vaste-kosten-analyse)', () => {
  it('alle geregistreerde cases slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('wil.vaste-kosten-analyse')

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
