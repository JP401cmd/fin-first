import { describe, it, expect } from 'vitest'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import { buildKernelInputFromApp } from './adapter'
import { buildConvergentieAdapterProfile, type ConvergentieRawProfileRow } from './convergentie-router'
import { resolveMargeAnker } from './rendement-marge'

/**
 * ADR 0129 D3 (bevinding 5) — de rendement-marge ankert op het VASTE stopmoment van
 * het plan, en een sliderwaarde wint daar niet van.
 *
 * Vóór dit besluit gold die bescherming alleen voor 'Nu stoppen' (ADR 0127 D6): onder
 * de pensioen-strategie overschreef de stop-slider het anker, waardoor de marge een
 * ánder plan doorrekende dan de hoofdlijn die er pal naast stond. De slider is een
 * VERKENNING; het anker is het plan.
 *
 * De `aow`-terugval zonder anker blijft ongewijzigd: geen vast anker + geen sliderwaarde
 * ⇒ de AOW-leeftijd, met hetzelfde `'aow'`-label (de copy zegt in beide gevallen
 * "op je AOW-leeftijd").
 */

const PINNED_AGE = 42
const AOW_FALLBACK = 67
const fx = buildCompleetHorizonFixture(PINNED_AGE)
const base = buildCompleetKernelProfileBase(PINNED_AGE)

function input(over: Partial<ConvergentieRawProfileRow>) {
  return buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile({
      ...base,
      fire_end_strategy: 'deplete',
      fire_end_age: 90,
      fire_legacy_amount: 0,
      housing_strategy_config: { mode: 'include_full' },
      ...over,
    }),
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
  })
}

describe('resolveMargeAnker — een VAST stopmoment wint van de slider (D3, bevinding 5)', () => {
  it('nu-anker: startleeftijd, ook mét sliderwaarde', () => {
    expect(resolveMargeAnker(input({ fire_stop_anchor: 'now' }), null)).toEqual({
      leeftijd: PINNED_AGE,
      anker: 'nu',
    })
    expect(resolveMargeAnker(input({ fire_stop_anchor: 'now' }), 55)).toEqual({
      leeftijd: PINNED_AGE,
      anker: 'nu',
    })
  })

  it('aow-anker: de AOW-leeftijd, ook mét sliderwaarde (dít was bevinding 5)', () => {
    expect(resolveMargeAnker(input({ fire_stop_anchor: 'aow' }), null)).toEqual({
      leeftijd: AOW_FALLBACK,
      anker: 'aow',
    })
    expect(resolveMargeAnker(input({ fire_stop_anchor: 'aow' }), 55)).toEqual({
      leeftijd: AOW_FALLBACK,
      anker: 'aow',
    })
  })

  it('leeftijd-anker: de gekozen stopleeftijd, ook mét sliderwaarde', () => {
    const plan = { fire_stop_anchor: 'age', fire_stop_age: 58.5 }
    expect(resolveMargeAnker(input(plan), null)).toEqual({ leeftijd: 58.5, anker: 'anker' })
    expect(resolveMargeAnker(input(plan), 70)).toEqual({ leeftijd: 58.5, anker: 'anker' })
  })

  it('de legacy-rijvormen leveren hetzelfde anker (tegenspraak-regel D2)', () => {
    expect(resolveMargeAnker(input({ fire_end_strategy: 'nu-stoppen' }), 55)?.anker).toBe('nu')
    expect(resolveMargeAnker(input({ fire_end_strategy: 'pensioen' }), 55)?.leeftijd).toBe(
      AOW_FALLBACK,
    )
  })

  it('degenereert (null) wanneer het anker niet vóór de eindleeftijd ligt', () => {
    expect(
      resolveMargeAnker(input({ fire_stop_anchor: 'now', fire_end_age: PINNED_AGE }), null),
    ).toBeNull()
    // AOW-anker met een eindleeftijd ónder de AOW: geen onttrekkingsfase om te toetsen.
    expect(
      resolveMargeAnker(input({ fire_stop_anchor: 'aow', fire_end_age: 60 }), null),
    ).toBeNull()
  })

  it('ZONDER vast anker is het gedrag ongewijzigd: stopkeuze wint, anders AOW-terugval', () => {
    const solved = input({})
    expect(resolveMargeAnker(solved, null)?.anker).toBe('aow')
    expect(resolveMargeAnker(solved, 55)).toEqual({ leeftijd: 55, anker: 'stopkeuze' })
  })
})
