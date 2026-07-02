import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCell, getSheet, listFixtures } from '@/lib/horizon-kernel/oracle/fixture-load'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { computeBez, type BezDep, type BezRow, type CategorieBedrag } from '@/lib/horizon-kernel/tables/bez'
import {
  runTableParityAllFixtures,
  type TableColumn,
  type TableParitySpec,
} from '@/lib/horizon-kernel/parity/teacher'
import type { AssetCategorie, KernelInput, MonthIndex } from '@/lib/horizon-kernel/types'

/**
 * PARITY — tabel **Bez** (bezittingen per maand, incl. woningblok AY:BE) tegen het
 * Excel-oracle (ADR 0032).
 *
 * Teacher-forced: alle upstream-waarden komen uit de fixture (`buildDep`), zodat
 * `computeBez` geïsoleerd formule-getrouw bewezen wordt over **alle 16 fixtures ×
 * 1200 maanden**, tolerantie €0,01:
 *   - eigen Bez-saldi + categorietotalen (m−1), de vorige woningblok-cellen (AY/BA/BB),
 *     de huiswaarde (m−1);
 *   - `Toename en afname` (toename€ + aantal per categorie) en `Verdeling`
 *     (afname/onttrekking-eindtoewijzing + schuld-overloop per categorie);
 *   - `S` (hypotheek- en opeetsaldo m−1), `Prognose!J` (m−1) voor de verkoop-trigger;
 *   - de FIRE-leeftijd (P!B16, solver-output) + de overwaarde bij opeet-start (in
 *     `prepare`, uit vaste rijen).
 *
 * Bewust BUITEN de vergelijking (statische opmaak/scaffold, geen per-maand-
 * berekening; alle empirisch geverifieerd als spacer/tekst):
 *   - **AS** (kolom "Control") — 0 data-cellen in alle fixtures (lege scheider);
 *   - **AT** (toelichtingstekst) + **AU/AX** (lege spacers).
 * A (maandindex) wordt wél vergeleken (numeriek, óók voorbij de horizon).
 */

// ── Oracle-layout (bron: structuur.md + empirisch geverifieerd tegen de fixtures) ─
const BEZ_DATA_ROW = 3 // Bez maand 0 op grid-index 3 (Excel-rij 4)
const TOE_DATA_ROW = 2 // "Toename en afname" maand 0 op grid-index 2 (Excel-rij 3)
const VER_DATA_ROW = 3 // Verdeling maand 0 op grid-index 3 (Excel-rij 4)
const S_DATA_ROW = 3 // S maand 0 op grid-index 3 (Excel-rij 4)
const PROGNOSE_DATA_ROW = 1 // Prognose maand 0 op grid-index 1 (Excel-rij 2)

// Bez per-slot kolommen: waarde 3+3i, rendement 4+3i, inleg 5+3i.
const bezWaardeCol = (slot: number): number => 3 + slot * 3
const bezRendementCol = (slot: number): number => 4 + slot * 3
const bezInlegCol = (slot: number): number => 5 + slot * 3

// Bez categorietotalen AM…AR (share-noemer). NB volgorde wijkt af van bens: Overig
// (AQ=42) vóór Eigen huis (AR=43).
const BEZ_TOTAAL_COL: Readonly<Record<AssetCategorie, number>> = {
  Spaargeld: 38, // AM
  Beleggingen: 39, // AN
  Pensioen: 40, // AO
  Vastgoed: 41, // AP
  Overig: 42, // AQ
  'Eigen huis': 43, // AR
}

// "Toename en afname": per categorie een 9-kolomsblok; toename€ = start+1, aantal = start+7.
const TOE_BLOCK_START: Readonly<Record<AssetCategorie, number>> = {
  Spaargeld: 7, // H
  Beleggingen: 16, // Q
  Pensioen: 25, // Z
  Vastgoed: 34, // AI
  'Eigen huis': 43, // AR
  Overig: 52, // BA
}

// "Verdeling"-eindtoewijzing/overloop, in de volgorde Spaargeld…Overig:
//   afname BP:BU = 67…72, onttrekking EI:EN = 138…143, overloop HC:HH = 210…215.
const VER_ORDER: readonly AssetCategorie[] = [
  'Spaargeld',
  'Beleggingen',
  'Pensioen',
  'Vastgoed',
  'Eigen huis',
  'Overig',
]
const VER_AFNAME_BASE = 67
const VER_ONTTREKKING_BASE = 138
const VER_OVERLOOP_BASE = 210

const ALLE_CATEGORIEEN: readonly AssetCategorie[] = [
  'Spaargeld',
  'Beleggingen',
  'Pensioen',
  'Vastgoed',
  'Eigen huis',
  'Overig',
]

/** Grid-cel → getal (leeg/niet-getal → 0). */
function cellNum(row: readonly CellValue[] | undefined, col: number): number {
  const v = row?.[col]
  return typeof v === 'number' ? v : 0
}

/** Bouw een per-categorie-bedrag uit één rij via een kolom-resolver. */
function perCategorie(resolve: (cat: AssetCategorie) => number): CategorieBedrag {
  const out = {} as Record<AssetCategorie, number>
  for (const cat of ALLE_CATEGORIEEN) out[cat] = resolve(cat)
  return out
}

// ── Bez-parity-spec ─────────────────────────────────────────────────────────────

/** Per-fixture context: de ruwe upstream-grids + twee solver-/start-afgeleiden. */
interface BezCtx {
  readonly bez: CellValue[][]
  readonly toe: CellValue[][]
  readonly ver: CellValue[][]
  readonly s: CellValue[][]
  readonly prognose: CellValue[][]
  /** P!B16 — FIRE-leeftijd (solver-output). */
  readonly fireLeeftijd: number
  /** Huis-slot (rol 'eigenHuis'); bepaalt de huiswaarde-kolom. */
  readonly houseSlot: number
  /** Overwaarde (J − S!D) in de maand vóór opeet-start (bevroren auto-opname-basis). */
  readonly overwaardeBijOpeetStart: number
}

const bezSpec: TableParitySpec<KernelInput, BezCtx, BezDep, BezRow> = {
  sheet: 'Bez',
  headerRows: BEZ_DATA_ROW, // maand 0 op grid-index 3
  buildInput: buildKernelInput,
  prepare: (fx: OracleFixture, input: KernelInput): BezCtx => {
    const bez = getSheet(fx, 'Bez').values
    const s = getSheet(fx, 'S').values
    const housePot = input.assetPotten.find((p) => p.rol === 'eigenHuis')
    const houseSlot = housePot?.slot ?? 2

    // Overwaarde bij opeet-start = J(mStart−1) − S!D(mStart−1), mStart = eerste maand
    // met leeftijd ≥ B64. Alléén de opeet-tak gebruikt 'm; overige fixtures negeren.
    const mStart = Math.round((input.woning.opeetStartleeftijdOpname - input.startLeeftijd) * 12)
    let overwaardeBijOpeetStart = 0
    if (mStart >= 1) {
      const vorige = BEZ_DATA_ROW + mStart - 1
      const huisJ = cellNum(bez[vorige], bezWaardeCol(houseSlot))
      const sD = cellNum(s[S_DATA_ROW + mStart - 1], 3)
      overwaardeBijOpeetStart = Math.max(0, huisJ - sD)
    }

    const b16 = getCell(fx, 'P!B16')
    return {
      bez,
      toe: getSheet(fx, 'Toename en afname').values,
      ver: getSheet(fx, 'Verdeling').values,
      s,
      prognose: getSheet(fx, 'Prognose').values,
      fireLeeftijd: typeof b16 === 'number' ? b16 : 0,
      houseSlot,
      overwaardeBijOpeetStart,
    }
  },
  buildDep: (ctx: BezCtx, input: KernelInput, m: MonthIndex): BezDep => {
    const bezVorige = m === 0 ? undefined : ctx.bez[BEZ_DATA_ROW + m - 1]
    const toeRow = ctx.toe[TOE_DATA_ROW + m]
    const verRow = ctx.ver[VER_DATA_ROW + m]
    const sVorige = m === 0 ? undefined : ctx.s[S_DATA_ROW + m - 1]
    const prognoseVorige = m === 0 ? undefined : ctx.prognose[PROGNOSE_DATA_ROW + m - 1]

    return {
      slotWaardeVorig: input.assetPotten.map((p) => cellNum(bezVorige, bezWaardeCol(p.slot))),
      categoriesaldoVorig: perCategorie((cat) => cellNum(bezVorige, BEZ_TOTAAL_COL[cat])),
      toenameEur: perCategorie((cat) => cellNum(toeRow, TOE_BLOCK_START[cat] + 1)),
      aantalPotten: perCategorie((cat) => cellNum(toeRow, TOE_BLOCK_START[cat] + 7)),
      verdelingAfname: perCategorie((cat) => cellNum(verRow, VER_AFNAME_BASE + VER_ORDER.indexOf(cat))),
      verdelingOnttrekking: perCategorie((cat) =>
        cellNum(verRow, VER_ONTTREKKING_BASE + VER_ORDER.indexOf(cat)),
      ),
      overloop: perCategorie((cat) => cellNum(verRow, VER_OVERLOOP_BASE + VER_ORDER.indexOf(cat))),
      ayVorig: cellNum(bezVorige, 50),
      baVorig: cellNum(bezVorige, 52),
      bbVorig: cellNum(bezVorige, 53),
      huisWaardeVorig: cellNum(bezVorige, bezWaardeCol(ctx.houseSlot)),
      hypotheekSaldoVorig: cellNum(sVorige, 3),
      opeetSaldoVorig: cellNum(sVorige, 15),
      prognoseLiquideVorig: cellNum(prognoseVorige, 9),
      fireLeeftijd: ctx.fireLeeftijd,
      overwaardeBijOpeetStart: ctx.overwaardeBijOpeetStart,
    }
  },
  compute: computeBez,
  columns: buildColumns(),
}

/** Excel-kolomletter uit een 0-gebaseerde index (A=0, Z=25, AA=26, …). */
function indexToLetter(index: number): string {
  let s = ''
  let i = index + 1
  while (i > 0) {
    const r = (i - 1) % 26
    s = String.fromCharCode(65 + r) + s
    i = Math.floor((i - 1) / 26)
  }
  return s
}

/**
 * Alle vergeleken Bez-kolommen. Horizon-guard per kolomtype: waarde/rendement,
 * B/C/AV/AW en de totalen → "" voorbij de horizon; inleg-kolommen en het woningblok
 * (AY:BE) → numeriek 0.
 */
function buildColumns(): ReadonlyArray<TableColumn<BezRow>> {
  const cols: TableColumn<BezRow>[] = []
  const push = (index: number, get: (r: BezRow) => CellValue): void => {
    cols.push({ letter: indexToLetter(index), index, get })
  }

  push(0, (r) => r.maand) // A
  push(1, (r) => (r.beyondHorizon ? '' : r.leeftijd)) // B
  push(2, (r) => (r.beyondHorizon ? '' : r.maandInJaar)) // C

  for (let slot = 0; slot < 10; slot++) {
    push(bezWaardeCol(slot), (r) => (r.beyondHorizon ? '' : r.slots[slot].waarde))
    push(bezRendementCol(slot), (r) => (r.beyondHorizon ? '' : r.slots[slot].rendement))
    push(bezInlegCol(slot), (r) => (r.beyondHorizon ? 0 : r.slots[slot].inleg))
  }

  push(33, (r) => (r.beyondHorizon ? '' : r.totaalBox3Spaar)) // AH
  push(34, (r) => (r.beyondHorizon ? '' : r.totaalBox3Investering)) // AI
  push(35, (r) => (r.beyondHorizon ? '' : r.totaalGeenBox3)) // AJ
  push(36, (r) => (r.beyondHorizon ? '' : r.totaalRendement)) // AK
  push(37, (r) => (r.beyondHorizon ? '' : r.totaalInleg)) // AL
  push(38, (r) => (r.beyondHorizon ? '' : r.totaalSpaargeld)) // AM
  push(39, (r) => (r.beyondHorizon ? '' : r.totaalBeleggingen)) // AN
  push(40, (r) => (r.beyondHorizon ? '' : r.totaalPensioen)) // AO
  push(41, (r) => (r.beyondHorizon ? '' : r.totaalVastgoed)) // AP
  push(42, (r) => (r.beyondHorizon ? '' : r.totaalOverig)) // AQ
  push(43, (r) => (r.beyondHorizon ? '' : r.totaalEigenHuis)) // AR

  push(47, (r) => (r.beyondHorizon ? '' : r.avLeeftijd)) // AV
  push(48, (r) => (r.beyondHorizon ? '' : r.awMaand)) // AW

  push(50, (r) => (r.beyondHorizon ? 0 : r.woning.verkocht)) // AY
  push(51, (r) => (r.beyondHorizon ? 0 : r.woning.verkoopopbrengst)) // AZ
  push(52, (r) => (r.beyondHorizon ? 0 : r.woning.huurPerMaand)) // BA
  push(53, (r) => (r.beyondHorizon ? 0 : r.woning.vervallenHypotheeklast)) // BB
  push(54, (r) => (r.beyondHorizon ? 0 : r.woning.overwaardeVorig)) // BC
  push(55, (r) => (r.beyondHorizon ? 0 : r.woning.opeetCap)) // BD
  push(56, (r) => (r.beyondHorizon ? 0 : r.woning.opeetOpname)) // BE

  return cols
}

// ── Testrun ─────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity Bez (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = runTableParityAllFixtures(FIXTURE_DIR, bezSpec)
  const COLUMN_COUNT = buildColumns().length // 53: A,B,C + 10×(w/r/inleg) + AH…AR + AV,AW + AY…BE

  describe('horizon-kernel · parity Bez (bezittingen + woningblok) tegen Excel-oracle', () => {
    it('draait over alle 19 fixtures', () => {
      // Bewuste tripwire: een nieuwe fixture-ronde moet hier zichtbaar afketsen.
      expect(results.length).toBe(19)
    })

    for (const result of results) {
      it(`${result.scenario}: Bez cel-voor-cel binnen €0,01`, () => {
        const { mismatchCount, maxAbsDiff } = result.comparison
        expect(
          mismatchCount,
          mismatchCount === 0
            ? undefined
            : `${mismatchCount} mismatch(es) in Bez (${result.scenario}), ` +
                `max |Δ|=${maxAbsDiff}:\n${result.mismatchLines.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt het volledige maand×kolom-grid per fixture', () => {
      for (const result of results) {
        expect(result.comparison.cellCount).toBe(result.months * result.columnCount)
        expect(result.months).toBe(1200)
        expect(result.columnCount).toBe(COLUMN_COUNT)
      }
      const totalCells = results.reduce((sum, r) => sum + r.comparison.cellCount, 0)
      // Dynamisch (ronde-4-proof): fixtures × 1200 maanden × 53 kolommen.
      expect(totalCells).toBe(results.length * 1200 * COLUMN_COUNT)
    })
  })
}
