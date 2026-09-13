import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listFixtures, loadFixture } from './oracle/fixture-load'
import { buildKernelInput } from './input-from-fixture'
import { runKernelProjection } from './engine'
import { solveFire } from './solver'
import type { CFComputedRow } from './tables/cf'
import type { GebPost, KernelInput } from './types'

/**
 * EIGENSCHAPS-TESTS — ADR 0143: een handmatige Geb-post met `eindBijStopmoment` loopt
 * tot de maand vóór het stopmoment van de run (buiten oracle-domein).
 *
 * Given een fixture-invoer met één extra doorlopende maandbate,
 * When de engine draait op een vaste FIRE-leeftijd,
 * Then telt de bate mee in CF!H t/m fireMonth−1 en vanaf fireMonth niet meer — terwijl
 * dezelfde post zónder vlag tot de horizon doorloopt en een run zonder vlag byte-
 * identiek is aan het oude pad.
 */

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

const BATE = 1_000
const FIRE_OFFSET_JAAR = 10

function metPost(input: KernelInput, post: GebPost): KernelInput {
  return {
    ...input,
    gebeurtenissen: [
      ...input.gebeurtenissen,
      { rij: 4 + input.gebeurtenissen.length, naam: 'Extra inleg', posten: [post] },
    ],
  }
}

function doorlopendeBate(input: KernelInput, startJaarNaNu: number, extra: Partial<GebPost> = {}): GebPost {
  return {
    type: 'Periodiek',
    bedrag: BATE,
    startLeeftijd: input.startLeeftijd + startJaarNaNu,
    startMaand: 1,
    eindLeeftijd: null,
    eindMaand: null,
    ...extra,
  }
}

const h = (row: { beyondHorizon: boolean }): number => {
  expect(row.beyondHorizon).toBe(false)
  return (row as CFComputedRow).gebeurtenisBaten
}

if (!hasFixtures) {
  describe.skip('horizon-kernel · eindBijStopmoment (fixtures nog niet geëxtraheerd)', () => {
    it('overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const input = buildKernelInput(loadFixture(listFixtures(FIXTURE_DIR)[0]))
  const fireAge = input.startLeeftijd + FIRE_OFFSET_JAAR
  const fireMonth = FIRE_OFFSET_JAAR * 12

  describe('Geb-post eindBijStopmoment (ADR 0143)', () => {
    it('inert: vlag false/afwezig ⇒ projectie identiek aan dezelfde post zonder het veld', () => {
      const zonder = runKernelProjection(metPost(input, doorlopendeBate(input, 1)), { fireAge })
      const metFalse = runKernelProjection(
        metPost(input, doorlopendeBate(input, 1, { eindBijStopmoment: false })),
        { fireAge },
      )
      expect(metFalse).toEqual(zonder)
    })

    it('met vlag telt de bate t/m fireMonth−1 en vanaf fireMonth niet meer; zonder vlag loopt hij door', () => {
      const basis = runKernelProjection(input, { fireAge })
      const doorlopend = runKernelProjection(metPost(input, doorlopendeBate(input, 1)), { fireAge })
      const totStop = runKernelProjection(
        metPost(input, doorlopendeBate(input, 1, { eindBijStopmoment: true })),
        { fireAge },
      )
      const extra = (p: typeof basis, m: number) => h(p.cf[m]) - h(basis.cf[m])

      // Vóór de start: geen bate in beide varianten.
      expect(extra(totStop, 11)).toBeCloseTo(0, 6)
      // Tussen start en stopmoment: identiek aan de doorlopende variant (> 0).
      expect(extra(totStop, 12)).toBeGreaterThan(0)
      expect(extra(totStop, fireMonth - 1)).toBeCloseTo(extra(doorlopend, fireMonth - 1), 6)
      // Vanaf het stopmoment: weg bij totStop, nog aanwezig bij doorlopend.
      expect(extra(totStop, fireMonth)).toBeCloseTo(0, 6)
      expect(extra(totStop, fireMonth + 120)).toBeCloseTo(0, 6)
      expect(extra(doorlopend, fireMonth)).toBeGreaterThan(0)
      expect(extra(doorlopend, fireMonth + 120)).toBeGreaterThan(0)
    })

    it('een post die pas op/na het stopmoment start vuurt nooit', () => {
      const basis = runKernelProjection(input, { fireAge })
      const laat = runKernelProjection(
        metPost(input, doorlopendeBate(input, FIRE_OFFSET_JAAR + 2, { eindBijStopmoment: true })),
        { fireAge },
      )
      for (let m = 0; m < basis.cf.length; m++) {
        if (basis.cf[m].beyondHorizon) break
        expect(h(laat.cf[m])).toBeCloseTo(h(basis.cf[m]), 6)
      }
    })

    it('een eigen eind vóór het stopmoment blijft staan (min van beide)', () => {
      const basis = runKernelProjection(input, { fireAge })
      const kort = runKernelProjection(
        metPost(
          input,
          doorlopendeBate(input, 1, {
            eindLeeftijd: input.startLeeftijd + 3,
            eindMaand: 12,
            eindBijStopmoment: true,
          }),
        ),
        { fireAge },
      )
      const laatsteActief = 3 * 12 + 11
      expect(h(kort.cf[laatsteActief]) - h(basis.cf[laatsteActief])).toBeGreaterThan(0)
      expect(h(kort.cf[laatsteActief + 1]) - h(basis.cf[laatsteActief + 1])).toBeCloseTo(0, 6)
    })

    it('solveFire met de vlag vindt geen eerder stopmoment dan met een doorlopende bate', () => {
      // De vlag haalt alleen inkomen ná het stopmoment weg; vóór het stopmoment is de
      // opbouw identiek. Het gezochte stopmoment kan daardoor alleen gelijk blijven of
      // later komen (minder dekking in de onttrekkingsfase) — nooit eerder.
      const doorlopend = solveFire(metPost(input, doorlopendeBate(input, 1)))
      const totStop = solveFire(metPost(input, doorlopendeBate(input, 1, { eindBijStopmoment: true })))
      expect(Number.isFinite(totStop.fireAge)).toBe(true)
      expect(totStop.fireAge).toBeGreaterThanOrEqual(doorlopend.fireAge)
    })
  })
}
