import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { getCell, listFixtures, loadFixture } from '@/lib/horizon-kernel/oracle/fixture-load'
import { runMonteCarlo } from '@/lib/horizon-kernel/wrappers/mc'

/**
 * Monte-Carlo-parity: `runMonteCarlo` moet VANUIT ALLEEN DE INPUT de bevroren
 * MC-uitkomsten reproduceren die de VBA-macro `RunMonteCarlo` per fixture heeft
 * weggeschreven — de 1/0-slaagcriteria MC!B14 … MC!B(13+n) én de slaagkans MC!B4
 * (= AVERAGE van die reeks). De randomness is deterministisch (sin-hash in de
 * sheetformules), dus de reeks moet cel-exact matchen.
 *
 * NB: in deze fixtures is n = MC!B1 = 10 (RunMonteCarlo draaide 10 runs; de "200
 * runs / slaagkans 0,535" uit docs/ is een ouder snapshot-artefact — de fixtures
 * dragen 10 verse runs, slaagkans 0,7 resp. 1,0). We lezen de reekslengte uit de
 * fixture zelf. MC stond in de eindstand uit (B5=0), maar de reeks is aanwezig.
 *
 * Toleranties: outcomes exact (1/0); slaagkans op 1e-6 (toBeCloseTo 6).
 */

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const fixtureFiles = existsSync(FIXTURE_DIR) ? listFixtures(FIXTURE_DIR) : []

/** Lees de bevroren MC-reeks MC!B14… (aaneengesloten numerieke cellen). */
function frozenSeries(fx: Parameters<typeof getCell>[0]): number[] {
  const series: number[] = []
  for (let k = 0; ; k++) {
    const v = getCell(fx, `MC!B${14 + k}`)
    if (typeof v !== 'number') break
    series.push(v)
  }
  return series
}

if (fixtureFiles.length === 0) {
  describe.skip('horizon-oracle Monte-Carlo-parity (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(fixtureFiles.length).toBe(0)
    })
  })
} else {
  describe('horizon-oracle Monte-Carlo-parity (RunMonteCarlo → MC!B14…, B4)', () => {
    for (const file of fixtureFiles) {
      it(path.basename(file), () => {
        const fx = loadFixture(file)
        const input = buildKernelInput(fx)
        const frozen = frozenSeries(fx)

        // De fixture draagt een niet-lege bevroren reeks; n = MC!B1 = reekslengte.
        expect(frozen.length, 'aantal bevroren MC-runs').toBeGreaterThan(0)
        expect(input.onzekerheid.mc.aantalRuns, 'n = MC!B1 = reekslengte').toBe(frozen.length)

        const result = runMonteCarlo(input)

        expect(result.outcomes, 'aantal outcomes = n').toHaveLength(frozen.length)
        for (let k = 0; k < frozen.length; k++) {
          expect(result.outcomes[k], `MC!B${14 + k} (run ${k + 1}, 1/0-slaagcriterium)`).toBe(
            frozen[k],
          )
        }

        // MC!B4 — slaagkans = gemiddelde van de reeks.
        const b4 = getCell(fx, 'MC!B4')
        if (typeof b4 === 'number') {
          expect(result.successProbability, 'MC!B4 (slaagkans)').toBeCloseTo(b4, 6)
        }
      })
    }
  })
}
