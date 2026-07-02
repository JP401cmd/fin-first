/**
 * Horizon-kernel · Excel-oracle — comparator.
 *
 * **Pure** cel-voor-cel-vergelijker van 2D-grids (géén `node:fs`/Supabase) —
 * herbruikbaar door zowel de FASE-1-tests als de latere beheer-VERIFICATIE-
 * pagina die de kern-uitvoer tegen de oracle-fixtures legt (ADR 0032, parity
 * ≤ €0,01).
 *
 * Vergelijk-regels (per cel):
 *   - number ↔ number : mismatch als |verwacht − werkelijk| > tolerantie.
 *   - string ↔ string : exact (===).
 *   - boolean ↔ boolean: exact (===).
 *   - null ↔ null      : gelijk.
 *   - null ↔ 0 (of 0 ↔ null): **mismatch — expliciet** (leeg ≠ nul; dit vangt
 *     een pot die uit het grootboek verdwijnt i.p.v. op nul te staan).
 *   - overige type-verschillen: mismatch.
 *
 * `diff` is de numerieke |verschil| bij een number↔number-mismatch, en `null`
 * bij een structurele mismatch (type/leegte). `maxAbsDiff` telt uitsluitend de
 * numerieke verschillen — een structurele mismatch is geen tolerantie-kwestie.
 */

import type { CellValue } from './fixture-types'

/**
 * Standaard parity-tolerantie (euro's) conform ADR 0032.
 *
 * LET OP (calc-review): dit is een **absolute** marge. Zij is bewezen passend
 * voor het fixture-domein (nominale standen tot ~tientallen miljoenen; grootste
 * waargenomen |Δ| ≈ 5·10⁻⁵). Bij extreme horizon×inflatie-combinaties groeien
 * nominale bedragen zó ver dat relatieve fp-fout de €0,01 structureel kan
 * overschrijden — overweeg dan een relatieve tolerantie-vloer (bv.
 * max(0,01, |verwacht|·1e-12)) i.p.v. de marge blind te verruimen.
 */
export const DEFAULT_TOLERANCE = 0.01

/** Eén afwijkende cel. */
export interface CellMismatch {
  /** 0-gebaseerde rij-index in het grid. */
  row: number
  /** 0-gebaseerde kolom-index in het grid. */
  col: number
  expected: CellValue
  actual: CellValue
  /** |verschil| bij een numerieke mismatch; `null` bij een structurele mismatch. */
  diff: number | null
}

/** Resultaat van één grid-vergelijking. */
export interface GridComparison {
  /** Aantal vergeleken cel-posities (grootste gemene grid-omvang). */
  cellCount: number
  /** Totaal aantal mismatches (kan groter zijn dan `mismatches.length`). */
  mismatchCount: number
  /** Grootste numerieke |verschil| dat is gezien (0 als er geen numerieke mismatch was). */
  maxAbsDiff: number
  /** Eerste mismatches, gecapt op `MAX_MISMATCH_SAMPLES`. */
  mismatches: CellMismatch[]
}

/** Opties voor `compareGrid`. */
export interface CompareOptions {
  /** Numerieke tolerantie (default `DEFAULT_TOLERANCE`). */
  tolerance?: number
}

/** Maximaal aantal bewaarde mismatch-voorbeelden per grid. */
export const MAX_MISMATCH_SAMPLES = 50

/**
 * Vergelijk twee 2D-grids cel-voor-cel. Grids mogen jagged of ongelijk van
 * omvang zijn; ontbrekende cellen tellen als `null` (leeg), zodat een
 * vorm-verschil zichtbaar wordt via de null↔waarde-regel.
 */
export function compareGrid(
  expected: CellValue[][],
  actual: CellValue[][],
  opts: CompareOptions = {},
): GridComparison {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE

  let cellCount = 0
  let mismatchCount = 0
  let maxAbsDiff = 0
  const mismatches: CellMismatch[] = []

  const rowCount = Math.max(expected.length, actual.length)
  for (let row = 0; row < rowCount; row++) {
    const expRow = expected[row] ?? []
    const actRow = actual[row] ?? []
    const colCount = Math.max(expRow.length, actRow.length)
    for (let col = 0; col < colCount; col++) {
      cellCount++
      const e = expRow[col] ?? null
      const a = actRow[col] ?? null

      const result = compareCell(e, a, tolerance)
      if (result === null) continue // gelijk

      mismatchCount++
      if (result.diff !== null && result.diff > maxAbsDiff) maxAbsDiff = result.diff
      if (mismatches.length < MAX_MISMATCH_SAMPLES) {
        mismatches.push({ row, col, expected: e, actual: a, diff: result.diff })
      }
    }
  }

  return { cellCount, mismatchCount, maxAbsDiff, mismatches }
}

/**
 * Vergelijk één cel. Geeft `null` als gelijk, anders `{ diff }` waarbij `diff`
 * het numerieke |verschil| is (number↔number) of `null` (structureel).
 */
function compareCell(
  expected: CellValue,
  actual: CellValue,
  tolerance: number,
): { diff: number | null } | null {
  if (typeof expected === 'number' && typeof actual === 'number') {
    // NaN is nooit "gelijk"; verder tolerantie-vergelijking.
    if (Number.isNaN(expected) || Number.isNaN(actual)) return { diff: null }
    const diff = Math.abs(expected - actual)
    return diff <= tolerance ? null : { diff }
  }

  // Beide leeg → gelijk. null↔0 valt hieronder als expliciete (structurele) mismatch.
  if (expected === null && actual === null) return null

  if (typeof expected === 'string' && typeof actual === 'string') {
    return expected === actual ? null : { diff: null }
  }

  if (typeof expected === 'boolean' && typeof actual === 'boolean') {
    return expected === actual ? null : { diff: null }
  }

  // Alle overige combinaties (incl. null↔0, string↔number, boolean↔number) = mismatch.
  return { diff: null }
}

/** Compacte per-tabel-regel voor de totaal-samenvatting. */
export interface TableSummaryRow {
  cellCount: number
  mismatchCount: number
  maxAbsDiff: number
}

/** Beknopte totaal-samenvatting over meerdere tabel-vergelijkingen. */
export interface ComparisonSummary {
  /** Aantal vergeleken tabellen. */
  tableCount: number
  /** Som van alle vergeleken cel-posities. */
  totalCells: number
  /** Som van alle mismatches. */
  totalMismatches: number
  /** Grootste numerieke |verschil| over alle tabellen. */
  maxAbsDiff: number
  /** Tabel met de meeste mismatches (tiebreak: grootste `maxAbsDiff`); `null` als alles klopt. */
  worstTable: string | null
  /** Per-tabel-samenvatting (voor test-output én de beheer-weergave). */
  perTable: Record<string, TableSummaryRow>
  /** True als geen enkele tabel een mismatch had. */
  ok: boolean
}

/**
 * Vat meerdere grid-vergelijkingen samen tot één compact overzicht — bruikbaar
 * voor zowel test-assertions als de latere beheer-verificatiepagina.
 */
export function summarizeComparisons(
  perTable: Record<string, GridComparison>,
): ComparisonSummary {
  let totalCells = 0
  let totalMismatches = 0
  let maxAbsDiff = 0
  let worstTable: string | null = null
  let worstMismatchCount = -1
  let worstMaxDiff = -1
  const summaryPerTable: Record<string, TableSummaryRow> = {}

  for (const [naam, cmp] of Object.entries(perTable)) {
    totalCells += cmp.cellCount
    totalMismatches += cmp.mismatchCount
    if (cmp.maxAbsDiff > maxAbsDiff) maxAbsDiff = cmp.maxAbsDiff
    summaryPerTable[naam] = {
      cellCount: cmp.cellCount,
      mismatchCount: cmp.mismatchCount,
      maxAbsDiff: cmp.maxAbsDiff,
    }

    // "Slechtste" tabel: meeste mismatches, bij gelijkspel de grootste afwijking.
    if (cmp.mismatchCount === 0) continue
    const beter =
      cmp.mismatchCount > worstMismatchCount ||
      (cmp.mismatchCount === worstMismatchCount && cmp.maxAbsDiff > worstMaxDiff)
    if (beter) {
      worstTable = naam
      worstMismatchCount = cmp.mismatchCount
      worstMaxDiff = cmp.maxAbsDiff
    }
  }

  return {
    tableCount: Object.keys(perTable).length,
    totalCells,
    totalMismatches,
    maxAbsDiff,
    worstTable,
    perTable: summaryPerTable,
    ok: totalMismatches === 0,
  }
}
