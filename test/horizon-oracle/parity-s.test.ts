import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getSheet, listFixtures } from '@/lib/horizon-kernel/oracle/fixture-load'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import {
  computeS,
  S_EXTRA_CATEGORIEEN,
  S_PHYSICAL_SLOTS,
  type SDep,
  type SRow,
} from '@/lib/horizon-kernel/tables/s'
import {
  runTableParityAllFixtures,
  type TableColumn,
  type TableParitySpec,
} from '@/lib/horizon-kernel/parity/teacher'
import type { KernelInput, MonthIndex } from '@/lib/horizon-kernel/types'

/**
 * PARITY — tabel **S** (schulden per maand) tegen het Excel-oracle (ADR 0032).
 *
 * Teacher-forced: de upstream-waarden (Bez!AY/BD/BE, Verdeling!BV/EO + de extra-
 * aflossing-budget/cap per categorie) én de eigen S-saldi van maand m−1 komen uit
 * de fixture (`buildDep`), zodat `computeS` geïsoleerd formule-getrouw bewezen wordt
 * over **alle 16 fixtures × alle 1200 maanden × de kolommen A–AN + AR + AS**, met
 * tolerantie €0,01.
 *
 * Buiten de vergelijking blijven bewust: **AO** (idx 40) en **AQ** (idx 42) —
 * permanente lege spacers — en **AP** (idx 41) — per-rij toelichtingstekst (statische
 * documentatie, geen per-maand-berekening). Alle overige kolommen worden vergeleken.
 */

// ── Oracle-layout (bron: structuur.md, empirisch geverifieerd) ───────────────────
// S/Bez/Verdeling: datamaand m staat op grid-index 3 + m (Excel-rij 4 = maand 0).
const DATA_ROW_START = 3
// S-slot i (0-gebaseerd): saldo 3+4i, aflossing 4+4i, extra 5+4i, rente 6+4i.
const sSaldoCol = (slot: number): number => 3 + slot * 4
// Bez woningblok: AY (verkocht) = 50, BD (opeet-cap) = 55, BE (opeet-opname) = 56.
const BEZ_COL_AY = 50
const BEZ_COL_BD = 55
const BEZ_COL_BE = 56
// Verdeling: BV (onbenut afname) = 73, EO (onbenut onttrekking) = 144.
const VERD_COL_BV = 73
const VERD_COL_EO = 144
// Verdeling extra-aflossing per categorie: budget GT:GX = 201..205, cap ER:EV = 147..151.
const VERD_COL_EXTRA_BUDGET_START = 201 // GT (Woning) … GX (Overig)
const VERD_COL_CAP_START = 147 // ER (Woning) … EV (Overig)

/** Grid-cel → getal (leeg "" / null → 0; compute negeert die waar niet gebruikt). */
function cellNum(row: readonly CellValue[] | undefined, col: number): number {
  const v = row?.[col]
  return typeof v === 'number' ? v : 0
}

/** Kolomindex → Excel-letters (voor leesbare mismatch-output). */
function idxToLetters(idx: number): string {
  let s = ''
  let i = idx + 1
  while (i > 0) {
    const r = (i - 1) % 26
    s = String.fromCharCode(65 + r) + s
    i = Math.floor((i - 1) / 26)
  }
  return s
}

// ── Kolommen A–AN + AR + AS ──────────────────────────────────────────────────────
function buildColumns(): ReadonlyArray<TableColumn<SRow>> {
  const cols: TableColumn<SRow>[] = [
    { letter: 'A', index: 0, get: (r) => r.maand },
    { letter: 'B', index: 1, get: (r) => r.leeftijd },
    { letter: 'C', index: 2, get: (r) => r.maandInJaar },
  ]
  // Per slot 4 kolommen (saldo / aflossing / extra / rente).
  for (let slot = 0; slot < S_PHYSICAL_SLOTS; slot++) {
    const base = sSaldoCol(slot)
    cols.push({ letter: idxToLetters(base), index: base, get: (r) => r.slots[slot].saldo })
    cols.push({ letter: idxToLetters(base + 1), index: base + 1, get: (r) => r.slots[slot].aflossing })
    cols.push({ letter: idxToLetters(base + 2), index: base + 2, get: (r) => r.slots[slot].extra })
    cols.push({ letter: idxToLetters(base + 3), index: base + 3, get: (r) => r.slots[slot].rente })
  }
  // Totalen AF–AN + hulpkolommen AR/AS (AO/AP/AQ bewust uitgesloten).
  cols.push({ letter: 'AF', index: 31, get: (r) => r.totaalBox3 })
  cols.push({ letter: 'AG', index: 32, get: (r) => r.totaalGeenBox3 })
  cols.push({ letter: 'AH', index: 33, get: (r) => r.totaalAflossing })
  cols.push({ letter: 'AI', index: 34, get: (r) => r.totaalRente })
  cols.push({ letter: 'AJ', index: 35, get: (r) => r.totaalWoning })
  cols.push({ letter: 'AK', index: 36, get: (r) => r.totaalConsumptief })
  cols.push({ letter: 'AL', index: 37, get: (r) => r.totaalStudie })
  cols.push({ letter: 'AM', index: 38, get: (r) => r.totaalZakelijk })
  cols.push({ letter: 'AN', index: 39, get: (r) => r.totaalOverig })
  cols.push({ letter: 'AR', index: 43, get: (r) => r.helperLeeftijd })
  cols.push({ letter: 'AS', index: 44, get: (r) => r.helperMaand })
  return cols
}

const S_COLUMNS = buildColumns()

// ── S-parity-spec ─────────────────────────────────────────────────────────────
/** Per-fixture context: de ruwe S/Bez/Verdeling-grids (eenmalig opgehaald). */
interface SCtx {
  readonly s: CellValue[][]
  readonly bez: CellValue[][]
  readonly verd: CellValue[][]
}

const sSpec: TableParitySpec<KernelInput, SCtx, SDep, SRow> = {
  sheet: 'S',
  headerRows: DATA_ROW_START, // S: maand 0 op grid-rij 3 (Excel-rij 4)
  buildInput: buildKernelInput,
  prepare: (fx: OracleFixture): SCtx => ({
    s: getSheet(fx, 'S').values,
    bez: getSheet(fx, 'Bez').values,
    verd: getSheet(fx, 'Verdeling').values,
  }),
  buildDep: (ctx: SCtx, _input: KernelInput, m: MonthIndex): SDep => {
    const bezRow = ctx.bez[DATA_ROW_START + m]
    const verdRow = ctx.verd[DATA_ROW_START + m]
    const prevRow = m > 0 ? ctx.s[DATA_ROW_START + m - 1] : undefined
    // Eigen S-saldi van maand m−1 per fysieke slot (teacher-forced).
    const saldoVorige: number[] = []
    for (let slot = 0; slot < S_PHYSICAL_SLOTS; slot++) {
      saldoVorige.push(m > 0 ? cellNum(prevRow, sSaldoCol(slot)) : 0)
    }
    // Verdeling extra-aflossing-budget (GT:GX) + cap (ER:EV) per categorie.
    const extraAflossingBudget: number[] = []
    const categorieCap: number[] = []
    for (let c = 0; c < S_EXTRA_CATEGORIEEN.length; c++) {
      extraAflossingBudget.push(cellNum(verdRow, VERD_COL_EXTRA_BUDGET_START + c))
      categorieCap.push(cellNum(verdRow, VERD_COL_CAP_START + c))
    }
    return {
      saldoVorige,
      verkocht: cellNum(bezRow, BEZ_COL_AY),
      opeetCap: cellNum(bezRow, BEZ_COL_BD),
      opeetOpname: cellNum(bezRow, BEZ_COL_BE),
      tekortBudget: cellNum(verdRow, VERD_COL_BV) + cellNum(verdRow, VERD_COL_EO),
      extraAflossingBudget,
      categorieCap,
    }
  },
  compute: computeS,
  columns: S_COLUMNS,
}

// ── Testrun ────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity S (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = runTableParityAllFixtures(FIXTURE_DIR, sSpec)

  describe('horizon-kernel · parity S (schulden) tegen Excel-oracle', () => {
    it('draait over alle 16 fixtures', () => {
      expect(results.length).toBe(16)
    })

    for (const result of results) {
      it(`${result.scenario}: S cel-voor-cel binnen €0,01`, () => {
        const { mismatchCount, maxAbsDiff } = result.comparison
        expect(
          mismatchCount,
          mismatchCount === 0
            ? undefined
            : `${mismatchCount} mismatch(es) in S (${result.scenario}), ` +
                `max |Δ|=${maxAbsDiff}:\n${result.mismatchLines.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt het volledige maand×kolom-grid per fixture', () => {
      // A–C (3) + 7 slots × 4 (28) + AF–AN (9) + AR/AS (2) = 42 kolommen.
      const columnCount = 3 + S_PHYSICAL_SLOTS * 4 + 9 + 2
      for (const result of results) {
        expect(result.comparison.cellCount).toBe(result.months * result.columnCount)
        expect(result.months).toBe(1200)
        expect(result.columnCount).toBe(columnCount)
      }
      const totalCells = results.reduce((sum, r) => sum + r.comparison.cellCount, 0)
      // 16 fixtures × 1200 × 42 = 806.400 vergeleken cellen.
      expect(totalCells).toBe(16 * 1200 * columnCount)
    })
  })
}
