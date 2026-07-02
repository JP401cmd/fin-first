import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { getCell, listFixtures, loadFixture } from '@/lib/horizon-kernel/oracle/fixture-load'
import { runScenarioBand } from '@/lib/horizon-kernel/wrappers/band'

/**
 * Scenarioband-parity: `runScenarioBand` moet VANUIT ALLEEN DE INPUT exact op de
 * oracle-uitkomsten Sim!B6:D8 landen — de drie scenario-rijen die de VBA-macro
 * `RunScenarioBand` per fixture heeft weggeschreven:
 *   - Sim!B(6+i) = gevonden FIRE-leeftijd (bisectie, of #N/A bij onhaalbaar);
 *   - Sim!C(6+i) = Rapport!L6 = Prognose!I op de FIRE-maand;
 *   - Sim!D(6+i) = Sim!B3   = Prognose!J op de eindleeftijd.
 *
 * De rijvolgorde is vast: 6 = Pessimistisch, 7 = Verwacht, 8 = Optimistisch.
 * Onhaalbare scenario's staan in de fixture als de tekst "#N/A" (alle drie de
 * kolommen); die worden als `reachable === false` gecontroleerd.
 *
 * Toleranties: FIRE-leeftijd op de 6-decimalen-dumpprecisie (toBeCloseTo 5);
 * euro-cellen op de €0,01-oracle-tolerantie (toBeCloseTo 2).
 */

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const fixtureFiles = existsSync(FIXTURE_DIR) ? listFixtures(FIXTURE_DIR) : []

/** Sim-rij per scenario-index (0=Pessimistisch, 1=Verwacht, 2=Optimistisch). */
const SIM_ROW = [6, 7, 8] as const
const SCENARIO_LABEL = ['Pessimistisch', 'Verwacht', 'Optimistisch'] as const

function num(v: unknown): number {
  expect(typeof v, `verwacht een getal, kreeg ${JSON.stringify(v)}`).toBe('number')
  return v as number
}

if (fixtureFiles.length === 0) {
  describe.skip('horizon-oracle scenarioband-parity (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(fixtureFiles.length).toBe(0)
    })
  })
} else {
  describe('horizon-oracle scenarioband-parity (RunScenarioBand → Sim!B6:D8)', () => {
    for (const file of fixtureFiles) {
      it(path.basename(file), () => {
        const fx = loadFixture(file)
        const input = buildKernelInput(fx)
        const result = runScenarioBand(input)

        expect(result.rows).toHaveLength(3)

        for (let i = 0; i < 3; i++) {
          const row = result.rows[i]
          const label = SCENARIO_LABEL[i]
          expect(row.scenario, `scenario-volgorde rij ${i}`).toBe(label)

          const bCell = getCell(fx, `Sim!B${SIM_ROW[i]}`)
          const cCell = getCell(fx, `Sim!C${SIM_ROW[i]}`)
          const dCell = getCell(fx, `Sim!D${SIM_ROW[i]}`)

          // Onhaalbaar scenario: de fixture zet #N/A in alle drie de kolommen.
          if (bCell === '#N/A') {
            expect(row.reachable, `${label}: onhaalbaar (Sim!B${SIM_ROW[i]}=#N/A)`).toBe(false)
            expect(cCell, `${label}: Sim!C ook #N/A`).toBe('#N/A')
            expect(dCell, `${label}: Sim!D ook #N/A`).toBe('#N/A')
            continue
          }

          expect(row.reachable, `${label}: haalbaar`).toBe(true)
          expect(row.fireAge, `${label}: Sim!B${SIM_ROW[i]} (FIRE-leeftijd)`).toBeCloseTo(
            num(bCell),
            5,
          )
          expect(
            row.nettoVermogenBijFire,
            `${label}: Sim!C${SIM_ROW[i]} (Rapport!L6, Prognose!I@FIRE)`,
          ).toBeCloseTo(num(cCell), 2)
          expect(
            row.vermogenOpEindleeftijd,
            `${label}: Sim!D${SIM_ROW[i]} (Sim!B3, Prognose!J@eindleeftijd)`,
          ).toBeCloseTo(num(dCell), 2)
        }
      })
    }
  })
}
