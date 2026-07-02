import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { getCell, listFixtures, loadFixture } from '@/lib/horizon-kernel/oracle/fixture-load'
import { solveFire } from '@/lib/horizon-kernel/solver'

/**
 * Solver-parity: `solveFire` moet VANUIT ALLEEN DE INPUT (géén fixture-B16 als
 * startgeschenk) exact op de oracle-uitkomsten landen — de FIRE-leeftijd
 * (P!B16, gevonden door de VBA-bisectie), het doelblok (B35/B36/B38=B98), de
 * status (B93 = B100, incl. de bewuste doel=0-quirk waardoor `eind-deplete` en
 * `eind-pensioen` als `reached_now` rapporteren), de €/mnd-hint (B96) en de
 * tekort-lening-piek (B99).
 *
 * Toleranties: FIRE-leeftijd op de 6-decimalen-dump-precisie; euro-cellen op
 * de standaard €0,01-oracle-tolerantie.
 */

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const fixtureFiles = existsSync(FIXTURE_DIR) ? listFixtures(FIXTURE_DIR) : []

function num(v: unknown): number {
  expect(typeof v, `verwacht een getal, kreeg ${JSON.stringify(v)}`).toBe('number')
  return v as number
}

if (fixtureFiles.length === 0) {
  describe.skip('horizon-oracle solver-parity (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(fixtureFiles.length).toBe(0)
    })
  })
} else {
  describe('horizon-oracle solver-parity (BepaalFIRE + statusblok)', () => {
    for (const file of fixtureFiles) {
      it(path.basename(file), () => {
        const fx = loadFixture(file)
        const input = buildKernelInput(fx)
        const result = solveFire(input)

        // P!B16 — de gevonden FIRE-leeftijd (bisectie-exact; dump = 6 decimalen).
        expect(result.fireAge, 'P!B16 (FIRE-leeftijd)').toBeCloseTo(num(getCell(fx, 'P!B16')), 5)

        // P!B35 — eindleeftijd van de strategie.
        expect(result.eindleeftijd, 'P!B35 (eindleeftijd)').toBeCloseTo(
          num(getCell(fx, 'P!B35')),
          6,
        )

        // P!B36 — doelbedrag; P!B37 — modelwaarde; P!B38 = P!B98 — gap.
        expect(result.doelbedrag, 'P!B36 (doelbedrag)').toBeCloseTo(num(getCell(fx, 'P!B36')), 2)
        expect(result.modelwaarde, 'P!B37 (modelwaarde)').toBeCloseTo(
          num(getCell(fx, 'P!B37')),
          2,
        )
        expect(result.gap, 'P!B38 (gap)').toBeCloseTo(num(getCell(fx, 'P!B38')), 2)
        expect(result.gap, 'P!B98 (= B38)').toBeCloseTo(num(getCell(fx, 'P!B98')), 2)

        // P!B93 + P!B100 — status (string-exact).
        expect(result.status, 'P!B93 (status)').toBe(getCell(fx, 'P!B93'))
        expect(result.status, 'P!B100 (laatste VBA-status)').toBe(getCell(fx, 'P!B100'))

        // P!B96 — €/mnd-hint (alleen numeriek vergelijken als de cel een getal is).
        const b96 = getCell(fx, 'P!B96')
        if (typeof b96 === 'number') {
          expect(result.maandHint, 'P!B96 (€/mnd-hint)').toBeCloseTo(b96, 2)
        }

        // P!B99 — piek tekort-lening t/m de eindleeftijd.
        expect(result.tekortLeningTotEindleeftijd, 'P!B99 (tekort-lening)').toBeCloseTo(
          num(getCell(fx, 'P!B99')),
          2,
        )

        // Sanity: de bisectie blijft binnen het verwachte aantal engine-runs.
        expect(result.engineRuns, 'aantal engine-runs').toBeLessThanOrEqual(14)
      })
    }
  })
}
