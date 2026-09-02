import { describe, it, expect } from 'vitest'
import {
  depletionMonth,
  MAX_TRANSIENT_SPAN_MONTHS,
  MAX_TRANSIENT_SPAN_YEARS,
  type RunwayProjectionView,
} from './runway'

/**
 * `depletionMonth` — de domein-zuivere runway-lezer (ADR 0126, PR B). Synthetische
 * Prognose!J-reeksen, zodat elke rand (bruggetje, AOW-redding, horizon-einde,
 * afronding) exact en zonder engine-run te toetsen is. De engine-integratie
 * (FIRE-maand 0, guardrails-anker) staat in `guardrails-anker-fire-maand-0.test.ts`
 * en de duiding tot `RunwayResult` in lib/horizon/runway.test.ts.
 */

/** Bouw een projectie-zicht uit een J-reeks; `lastInHorizonMonth` default = laatste rij. */
function view(J: readonly number[], lastInHorizonMonth = J.length - 1): RunwayProjectionView {
  return {
    prognose: J.map((j) => ({ beyondHorizon: false, nettoLiquide: j })),
    summary: { lastInHorizonMonth },
  }
}

/** n maanden met waarde v. */
const rep = (v: number, n: number): number[] => Array.from({ length: n }, () => v)

describe('depletionMonth — grondvormen', () => {
  it('J blijft positief tot de horizon → null', () => {
    expect(depletionMonth(view(rep(1000, 120)))).toBeNull()
  })

  it('J ≤ 0 vanaf maand 0 en blijft ≤ 0 → 0 (deficit)', () => {
    expect(depletionMonth(view(rep(-500, 120)))).toBe(0)
  })

  it('J daalt en blijft weg → de eerste uitgeputte maand', () => {
    const J = [...rep(3000, 40), ...rep(-10, 80)]
    expect(depletionMonth(view(J))).toBe(40)
  })

  it('leest niet voorbij lastInHorizonMonth: uitputting die pas erna komt telt niet', () => {
    const J = [...rep(3000, 40), ...rep(-10, 80)]
    expect(depletionMonth(view(J, 39))).toBeNull()
  })

  it('rijen voorbij de horizon (beyondHorizon) tellen niet mee', () => {
    const proj: RunwayProjectionView = {
      prognose: [
        ...rep(3000, 10).map((j) => ({ beyondHorizon: false, nettoLiquide: j })),
        ...Array.from({ length: 5 }, () => ({ beyondHorizon: true })),
      ],
      summary: { lastInHorizonMonth: 9 },
    }
    expect(depletionMonth(proj)).toBeNull()
  })
})

describe('depletionMonth — aanhoud-regel (gedeeld met de tekort-melding)', () => {
  it('de constante is de bestaande kalibratie van de tekort-melding (1 jaar = 12 maanden)', () => {
    expect(MAX_TRANSIENT_SPAN_YEARS).toBe(1)
    expect(MAX_TRANSIENT_SPAN_MONTHS).toBe(12)
  })

  it('HUISVERKOOP-BRUGGETJE: één maand ≤ 0 met herstel erna is geen einde van de runway', () => {
    // liquide op in maand 30, verkoopopbrengst landt in maand 31.
    const J = [...rep(500, 30), -8000, ...rep(150_000, 100)]
    expect(depletionMonth(view(J))).toBeNull()
  })

  it('bruggetje van 12 maanden dat herstelt → geen einde', () => {
    const J = [...rep(500, 30), ...rep(-8000, 12), ...rep(150_000, 100)]
    expect(depletionMonth(view(J))).toBeNull()
  })

  it('RANDGEVAL: span exact MAX_TRANSIENT_SPAN_MONTHS (13 uitgeputte maanden) is nog transient …', () => {
    const J = [...rep(500, 30), ...rep(-8000, MAX_TRANSIENT_SPAN_MONTHS + 1), ...rep(150_000, 100)]
    expect(depletionMonth(view(J))).toBeNull()
  })

  it('… en één maand langer (span 13) is aanhoudend → de eerste maand van de dip', () => {
    const J = [...rep(500, 30), ...rep(-8000, MAX_TRANSIENT_SPAN_MONTHS + 2), ...rep(150_000, 100)]
    expect(depletionMonth(view(J))).toBe(30)
  })

  it('AOW-REDDING: een dip van 30 maanden die later door AOW wordt gered is WÉL een einde ("dan moet je lenen")', () => {
    const J = [...rep(20_000, 60), ...rep(-3000, 30), ...rep(400, 200)]
    expect(depletionMonth(view(J))).toBe(60)
  })

  it('een dip die aan het horizon-einde nog openstaat is aanhoudend, ook als hij kort is', () => {
    // De laatste 3 in-horizon maanden ≤ 0: niet bewezen hersteld ⇒ einde.
    const J = [...rep(20_000, 60), ...rep(-3000, 3)]
    expect(depletionMonth(view(J))).toBe(60)
  })

  it('eerst een bruggetje, later een echte uitputting → de tweede episode', () => {
    const J = [...rep(500, 30), -8000, ...rep(150_000, 100), ...rep(-1, 40)]
    expect(depletionMonth(view(J))).toBe(131)
  })

  it('een bruggetje in maand 0 is geen deficit', () => {
    const J = [-2000, ...rep(50_000, 100)]
    expect(depletionMonth(view(J))).toBeNull()
  })
})

describe('depletionMonth — afronding op hele euro’s', () => {
  it('J = 0,40 rondt naar 0 → uitgeput; J = 0,60 rondt naar 1 → niet', () => {
    expect(depletionMonth(view([...rep(100, 5), ...rep(0.4, 30)]))).toBe(5)
    expect(depletionMonth(view([...rep(100, 5), ...rep(0.6, 30)]))).toBeNull()
  })

  it('J = −0,40 rondt naar −0 en telt als ≤ 0', () => {
    expect(depletionMonth(view([...rep(100, 5), ...rep(-0.4, 30)]))).toBe(5)
  })

  it('exact 0 is uitgeput', () => {
    expect(depletionMonth(view([...rep(100, 5), ...rep(0, 30)]))).toBe(5)
  })
})
