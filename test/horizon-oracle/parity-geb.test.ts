import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCell, listFixtures, loadFixture } from '@/lib/horizon-kernel/oracle/fixture-load'
import { DEFAULT_TOLERANCE } from '@/lib/horizon-kernel/oracle/compare'
import type { CellValue, OracleFixture } from '@/lib/horizon-kernel/oracle/fixture-types'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { computeGebAutoRows, type GebAutoRow } from '@/lib/horizon-kernel/tables/geb'

/**
 * PARITY — tab **Geb**, auto-rijen 14-30 tegen het Excel-oracle (ADR 0032,
 * tolerantie €0,01). Reproduceert de automatische gebeurtenis-rijen zoals ze op
 * de Geb-tab landen: de **event-cellen A-H** van de actieve post én de
 * **machine-leesbare helper-kolommen W:AE** (sIdx/eIdx/bn per post) die CF!H en
 * Af!D consumeren.
 *
 * We vergelijken:
 *   1. **Helper-kolommen W:AE voor álle rijen 14-30** (numeriek, deterministisch)
 *      — het downstream-geconsumeerde resultaat van elke auto-rij.
 *   2. **Event-cellen A-H voor de actieve AOW-rij 14** — naam/type/bedrag/
 *      geïnd.-start/start/eind.
 *
 * **Bewust buiten de vergelijking:** de lege-tekst-artefacten (Excel `""`) in de
 * event-kolommen A-V van de INACTIEVE rijen 15-30. Dat "vs-blanco"-patroon is
 * een formule-opmaak-artefact van de sheet, geen per-invoer-berekening; het
 * deterministische resultaat van elke inactieve rij zit volledig in W:AE
 * (99999/99998/0 = structureel inactief). Ook rij 4-13 (handmatige invoer) en
 * 32-37 (werk-strategie-resultaat) vallen buiten deze module.
 *
 * **Beproevings-beperking:** in alle 16 fixtures is enkel de AOW-post (rij 14)
 * actief; rij 15-30 leveren uitsluitend inactieve helper-markers.
 */

const SHEET = 'Geb'

/** Helper-kolomletters per post (W:AE): [sIdx, eIdx, bn]. */
const HELPER_COLS: readonly (readonly [string, string, string])[] = [
  ['W', 'X', 'Y'], // post 1
  ['Z', 'AA', 'AB'], // post 2
  ['AC', 'AD', 'AE'], // post 3
]

interface CellSpec {
  readonly ref: string
  readonly actual: CellValue
}

/** Bouw de cel-specs voor één auto-rij (helpers W:AE + evt. event-cellen A-H). */
function specsForRow(row: GebAutoRow): CellSpec[] {
  const r = row.gebRow
  const specs: CellSpec[] = []

  // 1. Helper-drieluik per post.
  row.helpers.forEach((h, postIdx) => {
    const [sCol, eCol, bCol] = HELPER_COLS[postIdx]
    specs.push(
      { ref: `${sCol}${r}`, actual: h.sIdx },
      { ref: `${eCol}${r}`, actual: h.eIdx },
      { ref: `${bCol}${r}`, actual: h.bn },
    )
  })

  // 2. Event-cellen A-H, alléén voor een actieve post-1-rij (AOW rij 14).
  if (row.post1Event !== null) {
    const ev = row.post1Event
    specs.push(
      { ref: `A${r}`, actual: ev.naam },
      { ref: `B${r}`, actual: ev.type },
      { ref: `C${r}`, actual: ev.bedrag },
      { ref: `D${r}`, actual: ev.geindStart },
      { ref: `E${r}`, actual: ev.startLeeftijd },
      { ref: `F${r}`, actual: ev.startMaand },
      { ref: `G${r}`, actual: ev.eindLeeftijd },
      { ref: `H${r}`, actual: ev.eindMaand },
    )
  }

  return specs
}

/** Vergelijk één cel; `null` = gelijk, anders een leesbare mismatch-regel. */
function compareCell(ref: string, expected: CellValue, actual: CellValue): string | null {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const diff = Math.abs(expected - actual)
    return diff <= DEFAULT_TOLERANCE ? null : `${SHEET}!${ref}: Δ=${diff} (exp=${expected} act=${actual})`
  }
  if (expected === actual) return null
  return `${SHEET}!${ref}: exp=${JSON.stringify(expected)} act=${JSON.stringify(actual)}`
}

function runFixture(fx: OracleFixture): { scenario: string; mismatches: string[]; cellCount: number } {
  const input = buildKernelInput(fx)
  const rows = computeGebAutoRows(input)
  const mismatches: string[] = []
  let cellCount = 0
  for (const row of rows) {
    for (const spec of specsForRow(row)) {
      cellCount++
      const expected = getCell(fx, `${SHEET}!${spec.ref}`)
      const line = compareCell(spec.ref, expected, spec.actual)
      if (line !== null) mismatches.push(line)
    }
  }
  return { scenario: fx.meta.scenario, mismatches, cellCount }
}

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel · parity Geb auto-rijen (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const results = listFixtures(FIXTURE_DIR).map((f) => runFixture(loadFixture(f)))

  describe('horizon-kernel · parity Geb auto-rijen (14-30) tegen Excel-oracle', () => {
    it('draait over alle 19 fixtures', () => {
      // Bewuste tripwire: een nieuwe fixture-ronde moet hier zichtbaar afketsen.
      expect(results.length).toBe(19)
    })

    for (const result of results) {
      it(`${result.scenario}: Geb auto-rijen cel-voor-cel binnen €0,01`, () => {
        expect(
          result.mismatches.length,
          result.mismatches.length === 0
            ? undefined
            : `${result.mismatches.length} mismatch(es) (${result.scenario}):\n${result.mismatches.join('\n')}`,
        ).toBe(0)
      })
    }

    it('vergelijkt per fixture de helpers 14-30 + de actieve event-cellen', () => {
      for (const result of results) {
        // Basis: 17 rijen × 9 helper-cellen + 8 event-cellen (AOW, rij 14).
        // `gezin` activeert 4 extra event-rijen (pensioenpot 15, kind 21/22,
        // erfenis 30) → 8 extra cellen per rij = 193 (ronde-3-vondst).
        const verwacht = result.scenario === 'gezin' ? 17 * 9 + 8 + 4 * 8 : 17 * 9 + 8
        expect(result.cellCount, result.scenario).toBe(verwacht)
      }
    })
  })
}
