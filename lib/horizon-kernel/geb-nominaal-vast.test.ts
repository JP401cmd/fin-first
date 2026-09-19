import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listFixtures, loadFixture } from './oracle/fixture-load'
import { buildKernelInput } from './input-from-fixture'
import { runKernelProjection } from './engine'
import type { CFComputedRow } from './tables/cf'
import type { GebPost, KernelInput, PensioenPot } from './types'

/**
 * EIGENSCHAPS-TESTS — nominaal-vaste gebeurtenis-posten (buiten oracle-domein).
 *
 * Given een fixture-invoer met één extra doorlopende maandpost die "niet meestijgt met
 * inflatie" (`GebPost.nominaalVast`),
 * When de engine draait op een vaste FIRE-leeftijd,
 * Then is de extra CF!H-bate (resp. Af!D-kost) in élke actieve maand exact het ingevoerde
 * nominale bedrag — op de startmaand, 10 en 20 jaar later — terwijl dezelfde post zónder
 * vlag met idx(m) meegroeit, en een run zonder de vlag byte-identiek is aan het oude pad.
 *
 * Idem voor een eigen pensioen met "Geïndexeerd = Nee" onder `KernelInput.pensioenNominaalVast`
 * (gap-besluit: de Excel-structuur de-indexeert één keer naar de ingangsleeftijd en laat de
 * motor daarna centraal indexeren — dat is groei, geen vast bedrag; het partnerpensioen PT!K
 * is in het oracle zelf wél vlak nominaal).
 *
 * Tolerantie: ABSOLUUT €0,01 — de grootheden zijn maandbedragen rond €1.000; een relatieve
 * tolerantie zou een cent-fout op deze schaal onzichtbaar maken en een absolute cent-
 * tolerantie is precies de parity-norm van de kern.
 */

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

const BEDRAG = 1_000
const START_JAAR = 10
const FIRE_OFFSET_JAAR = 20
const CENT = 2 // toBeCloseTo(…, 2) ⇒ |Δ| < 0,005

function metPost(input: KernelInput, post: GebPost): KernelInput {
  return {
    ...input,
    gebeurtenissen: [
      ...input.gebeurtenissen,
      { rij: 4 + input.gebeurtenissen.length, naam: 'Vaste post', posten: [post] },
    ],
  }
}

function doorlopend(input: KernelInput, bedrag: number, extra: Partial<GebPost> = {}): GebPost {
  return {
    type: 'Periodiek',
    bedrag,
    startLeeftijd: input.startLeeftijd + START_JAAR,
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
  describe.skip('horizon-kernel · nominaalVast (fixtures nog niet geëxtraheerd)', () => {
    it('overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const input = buildKernelInput(loadFixture(listFixtures(FIXTURE_DIR)[0]))
  const fireAge = input.startLeeftijd + FIRE_OFFSET_JAAR
  const s = START_JAAR * 12
  const idx = (m: number) => Math.pow(1 + input.inflatie, m / 12)

  describe('Geb-post nominaalVast (eigen gebeurtenis, "stijgt niet mee met inflatie")', () => {
    it('inert: vlag false/afwezig ⇒ projectie identiek aan dezelfde post zonder het veld', () => {
      const zonder = runKernelProjection(metPost(input, doorlopend(input, BEDRAG)), { fireAge })
      const metFalse = runKernelProjection(
        metPost(input, doorlopend(input, BEDRAG, { nominaalVast: false })),
        { fireAge },
      )
      expect(metFalse).toEqual(zonder)
    })

    it('doorlopende bate met vlag: CF!H-extra = het nominale bedrag op s, s+120 en s+240', () => {
      const basis = runKernelProjection(input, { fireAge })
      const vast = runKernelProjection(
        metPost(input, doorlopend(input, BEDRAG, { nominaalVast: true })),
        { fireAge },
      )
      const extra = (m: number) => h(vast.cf[m]) - h(basis.cf[m])
      expect(extra(s - 1)).toBeCloseTo(0, CENT)
      expect(extra(s)).toBeCloseTo(BEDRAG, CENT)
      expect(extra(s + 120)).toBeCloseTo(BEDRAG, CENT)
      expect(extra(s + 240)).toBeCloseTo(BEDRAG, CENT)
    })

    it('doorlopende kost met vlag: Af!D-extra = het nominale bedrag op s, s+120 en s+240', () => {
      const basis = runKernelProjection(input, { fireAge })
      const vast = runKernelProjection(
        metPost(input, doorlopend(input, -BEDRAG, { nominaalVast: true })),
        { fireAge },
      )
      const extra = (m: number) => vast.af[m].totaalAfname - basis.af[m].totaalAfname
      expect(extra(s - 1)).toBeCloseTo(0, CENT)
      expect(extra(s)).toBeCloseTo(BEDRAG, CENT)
      expect(extra(s + 120)).toBeCloseTo(BEDRAG, CENT)
      expect(extra(s + 240)).toBeCloseTo(BEDRAG, CENT)
    })

    it('geïndexeerde post (zonder vlag) groeit ongewijzigd mee met idx(m)', () => {
      const basis = runKernelProjection(input, { fireAge })
      const geind = runKernelProjection(metPost(input, doorlopend(input, BEDRAG)), { fireAge })
      const extra = (m: number) => h(geind.cf[m]) - h(basis.cf[m])
      expect(extra(s)).toBeCloseTo(BEDRAG * idx(s), CENT)
      expect(extra(s + 120)).toBeCloseTo(BEDRAG * idx(s + 120), CENT)
      expect(extra(s + 240)).toBeCloseTo(BEDRAG * idx(s + 240), CENT)
    })

    it('vaste én geïndexeerde post naast elkaar: CF!H = vast + geïndexeerd·idx', () => {
      const basis = runKernelProjection(input, { fireAge })
      const beide = runKernelProjection(
        metPost(
          metPost(input, doorlopend(input, BEDRAG)),
          doorlopend(input, BEDRAG, { nominaalVast: true }),
        ),
        { fireAge },
      )
      const extra = (m: number) => h(beide.cf[m]) - h(basis.cf[m])
      expect(extra(s + 120)).toBeCloseTo(BEDRAG + BEDRAG * idx(s + 120), CENT)
    })
  })

  describe('eigen pensioen "Geïndexeerd = Nee" onder KernelInput.pensioenNominaalVast', () => {
    const BRUTO = 1_500
    const INGANG_JAAR = 15
    const pot: PensioenPot = {
      slot: 5, // laatste slot — botst niet met fixture-potten in lagere slots
      naam: 'Vast pensioen (test)',
      type: 'bedrijf', // → eind-leeftijd 100
      ingangsLeeftijd: input.startLeeftijd + INGANG_JAAR,
      invoermodus: 'bruto',
      brutoPerMaand: BRUTO,
      inlegPot: null,
      duurJaarInvoer: 0,
      geindexeerd: 'Nee',
      partnerUitkeringPct: null,
    }
    const metPensioen = (base: KernelInput, vlag?: boolean): KernelInput => ({
      ...base,
      autoGebeurtenissen: {
        ...base.autoGebeurtenissen,
        pensioenPotten: [
          ...base.autoGebeurtenissen.pensioenPotten.filter((p) => p.slot !== pot.slot),
          pot,
        ],
      },
      ...(vlag === undefined ? {} : { pensioenNominaalVast: vlag }),
    })
    const p = INGANG_JAAR * 12

    it('inert: zonder vlag (of false) blijft het oracle-pad — bedrag gede-indexeerd naar de ingang en daarna centraal geïndexeerd', () => {
      const basis = runKernelProjection(input, { fireAge })
      const zonder = runKernelProjection(metPensioen(input), { fireAge })
      const metFalse = runKernelProjection(metPensioen(input, false), { fireAge })
      expect(metFalse).toEqual(zonder)
      const extra = (m: number) => h(zonder.cf[m]) - h(basis.cf[m])
      const gedeeld = BRUTO / Math.pow(1 + input.inflatie, INGANG_JAAR)
      expect(extra(p)).toBeCloseTo(gedeeld * idx(p), CENT) // ≈ BRUTO op de ingangsmaand
      expect(extra(p + 120)).toBeCloseTo(gedeeld * idx(p + 120), CENT) // groeit (oud gedrag)
    })

    it('met vlag: pensioenbedrag vlak nominaal op ingang, +10 en +20 jaar', () => {
      const basis = runKernelProjection(input, { fireAge })
      const vast = runKernelProjection(metPensioen(input, true), { fireAge })
      const extra = (m: number) => h(vast.cf[m]) - h(basis.cf[m])
      expect(extra(p - 1)).toBeCloseTo(0, CENT)
      expect(extra(p)).toBeCloseTo(BRUTO, CENT)
      expect(extra(p + 120)).toBeCloseTo(BRUTO, CENT)
      expect(extra(p + 240)).toBeCloseTo(BRUTO, CENT)
    })

    it('met vlag raakt een geïndexeerd pensioen ("Ja") niet', () => {
      const ja: PensioenPot = { ...pot, geindexeerd: 'Ja' }
      const mk = (vlag?: boolean): KernelInput => ({
        ...metPensioen(input, vlag),
        autoGebeurtenissen: {
          ...input.autoGebeurtenissen,
          pensioenPotten: [
            ...input.autoGebeurtenissen.pensioenPotten.filter((q) => q.slot !== ja.slot),
            ja,
          ],
        },
      })
      const zonder = runKernelProjection(mk(), { fireAge })
      const met = runKernelProjection(mk(true), { fireAge })
      for (let m = 0; m < zonder.cf.length; m++) {
        if (zonder.cf[m].beyondHorizon) break
        expect(h(met.cf[m])).toBeCloseTo(h(zonder.cf[m]), 6)
      }
    })
  })
}
