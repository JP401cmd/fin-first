import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { getCell, listFixtures, loadFixture } from '@/lib/horizon-kernel/oracle/fixture-load'
import { inspectHistBacktest } from '@/lib/horizon-kernel/wrappers/hist'

/**
 * Hist-stub-parity: het oracle-model draagt géén backtest-data (Hist!B2 = 0 en
 * de reeks Hist!B4:B99 is leeg in alle fixtures). `inspectHistBacktest` moet
 * die inerte toestand exact weerspiegelen — er valt niets te simuleren; de echte
 * backtest blijft app-zijdig (gap-besluit V11). Deze test bewaakt dat de stub
 * niet stiekem "actief" wordt of een reeks fabriceert.
 */

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const fixtureFiles = existsSync(FIXTURE_DIR) ? listFixtures(FIXTURE_DIR) : []

if (fixtureFiles.length === 0) {
  describe.skip('horizon-oracle Hist-stub-parity (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(fixtureFiles.length).toBe(0)
    })
  })
} else {
  describe('horizon-oracle Hist-stub-parity (inerte backtest)', () => {
    for (const file of fixtureFiles) {
      it(path.basename(file), () => {
        const fx = loadFixture(file)
        const input = buildKernelInput(fx)
        const state = inspectHistBacktest(input)

        // Hist!B2 = 0 (uit) en geen numerieke jaarrendementen in het model.
        expect(getCell(fx, 'Hist!B2'), 'Hist!B2 (oracle, uit)').toBe(0)
        expect(state.actief, 'backtest actief').toBe(false)
        expect(state.reeksAanwezig, 'reeks aanwezig').toBe(false)
        expect(state.aantalJaren, 'aantal gevulde jaren').toBe(0)
      })
    }
  })
}
