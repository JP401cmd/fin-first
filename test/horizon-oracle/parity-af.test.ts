import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getSheet, listFixtures } from '@/lib/horizon-kernel/oracle/fixture-load'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { computeAf, type AfDep, type AfGebPost, type AfRow } from '@/lib/horizon-kernel/tables/af'
import {
  runTableParityAllFixtures,
  type TableColumn,
  type TableParitySpec,
} from '@/lib/horizon-kernel/parity/teacher'
import type { KernelInput, MonthIndex } from '@/lib/horizon-kernel/types'

/**
 * PARITY — tabel **Af** (afname / negatieve gebeurtenissen) tegen het Excel-oracle
 * (ADR 0032).
 *
 * Teacher-forced: de gebeurtenis-posten komen uit de **Geb**-sheet (helper-
 * kolommen W:AE, rijen 4-30 — handmatig + auto). De Geb-tab wordt door een andere
 * porter gegenereerd; Af CONSUMEERT die posten, hier rechtstreeks uit de fixture,
 * zodat `computeAf` geïsoleerd formule-getrouw bewezen wordt over **alle 16
 * fixtures × alle 1200 maanden × de kolommen A–D, F, G**, tolerantie €0,01.
 *
 * Bewust buiten de vergelijking: kolom **E** — een permanente spacer (altijd
 * leeg, geen per-maand-berekening). Kolommen A (maandindex, altijd numeriek) en D
 * (`Totaal afname`, GEEN horizon-guard) worden óók voorbij de horizon vergeleken;
 * B/C (leeftijd/maand) en de duplicaat-kolommen F/G tonen daar `""`.
 */

// ── Geb-oracle-layout (bron: structuur.md, empirisch geverifieerd) ──
// Geb-gebeurtenis-rijen 4-30 = grid-index 3..29 (Excel-rij 4 = grid 3).
const GEB_ROW_START = 3
const GEB_ROW_END = 29
// Per rij 3 posten; elk (sIdx, eIdx, bn): W/X/Y, Z/AA/AB, AC/AD/AE.
const GEB_POST_COLS: ReadonlyArray<readonly [number, number, number]> = [
  [22, 23, 24], // W, X, Y
  [25, 26, 27], // Z, AA, AB
  [28, 29, 30], // AC, AD, AE
]

/** Grid-cel → getal met fallback (leeg/niet-getal → `fallback`). */
function cellNumOr(row: readonly CellValue[] | undefined, col: number, fallback: number): number {
  const v = row?.[col]
  return typeof v === 'number' ? v : fallback
}

/** Alle gebeurtenis-posten (81 = 27 rijen × 3) uit de Geb-helper-kolommen. */
function readGebPosten(gebValues: CellValue[][]): AfGebPost[] {
  const posten: AfGebPost[] = []
  for (let grid = GEB_ROW_START; grid <= GEB_ROW_END; grid++) {
    const row = gebValues[grid]
    for (const [sCol, eCol, bCol] of GEB_POST_COLS) {
      posten.push({
        // Lege post: sIdx=99999 > eIdx=99998 → nooit actief; bn=0.
        startIndex: cellNumOr(row, sCol, 99999),
        eindIndex: cellNumOr(row, eCol, 99998),
        bedrag: cellNumOr(row, bCol, 0),
      })
    }
  }
  return posten
}

/** Per-fixture context: de statische gebeurtenis-posten (eenmalig geëxtraheerd). */
interface AfCtx {
  readonly gebPosten: readonly AfGebPost[]
}

/** Kolommen A–D, F, G van Af (E = spacer, uitgesloten). */
const AF_COLUMNS: ReadonlyArray<TableColumn<AfRow>> = [
  { letter: 'A', index: 0, get: (r) => r.maand },
  { letter: 'B', index: 1, get: (r) => (r.beyondHorizon ? '' : r.leeftijd) },
  { letter: 'C', index: 2, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar) },
  { letter: 'D', index: 3, get: (r) => r.totaalAfname }, // altijd numeriek — geen guard
  { letter: 'F', index: 5, get: (r) => (r.beyondHorizon ? '' : r.leeftijd) },
  { letter: 'G', index: 6, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar) },
]

const afSpec: TableParitySpec<KernelInput, AfCtx, AfDep, AfRow> = {
  sheet: 'Af',
  headerRows: 1, // Af: maand 0 op grid-rij 1 (Excel-rij 2)
  buildInput: buildKernelInput,
  prepare: (fx: OracleFixture): AfCtx => ({
    gebPosten: readGebPosten(getSheet(fx, 'Geb').values),
  }),
  // De posten zijn statisch over de maanden; de per-maand-selectie zit in computeAf.
  buildDep: (ctx: AfCtx): AfDep => ({ gebPosten: ctx.gebPosten }),
  compute: computeAf,
  columns: AF_COLUMNS,
}

// ── Testrun ────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity Af (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = runTableParityAllFixtures(FIXTURE_DIR, afSpec)

  describe('horizon-kernel · parity Af (afname) tegen Excel-oracle', () => {
    it('draait over alle 19 fixtures', () => {
      // Bewuste tripwire: een nieuwe fixture-ronde moet hier zichtbaar afketsen.
      expect(results.length).toBe(19)
    })

    for (const result of results) {
      it(`${result.scenario}: Af cel-voor-cel binnen €0,01`, () => {
        const { mismatchCount, maxAbsDiff } = result.comparison
        expect(
          mismatchCount,
          mismatchCount === 0
            ? undefined
            : `${mismatchCount} mismatch(es) in Af (${result.scenario}), ` +
                `max |Δ|=${maxAbsDiff}:\n${result.mismatchLines.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt het volledige maand×kolom-grid per fixture', () => {
      for (const result of results) {
        // 1200 maanden × 6 kolommen (A–D, F, G).
        expect(result.comparison.cellCount).toBe(result.months * result.columnCount)
        expect(result.months).toBe(1200)
        expect(result.columnCount).toBe(6)
      }
      const totalCells = results.reduce((sum, r) => sum + r.comparison.cellCount, 0)
      // Dynamisch (ronde-4-proof): fixtures × 1200 maanden × 6 kolommen.
      expect(totalCells).toBe(results.length * 1200 * 6)
    })
  })
}
