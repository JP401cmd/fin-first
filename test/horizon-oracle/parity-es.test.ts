import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCell, listFixtures, loadFixture } from '@/lib/horizon-kernel/oracle/fixture-load'
import type { CellValue } from '@/lib/horizon-kernel/oracle/fixture-types'
import { compareGrid } from '@/lib/horizon-kernel/oracle/compare'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { computeEs, type EsRow } from '@/lib/horizon-kernel/tables/es'

/**
 * PARITY — tabel **ES** (Eindstrategie-spiegel) tegen het Excel-oracle (ADR 0032).
 *
 * ES is GEEN maandtabel maar een klein afgeleid blok. De parity-vorm is daarop
 * aangepast: i.p.v. 1200 maanden × kolommen vergelijken we de **berekende cellen**
 * (kolom C + de actief-markers E10:E15) cel-voor-cel over **alle fixtures**, met
 * tolerantie €0,01.
 *
 * **Berekende cellen** (afgeleid van de P-eindstrategie-parameters):
 *   C5  gekozen eindstrategie (= P!B48)          C13 niet-liquide meetellen (= P!B54)
 *   C6  "wat dit betekent" (SWITCH op code)      C14 "n.v.t." (constante, eeuwigdurend)
 *   C7  interne code (IFS op P!B48)              C15 pensioenleeftijd/AOW (= P!B55)
 *   C10 eindleeftijd opeten (= P!B51)            E10:E15 actief-markers per strategie
 *   C11 eindleeftijd nalatenschap (= P!B52)
 *   C12 nalatenschapbedrag (= P!B53)
 *
 * **Bewust BUITEN de vergelijking = documentatie/opmaak** (in alle fixtures
 * identiek, niet uit de P-invoer afgeleid): kolommen A (labels/sectiekoppen),
 * B (parameterbeschrijvingen), D (eenheden), F (toelichtingen), de headers
 * (rij 9), en het "3 · Toelichting per eindstrategie"-blok (rij 17-21). Dit is
 * statische spiegel-/uitleg-tekst — geen berekening (motivatie zoals Bel!O/P).
 */

/** Eén te vergelijken ES-cel: A1-adres (zonder tab-prefix) + getter uit de EsRow. */
interface EsCell {
  readonly ref: string
  readonly get: (r: EsRow) => CellValue
}

/**
 * De berekende ES-cellen (kolom C + actief-markers E10:E15). De actief-markers
 * leveren "" (leeg) op inactieve rijen — dat matcht de Excel-IF-formule (lege
 * string, geen `null`); de comparator behandelt `null` ↔ "" bewust als mismatch.
 */
const ES_CELLS: readonly EsCell[] = [
  { ref: 'C5', get: (r) => r.gekozen },
  { ref: 'C6', get: (r) => r.betekenis },
  { ref: 'C7', get: (r) => r.interneCode },
  { ref: 'C10', get: (r) => r.eindleeftijdOpeten },
  { ref: 'C11', get: (r) => r.eindleeftijdNalatenschap },
  { ref: 'C12', get: (r) => r.nalatenschapBedrag },
  { ref: 'C13', get: (r) => r.nietLiquideMeetellen },
  { ref: 'C14', get: (r) => r.eeuwigdurend },
  { ref: 'C15', get: (r) => r.pensioenleeftijd },
  { ref: 'E10', get: (r) => r.actiefOpeten },
  { ref: 'E11', get: (r) => r.actiefNalatenschapEindleeftijd },
  { ref: 'E12', get: (r) => r.actiefNalatenschapBedrag },
  { ref: 'E13', get: (r) => r.actiefNietLiquide },
  { ref: 'E14', get: (r) => r.actiefEeuwigdurend },
  { ref: 'E15', get: (r) => r.actiefPensioen },
]

// ── Testrun ────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity ES (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = listFixtures(FIXTURE_DIR).map((file) => {
    const fx = loadFixture(file)
    const row = computeEs(buildKernelInput(fx))
    // Eén rij "verwacht" (fixture) en één rij "actueel" (compute), in ES_CELLS-volgorde.
    const expected: CellValue[] = ES_CELLS.map((c) => getCell(fx, `ES!${c.ref}`))
    const actual: CellValue[] = ES_CELLS.map((c) => c.get(row))
    const comparison = compareGrid([expected], [actual])
    const mismatchLines = comparison.mismatches.map((mm) => {
      const cell = ES_CELLS[mm.col]
      return `  ES!${cell.ref}: verwacht=${JSON.stringify(mm.expected)} actueel=${JSON.stringify(mm.actual)}`
    })
    return { scenario: fx.meta.scenario, comparison, mismatchLines }
  })

  describe('horizon-kernel · parity ES (eindstrategie-spiegel) tegen Excel-oracle', () => {
    it('draait over alle 19 fixtures', () => {
      // Bewuste teller-tripwire: hardcoded op de fixture-set-grootte zodat een
      // toegevoegde/verdwenen fixture (bv. ronde 4) hier zichtbaar wordt.
      expect(results.length).toBe(19)
    })

    for (const result of results) {
      it(`${result.scenario}: ES cel-voor-cel binnen €0,01`, () => {
        const { mismatchCount, maxAbsDiff } = result.comparison
        expect(
          mismatchCount,
          mismatchCount === 0
            ? undefined
            : `${mismatchCount} mismatch(es) in ES (${result.scenario}), ` +
                `max |Δ|=${maxAbsDiff}:\n${result.mismatchLines.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt alle 15 berekende ES-cellen per fixture', () => {
      for (const result of results) {
        expect(result.comparison.cellCount).toBe(ES_CELLS.length)
      }
      const totalCells = results.reduce((sum, r) => sum + r.comparison.cellCount, 0)
      // Per fixture 15 berekende cellen; totaal schaalt mee met het aantal fixtures.
      expect(totalCells).toBe(results.length * ES_CELLS.length)
      expect(ES_CELLS.length).toBe(15)
    })
  })
}
