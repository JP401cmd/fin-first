import { describe, it, expect } from 'vitest'
import { clearRegistry, getAllTests } from '@/lib/regression-tests/test-registry'
import type { TestCase } from '@/lib/regression-tests/test-types'
import { KNOWN_FAILING_TESTS } from './regression-known-failures'

// ── Generieke CI-koppeling voor pure in-app regressiesuites ─────────────────
//
// De 80+ suites in lib/regression-tests/suites/* draaien normaal alleen via
// de server-runner (dev-only, /beheer/regressietest of POST /api/regression/run
// tegen een lopende server + geseede gebruiker) — dus NOOIT in `npm run
// test:run` en dus nooit in CI. Voor suites zonder DB/netwerk/sessie-afhankelijkheid
// is dat een onnodig dekkingsgat: hun `fn()` is pure logica en kan prima onder
// vitest draaien.
//
// Deze helper registreert zo'n suite bij vitest: elke TestCase wordt een eigen
// `it()` (individuele rapportage, niet één grote blob), met bekende drift
// (KNOWN_FAILING_TESTS) zichtbaar apart gehouden van nieuwe regressies —
// zie regression-known-failures.ts voor de precieze regels.
//
// GEBRUIK NIET voor suites die fetch()/authenticatedFetch, een Supabase-client
// of een ingelogde testsessie nodig hebben — die horen bij de live-server
// CI-stap (zie docs/adr/ voor de aanbeveling), niet hier geforceerd.

export interface RegressionSuiteOptions {
  /**
   * test-ids binnen een verder pure suite die niet onder vitest kunnen
   * draaien — netwerk/DB (mirror van het NETWORK_TEST_IDS-patroon in
   * dashboard-widgets-suite-check.test.ts), of environment-afhankelijk
   * (bv. een assertie op lokale tijdzone of een wall-clock <Xms-drempel die
   * onder een gedeelde CI-runner flaky is — CLAUDE.md verbiedt precies dat).
   * Wordt overgeslagen in vitest met de reden zichtbaar in de testnaam.
   */
  networkOnly?: Record<string, string>
  /**
   * Deze suite registreert legitiem 0 tests (bv. uat-beheer: een admin-zone
   * zonder rekenkern, zie de suite's eigen doc-comment). Onderdrukt de
   * standaard "0 tests gevonden = mislukte import"-guard.
   */
  allowZeroTests?: boolean
  /**
   * De HELE suite is ongeschikt voor een gedeelde CI-runner. Alle tests worden
   * overgeslagen met deze reden, maar de suite blijft zichtbaar meelopen: de
   * import wordt nog steeds uitgevoerd, dus een kapotte `register()` of een
   * verdwenen suite valt hier alsnog door de mand.
   *
   * Gebruik dit boven een lange `networkOnly`-lijst wanneer de ongeschiktheid
   * een eigenschap van de SUITE is en niet van losse cases — anders sluit je
   * precies de tests uit die tijdens jouw run toevallig omvielen, en blijft de
   * rest als tijdbom staan.
   */
  skipAll?: string
}

/**
 * Registreer een regressiesuite als individuele vitest-tests.
 *
 * `register` moet SYNCHROON zijn (alle 98 suite-register()-functies zijn dat)
 * — hij wordt op module-niveau aangeroepen zodat elke TestCase een eigen
 * `it()` krijgt vóór vitest de collectie-fase afsluit.
 */
export function describeRegressionSuite(
  suiteId: string,
  register: () => void,
  options: RegressionSuiteOptions = {},
): void {
  clearRegistry()
  register()
  const tests: TestCase[] = getAllTests()
  const networkOnly = options.networkOnly ?? {}

  describe(`${suiteId} — regressiesuite (vitest CI-koppeling)`, () => {
    if (options.allowZeroTests) {
      // Vitest staat geen lege describe() toe ("No test found in suite") —
      // een expliciete it() houdt de suite zichtbaar EN bewaakt dat 'ie
      // bewust leeg blijft (zie de allowZeroTests-uitleg bij de aanroep).
      it(`bevat bewust 0 tests (${tests.length} gevonden)`, () => {
        expect(tests.length).toBe(0)
      })
    } else {
      it(`registreert minstens 1 test (${tests.length} gevonden)`, () => {
        expect(
          tests.length,
          `${suiteId}: register() leverde 0 tests op — mislukte import of ` +
            'vergeten register()-aanroep?',
        ).toBeGreaterThan(0)
      })
    }

    for (const t of tests) {
      const skipReason = options.skipAll ?? networkOnly[t.id]
      const label = `${t.id} — ${t.name}`

      if (skipReason) {
        it.skip(`${label} (netwerk/DB — ${skipReason})`, () => {})
        continue
      }

      it(label, async () => {
        const known = KNOWN_FAILING_TESTS.get(t.id)
        let caught: unknown
        try {
          await t.fn()
        } catch (e) {
          caught = e
        }

        if (known) {
          // Bekende drift: deze test MOET nog falen. Slaagt hij weer, dan is
          // de residue-entry stale en verbergt hij een teruggekeerde bug.
          expect(
            caught,
            `${t.id} staat in KNOWN_FAILING_TESTS ("${known}") maar slaagt nu weer. ` +
              'Verwijder de entry uit test/helpers/regression-known-failures.ts — ' +
              'de lijst mag alleen krimpen, en een groene test die er nog in staat ' +
              'maskeert straks een echte regressie.',
          ).toBeDefined()
        } else if (caught) {
          throw caught instanceof Error ? caught : new Error(String(caught))
        }
      })
    }
  })
}
