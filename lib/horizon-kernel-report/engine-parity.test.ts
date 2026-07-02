import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { listFixtures } from '@/lib/horizon-kernel/oracle/fixture-load'
import { runVerification } from './engine-parity'

/**
 * Bewaakt dat de beheer-verificatie-runner op EXACT dezelfde cellen groen is als de
 * bewaakte integrale engine-parity-suite. De kolom-serialisatie in `table-columns.ts`
 * is een replica van `parity-engine.test.ts`; deze test faalt zodra die twee uit de
 * pas lopen (dan zou de beheer-pagina een valse rode/groene status tonen).
 */
const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

if (!hasFixtures) {
  describe.skip('horizon-kernel-report · verificatie (fixtures ontbreken)', () => {
    it('overgeslagen', () => expect(hasFixtures).toBe(false))
  })
} else {
  describe('horizon-kernel-report · beheer-verificatie', () => {
    const report = runVerification(FIXTURE_DIR)

    it('draait over alle 19 fixtures × 11 tabellen', () => {
      expect(report.fixtureCount).toBe(19)
      expect(report.tableCount).toBe(11)
    })

    it('elke fixture rekent aantoonbaar gelijk aan het Excel (0 mismatches, €0,01)', () => {
      expect(report.ok, `${report.totalMismatches} mismatch(es), max |Δ|=${report.maxAbsDiff}`).toBe(true)
      expect(report.totalMismatches).toBe(0)
      expect(report.maxAbsDiff).toBeLessThanOrEqual(0.01)
    })

    it('levert bron-herkomst uit de fixture-meta', () => {
      expect(report.bron?.sourceSha256).toMatch(/^[0-9a-f]{16,}$/i)
    })
  })
}
