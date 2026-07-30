/**
 * CI-bewaking van de in-app regressie-suite voor Import/Export
 * (lib/regression-tests/suites/kern-import-export.ts): holdings-CSV-import,
 * bankafschrift-import (/core/cash/import) en data-export
 * (/api/export).
 *
 * Voert alle NIET-netwerk suite-tests ook onder vitest uit, zodat een
 * regressie in de echte parsers (@/lib/parsers/broker-csv, @/lib/parsers,
 * @/lib/parsers/shared) al bij `npm run test:run` rood wordt — niet pas op
 * /beheer/regressietest. De meeste statische cases in deze suite roepen die
 * parsers wél echt aan (dynamic import), dus dit bewaakt productiecode —
 * niet alleen suite-literals.
 *
 * De 10 tests die echte HTTP-aanroepen doen (via authenticatedFetch/
 * unauthenticatedFetch, o.a. de /api/export-varianten en de
 * holdings-import-pagina) worden overgeslagen: die zijn niet
 * deterministisch in CI zonder een lopende server.
 *
 * BEKENDE RODE STATUS (2026-07-29, niet hier opgelost — buiten scope van
 * het bankkoppeling-werk van vandaag): 'import-csv-valid-broker-presets'
 * verwacht `BROKER_PRESETS.length === 3` maar @/lib/parsers/broker-csv
 * telt er inmiddels 5 — de suite is nooit meegedraaid sinds er brokers
 * zijn bijgekomen. Dit is een holdings/beleggen-import aangelegenheid,
 * geen bank/kas-drift; los op door het getal (of de assertie) bij te
 * werken naar de huidige preset-lijst.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/kern-import-export'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

const NETWORK_TEST_IDS = new Set([
  'import-holdings-page-loads',
  'import-holdings-api-auth',
  'import-holdings-api-empty-holdings',
  'import-holdings-api-invalid-broker',
  'import-bank-page-loads',
  'export-auth-guard',
  'export-invalid-type',
  'export-valid-types',
  'export-missing-type',
  'import-export-auth-consistency',
])

describe('kern-import-export regressie-suite (zonder netwerk)', () => {
  it('alle statische suite-tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('kern.import-export')

    // 25 tests geregistreerd; 10 zijn netwerk-only (overgeslagen in vitest CI)
    expect(tests.length).toBe(25)

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
