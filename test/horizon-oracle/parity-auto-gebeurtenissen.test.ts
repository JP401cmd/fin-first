import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCell, listFixtures, loadFixture } from '@/lib/horizon-kernel/oracle/fixture-load'
import { DEFAULT_TOLERANCE } from '@/lib/horizon-kernel/oracle/compare'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import {
  computeAutoGebeurtenissen,
  type AutoGebeurtenissenResult,
} from '@/lib/horizon-kernel/tables/auto-gebeurtenissen'

/**
 * PARITY — tab **Auto-gebeurtenissen** (de "expander") tegen het Excel-oracle
 * (ADR 0032, tolerantie €0,01). Reproduceert de AFGELEIDE cellen — AOW-bedrag,
 * kinderen-index-structuur, erfenis-vrijstelling/tarief/netto, pensioen-J:M — uit
 * `KernelInput`, en legt ze cel-voor-cel over alle 16 fixtures.
 *
 * Rij-blok-parity (geen 1200-maandtabel): we vergelijken de betreffende cel-
 * ranges expliciet, met dezelfde vergelijk-semantiek als de monthly-runner
 * (number↔number binnen €0,01; string/leeg exact).
 *
 * **Bewust buiten de vergelijking** (documentatie/opmaak, geen per-invoer-
 * berekening): kolom A-labels/toelichtingen, de post-namen (kinderen kolom B),
 * de INVOER-cellen B4-B18, en de zelf-controle-assertions B63-B65 (die naar
 * andere sheets verwijzen). Pensioen-kolom N (rij 26-31) is een echt-lege cel
 * (blanco, geen ""-formule) en valt eveneens buiten de vergelijking.
 *
 * **Beproevings-beperking:** alle 16 fixtures delen dezelfde Auto-geb-invoer
 * (Alleenstaand, 50 opbouwjaren, 0 kinderen, erfenis €0, geen pensioen-potten).
 * De samenwonend-AOW-tak (993), de actieve-kind-tak (J-N-waarden), de erfenis>0-
 * tak en de pensioen-annuïtisering zijn daardoor onbeproefd (zie module-doc).
 */

const SHEET = 'Auto-gebeurtenissen'

/** Eén te vergelijken cel: A1-adres (binnen SHEET) + de door de kern berekende waarde. */
interface CellSpec {
  readonly ref: string
  readonly actual: CellValue
}

// Kinderen-blok: rij 35 = kind 1 / post 0; Excel-rij = 35 + kind*6 + post.
const KINDER_ROW_BASE = 35
const PENSIOEN_ROW_BASE = 26 // rij 26-31

/** Bouw de volledige lijst berekende cellen (Auto-geb) uit het kern-resultaat. */
function buildCellSpecs(result: AutoGebeurtenissenResult): CellSpec[] {
  const specs: CellSpec[] = [
    { ref: 'B6', actual: result.huidigeLeeftijd },
    { ref: 'B7', actual: result.aowLeeftijd },
    { ref: 'B21', actual: result.aowBedrag },
    { ref: 'B56', actual: result.erfenis.vrijstelling },
    { ref: 'B57', actual: result.erfenis.tarief },
    { ref: 'B58', actual: result.erfenis.netto },
    { ref: 'B59', actual: result.erfenis.gebBedrag },
  ]

  // Kinderen rij 35-52 — kolommen A/C/D/E/F/G/H/I altijd, J-N (leeg tot actief).
  result.kinderRows.forEach((row, i) => {
    const r = KINDER_ROW_BASE + i
    specs.push(
      { ref: `A${r}`, actual: row.kind },
      { ref: `C${r}`, actual: row.fs },
      { ref: `D${r}`, actual: row.fe },
      { ref: `E${r}`, actual: row.type },
      { ref: `F${r}`, actual: row.m0 },
      { ref: `G${r}`, actual: row.sIdx },
      { ref: `H${r}`, actual: row.eIdx },
      { ref: `I${r}`, actual: row.actief },
      { ref: `J${r}`, actual: row.bedragPerMaand },
      { ref: `K${r}`, actual: row.startLeeftijd },
      { ref: `L${r}`, actual: row.startMaand },
      { ref: `M${r}`, actual: row.eindLeeftijd },
      { ref: `N${r}`, actual: row.eindMaand },
    )
  })

  // Pensioen rij 26-31 — afgeleide kolommen J-M (N is blanco, buiten vergelijking).
  result.pensioenRows.forEach((row, slot) => {
    const r = PENSIOEN_ROW_BASE + slot
    specs.push(
      { ref: `J${r}`, actual: row.duurModel },
      { ref: `K${r}`, actual: row.maandbedrag },
      { ref: `L${r}`, actual: row.eindLeeftijd },
      { ref: `M${r}`, actual: row.gebBedrag },
    )
  })

  return specs
}

/** Vergelijk één cel; `null` = gelijk, anders een leesbare mismatch-regel. */
function compareCell(ref: string, expected: CellValue, actual: CellValue): string | null {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const diff = Math.abs(expected - actual)
    return diff <= DEFAULT_TOLERANCE ? null : `${SHEET}!${ref}: Δ=${diff} (exp=${expected} act=${actual})`
  }
  if (expected === actual) return null // exact voor string/boolean/leeg-""
  return `${SHEET}!${ref}: exp=${JSON.stringify(expected)} act=${JSON.stringify(actual)}`
}

/** Draai de cel-lijst over één fixture; geef de mismatch-regels terug. */
function runFixture(fx: OracleFixture): { scenario: string; mismatches: string[]; cellCount: number } {
  const input = buildKernelInput(fx)
  const result = computeAutoGebeurtenissen(input)
  const specs = buildCellSpecs(result)
  const mismatches: string[] = []
  for (const spec of specs) {
    const expected = getCell(fx, `${SHEET}!${spec.ref}`)
    const line = compareCell(spec.ref, expected, spec.actual)
    if (line !== null) mismatches.push(line)
  }
  return { scenario: fx.meta.scenario, mismatches, cellCount: specs.length }
}

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity Auto-gebeurtenissen (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = listFixtures(FIXTURE_DIR).map((f) => runFixture(loadFixture(f)))

  describe('horizon-kernel · parity Auto-gebeurtenissen (expander) tegen Excel-oracle', () => {
    it('draait over alle 16 fixtures', () => {
      expect(results.length).toBe(16)
    })

    for (const result of results) {
      it(`${result.scenario}: Auto-gebeurtenissen cel-voor-cel binnen €0,01`, () => {
        expect(
          result.mismatches.length,
          result.mismatches.length === 0
            ? undefined
            : `${result.mismatches.length} mismatch(es) (${result.scenario}):\n${result.mismatches.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt per fixture het volledige berekende cel-blok', () => {
      for (const result of results) {
        // 7 losse (B6/B7/B21/B56-59) + 18 kinderrijen × 13 + 6 pensioenrijen × 4.
        expect(result.cellCount).toBe(7 + 18 * 13 + 6 * 4)
      }
    })
  })
}
