/**
 * Horizon-kernel · parity — teacher-forced-runner.
 *
 * **Node/test/server-only** (leest fixtures via de oracle-loader). Herbruikbaar
 * harnas dat één maandtabel geïsoleerd cel-voor-cel tegen het Excel-oracle legt
 * (ADR 0032, tolerantie €0,01). "Teacher-forcing": de upstream-waarden die de
 * tabel consumeert (`DepView`) komen uit de FIXTURE, niet uit een eigen
 * berekening. Zo bewijs je elke tabel-formule over alle 1200 maanden × alle
 * fixtures zonder dat een fout in tabel X tabel Y besmet. De integrale
 * forward-recursie (die de tabellen aan elkaar koppelt) volgt als aparte stap
 * ná de tabel-ports.
 *
 * Een `TableParitySpec` beschrijft één tabel:
 *   - `buildInput(fx)`         → statische KernelInput (eenmalig per fixture).
 *   - `prepare(fx, input)`     → per-fixture context (bv. sheet-grids cachen).
 *   - `buildDep(ctx, input, m)`→ upstream-DepView voor maand m, uit de fixture.
 *   - `compute(input, dep, m)` → de te bewijzen kern-rij (pure tabel-functie).
 *   - `columns`                → welke Excel-kolommen vergeleken worden (+ getter).
 *
 * De runner bouwt twee parallelle grids (verwacht uit de fixture, actueel uit
 * `compute`) en vergelijkt ze met `compareGrid`. Mismatches worden vertaald naar
 * leesbare regels met kolomletter + Excel-rij + maand + verwacht/actueel/Δ.
 */

import { getSheet, listFixtures, loadFixture } from '../oracle/fixture-load'
import type { CellValue, OracleFixture } from '../oracle/fixture-types'
import {
  compareGrid,
  DEFAULT_TOLERANCE,
  type CellMismatch,
  type GridComparison,
} from '../oracle/compare'
import { HORIZON_MONTHS, type MonthIndex } from '../types'

/** Eén te vergelijken Excel-kolom van een tabel. */
export interface TableColumn<TRow> {
  /** Excel-kolomletter (voor leesbare mismatch-output), bv. `"D"`. */
  readonly letter: string
  /** 0-gebaseerde kolomindex in de sheet-grid (A=0, D=3, …). */
  readonly index: number
  /** Haal de celwaarde uit de compute-rij (number | "" | null | …). */
  readonly get: (row: TRow) => CellValue
}

/** Specificatie van één maandtabel-parity. */
export interface TableParitySpec<TInput, TCtx, TDep, TRow> {
  /** Excel-tabnaam, bv. `"Bel"`. */
  readonly sheet: string
  /** Aantal header-rijen bovenaan de tab (data begint daarna). Bel = 1. */
  readonly headerRows: number
  /** Aantal te vergelijken maanden (default `HORIZON_MONTHS`). */
  readonly months?: number
  /** Numerieke tolerantie (default €0,01). */
  readonly tolerance?: number
  /** Bouw de statische KernelInput (eenmalig per fixture). */
  readonly buildInput: (fx: OracleFixture) => TInput
  /** Per-fixture context (eenmalig): bv. sheet-grids ophalen om herhaald zoeken te sparen. */
  readonly prepare: (fx: OracleFixture, input: TInput) => TCtx
  /** Bouw de per-maand DepView uit de fixture (teacher-forcing). */
  readonly buildDep: (ctx: TCtx, input: TInput, m: MonthIndex) => TDep
  /** De te bewijzen pure tabel-functie. */
  readonly compute: (input: TInput, dep: TDep, m: MonthIndex) => TRow
  /** De vergeleken kolommen (volgorde bepaalt de grid-kolomvolgorde). */
  readonly columns: ReadonlyArray<TableColumn<TRow>>
}

/** Resultaat van één tabel-parity op één fixture. */
export interface TableParityResult {
  readonly scenario: string
  readonly sheet: string
  readonly comparison: GridComparison
  /** Leesbare regels voor de eerste mismatches (kolomletter/rij/maand/verwacht/actueel). */
  readonly mismatchLines: string[]
  readonly months: number
  readonly columnCount: number
}

/** Normaliseer een ruwe grid-cel: ontbrekend (`undefined`) → `null` (leeg). */
function normalizeCell(v: CellValue | undefined): CellValue {
  return v === undefined ? null : v
}

/** Compacte weergave van een celwaarde voor mismatch-output. */
function fmtCell(v: CellValue): string {
  if (v === null) return '∅'
  if (v === '') return '""'
  if (typeof v === 'number') return v.toFixed(6)
  return String(v)
}

/**
 * Voer de parity uit voor één tabel op één (reeds geladen) fixture.
 * Bouwt verwacht- (fixture) en actueel-grid (compute) en vergelijkt cel-voor-cel.
 */
export function runTableParity<TInput, TCtx, TDep, TRow>(
  fx: OracleFixture,
  spec: TableParitySpec<TInput, TCtx, TDep, TRow>,
): TableParityResult {
  const months = spec.months ?? HORIZON_MONTHS
  const tolerance = spec.tolerance ?? DEFAULT_TOLERANCE
  const input = spec.buildInput(fx)
  const ctx = spec.prepare(fx, input)
  const sheet = getSheet(fx, spec.sheet)

  const expected: CellValue[][] = []
  const actual: CellValue[][] = []

  for (let m = 0; m < months; m++) {
    const gridRow = sheet.values[spec.headerRows + m] ?? []
    const dep = spec.buildDep(ctx, input, m)
    const row = spec.compute(input, dep, m)

    const expRow: CellValue[] = []
    const actRow: CellValue[] = []
    for (const column of spec.columns) {
      expRow.push(normalizeCell(gridRow[column.index]))
      actRow.push(column.get(row))
    }
    expected.push(expRow)
    actual.push(actRow)
  }

  const comparison = compareGrid(expected, actual, { tolerance })
  const mismatchLines = comparison.mismatches.map((mm: CellMismatch) => {
    const column = spec.columns[mm.col]
    const excelRow = spec.headerRows + mm.row + 1 // A1-rij (1-gebaseerd)
    const delta = mm.diff !== null ? ` Δ=${mm.diff.toFixed(6)}` : ''
    return (
      `  ${spec.sheet}!${column.letter}${excelRow} (maand ${mm.row}): ` +
      `verwacht=${fmtCell(mm.expected)} actueel=${fmtCell(mm.actual)}${delta}`
    )
  })

  return {
    scenario: fx.meta.scenario,
    sheet: spec.sheet,
    comparison,
    mismatchLines,
    months,
    columnCount: spec.columns.length,
  }
}

/**
 * Voer de parity uit over ALLE `*.json.gz`-fixtures in `fixtureDir`, gesorteerd.
 * Geeft één resultaat per fixture (lege lijst als de map niet bestaat/leeg is).
 */
export function runTableParityAllFixtures<TInput, TCtx, TDep, TRow>(
  fixtureDir: string,
  spec: TableParitySpec<TInput, TCtx, TDep, TRow>,
): TableParityResult[] {
  return listFixtures(fixtureDir).map((file) => runTableParity(loadFixture(file), spec))
}
