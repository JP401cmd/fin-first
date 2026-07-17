import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listFixtures } from '@/lib/horizon-kernel/oracle/fixture-load'

/**
 * Bewuste wachter (géén describe.skip-pad): faalt hard als de Excel-oracle-
 * fixtures ontbreken of onvolledig zijn, i.p.v. de stille skip die
 * parity-engine.test.ts en fixture-integrity.test.ts gebruiken wanneer de map
 * leeg/afwezig is. Zonder deze test kan de map kwijtraken (verkeerde
 * checkout, .gitignore-wijziging, LFS-achtig probleem) zonder dat CI het
 * meldt — de €0,01-oracle-pariteit is dan stilzwijgend niet meer gedekt.
 *
 * Zie Notion [Arch F2] "Wachter-test: Excel-oracle-fixtures verplicht
 * aanwezig" (architectuurreview 3 jul 2026, bevinding #30).
 */
const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const MIN_FIXTURES = 19

describe('horizon-oracle · fixture-aanwezigheid (wachter)', () => {
  it(`test/fixtures/horizon-oracle bevat minstens ${MIN_FIXTURES} fixtures`, () => {
    const files = listFixtures(FIXTURE_DIR)
    expect(
      files.length,
      files.length === 0
        ? `map ontbreekt of is leeg: ${FIXTURE_DIR} — de Excel-oracle-pariteitssuites ` +
            `(parity-engine.test.ts, fixture-integrity.test.ts) skippen dan stil en CI ` +
            `verliest zijn belangrijkste rekenmotor-dekking zonder het te melden.`
        : `slechts ${files.length} fixture(s) gevonden in ${FIXTURE_DIR}, verwacht ≥ ${MIN_FIXTURES}.`,
    ).toBeGreaterThanOrEqual(MIN_FIXTURES)
  })
})
