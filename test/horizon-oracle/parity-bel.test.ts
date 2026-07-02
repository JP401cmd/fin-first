import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getSheet, listFixtures } from '@/lib/horizon-kernel/oracle/fixture-load'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { computeBel, type BelDep, type BelRow } from '@/lib/horizon-kernel/tables/bel'
import {
  runTableParityAllFixtures,
  type TableColumn,
  type TableParitySpec,
} from '@/lib/horizon-kernel/parity/teacher'
import type { KernelInput, MonthIndex } from '@/lib/horizon-kernel/types'

/**
 * PARITY — tabel **Bel** (Box 3) tegen het Excel-oracle (ADR 0032).
 *
 * Teacher-forced: alle upstream-grondslagen + per-pot rendement/rente komen uit
 * de fixture (`buildDep`), zodat `computeBel` geïsoleerd formule-getrouw bewezen
 * wordt over **alle fixtures × alle 1200 maanden × de kolommen A–N**, met
 * tolerantie €0,01. Kolommen O (permanente spacer, altijd leeg) en P
 * (toelichtingstekst — statische documentatie, geen per-maand-berekening)
 * blijven bewust buiten de vergelijking.
 *
 * Conventie voor volgende tabel-ports: één `parity-<tabel>.test.ts` per tabel,
 * die de tabel-specifieke `TableParitySpec` definieert en de gedeelde runner
 * `runTableParityAllFixtures` aanroept.
 */

// ── Oracle-layout van de upstream-tabs (bron: structuur.md, empirisch geverifieerd) ──
// Bez/S: datamaand m staat op grid-index 3 + m (Excel-rij 4 = maand 0).
const DATA_ROW_START = 3
// Bez-totalen: AH (Box 3 spaar) = kolomindex 33, AI (investering) = 34.
const BEZ_COL_GRONDSLAG_SPAAR = 33
const BEZ_COL_GRONDSLAG_INVESTERING = 34
// S-totaal: AF (Box 3-schuld) = kolomindex 31.
const S_COL_GRONDSLAG_SCHULD = 31
// Bez-slot i (0-gebaseerd): waarde 3+3i, rendement 4+3i, inleg 5+3i.
const bezRendementCol = (slot: number): number => 4 + slot * 3
// S-slot i (0-gebaseerd): saldo 3+4i, aflossing 4+4i, extra 5+4i, rente 6+4i.
const sRenteCol = (slot: number): number => 6 + slot * 4

/** Grid-cel → getal (niet-getal, bv. lege "" voorbij horizon → 0; compute negeert die). */
function cellNum(row: readonly CellValue[] | undefined, col: number): number {
  const v = row?.[col]
  return typeof v === 'number' ? v : 0
}

// ── Bel-parity-spec ───────────────────────────────────────────────────────────

/** Per-fixture context: de ruwe Bez/S-grids (eenmalig opgehaald). */
interface BelCtx {
  readonly bez: CellValue[][]
  readonly s: CellValue[][]
}

/** Kolom A–N van Bel, met de getter uit de `BelRow`. */
const BEL_COLUMNS: ReadonlyArray<TableColumn<BelRow>> = [
  { letter: 'A', index: 0, get: (r) => r.maand },
  { letter: 'B', index: 1, get: (r) => (r.beyondHorizon ? '' : r.leeftijd) },
  { letter: 'C', index: 2, get: (r) => (r.beyondHorizon ? '' : r.maandInJaar) },
  { letter: 'D', index: 3, get: (r) => (r.beyondHorizon ? '' : r.grondslagSpaar) },
  { letter: 'E', index: 4, get: (r) => (r.beyondHorizon ? '' : r.grondslagInvestering) },
  { letter: 'F', index: 5, get: (r) => (r.beyondHorizon ? '' : r.grondslagSchuld) },
  { letter: 'G', index: 6, get: (r) => (r.beyondHorizon ? '' : r.schuldNaDrempel) },
  { letter: 'H', index: 7, get: (r) => (r.beyondHorizon ? '' : r.rendementsgrondslag) },
  { letter: 'I', index: 8, get: (r) => (r.beyondHorizon ? '' : r.fictiefRendement) },
  { letter: 'J', index: 9, get: (r) => (r.beyondHorizon ? '' : r.grondslagSparenBeleggen) },
  { letter: 'K', index: 10, get: (r) => (r.beyondHorizon ? '' : r.forfaitaireHeffing) },
  { letter: 'L', index: 11, get: (r) => (r.beyondHorizon ? '' : r.werkelijkRendement) },
  { letter: 'M', index: 12, get: (r) => (r.beyondHorizon ? '' : r.belastingWerkelijk) },
  { letter: 'N', index: 13, get: (r) => (r.beyondHorizon ? '' : r.canoniek) },
]

const belSpec: TableParitySpec<KernelInput, BelCtx, BelDep, BelRow> = {
  sheet: 'Bel',
  headerRows: 1, // Bel: maand 0 op grid-rij 1 (Excel-rij 2)
  buildInput: buildKernelInput,
  prepare: (fx: OracleFixture): BelCtx => ({
    bez: getSheet(fx, 'Bez').values,
    s: getSheet(fx, 'S').values,
  }),
  buildDep: (ctx: BelCtx, input: KernelInput, m: MonthIndex): BelDep => {
    const bezRow = ctx.bez[DATA_ROW_START + m]
    const sRow = ctx.s[DATA_ROW_START + m]
    return {
      grondslagSpaar: cellNum(bezRow, BEZ_COL_GRONDSLAG_SPAAR),
      grondslagInvestering: cellNum(bezRow, BEZ_COL_GRONDSLAG_INVESTERING),
      grondslagSchuld: cellNum(sRow, S_COL_GRONDSLAG_SCHULD),
      assetRendementen: input.assetPotten.map((p) => cellNum(bezRow, bezRendementCol(p.slot))),
      schuldRentes: input.schuldPotten.map((p) => cellNum(sRow, sRenteCol(p.slot))),
    }
  },
  compute: computeBel,
  columns: BEL_COLUMNS,
}

// ── Testrun ────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity Bel (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = runTableParityAllFixtures(FIXTURE_DIR, belSpec)

  describe('horizon-kernel · parity Bel (Box 3) tegen Excel-oracle', () => {
    it('draait over alle 19 fixtures', () => {
      // Bewuste teller-tripwire: hardcoded op de fixture-set-grootte zodat een
      // toegevoegde/verdwenen fixture (bv. ronde 4) hier zichtbaar wordt.
      expect(results.length).toBe(19)
    })

    for (const result of results) {
      it(`${result.scenario}: Bel cel-voor-cel binnen €0,01`, () => {
        const { mismatchCount, maxAbsDiff } = result.comparison
        expect(
          mismatchCount,
          mismatchCount === 0
            ? undefined
            : `${mismatchCount} mismatch(es) in Bel (${result.scenario}), ` +
                `max |Δ|=${maxAbsDiff}:\n${result.mismatchLines.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt het volledige maand×kolom-grid per fixture', () => {
      for (const result of results) {
        // 1200 maanden × 14 kolommen (A–N).
        expect(result.comparison.cellCount).toBe(result.months * result.columnCount)
        expect(result.months).toBe(1200)
        expect(result.columnCount).toBe(14)
      }
      const totalCells = results.reduce((sum, r) => sum + r.comparison.cellCount, 0)
      // Per fixture 1200 × 14 = 16.800 cellen; totaal schaalt mee met het aantal fixtures.
      expect(totalCells).toBe(results.length * 1200 * 14)
    })
  })
}
