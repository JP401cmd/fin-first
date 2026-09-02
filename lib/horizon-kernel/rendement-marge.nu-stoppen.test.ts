import { describe, it, expect } from 'vitest'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import { buildKernelInputFromApp } from './adapter'
import { buildConvergentieAdapterProfile, type ConvergentieRawProfileRow } from './convergentie-router'
import { resolveMargeAnker } from './rendement-marge'

/**
 * ADR 0127 D6 — de rendement-marge ankert bij eindstrategie 'Nu stoppen' op de
 * STARTLEEFTIJD. Zonder deze tak viel `resolveMargeAnker` terug op de AOW-leeftijd
 * (of een meegegeven stopkeuze) en rekende de marge een ánder plan door dan de
 * hoofdlijn — die bij 'nu' op maand 0 stopt.
 */

const PINNED_AGE = 42
const fx = buildCompleetHorizonFixture(PINNED_AGE)
const base = buildCompleetKernelProfileBase(PINNED_AGE)

function input(over: Partial<ConvergentieRawProfileRow>) {
  return buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile({ ...base, fire_end_age: 90, fire_legacy_amount: 0, housing_strategy_config: { mode: 'include_full' }, ...over }),
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
  })
}

describe("resolveMargeAnker — 'nu'", () => {
  it('ankert op de startleeftijd met anker "nu", ook zonder stopkeuze (geen AOW-terugval)', () => {
    const anker = resolveMargeAnker(input({ fire_end_strategy: 'nu-stoppen' }), null)
    expect(anker).toEqual({ leeftijd: PINNED_AGE, anker: 'nu' })
  })

  it('een meegegeven stopkeuze wint NIET: het plan stopt vandaag', () => {
    const anker = resolveMargeAnker(input({ fire_end_strategy: 'nu-stoppen' }), 55)
    expect(anker).toEqual({ leeftijd: PINNED_AGE, anker: 'nu' })
  })

  it('degenereert (null) wanneer de eindleeftijd niet ná de startleeftijd ligt', () => {
    const anker = resolveMargeAnker(input({ fire_end_strategy: 'nu-stoppen', fire_end_age: PINNED_AGE }), null)
    expect(anker).toBeNull()
  })

  it('de bestaande ankers zijn ongewijzigd: deplete zonder stopkeuze → AOW, met stopkeuze → stopkeuze', () => {
    const deplete = input({ fire_end_strategy: 'deplete' })
    expect(resolveMargeAnker(deplete, null)?.anker).toBe('aow')
    expect(resolveMargeAnker(deplete, 55)).toEqual({ leeftijd: 55, anker: 'stopkeuze' })
  })
})
