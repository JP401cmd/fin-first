/**
 * CI-bewaking van de in-app regressie-suite voor categorisatie
 * (lib/regression-tests/suites/categorisatie.ts).
 *
 * Deze suite bestond al, maar had — net als de meeste bestaande suites —
 * géén vitest-CI-wrapper (CLAUDE.md, "CI-zichtbaarheid verplicht"): zonder
 * dit bestand draaien de geregistreerde cases uitsluitend on-demand op
 * /beheer/regressietest, nooit bij `npm run test:run`. Alle cases hier zijn
 * pure functies (geen Supabase/netwerk/browser-API's) en dus 1-op-1 onder
 * vitest te draaien.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/categorisatie'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

describe('categorisatie regressie-suite (kern.categorisatie)', () => {
  it('alle geregistreerde cases slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('kern.categorisatie')

    // Vergrendel het aantal: een stille wijziging (test verwijderd/vergeten
    // te registreren) moet hier zichtbaar worden, niet pas op de beheerpagina.
    expect(tests.length).toBe(17)

    for (const t of tests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
