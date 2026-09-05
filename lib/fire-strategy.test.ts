import { describe, it, expect } from 'vitest'
import {
  isAtOrPastAow,
  isFinanciallyFree,
  isRetiredView,
  resolveFreedomFraming,
  resolveFreedomAgeView,
  fireAgeForDisplay,
  type FreedomStateInput,
} from './fire-strategy'
import { HORIZON_PLAFOND_LEEFTIJD } from '@/lib/constants'

/**
 * Tests voor de afgeleide vrijheids-/pensioentoestand — de gedeelde, consume-only
 * vlag die hero, status-banner en AI delen (geen drift). Randgevallen rond
 * freedomPct 99,9/100/100+, currentAge </=/> fireAge, fireAge </=/> aowAge,
 * strategie 'pensioen' en null-leeftijden.
 */

const base: FreedomStateInput = {
  freedomPct: 40,
  currentAge: 40,
  fireAge: 55,
}

describe('isFinanciallyFree', () => {
  it('false bij freedomPct net onder 100 zonder leeftijd-trigger', () => {
    expect(isFinanciallyFree({ ...base, freedomPct: 99.9 })).toBe(false)
  })

  it('true bij freedomPct exact 100', () => {
    expect(isFinanciallyFree({ ...base, freedomPct: 100 })).toBe(true)
  })

  it('true bij freedomPct boven 100', () => {
    expect(isFinanciallyFree({ ...base, freedomPct: 150 })).toBe(true)
  })

  it('true wanneer currentAge gelijk aan fireAge', () => {
    expect(isFinanciallyFree({ freedomPct: 50, currentAge: 55, fireAge: 55 })).toBe(true)
  })

  it('true wanneer currentAge voorbij fireAge', () => {
    expect(isFinanciallyFree({ freedomPct: 10, currentAge: 60, fireAge: 55 })).toBe(true)
  })

  it('false wanneer currentAge vóór fireAge en lage freedomPct', () => {
    expect(isFinanciallyFree({ freedomPct: 30, currentAge: 40, fireAge: 55 })).toBe(false)
  })

  // WF-CANON-03: fireAge is een DREMPEL, dus de callers geven de FRACTIONELE
  // vrijheidsleeftijd door. Voor elke fractie in (currentAge, currentAge+0,5)
  // rondde Math.round OMLAAG naar currentAge, waardoor deze vlag tot 6 maanden
  // vóór de daadwerkelijke FIRE-maand omsloeg naar "vrij".
  it('false bij een fractionele fireAge die nog nét niet bereikt is', () => {
    expect(isFinanciallyFree({ freedomPct: 99.4, currentAge: 45, fireAge: 45.3 })).toBe(false)
    // Het afgeronde equivalent geeft hier ten onrechte true — regressie-slot.
    expect(isFinanciallyFree({ freedomPct: 99.4, currentAge: 45, fireAge: Math.round(45.3) })).toBe(true)
  })

  it('true zodra de fractionele fireAge is gepasseerd', () => {
    expect(isFinanciallyFree({ freedomPct: 99.4, currentAge: 46, fireAge: 45.3 })).toBe(true)
  })

  it('false bij freedomPct null en ontbrekende leeftijden', () => {
    expect(isFinanciallyFree({ freedomPct: null, currentAge: null, fireAge: null })).toBe(false)
  })

  it('false bij niet-finite freedomPct', () => {
    expect(isFinanciallyFree({ freedomPct: NaN, currentAge: null, fireAge: null })).toBe(false)
  })
})

describe('isRetiredView', () => {
  it('true zodra financieel vrij (subsumeert)', () => {
    expect(isRetiredView({ ...base, freedomPct: 100 })).toBe(true)
  })

  it('true bij pensioen-strategie voorbij AOW (currentAge ≥ aowAge)', () => {
    expect(
      isRetiredView({ freedomPct: 20, currentAge: 68, fireAge: 67, strategy: 'pensioen', aowAge: 67 }),
    ).toBe(true)
  })

  it('valt terug op fireAge als AOW-drempel wanneer aowAge ontbreekt', () => {
    expect(
      isRetiredView({ freedomPct: 20, currentAge: 67, fireAge: 67, strategy: 'pensioen' }),
    ).toBe(true)
  })

  it('false bij pensioen-strategie vóór AOW en niet vrij', () => {
    expect(
      isRetiredView({ freedomPct: 30, currentAge: 50, fireAge: 67, strategy: 'pensioen', aowAge: 67 }),
    ).toBe(false)
  })

  it('false bij niet-pensioen-strategie en niet vrij', () => {
    expect(isRetiredView({ freedomPct: 30, currentAge: 40, fireAge: 55, strategy: 'deplete' })).toBe(false)
  })
})

describe('resolveFreedomFraming', () => {
  it("'building' wanneer nog niet vrij", () => {
    expect(resolveFreedomFraming({ freedomPct: 40, currentAge: 40, fireAge: 55 })).toBe('building')
  })

  it("'free' bij vervroegde vrijheid (vrij vóór AOW)", () => {
    expect(
      resolveFreedomFraming({ freedomPct: 100, currentAge: 45, fireAge: 45, strategy: 'deplete', aowAge: 67 }),
    ).toBe('free')
  })

  // ADR 0129 D8 — 'pensioen' is geen framing meer maar een ANKER (aow) en een
  // woordkeuze (`isAtOrPastAow`). De gate levert 'free'; de woordkeuze ernaast.
  it("legacy 'pensioen' op/voorbij AOW met dekking 100 → 'free' + pensioen-woordkeuze", () => {
    const input = { freedomPct: 100, currentAge: 67, fireAge: 67, strategy: 'pensioen' as const }
    expect(resolveFreedomFraming(input)).toBe('free')
    expect(isAtOrPastAow(input)).toBe(true)
  })

  it("'free' + pensioen-woordkeuze wanneer huidige leeftijd op/voorbij AOW (solved, leeftijd voorbij FIRE)", () => {
    const input = { freedomPct: 20, currentAge: 68, fireAge: 60, strategy: 'deplete' as const, aowAge: 67 }
    expect(resolveFreedomFraming(input)).toBe('free')
    expect(isAtOrPastAow(input)).toBe(true)
  })

  it("'free' + pensioen-woordkeuze wanneer vrijheidsleeftijd op/voorbij AOW", () => {
    const input = { freedomPct: 100, currentAge: 70, fireAge: 67, strategy: 'deplete' as const, aowAge: 67 }
    expect(resolveFreedomFraming(input)).toBe('free')
    expect(isAtOrPastAow(input)).toBe(true)
  })

  it("'free' wanneer vrij maar vóór AOW zonder pensioen-strategie", () => {
    expect(
      resolveFreedomFraming({ freedomPct: 100, currentAge: 50, fireAge: 50, strategy: 'perpetual', aowAge: 67 }),
    ).toBe('free')
  })
})

describe('fireAgeForDisplay', () => {
  it('rondt af op hele jaren', () => {
    expect(fireAgeForDisplay(45.3)).toBe(45)
    expect(fireAgeForDisplay(44.5)).toBe(45)
    expect(fireAgeForDisplay(44.49)).toBe(44)
  })

  it('geeft null bij ontbrekende of niet-finite invoer', () => {
    expect(fireAgeForDisplay(null)).toBeNull()
    expect(fireAgeForDisplay(undefined)).toBeNull()
    expect(fireAgeForDisplay(NaN)).toBeNull()
  })
})

/**
 * WF-CANON-03 — de seam die drempel en weergave uit elkaar houdt.
 *
 * De eerdere fix leefde in de AANROEPER (overzicht-secondary-loader) en was
 * daardoor onbewaakt: de bug opnieuw introduceren liet alle suites groen. Deze
 * tests toetsen de seam zelf, zodat afronden vóór de drempelvergelijking wél
 * rood wordt.
 */
describe('resolveFreedomAgeView (seam: drempel vs. weergave)', () => {
  // DE BIJTENDE TEST. 45,3 rondt af naar 45; met currentAge 45 zou een
  // afgeronde drempel `45 >= 45` waar maken en de framing naar 'free' trekken —
  // tot zes maanden vóór de daadwerkelijke FIRE-maand. Wie in deze helper vóór
  // de drempel afrondt, maakt deze test rood.
  it('rondt af voor WEERGAVE maar toetst de DREMPEL fractioneel', () => {
    const view = resolveFreedomAgeView({
      fireAgeFractional: 45.3,
      freedomPct: 99.4,
      currentAge: 45,
      strategy: 'deplete',
    })
    expect(view.fireAgeDisplay).toBe(45)
    expect(view.framing).toBe('building')
    // Contrast: mét afronding vóór de drempel zou exact dit scenario 'free' zijn.
    expect(
      resolveFreedomFraming({ freedomPct: 99.4, currentAge: 45, fireAge: 45, strategy: 'deplete' }),
    ).toBe('free')
  })

  it("slaat om naar 'free' zodra de fractionele leeftijd echt is gepasseerd", () => {
    const view = resolveFreedomAgeView({
      fireAgeFractional: 45.3,
      freedomPct: 99.4,
      currentAge: 46,
      strategy: 'deplete',
      aowAge: 67,
    })
    expect(view.framing).toBe('free')
    expect(view.fireAgeDisplay).toBe(45)
  })

  it("geeft strategie en AOW door aan de framing (legacy 'pensioen' ⇒ anker aow, 'free')", () => {
    const view = resolveFreedomAgeView({
      fireAgeFractional: 67.2,
      freedomPct: 100,
      currentAge: 68,
      strategy: 'pensioen',
      aowAge: 67,
    })
    expect(view.framing).toBe('free')
    expect(view.anchor).toEqual({ kind: 'aow' })
    expect(view.fireAgeDisplay).toBe(67)
  })

  it("null-projectie: geen weergave-leeftijd, framing blijft 'building'", () => {
    const view = resolveFreedomAgeView({
      fireAgeFractional: null,
      freedomPct: 40,
      currentAge: 40,
    })
    expect(view.fireAgeDisplay).toBeNull()
    expect(view.framing).toBe('building')
  })

  it('freedomPct ≥ 100 blijft vrij, ongeacht de leeftijd-drempel', () => {
    const view = resolveFreedomAgeView({
      fireAgeFractional: 55.8,
      freedomPct: 100,
      currentAge: 45,
      strategy: 'deplete',
      aowAge: 67,
    })
    expect(view.framing).toBe('free')
    expect(view.fireAgeDisplay).toBe(56)
  })
})

describe('resolveFreedomAgeView / fireAgeForDisplay — M6-vangrail', () => {
  // Bevinding M6: de kernel parkeert de FIRE-leeftijd op het horizonplafond
  // wanneer er geen vrijheidsmoment is. /overzicht toonde dat getal ("nog 65
  // jaar") als gewoon resultaat. Eén guard, gedeeld met de /toekomst-hero.
  it('toont de parkeerstand op het horizonplafond niet als vrijheidsleeftijd', () => {
    expect(fireAgeForDisplay(HORIZON_PLAFOND_LEEFTIJD)).toBeNull()
    expect(fireAgeForDisplay(HORIZON_PLAFOND_LEEFTIJD + 12)).toBeNull()
  })

  it('een gewone leeftijd blijft gewoon afgerond', () => {
    expect(fireAgeForDisplay(52.6)).toBe(53)
    expect(fireAgeForDisplay(HORIZON_PLAFOND_LEEFTIJD - 0.5)).toBe(HORIZON_PLAFOND_LEEFTIJD)
  })

  it('meldt het probleem via dataIssue i.p.v. het stil weg te laten', () => {
    const view = resolveFreedomAgeView({
      fireAgeFractional: HORIZON_PLAFOND_LEEFTIJD,
      freedomPct: 12,
      currentAge: 36,
      strategy: 'perpetual',
    })
    expect(view.dataIssue).toBe(true)
    expect(view.fireAgeDisplay).toBeNull()
  })

  it('een onmogelijke leeftijd voedt de DREMPEL niet (geen valse framing)', () => {
    const view = resolveFreedomAgeView({
      fireAgeFractional: HORIZON_PLAFOND_LEEFTIJD,
      freedomPct: 12,
      currentAge: 101,
      strategy: 'perpetual',
    })
    // Zonder de guard zou `101 >= 100` hier 'free'/'pensioen' opleveren.
    expect(view.framing).toBe('building')
  })

  it('een normale uitkomst zet dataIssue niet', () => {
    const view = resolveFreedomAgeView({
      fireAgeFractional: 52.4,
      freedomPct: 60,
      currentAge: 40,
      strategy: 'deplete',
    })
    expect(view.dataIssue).toBe(false)
    expect(view.fireAgeDisplay).toBe(52)
  })
})
