import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCell, getSheet, listFixtures } from '@/lib/horizon-kernel/oracle/fixture-load'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { computeOnt, type OntDep, type OntRow } from '@/lib/horizon-kernel/tables/ont'
import {
  runTableParityAllFixtures,
  type TableColumn,
  type TableParitySpec,
} from '@/lib/horizon-kernel/parity/teacher'
import type { KernelInput, MonthIndex } from '@/lib/horizon-kernel/types'

/**
 * PARITY — tabel **Ont** (onttrekkingsbehoefte na FIRE + onttrekkingsprofiel)
 * tegen het Excel-oracle (ADR 0032).
 *
 * Teacher-forced: alle upstream-vensters komen uit de fixture (`buildDep`), zodat
 * `computeOnt` geïsoleerd formule-getrouw bewezen wordt over **alle fixtures ×
 * alle 1200 maanden × de kolommen A/B/C/D/F/G/H/I**, met tolerantie €0,01. De
 * vier profiel-scenario's (basis=Afnemend, profiel-vast/-oplopend/-guardrails)
 * bewijzen de fasecurve- en guardrails-mechaniek; onhaalbaar (B16 op 100) en
 * pensioen-tekort bewijzen de FIRE-gate-randgevallen.
 *
 * Bewust buiten de vergelijking (statische documentatie/opmaak, geen per-maand-
 * berekening — empirisch leeg in alle 1200 data-rijen × alle fixtures):
 *   - **E** (permanente spacer-kolom, altijd leeg).
 *   - **J** (toelichtingstekst — alleen de kopregel bevat tekst).
 *
 * De solver-gebonden waarden P!B16 (→ FIRE-maand) en P!B82 (guardrails-anker)
 * worden teacher-forced uit de fixture-P-sheet gelezen (niet uit KernelInput),
 * zodat de module later aan de echte solver te koppelen is.
 */

// ── Oracle-layout van de upstream-tabs (bron: structuur.md, empirisch geverifieerd) ──
// CF/Prognose/PT: datamaand m op grid-index 1 + m (Excel-rij 2 = maand 0).
const ROW2_START = 1
// Bez: datamaand m op grid-index 3 + m (Excel-rij 4 = maand 0).
const ROW4_START = 3
// Kolomindices (0-gebaseerd): Prognose!J = 9, CF!K = 10, PT!K = 10, Bez!BA = 52, Bez!BB = 53.
const PROGNOSE_COL_J = 9
const CF_COL_K = 10
const PT_COL_K = 10
const BEZ_COL_BA = 52
const BEZ_COL_BB = 53

/** Grid-cel → getal (lege/niet-numerieke cel → 0; Excel-semantiek voor leeg-numeriek). */
function cellNum(row: readonly CellValue[] | undefined, col: number): number {
  const v = row?.[col]
  return typeof v === 'number' ? v : 0
}

/** Lees een P-cel als getal (solver-gebonden waarden P!B16 / P!B82). */
function pCellNum(fx: OracleFixture, ref: string): number {
  const v = getCell(fx, ref)
  return typeof v === 'number' ? v : 0
}

// ── Ont-parity-spec ─────────────────────────────────────────────────────────────

/** Per-fixture context: upstream-grids + de solver-gebonden scalars. */
interface OntCtx {
  readonly prognose: CellValue[][]
  readonly cf: CellValue[][]
  readonly bez: CellValue[][]
  readonly pt: CellValue[][]
  /** ROUND((P!B16 − P!B7)·12, 0) — de FIRE-maand-gate. */
  readonly fireMaand: number
  /** P!B82 — guardrails-anker (liquide netto vóór FIRE). */
  readonly guardrailsAnker: number
}

/** Kolommen A/B/C/D/F/G/H/I van Ont, met de getter uit de `OntRow`. */
const ONT_COLUMNS: ReadonlyArray<TableColumn<OntRow>> = [
  { letter: 'A', index: 0, get: (r) => r.maand },
  { letter: 'B', index: 1, get: (r) => r.leeftijd },
  { letter: 'C', index: 2, get: (r) => r.maandInJaar },
  { letter: 'D', index: 3, get: (r) => r.onttrekking },
  { letter: 'F', index: 5, get: (r) => r.faseFactor },
  { letter: 'G', index: 6, get: (r) => r.liquideNettoVorigeMaand },
  { letter: 'H', index: 7, get: (r) => r.guardrailsFactor },
  { letter: 'I', index: 8, get: (r) => r.actieveFactor },
]

const ontSpec: TableParitySpec<KernelInput, OntCtx, OntDep, OntRow> = {
  sheet: 'Ont',
  headerRows: 1, // Ont: maand 0 op grid-rij 1 (Excel-rij 2)
  buildInput: buildKernelInput,
  prepare: (fx: OracleFixture, input: KernelInput): OntCtx => ({
    prognose: getSheet(fx, 'Prognose').values,
    cf: getSheet(fx, 'CF').values,
    bez: getSheet(fx, 'Bez').values,
    pt: getSheet(fx, 'PT').values,
    // FIRE-maand uit de solver-uitkomst P!B16 (teacher-forced) + de statische P!B7.
    fireMaand: Math.round((pCellNum(fx, 'P!B16') - input.startLeeftijd) * 12),
    guardrailsAnker: pCellNum(fx, 'P!B82'),
  }),
  buildDep: (ctx: OntCtx, _input: KernelInput, m: MonthIndex): OntDep => ({
    fireMaand: ctx.fireMaand,
    guardrailsAnker: ctx.guardrailsAnker,
    // Prognose!J(m−1) — bij m=0 is er geen vorige maand (compute negeert de waarde dan).
    liquideNettoVorigeMaand: m === 0 ? 0 : cellNum(ctx.prognose[ROW2_START + (m - 1)], PROGNOSE_COL_J),
    huurNaVerkoop: cellNum(ctx.bez[ROW4_START + m], BEZ_COL_BA),
    vervallenHypotheeklast: cellNum(ctx.bez[ROW4_START + m], BEZ_COL_BB),
    box3VorigeMaand: cellNum(ctx.cf[ROW2_START + m], CF_COL_K),
    partnerTotaal: cellNum(ctx.pt[ROW2_START + m], PT_COL_K),
  }),
  compute: computeOnt,
  columns: ONT_COLUMNS,
}

// ── Testrun ────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity Ont (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = runTableParityAllFixtures(FIXTURE_DIR, ontSpec)

  describe('horizon-kernel · parity Ont (onttrekkingsbehoefte) tegen Excel-oracle', () => {
    it('draait over alle 19 fixtures', () => {
      // Bewuste teller-tripwire: hardcoded op de fixture-set-grootte zodat een
      // toegevoegde/verdwenen fixture (bv. ronde 4) hier zichtbaar wordt.
      expect(results.length).toBe(19)
    })

    for (const result of results) {
      it(`${result.scenario}: Ont cel-voor-cel binnen €0,01`, () => {
        const { mismatchCount, maxAbsDiff } = result.comparison
        expect(
          mismatchCount,
          mismatchCount === 0
            ? undefined
            : `${mismatchCount} mismatch(es) in Ont (${result.scenario}), ` +
                `max |Δ|=${maxAbsDiff}:\n${result.mismatchLines.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt het volledige maand×kolom-grid per fixture', () => {
      for (const result of results) {
        // 1200 maanden × 8 kolommen (A/B/C/D/F/G/H/I).
        expect(result.comparison.cellCount).toBe(result.months * result.columnCount)
        expect(result.months).toBe(1200)
        expect(result.columnCount).toBe(8)
      }
      const totalCells = results.reduce((sum, r) => sum + r.comparison.cellCount, 0)
      // Per fixture 1200 × 8 = 9.600 cellen; totaal schaalt mee met het aantal fixtures.
      expect(totalCells).toBe(results.length * 1200 * 8)
    })
  })
}
