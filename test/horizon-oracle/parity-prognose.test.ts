import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getSheet, listFixtures } from '@/lib/horizon-kernel/oracle/fixture-load'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import {
  computePrognose,
  type PrognoseDep,
  type PrognoseRow,
} from '@/lib/horizon-kernel/tables/prognose'
import {
  runTableParityAllFixtures,
  type TableColumn,
  type TableParitySpec,
} from '@/lib/horizon-kernel/parity/teacher'
import type {
  AssetCategorie,
  KernelInput,
  MonthIndex,
  TsSchuldCategorieLabel,
} from '@/lib/horizon-kernel/types'

/**
 * PARITY — tabel **Prognose** (samenvattend maandvermogen) tegen het Excel-oracle
 * (ADR 0032).
 *
 * Teacher-forced: alle upstream-totalen (Bez / S / Bel) én het intra-tabel-anker
 * Prognose!G(m−1) komen uit de fixture (`buildDep`), zodat `computePrognose`
 * geïsoleerd formule-getrouw bewezen wordt over **alle fixtures × alle 1200
 * maanden × de kolommen A–M**, met tolerantie €0,01.
 *
 * Bewust BUITEN de vergelijking (statische documentatie/opmaak, geen per-maand-
 * berekening — motivatie zoals Bel!O/P): kolom **N** (permanente spacer, altijd
 * leeg) en kolom **O** (per-rij toelichtingstekst, alleen de eerste rijen gevuld).
 */

// ── Oracle-layout van de upstream-tabs (bron: structuur.md, empirisch geverifieerd) ──
// Bez/S: datamaand m staat op grid-index 3 + m (Excel-rij 4 = maand 0).
const DATA_ROW_START = 3
// Bel: maandtabel met 1 header-rij → maand m op grid-index 1 + m; Bel!K = kolomindex 10.
const BEL_HEADER_ROWS = 1
const BEL_COL_FORFAITAIRE_HEFFING = 10
// Prognose: 1 header-rij → maand m op grid-index 1 + m; kolom G (cumulatief Box 3) = index 6.
const PROGNOSE_HEADER_ROWS = 1
const PROGNOSE_COL_CUMULATIEF_BOX3 = 6

// Bez-totalen: AH/AI/AJ (drie Box 3-typen) = kolomindices 33/34/35.
const BEZ_COL_BOX3_SPAAR = 33
const BEZ_COL_BOX3_INVESTERING = 34
const BEZ_COL_BOX3_GEEN = 35
// S-totalen: AF/AG (Box 3-schuld / geen-Box 3-schuld) = kolomindices 31/32.
const S_COL_BOX3_SCHULD = 31
const S_COL_GEEN_BOX3_SCHULD = 32

// Bez-categorietotalen AM:AR (kolomindices 38..43). De volgorde in Bez wijkt af van
// de TS-rijvolgorde: Eigen huis staat als LAATSTE (AR), Overig ervóór (AQ) —
// empirisch geverifieerd (Bez!AR(m0)=400000=huis; Bez!AQ(m0)=5333=overig).
const BEZ_CATEGORIE_KOLOM: Record<AssetCategorie, number> = {
  Spaargeld: 38, // AM
  Beleggingen: 39, // AN
  Pensioen: 40, // AO
  Vastgoed: 41, // AP
  Overig: 42, // AQ
  'Eigen huis': 43, // AR
}
// S-categorietotalen AJ:AN (kolomindices 35..39); Tekort-lening heeft GEEN
// categorie-kolom (telt niet mee in de niet-liquide-som → undefined → 0).
const S_CATEGORIE_KOLOM: Record<TsSchuldCategorieLabel, number | undefined> = {
  Woning: 35, // AJ
  Consumptief: 36, // AK
  Studie: 37, // AL
  Zakelijk: 38, // AM
  Overig: 39, // AN
  'Tekort-lening': undefined,
}

/** Grid-cel → getal (niet-getal, bv. lege "" voorbij horizon → 0; compute negeert die). */
function cellNum(row: readonly CellValue[] | undefined, col: number): number {
  const v = row?.[col]
  return typeof v === 'number' ? v : 0
}

// ── Prognose-parity-spec ────────────────────────────────────────────────────────

/** Per-fixture context: de ruwe Bez/S/Bel/Prognose-grids (eenmalig opgehaald). */
interface PrognoseCtx {
  readonly bez: CellValue[][]
  readonly s: CellValue[][]
  readonly bel: CellValue[][]
  readonly prognose: CellValue[][]
}

/** Kolom A–M van Prognose, met de getter uit de `PrognoseRow`. */
const PROGNOSE_COLUMNS: ReadonlyArray<TableColumn<PrognoseRow>> = [
  { letter: 'A', index: 0, get: (r) => r.maand },
  { letter: 'B', index: 1, get: (r) => (r.beyondHorizon ? '' : r.leeftijd) },
  { letter: 'C', index: 2, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar) },
  { letter: 'D', index: 3, get: (r) => (r.beyondHorizon ? '' : r.totaalBezittingen) },
  { letter: 'E', index: 4, get: (r) => (r.beyondHorizon ? '' : r.totaalSchulden) },
  { letter: 'F', index: 5, get: (r) => (r.beyondHorizon ? '' : r.box3Forfaitair) },
  { letter: 'G', index: 6, get: (r) => (r.beyondHorizon ? '' : r.cumulatiefBox3) },
  { letter: 'H', index: 7, get: (r) => (r.beyondHorizon ? '' : r.brutoVermogen) },
  { letter: 'I', index: 8, get: (r) => (r.beyondHorizon ? '' : r.nettoVermogen) },
  { letter: 'J', index: 9, get: (r) => (r.beyondHorizon ? '' : r.nettoLiquide) },
  { letter: 'K', index: 10, get: (r) => (r.beyondHorizon ? '' : r.schuldenNegatief) },
  { letter: 'L', index: 11, get: (r) => (r.beyondHorizon ? '' : r.nietLiquideBezit) },
  { letter: 'M', index: 12, get: (r) => (r.beyondHorizon ? '' : r.nietLiquideLeningen) },
]

const prognoseSpec: TableParitySpec<KernelInput, PrognoseCtx, PrognoseDep, PrognoseRow> = {
  sheet: 'Prognose',
  headerRows: PROGNOSE_HEADER_ROWS, // Prognose: maand 0 op grid-rij 1 (Excel-rij 2)
  buildInput: buildKernelInput,
  prepare: (fx: OracleFixture): PrognoseCtx => ({
    bez: getSheet(fx, 'Bez').values,
    s: getSheet(fx, 'S').values,
    bel: getSheet(fx, 'Bel').values,
    prognose: getSheet(fx, 'Prognose').values,
  }),
  buildDep: (ctx: PrognoseCtx, input: KernelInput, m: MonthIndex): PrognoseDep => {
    const bezRow = ctx.bez[DATA_ROW_START + m]
    const sRow = ctx.s[DATA_ROW_START + m]
    const belRow = ctx.bel[BEL_HEADER_ROWS + m]
    // G(m−1): intra-tabel m−1-anker (teacher-forced); maand 0 heeft geen voorganger.
    const cumulatiefBox3Vorige =
      m === 0 ? 0 : cellNum(ctx.prognose[PROGNOSE_HEADER_ROWS + (m - 1)], PROGNOSE_COL_CUMULATIEF_BOX3)
    return {
      totaalBezittingen:
        cellNum(bezRow, BEZ_COL_BOX3_SPAAR) +
        cellNum(bezRow, BEZ_COL_BOX3_INVESTERING) +
        cellNum(bezRow, BEZ_COL_BOX3_GEEN),
      totaalSchulden: cellNum(sRow, S_COL_BOX3_SCHULD) + cellNum(sRow, S_COL_GEEN_BOX3_SCHULD),
      box3Forfaitair: cellNum(belRow, BEL_COL_FORFAITAIRE_HEFFING),
      cumulatiefBox3Vorige,
      bezCategorieTotalen: input.ts.bezitCategorien.map((c) =>
        cellNum(bezRow, BEZ_CATEGORIE_KOLOM[c.categorie]),
      ),
      schuldCategorieTotalen: input.ts.schuldCategorien.map((c) => {
        const col = S_CATEGORIE_KOLOM[c.categorie]
        return col === undefined ? 0 : cellNum(sRow, col)
      }),
    }
  },
  compute: computePrognose,
  columns: PROGNOSE_COLUMNS,
}

// ── Testrun ────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity Prognose (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = runTableParityAllFixtures(FIXTURE_DIR, prognoseSpec)

  describe('horizon-kernel · parity Prognose (maandvermogen) tegen Excel-oracle', () => {
    it('draait over alle 19 fixtures', () => {
      // Bewuste teller-tripwire: hardcoded op de fixture-set-grootte zodat een
      // toegevoegde/verdwenen fixture (bv. ronde 4) hier zichtbaar wordt.
      expect(results.length).toBe(19)
    })

    for (const result of results) {
      it(`${result.scenario}: Prognose cel-voor-cel binnen €0,01`, () => {
        const { mismatchCount, maxAbsDiff } = result.comparison
        expect(
          mismatchCount,
          mismatchCount === 0
            ? undefined
            : `${mismatchCount} mismatch(es) in Prognose (${result.scenario}), ` +
                `max |Δ|=${maxAbsDiff}:\n${result.mismatchLines.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt het volledige maand×kolom-grid per fixture', () => {
      for (const result of results) {
        // 1200 maanden × 13 kolommen (A–M).
        expect(result.comparison.cellCount).toBe(result.months * result.columnCount)
        expect(result.months).toBe(1200)
        expect(result.columnCount).toBe(13)
      }
      const totalCells = results.reduce((sum, r) => sum + r.comparison.cellCount, 0)
      // Per fixture 1200 × 13 = 15.600 cellen; totaal schaalt mee met het aantal fixtures.
      expect(totalCells).toBe(results.length * 1200 * 13)
    })
  })
}
