import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCell, getSheet, listFixtures } from '@/lib/horizon-kernel/oracle/fixture-load'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { computeCF, type CFDep, type CFRow, type GebPostHelper } from '@/lib/horizon-kernel/tables/cf'
import {
  runTableParityAllFixtures,
  type TableColumn,
  type TableParitySpec,
} from '@/lib/horizon-kernel/parity/teacher'
import type { KernelInput, MonthIndex } from '@/lib/horizon-kernel/types'

/**
 * PARITY — tabel **CF** (cashflow) tegen het Excel-oracle (ADR 0032).
 *
 * Teacher-forced: alle upstream-waarden die CF consumeert komen uit de fixture
 * (`buildDep`), zodat `computeCF` geïsoleerd formule-getrouw bewezen wordt over
 * **alle 16 fixtures × alle 1200 maanden × de kolommen A–K**, met tolerantie
 * €0,01. CF heeft géén spacer-/toelichtingskolommen (bereik A1:K1201) — alle 11
 * kolommen A–K worden vergeleken.
 *
 * De teacher-forced m−1-waarden (Bel!N(m−1) voor kolom K, S-saldi(m−1) voor kolom
 * G) materialiseren de structurele één-maand-lag; de FIRE-maand (solver-output
 * P!B16) wordt teacher-forced uit de fixture-P-sheet gelezen, niet uit KernelInput.
 */

// ── Oracle-layout van de upstream-tabs (bron: structuur.md, empirisch geverifieerd) ──
// CF/Bel/Ont/PT/Werk-strategie: maand 0 op grid-index 1 (Excel-rij 2 = maand 0).
// LET OP: Af/Ont starten óók op Excel-rij 2 (maand 0), NIET op rij 4 zoals de
// grid-groepering in structuur.md suggereert — empirisch geverifieerd tegen de
// fixture (de Af!D-kost van de Huwelijk-gebeurtenis staat op maand 53 = grid-rij 54).
const HEAD_DATA_START = 1
// Bez/S: datamaand m op grid-index 3 + m (Excel-rij 4 = maand 0).
const BEZS_DATA_START = 3

// PT!K (partnerbijdrage) = kolomindex 10.
const PT_COL_K = 10
// 'Werk-strategie'!S (nominale salaris-delta) = kolomindex 18.
const WERK_COL_S = 18
// Bez-woningblok: AZ verkoopopbrengst = 51, BA huur = 52, BB vervallen last = 53, BE opeet-opname = 56.
const BEZ_COL_VERKOOP_AZ = 51
const BEZ_COL_HUUR_BA = 52
const BEZ_COL_VERVALLEN_BB = 53
const BEZ_COL_OPEET_BE = 56
// Af!D (totaal afname) en Ont!D (totaal onttrekking) = kolomindex 3.
const AF_COL_D = 3
const ONT_COL_D = 3
// Bel!N (canonieke heffing) = kolomindex 13.
const BEL_COL_N = 13
// S-saldo van slot i (0-gebaseerd): saldo-kolom = 3 + 4·i (D=3, H=7, L=11, P=15, T=19, X=23, AB=27).
const sSaldoCol = (slot: number): number => 3 + slot * 4

// Geb-helperkolommen W:AE (rij 4..30 = handmatige + auto-gebeurtenissen). Per rij
// 3 posten: (sIdx, eIdx, bedrag) = W/X/Y, Z/AA/AB, AC/AD/AE.
const GEB_EVENT_ROW_START = 4
const GEB_EVENT_ROW_END = 30
const GEB_POST_TRIPLES: ReadonlyArray<readonly [number, number, number]> = [
  [22, 23, 24], // W, X, Y
  [25, 26, 27], // Z, AA, AB
  [28, 29, 30], // AC, AD, AE
]

/** Grid-cel → getal (niet-getal, bv. lege "" of header → 0; compute negeert die waar relevant). */
function cellNum(row: readonly CellValue[] | undefined, col: number): number {
  const v = row?.[col]
  return typeof v === 'number' ? v : 0
}

// ── CF-parity-spec ──────────────────────────────────────────────────────────────

/** Per-fixture context: de upstream-grids + de statische FIRE-maand en Geb-posten. */
interface CFCtx {
  readonly bez: CellValue[][]
  readonly s: CellValue[][]
  readonly pt: CellValue[][]
  readonly werk: CellValue[][]
  readonly bel: CellValue[][]
  readonly af: CellValue[][]
  readonly ont: CellValue[][]
  readonly fireMonth: number
  readonly gebPosten: readonly GebPostHelper[]
}

/** Kolom A–K van CF, met de getter uit de `CFRow`. Voorbij de horizon: B–G → "", H–K → 0. */
const CF_COLUMNS: ReadonlyArray<TableColumn<CFRow>> = [
  { letter: 'A', index: 0, get: (r) => r.maand },
  { letter: 'B', index: 1, get: (r) => (r.beyondHorizon ? '' : r.leeftijd) },
  { letter: 'C', index: 2, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar) },
  { letter: 'D', index: 3, get: (r) => (r.beyondHorizon ? '' : r.inkomen) },
  { letter: 'E', index: 4, get: (r) => (r.beyondHorizon ? '' : r.uitgaven) },
  { letter: 'F', index: 5, get: (r) => (r.beyondHorizon ? '' : r.sparen) },
  { letter: 'G', index: 6, get: (r) => (r.beyondHorizon ? '' : r.renteVrijval) },
  { letter: 'H', index: 7, get: (r) => (r.beyondHorizon ? 0 : r.gebeurtenisBaten) },
  { letter: 'I', index: 8, get: (r) => (r.beyondHorizon ? 0 : r.totaalExtraGeld) },
  { letter: 'J', index: 9, get: (r) => (r.beyondHorizon ? 0 : r.gebeurtenisNetto) },
  { letter: 'K', index: 10, get: (r) => (r.beyondHorizon ? 0 : r.box3VorigeMaand) },
]

/** Lees de Geb-helperposten (W:AE, rij 4..30) éénmalig uit de fixture. */
function readGebPosten(fx: OracleFixture): GebPostHelper[] {
  const geb = getSheet(fx, 'Geb').values
  const posten: GebPostHelper[] = []
  for (let excelRow = GEB_EVENT_ROW_START; excelRow <= GEB_EVENT_ROW_END; excelRow++) {
    const row = geb[excelRow - 1] // Excel-rij r → grid-index r−1
    for (const [sCol, eCol, bCol] of GEB_POST_TRIPLES) {
      posten.push({
        sIdx: cellNum(row, sCol),
        eIdx: cellNum(row, eCol),
        bedrag: cellNum(row, bCol),
      })
    }
  }
  return posten
}

/**
 * FIRE-maand = ROUND((FIRE-leeftijd − P!B7)·12). FIRE-leeftijd = P!B16 (solver-
 * output); als die leeg is valt Excel terug op P!B35 (spiegel van 'Werk-strategie'!S).
 * In alle 16 fixtures is P!B16 numeriek; de B35-fallback is defensief.
 */
function resolveFireMonth(fx: OracleFixture, input: KernelInput): number {
  const b16 = getCell(fx, 'P!B16')
  const b35 = getCell(fx, 'P!B35')
  const fireAge =
    typeof b16 === 'number' ? b16 : typeof b35 === 'number' ? b35 : input.startLeeftijd
  return Math.round((fireAge - input.startLeeftijd) * 12)
}

const cfSpec: TableParitySpec<KernelInput, CFCtx, CFDep, CFRow> = {
  sheet: 'CF',
  headerRows: 1, // CF: maand 0 op grid-rij 1 (Excel-rij 2)
  buildInput: buildKernelInput,
  prepare: (fx: OracleFixture, input: KernelInput): CFCtx => ({
    bez: getSheet(fx, 'Bez').values,
    s: getSheet(fx, 'S').values,
    pt: getSheet(fx, 'PT').values,
    werk: getSheet(fx, 'Werk-strategie').values,
    bel: getSheet(fx, 'Bel').values,
    af: getSheet(fx, 'Af').values,
    ont: getSheet(fx, 'Ont').values,
    fireMonth: resolveFireMonth(fx, input),
    gebPosten: readGebPosten(fx),
  }),
  buildDep: (ctx: CFCtx, input: KernelInput, m: MonthIndex): CFDep => {
    const headRow = ctx.pt[HEAD_DATA_START + m]
    const bezRow = ctx.bez[BEZS_DATA_START + m]
    const afRow = ctx.af[HEAD_DATA_START + m]
    const ontRow = ctx.ont[HEAD_DATA_START + m]
    const werkRow = ctx.werk[HEAD_DATA_START + m]
    // m−1-rijen (bij m=0 wijzen ze naar de header-rij; compute negeert de waarden dan).
    const belPrevRow = ctx.bel[HEAD_DATA_START + (m - 1)]
    const sPrevRow = ctx.s[BEZS_DATA_START + (m - 1)]
    return {
      partnerBijdrage: cellNum(headRow, PT_COL_K),
      werkStrategieDelta: cellNum(werkRow, WERK_COL_S),
      huurNaVerkoop: cellNum(bezRow, BEZ_COL_HUUR_BA),
      vervallenHypotheeklast: cellNum(bezRow, BEZ_COL_VERVALLEN_BB),
      verkoopopbrengst: cellNum(bezRow, BEZ_COL_VERKOOP_AZ),
      opeetOpname: cellNum(bezRow, BEZ_COL_OPEET_BE),
      afname: cellNum(afRow, AF_COL_D),
      onttrekking: cellNum(ontRow, ONT_COL_D),
      canoniekeHeffingVorigeMaand: cellNum(belPrevRow, BEL_COL_N),
      schuldSaldiVorigeMaand: input.schuldPotten.map((p) => cellNum(sPrevRow, sSaldoCol(p.slot))),
      fireMonth: ctx.fireMonth,
      gebPosten: ctx.gebPosten,
    }
  },
  compute: computeCF,
  columns: CF_COLUMNS,
}

// ── Testrun ──────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity CF (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = runTableParityAllFixtures(FIXTURE_DIR, cfSpec)

  describe('horizon-kernel · parity CF (cashflow) tegen Excel-oracle', () => {
    it('draait over alle 16 fixtures', () => {
      expect(results.length).toBe(16)
    })

    for (const result of results) {
      it(`${result.scenario}: CF cel-voor-cel binnen €0,01`, () => {
        const { mismatchCount, maxAbsDiff } = result.comparison
        expect(
          mismatchCount,
          mismatchCount === 0
            ? undefined
            : `${mismatchCount} mismatch(es) in CF (${result.scenario}), ` +
                `max |Δ|=${maxAbsDiff}:\n${result.mismatchLines.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt het volledige maand×kolom-grid per fixture', () => {
      for (const result of results) {
        // 1200 maanden × 11 kolommen (A–K).
        expect(result.comparison.cellCount).toBe(result.months * result.columnCount)
        expect(result.months).toBe(1200)
        expect(result.columnCount).toBe(11)
      }
      const totalCells = results.reduce((sum, r) => sum + r.comparison.cellCount, 0)
      // 16 fixtures × 1200 × 11 = 211.200 vergeleken cellen.
      expect(totalCells).toBe(211200)
    })
  })
}
