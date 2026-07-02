import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCell, listFixtures } from '@/lib/horizon-kernel/oracle/fixture-load'
import type { OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import {
  computeWerkStrategie,
  type WerkStrategieDep,
  type WerkStrategieRow,
} from '@/lib/horizon-kernel/tables/werk-strategie'
import {
  runTableParityAllFixtures,
  type TableColumn,
  type TableParitySpec,
} from '@/lib/horizon-kernel/parity/teacher'
import type { KernelInput, MonthIndex } from '@/lib/horizon-kernel/types'

/**
 * PARITY — tabel **Werk-strategie** (inkomenslijn, NIEUW in v5) tegen het
 * Excel-oracle (ADR 0032).
 *
 * Teacher-forced: de enige upstream-waarde is de solver-gebonden FIRE-gate
 * (`IF(P!B16="", P!B35, P!B16)`), die uit de fixture-P-sheet komt (`buildDep`).
 * De salarisladder zelf volgt puur uit `input.werkStrategie`. Zo wordt
 * `computeWerkStrategie` geïsoleerd formule-getrouw bewezen over **alle 16
 * fixtures × alle 1200 maanden × de maandtabel-kolommen N–S**, tolerantie €0,01.
 *
 * **Vergeleken kolommen: N (Maand), O (Leeftijd), P (Reëel salaris/mnd),
 * Q (Reële DELTA/mnd), R (Nominale DELTA/mnd), S (DELTA gegate → CF!D)** — de
 * volledige maandtabel. De kolommen A–M blijven bewust buiten de vergelijking:
 * dat is het invoer-/toelichtingsgebied van de tab (A/B = basis-parameters +
 * labels, D/E = optionele sprongen, G/H = optionele deeltijd, K/L = de
 * intermediaire jaarladder die alléén ages 36–71 vult, M = spacer) — statische
 * invoer/opmaak, geen per-maand-berekening van de maandtabel.
 *
 * Sprongen (D3:E8) en deeltijd (G3:H8) zijn in alle fixtures leeg; die takken
 * van `computeWerkStrategie` zijn geïmplementeerd conform structuur.md maar door
 * de fixtures niet uitgeoefend.
 */

// ── Oracle-layout van de Werk-strategie-maandtabel (bron: structuur.md, empirisch) ──
// De maandtabel staat in kolommen N:S (0-gebaseerd: N=13 … S=18); data begint op
// grid-index 1 (Excel-rij 2 = maand 0), dus headerRows = 1.
const WERK_COL_MAAND = 13 // N
const WERK_COL_LEEFTIJD = 14 // O
const WERK_COL_REEEL_SALARIS = 15 // P
const WERK_COL_REELE_DELTA = 16 // Q
const WERK_COL_NOMINALE_DELTA = 17 // R
const WERK_COL_GEGATE_DELTA = 18 // S

/** Kolom N–S van Werk-strategie, met de getter uit de `WerkStrategieRow`. */
const WERK_COLUMNS: ReadonlyArray<TableColumn<WerkStrategieRow>> = [
  { letter: 'N', index: WERK_COL_MAAND, get: (r) => r.maand },
  { letter: 'O', index: WERK_COL_LEEFTIJD, get: (r) => r.leeftijd },
  { letter: 'P', index: WERK_COL_REEEL_SALARIS, get: (r) => r.reeelSalaris },
  { letter: 'Q', index: WERK_COL_REELE_DELTA, get: (r) => r.reeleDelta },
  { letter: 'R', index: WERK_COL_NOMINALE_DELTA, get: (r) => r.nominaleDelta },
  { letter: 'S', index: WERK_COL_GEGATE_DELTA, get: (r) => r.gegateDelta },
]

/**
 * Per-fixture context: de teacher-forced FIRE-gate-leeftijd `IF(P!B16="", P!B35,
 * P!B16)` (scalar; solver-gebonden). Beide cellen komen uit de fixture-P-sheet.
 */
interface WerkCtx {
  readonly fireGateLeeftijd: number
}

/** Resolveer de FIRE-gate-leeftijd uit de fixture (P!B16, met P!B35 als fallback). */
function resolveFireGate(fx: OracleFixture): number {
  const b16 = getCell(fx, 'P!B16') // solver-FIRE-leeftijd
  if (typeof b16 === 'number') return b16
  const b35 = getCell(fx, 'P!B35') // solver-eindleeftijd (fallback bij lege B16)
  if (typeof b35 === 'number') return b35
  throw new Error('Werk-strategie parity: geen numerieke FIRE-gate (P!B16/P!B35) in fixture')
}

const werkSpec: TableParitySpec<KernelInput, WerkCtx, WerkStrategieDep, WerkStrategieRow> = {
  sheet: 'Werk-strategie',
  headerRows: 1, // maand 0 op grid-rij 1 (Excel-rij 2)
  buildInput: buildKernelInput,
  prepare: (fx: OracleFixture): WerkCtx => ({ fireGateLeeftijd: resolveFireGate(fx) }),
  buildDep: (ctx: WerkCtx): WerkStrategieDep => ({ fireGateLeeftijd: ctx.fireGateLeeftijd }),
  compute: computeWerkStrategie,
  columns: WERK_COLUMNS,
}

// ── Testrun ────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity Werk-strategie (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = runTableParityAllFixtures(FIXTURE_DIR, werkSpec)

  describe('horizon-kernel · parity Werk-strategie (inkomenslijn) tegen Excel-oracle', () => {
    it('draait over alle 19 fixtures', () => {
      // Bewuste teller-tripwire: hardcoded op de fixture-set-grootte zodat een
      // toegevoegde/verdwenen fixture (bv. ronde 4) hier zichtbaar wordt.
      expect(results.length).toBe(19)
    })

    for (const result of results) {
      it(`${result.scenario}: Werk-strategie cel-voor-cel binnen €0,01`, () => {
        const { mismatchCount, maxAbsDiff } = result.comparison
        expect(
          mismatchCount,
          mismatchCount === 0
            ? undefined
            : `${mismatchCount} mismatch(es) in Werk-strategie (${result.scenario}), ` +
                `max |Δ|=${maxAbsDiff}:\n${result.mismatchLines.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt het volledige maand×kolom-grid per fixture', () => {
      for (const result of results) {
        // 1200 maanden × 6 kolommen (N–S).
        expect(result.comparison.cellCount).toBe(result.months * result.columnCount)
        expect(result.months).toBe(1200)
        expect(result.columnCount).toBe(6)
      }
      const totalCells = results.reduce((sum, r) => sum + r.comparison.cellCount, 0)
      // Per fixture 1200 × 6 = 7.200 cellen; totaal schaalt mee met het aantal fixtures.
      expect(totalCells).toBe(results.length * 1200 * 6)
    })
  })
}
