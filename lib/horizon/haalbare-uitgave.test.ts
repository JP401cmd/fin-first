import { describe, it, expect } from 'vitest'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import {
  buildConvergentieAdapterProfile,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { buildKernelInputFromApp } from '@/lib/horizon-kernel/adapter'
import { solveFire } from '@/lib/horizon-kernel/solver'
import { solveHaalbareUitgave, HAALBARE_UITGAVE_DREMPEL } from './haalbare-uitgave'

const SHORTFALL = new Set(['anchor_shortfall', 'stop_now_shortfall', 'pension_shortfall'])

/** Context op de persona "compleet": leeftijd, vast stopmoment, jaarlijkse pensioenuitgave. */
function ctx(age: number, stop: number | null, essentieel: number) {
  const fx = buildCompleetHorizonFixture(age)
  const profile: ConvergentieRawProfileRow = {
    ...buildCompleetKernelProfileBase(age),
    yearly_essential_expenses: essentieel,
    retirement_expense_method: 'essential_budgets',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    fire_legacy_amount: 0,
    housing_strategy_config: { mode: 'include_full' },
    ...(stop == null
      ? { fire_stop_anchor: 'solved' as const }
      : { fire_stop_anchor: 'age' as const, fire_stop_age: stop }),
  }
  return { profile, assets: fx.assets, debts: fx.debts, lifeEvents: fx.lifeEvents, aowRows: [] }
}

/** Draait de kern met een vaste uitgave na pensioen en zegt of het plan dekt. */
function dektBij(c: ReturnType<typeof ctx>, bedrag: number): boolean {
  const input = buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile({
      ...c.profile,
      retirement_expense_method: 'custom_amount',
      retirement_expense_custom_amount: bedrag,
    }),
    assets: c.assets,
    debts: c.debts,
    lifeEvents: c.lifeEvents,
    aowRows: c.aowRows,
  })
  return !SHORTFALL.has(solveFire(input).status)
}

describe('solveHaalbareUitgave', () => {
  it('vindt bij een tekort een LAGERE uitgave die wel dekt, en € 600 hoger dekt niet', () => {
    // Stoppen op 50 met € 100.000/jr pensioenuitgave is voor deze persona een tekort
    // (gemeten 15 sep 2026 in lab-antwoorden.kernel.test.ts: 77,1% dekking).
    const c = ctx(42, 50, 100_000)
    const h = solveHaalbareUitgave(c)
    expect(h).not.toBeNull()
    expect(h!.richting).toBe('minder')
    expect(h!.perJaar).toBeLessThan(h!.huidigPerJaar)
    expect(h!.eindleeftijd).toBe(90)
    // De eigenschap die het getal draagt — geen magisch bedrag.
    expect(dektBij(c, h!.perJaar)).toBe(true)
    expect(dektBij(c, h!.perJaar + 600)).toBe(false)
  })

  it('vindt bij een overschot een HOGERE uitgave', () => {
    // Ruim doorwerken met een lage pensioenuitgave ⇒ er blijft over.
    const c = ctx(42, 62, 24_000)
    const h = solveHaalbareUitgave(c)
    expect(h).not.toBeNull()
    expect(h!.richting).toBe('meer')
    expect(h!.perJaar).toBeGreaterThan(h!.huidigPerJaar)
    expect(dektBij(c, h!.perJaar)).toBe(true)
  })

  it('geeft null zonder vast stopmoment', () => {
    expect(solveHaalbareUitgave(ctx(42, null, 100_000))).toBeNull()
  })

  it('geeft null wanneer het plan ook zonder pensioenuitgaven niet dekt', () => {
    // Stoppen op de huidige leeftijd: het tekort zit vóór het stopmoment, niet erna.
    const c = ctx(42, 42, 100_000)
    const h = solveHaalbareUitgave(c)
    if (h !== null) expect(dektBij(c, 0)).toBe(true) // anders had hij null moeten geven
  })

  it('noemt een verschil onder de drempel "gelijk"', () => {
    const c = ctx(42, 50, 100_000)
    const h = solveHaalbareUitgave(c)!
    // Zet de huidige uitgave gelijk aan het gevonden bedrag: dan is het verschil ~0.
    const gelijk = solveHaalbareUitgave({
      ...c,
      profile: {
        ...c.profile,
        retirement_expense_method: 'custom_amount',
        retirement_expense_custom_amount: h.perJaar,
      },
    })!
    expect(Math.abs(gelijk.perJaar - gelijk.huidigPerJaar)).toBeLessThan(HAALBARE_UITGAVE_DREMPEL)
    expect(gelijk.richting).toBe('gelijk')
  })
})
