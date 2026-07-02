import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getSheet, listFixtures } from '@/lib/horizon-kernel/oracle/fixture-load'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import {
  computeVerdeling,
  type VerdelingDep,
  type VerdelingRow,
} from '@/lib/horizon-kernel/tables/verdeling'
import type { WaterfallResult } from '@/lib/horizon-kernel/tables/verdeling/waterfall'
import {
  runTableParityAllFixtures,
  type TableColumn,
  type TableParitySpec,
} from '@/lib/horizon-kernel/parity/teacher'
import type { KernelInput, MonthIndex } from '@/lib/horizon-kernel/types'

/**
 * PARITY — tabel **Verdeling** (capaciteit-waterval, 219 kolommen A–HK) tegen het
 * Excel-oracle (ADR 0032).
 *
 * Teacher-forced: de drie budgetten (Af!D, Ont!D, aflos-deel CF!I) + de m−1-
 * categoriesaldi (Bez!AM:AR, S!AJ:AN) komen uit de fixture via `buildDep`; de
 * prio's / niet-liquide / gevuld (waaruit `computeVerdeling` de ½^(prio−1)-
 * gewichten en reserve-maskers herleidt) komen uit `KernelInput` (TS). Zo wordt
 * de volledige waterval — 6 doorstroom-passes, reserve-pass, eindtoewijzing,
 * onbenut — geïsoleerd bewezen over **alle 16 fixtures × 1200 maanden × alle
 * berekende kolommen**, met tolerantie €0,01.
 *
 * **Bewust buiten de vergelijking (1 kolom):** `HA` (toelichtingstekst — statische
 * documentatie op enkele kopregels, geen per-maand-berekening; net als Bel!P). De
 * spacer-kolommen `K`, `BW`, `EP`, `GZ`, `HB`, `HI` (in het grid altijd leeg) en de
 * herhaalde leeftijd/maand-kolommen `HJ/HK` blijven WÉL in de vergelijking — hun
 * getter levert exact `null` resp. de horizon-gemaskeerde waarde, zodat ze
 * meelopen als volwaardige controle.
 */

// ── Oracle-layout van de upstream-tabs (empirisch geverifieerd tegen de fixtures) ──
// Verdeling: maand m op grid-rij 3 + m (Excel-rij 4 = maand 0) → headerRows = 3.
// Bez/S: maand m op grid-rij 3 + m; Verdeling-cap(m) = categoriesaldo m−1 = grid 2 + m
//        (m = 0 → grid 2 = kopregel → niet-numeriek → 0, exact zoals Excel's mislukte MATCH).
const CAP_PREV_ROW = 2 // grid-rij van "categoriesaldo m−1" voor Verdeling-maand m
// Af/Ont: maand m op grid-rij 1 + m (Excel-rij 2 = maand 0).
const AF_ONT_ROW = 1
// Toename en afname: maand m op grid-rij 2 + m (Excel-rij 3 = maand 0).
const TA_ROW = 2

// Bez categorietotalen AM:AR — LET OP de swap: Eigen huis = AR, Overig = AQ, dus in
// bezit-volgorde [Spaar, Beleg, Pens, Vast, Huis, Overig] = [AM, AN, AO, AP, AR, AQ].
const BEZ_CAT_COLS = ['AM', 'AN', 'AO', 'AP', 'AR', 'AQ'].map(colIndex)
// S categorietotalen AJ:AN in schuld-volgorde [Woning, Consumptief, Studie, Zakelijk, Overig].
const S_CAT_COLS = ['AJ', 'AK', 'AL', 'AM', 'AN'].map(colIndex)
// 'Toename en afname' schuld-toename€ (aflos-deel per schuld-categorie): BK,BP,BU,BZ,CE.
const TA_AFLOS_EUR_COLS = ['BK', 'BP', 'BU', 'BZ', 'CE'].map(colIndex)
const AF_ONT_BUDGET_COL = colIndex('D') // Af!D / Ont!D

/** Excel-kolomletters → 0-gebaseerde index (A=0, AA=26, …). */
function colIndex(letters: string): number {
  let idx = 0
  for (const ch of letters.toUpperCase()) idx = idx * 26 + (ch.charCodeAt(0) - 64)
  return idx - 1
}

/** 0-gebaseerde index → Excel-kolomletters (voor leesbare mismatch-output). */
function colLetters(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Grid-cel → getal (niet-getal, bv. lege "" of kopregel → 0; conform Excel-coercie). */
function cellNum(row: readonly CellValue[] | undefined, col: number): number {
  const v = row?.[col]
  return typeof v === 'number' ? v : 0
}

// ── Verdeling-parity-spec ───────────────────────────────────────────────────────

/** Per-fixture context: de ruwe upstream-grids (eenmalig opgehaald). */
interface VerdelingCtx {
  readonly bez: CellValue[][]
  readonly s: CellValue[][]
  readonly af: CellValue[][]
  readonly ont: CellValue[][]
  readonly ta: CellValue[][]
}

// ── Kolom-generatoren (219 kolommen A–HK) ────────────────────────────────────────

/** Eén kolom die een vaste lege (null) spacer levert. */
function spacer(index: number): TableColumn<VerdelingRow> {
  return { letter: colLetters(index), index, get: () => null }
}

/** Eén kolom met een getter op de rij. */
function col(index: number, get: (r: VerdelingRow) => CellValue): TableColumn<VerdelingRow> {
  return { letter: colLetters(index), index, get }
}

/**
 * Genereer de kolommen van één onderwerp-blok (budget, caps, passes, leftover,
 * reserve-denom, reserve-toewijzing, eind, onbenut). De pass-blokbreedte is
 * `2 + nCats` (rest, Σw, `nCats` toewijzingen).
 */
function subjectColumns(
  getSubj: (r: VerdelingRow) => WaterfallResult,
  nCats: number,
  layout: {
    budget: number
    capsStart: number
    passBase: number
    leftover: number
    reserveDenom: number
    reserveAllocStart: number
    eindStart: number
    onbenut: number
  },
): TableColumn<VerdelingRow>[] {
  const out: TableColumn<VerdelingRow>[] = []
  out.push(col(layout.budget, (r) => getSubj(r).budget))
  for (let i = 0; i < nCats; i++) out.push(col(layout.capsStart + i, (r) => getSubj(r).caps[i]))
  const passWidth = 2 + nCats
  for (let p = 0; p < 6; p++) {
    const base = layout.passBase + p * passWidth
    out.push(col(base, (r) => getSubj(r).passRest[p]))
    out.push(col(base + 1, (r) => getSubj(r).passSumW[p]))
    for (let i = 0; i < nCats; i++) {
      out.push(col(base + 2 + i, (r) => getSubj(r).passAlloc[p][i]))
    }
  }
  out.push(col(layout.leftover, (r) => getSubj(r).leftover))
  out.push(col(layout.reserveDenom, (r) => getSubj(r).reserveDenom))
  for (let i = 0; i < nCats; i++) {
    out.push(col(layout.reserveAllocStart + i, (r) => getSubj(r).reserveAlloc[i]))
  }
  for (let i = 0; i < nCats; i++) {
    out.push(col(layout.eindStart + i, (r) => getSubj(r).eind[i]))
  }
  out.push(col(layout.onbenut, (r) => getSubj(r).onbenut))
  return out
}

/** Volledige kolom-lijst A–HK, exclusief de toelichtingskolom HA (index 208). */
function buildColumns(): TableColumn<VerdelingRow>[] {
  const cols: TableColumn<VerdelingRow>[] = [
    col(0, (r) => r.maand), // A
    col(1, (r) => (r.beyondHorizon ? '' : r.leeftijd)), // B
    col(2, (r) => (r.beyondHorizon ? '' : r.maandInJaar)), // C
  ]
  // AFNAME (bezit, 6): D budget, E:J caps, K spacer, L…BG passes, BH…BV.
  cols.push(
    ...subjectColumns((r) => r.afname, 6, {
      budget: colIndex('D'),
      capsStart: colIndex('E'),
      passBase: colIndex('L'),
      leftover: colIndex('BH'),
      reserveDenom: colIndex('BI'),
      reserveAllocStart: colIndex('BJ'),
      eindStart: colIndex('BP'),
      onbenut: colIndex('BV'),
    }),
  )
  cols.push(spacer(colIndex('K'))) // leidende spacer (uniek voor afname)
  cols.push(spacer(colIndex('BW')))
  // ONTTREKKING (bezit, 6): BX budget, BY:CD caps, CE…DZ passes, EA…EO.
  cols.push(
    ...subjectColumns((r) => r.onttrekking, 6, {
      budget: colIndex('BX'),
      capsStart: colIndex('BY'),
      passBase: colIndex('CE'),
      leftover: colIndex('EA'),
      reserveDenom: colIndex('EB'),
      reserveAllocStart: colIndex('EC'),
      eindStart: colIndex('EI'),
      onbenut: colIndex('EO'),
    }),
  )
  cols.push(spacer(colIndex('EP')))
  // SCHULD-AFLOSSING (schuld, 5): EQ budget, ER:EV caps, EW…GL passes, GM…GY.
  cols.push(
    ...subjectColumns((r) => r.aflossing, 5, {
      budget: colIndex('EQ'),
      capsStart: colIndex('ER'),
      passBase: colIndex('EW'),
      leftover: colIndex('GM'),
      reserveDenom: colIndex('GN'),
      reserveAllocStart: colIndex('GO'),
      eindStart: colIndex('GT'),
      onbenut: colIndex('GY'),
    }),
  )
  cols.push(spacer(colIndex('GZ')))
  // Tail: HA (208) EXCLUDED, HB spacer, HC:HH overloop, HI spacer, HJ/HK leeftijd/maand.
  cols.push(spacer(colIndex('HB')))
  for (let i = 0; i < 6; i++) cols.push(col(colIndex('HC') + i, (r) => r.overflow[i]))
  cols.push(spacer(colIndex('HI')))
  cols.push(col(colIndex('HJ'), (r) => (r.beyondHorizon ? '' : r.leeftijd)))
  cols.push(col(colIndex('HK'), (r) => (r.beyondHorizon ? '' : r.maandInJaar)))

  // Sorteer op grid-index zodat de vergelijking kolom-op-kolom uitlijnt.
  return cols.sort((a, b) => a.index - b.index)
}

const VERDELING_COLUMNS = buildColumns()

const verdelingSpec: TableParitySpec<KernelInput, VerdelingCtx, VerdelingDep, VerdelingRow> = {
  sheet: 'Verdeling',
  headerRows: 3, // Verdeling: maand 0 op grid-rij 3 (Excel-rij 4)
  buildInput: buildKernelInput,
  prepare: (fx: OracleFixture): VerdelingCtx => ({
    bez: getSheet(fx, 'Bez').values,
    s: getSheet(fx, 'S').values,
    af: getSheet(fx, 'Af').values,
    ont: getSheet(fx, 'Ont').values,
    ta: getSheet(fx, 'Toename en afname').values,
  }),
  buildDep: (ctx: VerdelingCtx, _input: KernelInput, m: MonthIndex): VerdelingDep => {
    const bezPrev = ctx.bez[CAP_PREV_ROW + m] // categoriesaldo m−1
    const sPrev = ctx.s[CAP_PREV_ROW + m]
    const afRow = ctx.af[AF_ONT_ROW + m]
    const ontRow = ctx.ont[AF_ONT_ROW + m]
    const taRow = ctx.ta[TA_ROW + m]
    let aflossingBudget = 0
    for (const c of TA_AFLOS_EUR_COLS) aflossingBudget += cellNum(taRow, c)
    return {
      afnameBudget: cellNum(afRow, AF_ONT_BUDGET_COL),
      onttrekkingBudget: cellNum(ontRow, AF_ONT_BUDGET_COL),
      aflossingBudget,
      bezSaldiPrev: BEZ_CAT_COLS.map((c) => cellNum(bezPrev, c)),
      schuldSaldiPrev: S_CAT_COLS.map((c) => cellNum(sPrev, c)),
    }
  },
  compute: computeVerdeling,
  columns: VERDELING_COLUMNS,
}

// ── Testrun ────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity Verdeling (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = runTableParityAllFixtures(FIXTURE_DIR, verdelingSpec)

  describe('horizon-kernel · parity Verdeling (capaciteit-waterval) tegen Excel-oracle', () => {
    it('draait over alle 16 fixtures', () => {
      expect(results.length).toBe(16)
    })

    for (const result of results) {
      it(`${result.scenario}: Verdeling cel-voor-cel binnen €0,01`, () => {
        const { mismatchCount, maxAbsDiff } = result.comparison
        expect(
          mismatchCount,
          mismatchCount === 0
            ? undefined
            : `${mismatchCount} mismatch(es) in Verdeling (${result.scenario}), ` +
                `max |Δ|=${maxAbsDiff}:\n${result.mismatchLines.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt het volledige maand×kolom-grid per fixture (218 kolommen, HA uitgesloten)', () => {
      for (const result of results) {
        expect(result.columnCount).toBe(218) // 219 kolommen − HA (toelichting)
        expect(result.months).toBe(1200)
        expect(result.comparison.cellCount).toBe(result.months * result.columnCount)
      }
      const totalCells = results.reduce((sum, r) => sum + r.comparison.cellCount, 0)
      // 16 fixtures × 1200 × 218 = 4.185.600 vergeleken cellen.
      expect(totalCells).toBe(4185600)
    })
  })
}
