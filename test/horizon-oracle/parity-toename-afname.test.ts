import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getSheet, listFixtures } from '@/lib/horizon-kernel/oracle/fixture-load'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import {
  computeToenameAfname,
  type ToenameAfnameDep,
  type ToenameAfnameRow,
} from '@/lib/horizon-kernel/tables/toename-afname'
import {
  runTableParityAllFixtures,
  type TableColumn,
  type TableParitySpec,
} from '@/lib/horizon-kernel/parity/teacher'
import type { KernelInput, MonthIndex } from '@/lib/horizon-kernel/types'

/**
 * PARITY — tabel **Toename en afname** (behoefte → categorie-bedragen) tegen het
 * Excel-oracle (ADR 0032).
 *
 * Teacher-forced budgetten: **D** = CF!I(m), **Af!D**(m) → E, **Ont!D**(m) → F,
 * gelezen uit de fixture-sheets. De categorie-gewichten (½^(prio−1) genormaliseerd,
 * reserve prio 5 → 0%) en pot-aantallen zijn AFGELEID uit `KernelInput` (TS +
 * bens). Zo wordt `computeToenameAfname` geïsoleerd formule-getrouw bewezen over
 * **alle 16 fixtures × alle 1200 maanden × 88 kolommen** (A–CH + CL/CM),
 * tolerantie €0,01.
 *
 * Bewust buiten de vergelijking: **CI** en **CK** (permanente spacers, altijd
 * leeg) en **CJ** (toelichtingstekst — statische documentatie). De duplicaat-
 * kolommen CL (leeftijd) en CM (maand) worden wél vergeleken. Voorbij de horizon
 * blijft alleen A numeriek; alle overige kolommen tonen `""`.
 */

// ── Oracle-layout van de upstream-tabs (bron: structuur.md, empirisch geverifieerd) ──
// CF/Af/Ont: maand 0 op grid-index 1 (Excel-rij 2), datamaand m op 1 + m.
const UPSTREAM_ROW_START = 1
const CF_COL_TOTAAL_EXTRA_GELD = 8 // CF!I
const AF_COL_AFNAME = 3 // Af!D
const ONT_COL_ONTTREKKING = 3 // Ont!D

// Toename-en-afname kolom-layout: 6 bezit-categorieën à 9 kolommen vanaf H (7),
// 5 schuld-categorieën à 5 kolommen vanaf BJ (61). CL/CM = leeftijd/maand-duplicaat.
const BEZIT_COL_START = 7
const BEZIT_COL_STRIDE = 9
const SCHULD_COL_START = 61
const SCHULD_COL_STRIDE = 5
const CL_COL = 89
const CM_COL = 90

/** 0-gebaseerde kolomindex → Excel-kolomletters (voor leesbare mismatch-output). */
function colLetters(index: number): string {
  let s = ''
  let i = index + 1
  while (i > 0) {
    const rest = (i - 1) % 26
    s = String.fromCharCode(65 + rest) + s
    i = Math.floor((i - 1) / 26)
  }
  return s
}

/** Grid-cel → getal (leeg/niet-getal → 0; compute negeert die maanden). */
function cellNum(row: readonly CellValue[] | undefined, col: number): number {
  const v = row?.[col]
  return typeof v === 'number' ? v : 0
}

/** Per-fixture context: de ruwe CF/Af/Ont-grids (eenmalig opgehaald). */
interface ToenameAfnameCtx {
  readonly cf: CellValue[][]
  readonly af: CellValue[][]
  readonly ont: CellValue[][]
}

// ── Kolom-opbouw (88 vergeleken kolommen) ──────────────────────────────────────

/** Waarde uit een in-horizon rij, of "" voorbij de horizon. */
type Getter = (r: ToenameAfnameRow) => CellValue

function makeColumns(): TableColumn<ToenameAfnameRow>[] {
  const cols: TableColumn<ToenameAfnameRow>[] = []
  const add = (index: number, get: Getter) => cols.push({ letter: colLetters(index), index, get })
  // Blank-helper: geef "" voorbij de horizon, anders `get(computedRow)`.
  const inH =
    (get: (r: Extract<ToenameAfnameRow, { beyondHorizon: false }>) => number): Getter =>
    (r) =>
      r.beyondHorizon ? '' : get(r)

  add(0, (r) => r.maand) // A (altijd numeriek)
  add(1, inH((r) => r.leeftijd)) // B
  add(2, inH((r) => r.maandInJaar)) // C
  add(3, inH((r) => r.totaalExtraGeld)) // D
  add(4, inH((r) => r.afname)) // E
  add(5, inH((r) => r.onttrekking)) // F
  add(6, inH((r) => r.totaal)) // G

  // Zes bezitting-categorieën × 9 kolommen.
  for (let i = 0; i < 6; i++) {
    const base = BEZIT_COL_START + BEZIT_COL_STRIDE * i
    add(base + 0, inH((r) => r.bezit[i].toenamePct))
    add(base + 1, inH((r) => r.bezit[i].toenameEur))
    add(base + 2, inH((r) => r.bezit[i].afnamePct))
    add(base + 3, inH((r) => r.bezit[i].afnameEur))
    add(base + 4, inH((r) => r.bezit[i].onttrekkingPct))
    add(base + 5, inH((r) => r.bezit[i].onttrekkingEur))
    add(base + 6, inH((r) => r.bezit[i].totaalEur))
    add(base + 7, inH((r) => r.bezit[i].aantal))
    add(base + 8, inH((r) => r.bezit[i].perStukEur))
  }

  // Vijf schuld-categorieën × 5 kolommen.
  for (let j = 0; j < 5; j++) {
    const base = SCHULD_COL_START + SCHULD_COL_STRIDE * j
    add(base + 0, inH((r) => r.schuld[j].toenamePct))
    add(base + 1, inH((r) => r.schuld[j].toenameEur))
    add(base + 2, inH((r) => r.schuld[j].totaalEur))
    add(base + 3, inH((r) => r.schuld[j].aantal))
    add(base + 4, inH((r) => r.schuld[j].perStukEur))
  }

  add(CL_COL, inH((r) => r.leeftijd)) // CL — leeftijd-duplicaat
  add(CM_COL, inH((r) => r.maandInJaar)) // CM — maand-duplicaat
  return cols
}

const TA_COLUMNS = makeColumns()

const taSpec: TableParitySpec<KernelInput, ToenameAfnameCtx, ToenameAfnameDep, ToenameAfnameRow> = {
  sheet: 'Toename en afname',
  headerRows: 2, // Toename en afname: maand 0 op grid-rij 2 (Excel-rij 3)
  buildInput: buildKernelInput,
  prepare: (fx: OracleFixture): ToenameAfnameCtx => ({
    cf: getSheet(fx, 'CF').values,
    af: getSheet(fx, 'Af').values,
    ont: getSheet(fx, 'Ont').values,
  }),
  buildDep: (ctx: ToenameAfnameCtx, _input: KernelInput, m: MonthIndex): ToenameAfnameDep => {
    const gridRow = UPSTREAM_ROW_START + m
    return {
      totaalExtraGeld: cellNum(ctx.cf[gridRow], CF_COL_TOTAAL_EXTRA_GELD),
      afname: cellNum(ctx.af[gridRow], AF_COL_AFNAME),
      onttrekking: cellNum(ctx.ont[gridRow], ONT_COL_ONTTREKKING),
    }
  },
  compute: computeToenameAfname,
  columns: TA_COLUMNS,
}

// ── Testrun ────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity Toename en afname (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = runTableParityAllFixtures(FIXTURE_DIR, taSpec)

  describe('horizon-kernel · parity Toename en afname tegen Excel-oracle', () => {
    it('draait over alle 16 fixtures', () => {
      expect(results.length).toBe(16)
    })

    for (const result of results) {
      it(`${result.scenario}: Toename en afname cel-voor-cel binnen €0,01`, () => {
        const { mismatchCount, maxAbsDiff } = result.comparison
        expect(
          mismatchCount,
          mismatchCount === 0
            ? undefined
            : `${mismatchCount} mismatch(es) in Toename en afname (${result.scenario}), ` +
                `max |Δ|=${maxAbsDiff}:\n${result.mismatchLines.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt het volledige maand×kolom-grid per fixture', () => {
      for (const result of results) {
        // 1200 maanden × 88 kolommen (A–CH + CL/CM).
        expect(result.comparison.cellCount).toBe(result.months * result.columnCount)
        expect(result.months).toBe(1200)
        expect(result.columnCount).toBe(88)
      }
      const totalCells = results.reduce((sum, r) => sum + r.comparison.cellCount, 0)
      // 16 fixtures × 1200 × 88 = 1.689.600 vergeleken cellen.
      expect(totalCells).toBe(1689600)
    })
  })
}
