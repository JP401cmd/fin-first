import { describe, it, expect } from 'vitest'
import {
  isAnchorReached,
  isAtOrPastAow,
  isFinanciallyFree,
  isFixedAnchor,
  isRetiredView,
  legacyAnchorOf,
  resolveFirePlanWithOverride,
  resolveFreedomAgeView,
  resolveFreedomAnchor,
  resolveFreedomFraming,
  stopAnchorFromKernel,
} from './fire-strategy'

/**
 * ADR 0129 D8/B3 (F3a) — `isFinanciallyFree` is een GATE, geen los cijfer.
 *
 * Onder een vast anker (aow/now/age) geldt: vrij ⇔ anker bereikt ∧ dekking ≥ 100.
 * De drie gevallen uit de F3a-opdracht:
 *  1. 30-jarige op `aow` met dekking 100 ⇒ NIET vrij (het anker ligt decennia weg);
 *  2. 42-jarige op `now` met dekking 100 ⇒ vrij (het nu-anker is per definitie bereikt);
 *  3. `age 30` in het verleden op 42 met dekking 40 ⇒ niet vrij — vóór F3a zei
 *     /overzicht hier "je bent vrij" omdat `currentAge ≥ fireAge` triviaal waar was
 *     (Fable-H1-exposure).
 */
describe('isFinanciallyFree — de D8-gate onder een vast anker', () => {
  it('1. 30-jarige op het aow-anker met dekking 100 is NIET vrij', () => {
    const input = { freedomPct: 100, currentAge: 30, fireAge: 67, anchor: { kind: 'aow' as const }, aowAge: 67 }
    expect(isFinanciallyFree(input)).toBe(false)
    expect(resolveFreedomFraming(input)).toBe('anchored')
    // …en wél zodra de AOW is bereikt.
    expect(isFinanciallyFree({ ...input, currentAge: 67 })).toBe(true)
    expect(resolveFreedomFraming({ ...input, currentAge: 67 })).toBe('free')
  })

  it('2. 42-jarige op het now-anker met dekking 100 is vrij', () => {
    const input = { freedomPct: 100, currentAge: 42, fireAge: 42, anchor: { kind: 'now' as const } }
    expect(isFinanciallyFree(input)).toBe(true)
    expect(resolveFreedomFraming(input)).toBe('free')
  })

  it('3. age-anker 30 in het verleden, 42 jaar, dekking 40 ⇒ NIET vrij (de leeftijd-trigger telt niet)', () => {
    const input = { freedomPct: 40, currentAge: 42, fireAge: 30, anchor: { kind: 'age' as const, age: 30 } }
    expect(isAnchorReached(input, input.anchor)).toBe(true)
    expect(isFinanciallyFree(input)).toBe(false)
    expect(resolveFreedomFraming(input)).toBe('anchored')
    // Dezelfde invoer onder `solved` sloeg vóór F3a wél om — dat blijft het solved-gedrag.
    expect(isFinanciallyFree({ ...input, anchor: { kind: 'solved' } })).toBe(true)
  })

  it('age-anker in de toekomst met dekking 100 ⇒ niet vrij tot het moment is bereikt (58,5 blijft 58,5)', () => {
    const anchor = { kind: 'age' as const, age: 58.5 }
    expect(isFinanciallyFree({ freedomPct: 100, currentAge: 58, fireAge: 58.5, anchor })).toBe(false)
    expect(isFinanciallyFree({ freedomPct: 100, currentAge: 58.5, fireAge: 58.5, anchor })).toBe(true)
  })

  it('dekking net onder 100 verklaart nooit vrij, ook niet op een bereikt anker', () => {
    expect(isFinanciallyFree({ freedomPct: 99.9, currentAge: 70, fireAge: 67, anchor: { kind: 'aow' }, aowAge: 67 })).toBe(false)
  })

  it('zonder leeftijd is een aow-/age-anker nooit "bereikt"', () => {
    expect(isFinanciallyFree({ freedomPct: 100, currentAge: null, fireAge: 67, anchor: { kind: 'aow' }, aowAge: 67 })).toBe(false)
    expect(isFinanciallyFree({ freedomPct: 100, currentAge: null, fireAge: null, anchor: { kind: 'age', age: 58 } })).toBe(false)
  })

  it('het aow-anker valt zonder aowAge terug op fireAge als drempel (onder dit anker ≡ AOW)', () => {
    expect(isAnchorReached({ freedomPct: 100, currentAge: 67, fireAge: 67 }, { kind: 'aow' })).toBe(true)
    expect(isAnchorReached({ freedomPct: 100, currentAge: 66, fireAge: 67 }, { kind: 'aow' })).toBe(false)
  })
})

describe('resolveFreedomAnchor — anker wint; legacy-label is de terugval (D2)', () => {
  it('expliciet anker wint van een tegenstrijdige legacy-label', () => {
    expect(resolveFreedomAnchor({ anchor: { kind: 'age', age: 58 }, strategy: 'pensioen' })).toEqual({ kind: 'age', age: 58 })
  })
  it('zonder anker vertaalt de legacy-label via legacyAnchorOf', () => {
    expect(resolveFreedomAnchor({ strategy: 'pensioen' })).toEqual({ kind: 'aow' })
    expect(resolveFreedomAnchor({ strategy: 'nu-stoppen' })).toEqual({ kind: 'now' })
    expect(resolveFreedomAnchor({ strategy: 'deplete' })).toEqual({ kind: 'solved' })
    expect(resolveFreedomAnchor({})).toEqual({ kind: 'solved' })
    expect(legacyAnchorOf('legacy')).toBeNull()
  })
})

describe('resolveFreedomFraming — building | free | anchored', () => {
  it("solved + nog op weg ⇒ 'building'; vast anker + nog niet vrij ⇒ 'anchored'", () => {
    expect(resolveFreedomFraming({ freedomPct: 40, currentAge: 40, fireAge: 55 })).toBe('building')
    expect(resolveFreedomFraming({ freedomPct: 40, currentAge: 40, fireAge: 67, anchor: { kind: 'aow' } })).toBe('anchored')
    expect(resolveFreedomFraming({ freedomPct: 60, currentAge: 40, fireAge: 40, anchor: { kind: 'now' } })).toBe('anchored')
  })

  it('resolveFreedomAgeView draagt het anker mee voor de woordkeuze', () => {
    const view = resolveFreedomAgeView({ fireAgeFractional: 67.2, freedomPct: 100, currentAge: 68, anchor: { kind: 'aow' }, aowAge: 67 })
    expect(view.framing).toBe('free')
    expect(view.anchor).toEqual({ kind: 'aow' })
    expect(isAtOrPastAow({ freedomPct: 100, currentAge: 68, fireAge: 67.2, anchor: { kind: 'aow' }, aowAge: 67 })).toBe(true)
  })

  it('isRetiredView: aow-anker bereikt telt ook bij een tekort als onttrekkingsbeeld', () => {
    expect(isRetiredView({ freedomPct: 40, currentAge: 68, fireAge: 67, anchor: { kind: 'aow' }, aowAge: 67 })).toBe(true)
    expect(isRetiredView({ freedomPct: 40, currentAge: 60, fireAge: 67, anchor: { kind: 'aow' }, aowAge: 67 })).toBe(false)
  })
})

describe('stopAnchorFromKernel / resolveFirePlanWithOverride — één mapping-home', () => {
  it('kernel-echo → app-anker', () => {
    expect(stopAnchorFromKernel(null)).toEqual({ kind: 'solved' })
    expect(stopAnchorFromKernel(undefined)).toEqual({ kind: 'solved' })
    expect(stopAnchorFromKernel({ soort: 'aow' })).toEqual({ kind: 'aow' })
    expect(stopAnchorFromKernel({ soort: 'nu' })).toEqual({ kind: 'now' })
    expect(stopAnchorFromKernel({ soort: 'leeftijd', leeftijd: 58.5 })).toEqual({ kind: 'age', age: 58.5 })
  })

  it('het schaduwpad (feature_preferences.fire_strategy_override = pensioen) levert het aow-anker', () => {
    const plan = resolveFirePlanWithOverride({
      fire_end_strategy: 'deplete',
      feature_preferences: { fire_strategy_override: 'pensioen' },
    })
    expect(plan.anchor).toEqual({ kind: 'aow' })
    expect(isFixedAnchor(plan)).toBe(true)
  })

  it('de nieuwe kolom zonder legacy-label', () => {
    expect(resolveFirePlanWithOverride({ fire_end_strategy: 'legacy', fire_stop_anchor: 'age', fire_stop_age: 58.5 }).anchor).toEqual({ kind: 'age', age: 58.5 })
    expect(isFixedAnchor({ anchor: { kind: 'solved' } })).toBe(false)
  })
})
