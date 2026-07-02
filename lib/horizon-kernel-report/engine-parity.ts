/**
 * Horizon-kernel · beheer-transparantie — verificatie-runner (server-only).
 *
 * **Node-only** (leest de oracle-fixtures via `fixture-load`). Draait de INTEGRALE
 * forward-recursie-engine (`runKernelProjection`) per fixture en legt elke geporte
 * maandtabel grid-voor-grid tegen de bijbehorende Excel-fixture-sheet met de pure
 * comparator (`compareGrid`, tolerantie €0,01). Dit is dezelfde vergelijking die de
 * bewaakte suite `test/horizon-oracle/parity-engine.test.ts` als assertie draait —
 * hier als on-demand rapport voor de beheer-verificatiepagina.
 *
 * De kolomsets komen uit de gedeelde registry (`table-columns.ts`), zodat de
 * beheer-verificatie op precies dezelfde cellen kijkt als de testsuite.
 */

import { getCell, getSheet, listFixtures, loadFixture } from '@/lib/horizon-kernel/oracle/fixture-load'
import { compareGrid } from '@/lib/horizon-kernel/oracle/compare'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { runKernelProjection } from '@/lib/horizon-kernel'
import { HORIZON_MONTHS } from '@/lib/horizon-kernel/types'
import { allTableSpecs } from './table-columns'

/** Eén afwijkende cel (leesbaar) voor de detail-uitklap. */
export interface VerifMismatch {
  readonly cel: string
  readonly maand: number
  readonly verwacht: string
  readonly actueel: string
  readonly delta: number | null
}

/** Verificatie-resultaat van één tabel binnen één fixture. */
export interface VerifTable {
  readonly sheet: string
  readonly id: string
  readonly cellCount: number
  readonly mismatchCount: number
  readonly maxAbsDiff: number
  readonly ok: boolean
  readonly voorbeelden: VerifMismatch[]
}

/** Verificatie-resultaat van één fixture. */
export interface VerifFixture {
  readonly scenario: string
  readonly description: string
  readonly fireAge: number | null
  readonly statusText: string
  readonly tables: VerifTable[]
  readonly ok: boolean
  readonly totalCells: number
  readonly totalMismatches: number
  readonly maxAbsDiff: number
}

/** Totaal-samenvatting over alle fixtures. */
export interface VerifReport {
  readonly ok: boolean
  readonly fixtureCount: number
  readonly tableCount: number
  readonly totalCells: number
  readonly totalMismatches: number
  readonly maxAbsDiff: number
  /** Herkomst van de bron-Excel (uit de fixture-meta; alle fixtures delen dezelfde save). */
  readonly bron: {
    readonly sourceFile: string
    readonly sourceLastWriteTime: string
    readonly sourceSha256: string
    readonly extractedAt: string
  } | null
  readonly fixtures: VerifFixture[]
  readonly durationMs: number
}

function fmtCell(v: CellValue): string {
  if (v === null) return '∅'
  if (v === '') return '""'
  if (typeof v === 'number') return v.toFixed(4)
  return String(v)
}

/** Draai de engine op één fixture en vergelijk alle geporte maandtabellen. */
function verifyFixture(fx: OracleFixture): VerifFixture {
  const input = buildKernelInput(fx)
  const b16 = getCell(fx, 'P!B16')
  const fireAge = typeof b16 === 'number' ? b16 : 0 // onhaalbaar: B16 op 100 geparkeerd
  const projection = runKernelProjection(input, { fireAge })

  const tables: VerifTable[] = []
  let totalCells = 0
  let totalMismatches = 0
  let maxAbsDiff = 0

  for (const spec of allTableSpecs()) {
    const grid = getSheet(fx, spec.sheet).values
    const rows = spec.select(projection)
    const expected: CellValue[][] = []
    const actual: CellValue[][] = []
    for (let m = 0; m < HORIZON_MONTHS; m++) {
      const gridRow = grid[spec.headerRows + m] ?? []
      const row = rows[m]
      const expRow: CellValue[] = []
      const actRow: CellValue[] = []
      for (const col of spec.columns) {
        expRow.push(gridRow[col.index] ?? null)
        actRow.push(col.get(row))
      }
      expected.push(expRow)
      actual.push(actRow)
    }
    const cmp = compareGrid(expected, actual)
    const voorbeelden: VerifMismatch[] = cmp.mismatches.slice(0, 8).map((mm) => {
      const col = spec.columns[mm.col]
      return {
        cel: `${spec.sheet}!${col.letter}${spec.headerRows + mm.row + 1}`,
        maand: mm.row,
        verwacht: fmtCell(mm.expected),
        actueel: fmtCell(mm.actual),
        delta: mm.diff,
      }
    })
    tables.push({
      sheet: spec.sheet,
      id: spec.id,
      cellCount: cmp.cellCount,
      mismatchCount: cmp.mismatchCount,
      maxAbsDiff: cmp.maxAbsDiff,
      ok: cmp.mismatchCount === 0,
      voorbeelden,
    })
    totalCells += cmp.cellCount
    totalMismatches += cmp.mismatchCount
    if (cmp.maxAbsDiff > maxAbsDiff) maxAbsDiff = cmp.maxAbsDiff
  }

  return {
    scenario: fx.meta.scenario,
    description: fx.meta.description,
    fireAge: fx.meta.solver.fireAge,
    statusText: fx.meta.solver.statusText,
    tables,
    ok: totalMismatches === 0,
    totalCells,
    totalMismatches,
    maxAbsDiff,
  }
}

/**
 * Draai de verificatie over alle `*.json.gz`-fixtures in `fixtureDir`. Geeft een
 * compleet rapport (per fixture per tabel + totaal). Gooit géén fout bij mismatches
 * — het rapport rapporteert de status.
 */
export function runVerification(fixtureDir: string): VerifReport {
  const start = Date.now()
  const files = listFixtures(fixtureDir)
  const fixtures = files.map((f) => verifyFixture(loadFixture(f)))

  let totalCells = 0
  let totalMismatches = 0
  let maxAbsDiff = 0
  for (const f of fixtures) {
    totalCells += f.totalCells
    totalMismatches += f.totalMismatches
    if (f.maxAbsDiff > maxAbsDiff) maxAbsDiff = f.maxAbsDiff
  }

  // Bron-herkomst uit de eerste fixture (alle fixtures komen uit dezelfde save).
  let bron: VerifReport['bron'] = null
  if (files.length > 0) {
    const meta = loadFixture(files[0]).meta
    bron = {
      sourceFile: meta.sourceFile,
      sourceLastWriteTime: meta.sourceLastWriteTime,
      sourceSha256: meta.sourceSha256,
      extractedAt: meta.extractedAt,
    }
  }

  return {
    ok: totalMismatches === 0,
    fixtureCount: fixtures.length,
    tableCount: allTableSpecs().length,
    totalCells,
    totalMismatches,
    maxAbsDiff,
    bron,
    fixtures,
    durationMs: Date.now() - start,
  }
}
