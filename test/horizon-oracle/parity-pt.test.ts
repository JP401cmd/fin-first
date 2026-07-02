import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCell, listFixtures, loadFixture } from '@/lib/horizon-kernel/oracle/fixture-load'
import { DEFAULT_TOLERANCE } from '@/lib/horizon-kernel/oracle/compare'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import {
  computePartnerHead,
  computePT,
  type PTDep,
  type PTRow,
} from '@/lib/horizon-kernel/tables/pt'
import {
  runTableParityAllFixtures,
  type TableColumn,
  type TableParitySpec,
} from '@/lib/horizon-kernel/parity/teacher'
import type { KernelInput } from '@/lib/horizon-kernel/types'

/**
 * PARITY — tab **PT** (partner / huishouden-parameterlaag) tegen het Excel-oracle
 * (ADR 0032, tolerantie €0,01).
 *
 * Twee vergelijkingen:
 *  1. **Maandtabel G:K** over alle fixtures × alle 1200 maanden, via de
 *     teacher-forced monthly-runner. PT heeft **geen upstream-tabel-afhankelijkheid**
 *     (`PTDep` is leeg): elke cel volgt uit `KernelInput`, dus de DepView is `{}`.
 *  2. **Afgeleide head-cellen B10-B12** (DOB-verschil + de twee AOW-/pensioen-
 *     maandindex-drempels), per fixture als losse cel-specs (zelfde semantiek:
 *     number↔number binnen €0,01; string/leeg exact).
 *
 * **Vergeleken maandkolommen: G (maandindex), H (partner-leeftijd), I (werkinkomen),
 * J (AOW+pensioen), K (totaal → CF!D/Ont!D).** De kolommen A–F blijven bewust buiten
 * de vergelijking: dat is het head-parameterblok (A = labels, B = invoer-/afgeleide
 * cellen op rij 1-13, C–F = leeg + de zelf-controle-assertions D2:E4). De INVOER-cellen
 * **B2-B9** (aanwezig / geboortejaar / inkomen / AOW-leeftijd / pensioen / AOW-bedrag)
 * zijn static input — ze worden via `input-from-fixture` naar `KernelInput.partner`
 * gemapt en horen daarom niet in de uitvoer-vergelijking. De self-controle-cel **B13**
 * ("OK — partnerleeftijd op AOW-startmaand …") en **D2:E4** zijn assertions/opmaak,
 * geen per-maand-berekening, en vallen eveneens buiten de vergelijking.
 *
 * **Beproevings-beperking:** slechts één fixture (`partner-aan`) heeft een actieve
 * partner (`PT!B2 = 1`); de overige 15 reproduceren de partner-uit-tak (I=J=K=0,
 * terwijl G/H numeriek doorlopen). Het partnerpensioen (`PT!B6 = 0` in álle fixtures)
 * en de indexatie-schakelaar (B8) blijven daardoor onbeproefd — geïmplementeerd
 * conform structuur.md, maar door de fixtures niet uitgeoefend.
 */

// ── Oracle-layout van de PT-maandtabel (bron: structuur.md, empirisch) ──
// De maandtabel staat in kolommen G:K (0-gebaseerd: G=6 … K=10); data begint op
// grid-index 1 (Excel-rij 2 = maand 0), dus headerRows = 1.
const PT_COL_MAAND = 6 // G
const PT_COL_LEEFTIJD = 7 // H
const PT_COL_WERKINKOMEN = 8 // I
const PT_COL_AOW_PENSIOEN = 9 // J
const PT_COL_TOTAAL = 10 // K

/** Kolom G–K van PT, met de getter uit de `PTRow`. */
const PT_COLUMNS: ReadonlyArray<TableColumn<PTRow>> = [
  { letter: 'G', index: PT_COL_MAAND, get: (r) => r.maand },
  { letter: 'H', index: PT_COL_LEEFTIJD, get: (r) => r.partnerLeeftijd },
  { letter: 'I', index: PT_COL_WERKINKOMEN, get: (r) => r.werkinkomen },
  { letter: 'J', index: PT_COL_AOW_PENSIOEN, get: (r) => r.aowPensioen },
  { letter: 'K', index: PT_COL_TOTAAL, get: (r) => r.totaal },
]

/** PT kent geen upstream-DepView; de teacher-forced dep is per definitie leeg. */
const EMPTY_DEP: PTDep = {}

const ptSpec: TableParitySpec<KernelInput, null, PTDep, PTRow> = {
  sheet: 'PT',
  headerRows: 1, // maand 0 op grid-rij 1 (Excel-rij 2)
  buildInput: buildKernelInput,
  prepare: (): null => null, // geen per-fixture context nodig (geen upstream-sheets)
  buildDep: (): PTDep => EMPTY_DEP,
  compute: computePT,
  columns: PT_COLUMNS,
}

// ── Head-cel-parity (B10-B12) — afgeleide "head-tijdas"-cellen ──
const SHEET = 'PT'

/** Eén te vergelijken head-cel: A1-adres (binnen PT) + de door de kern berekende waarde. */
interface CellSpec {
  readonly ref: string
  readonly actual: CellValue
}

/** De drie afgeleide head-cellen (B10-B12) uit `computePartnerHead`. */
function buildHeadCellSpecs(input: KernelInput): CellSpec[] {
  const head = computePartnerHead(input)
  return [
    { ref: 'B10', actual: head.dobVerschilMnd },
    { ref: 'B11', actual: head.aowStartMaand },
    { ref: 'B12', actual: head.pensioenStartMaand },
  ]
}

/** Vergelijk één cel; `null` = gelijk, anders een leesbare mismatch-regel. */
function compareHeadCell(ref: string, expected: CellValue, actual: CellValue): string | null {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const diff = Math.abs(expected - actual)
    return diff <= DEFAULT_TOLERANCE ? null : `${SHEET}!${ref}: Δ=${diff} (exp=${expected} act=${actual})`
  }
  if (expected === actual) return null // exact voor string/boolean/leeg
  return `${SHEET}!${ref}: exp=${JSON.stringify(expected)} act=${JSON.stringify(actual)}`
}

/** Draai de head-cel-lijst over één fixture; geef de mismatch-regels terug. */
function runHeadFixture(fx: OracleFixture): { scenario: string; mismatches: string[]; cellCount: number } {
  const input = buildKernelInput(fx)
  const specs = buildHeadCellSpecs(input)
  const mismatches: string[] = []
  for (const spec of specs) {
    const expected = getCell(fx, `${SHEET}!${spec.ref}`)
    const line = compareHeadCell(spec.ref, expected, spec.actual)
    if (line !== null) mismatches.push(line)
  }
  return { scenario: fx.meta.scenario, mismatches, cellCount: specs.length }
}

// ── Testrun ────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity PT (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = runTableParityAllFixtures(FIXTURE_DIR, ptSpec)
  const headResults = listFixtures(FIXTURE_DIR).map((f) => runHeadFixture(loadFixture(f)))

  describe('horizon-kernel · parity PT (partner-parameterlaag) tegen Excel-oracle', () => {
    it('draait over alle 19 fixtures', () => {
      // Bewuste teller-tripwire: hardcoded op de fixture-set-grootte zodat een
      // toegevoegde/verdwenen fixture (bv. ronde 4) hier zichtbaar wordt.
      expect(results.length).toBe(19)
      expect(headResults.length).toBe(19)
    })

    for (const result of results) {
      it(`${result.scenario}: PT-maandtabel G:K cel-voor-cel binnen €0,01`, () => {
        const { mismatchCount, maxAbsDiff } = result.comparison
        expect(
          mismatchCount,
          mismatchCount === 0
            ? undefined
            : `${mismatchCount} mismatch(es) in PT (${result.scenario}), ` +
                `max |Δ|=${maxAbsDiff}:\n${result.mismatchLines.join('\n')}`,
        ).toBe(0)
      })
    }

    for (const result of headResults) {
      it(`${result.scenario}: PT head-cellen B10-B12 binnen €0,01`, () => {
        expect(
          result.mismatches.length,
          result.mismatches.length === 0
            ? undefined
            : `${result.mismatches.length} mismatch(es) (${result.scenario}):\n${result.mismatches.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt het volledige maand×kolom-grid + head-cellen per fixture', () => {
      for (const result of results) {
        // 1200 maanden × 5 kolommen (G–K).
        expect(result.comparison.cellCount).toBe(result.months * result.columnCount)
        expect(result.months).toBe(1200)
        expect(result.columnCount).toBe(5)
      }
      const totalCells = results.reduce((sum, r) => sum + r.comparison.cellCount, 0)
      // Per fixture 1200 × 5 = 6.000 maandcellen; totaal schaalt mee met het aantal fixtures.
      expect(totalCells).toBe(results.length * 1200 * 5)
      // Per fixture 3 head-cellen (B10-B12).
      for (const result of headResults) expect(result.cellCount).toBe(3)
    })
  })
}
