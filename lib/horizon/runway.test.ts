import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import type {
  ConvergentieRawContext,
  ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { depletionMonth } from '@/lib/horizon-kernel/runway'
import { startNettoLiquide } from '@/lib/horizon-kernel/jaarrand'
import { bridgeForcedStop, buildForcedStopSolve } from './scenario-presets'
import {
  computeRunwayFromRawContext,
  computeRunwayFromSolve,
  resolveRetirementExpenseMethod,
  type RunwayResult,
} from './runway'

/**
 * De "stop nu"-runway (ADR 0126, PR B) end-to-end op de compleet-persona: adapter →
 * `evaluateFireAt` op FIRE-maand 0 (engine ankert guardrails op T0) → bridge
 * (`kernelDepletionMonth`) → `RunwayResult`. Geen verwachte getallen uit een eigen
 * som: de asserties zijn structureel (contract, D3-grondslag, D7-invariant,
 * degradatie-redenen, doorgeven-niet-herrekenen).
 */

const PINNED_AGE = 42
const fx = buildCompleetHorizonFixture(PINNED_AGE)

/** Deplete-profiel: de eindstrategie waarvoor D7 geldt. */
const depleteProfile: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(PINNED_AGE),
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  housing_strategy_config: { mode: 'include_full' },
}

function ctx(over: Partial<ConvergentieRawContext> = {}): ConvergentieRawContext {
  return {
    profile: depleteProfile,
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
    yearlyExpenses: 30_000,
    ...over,
  }
}

/** Schaal alle bezittingen (rijk/arm) zonder de rest van het plan te raken. */
const scaleAssets = (factor: number): Asset[] =>
  fx.assets.map((a) => ({ ...a, current_value: a.current_value * factor }) as Asset)

const KINDS: RunwayResult['kind'][] = ['months', 'reaches-end-age', 'beyond-horizon', 'deficit', 'unavailable']

/** De motor + bridge zoals `computeRunwayFromRawContext` ze draait — voor de consistentie-toetsen. */
function stopNu(c: ConvergentieRawContext) {
  const run = buildForcedStopSolve({ ...c, stopAge: 'nu', endStrategy: 'inherit' })
  return { ...run, bridged: bridgeForcedStop(run, c) }
}

describe('computeRunwayFromRawContext — contract en D3-grondslag', () => {
  const r = computeRunwayFromRawContext(ctx())

  it('levert een van de vijf gevallen', () => {
    expect(KINDS).toContain(r.kind)
  })

  it('D3: expenseBasis komt uit de kernel-INVOER (uitgaveNaPensioenPerJaar), niet uit een eigen som', () => {
    expect(r.kind).not.toBe('unavailable')
    if (r.kind === 'unavailable') return
    const { kernelInput } = stopNu(ctx())
    expect(r.expenseBasis.yearly).toBe(kernelInput.inkomenUitgaven.uitgaveNaPensioenPerJaar)
    // De persona: essential_budgets met €48.000 essentiële jaaruitgaven.
    expect(r.expenseBasis.yearly).toBe(48_000)
    expect(r.expenseBasis.method).toBe('essential_budgets')
  })

  it('de run staat op FIRE-maand 0, de engine ankert op T0 en de eigen eindstrategie wordt geërfd', () => {
    const { kernelInput, solve, stopAge } = stopNu(ctx())
    expect(stopAge).toBe(kernelInput.startLeeftijd)
    expect(solve.projection.summary.fireMonth).toBe(0)
    expect(solve.projection.summary.guardrailsAnker).toBe(Math.max(0, startNettoLiquide(kernelInput)))
    expect(solve.eindleeftijd).toBe(90)
    if (r.kind === 'months' || r.kind === 'reaches-end-age') expect(r.endAge).toBe(90)
  })

  it('DOORGEVEN, NIET HERREKENEN: de duiding leest het bridge-veld, en dat is de lezer op dezelfde projectie', () => {
    const { kernelInput, solve, bridged } = stopNu(ctx())
    expect(bridged.depletionMonth).toBe(depletionMonth(solve.projection))
    const via = computeRunwayFromSolve(kernelInput, solve, bridged.depletionMonth, 'essential_budgets')
    expect(via).toEqual(r)
    if (via.kind === 'months') {
      expect(via.months).toBe(bridged.depletionMonth)
      expect(via.depletionAge).toBe(kernelInput.startLeeftijd + (bridged.depletionMonth as number) / 12)
    }
    if (via.kind === 'beyond-horizon') expect(bridged.depletionMonth).toBeNull()
    if (via.kind === 'deficit') expect(bridged.depletionMonth).toBe(0)
  })
})

describe('D7 — deplete: runway reikt tot de eindleeftijd ⇒ solver reached_now', () => {
  it('rijke gebruiker (bezittingen ×20): J blijft positief tot de eindleeftijd en de solver zegt reached_now', () => {
    const r = computeRunwayFromRawContext(ctx({ assets: scaleAssets(20) }))
    expect(['reaches-end-age', 'beyond-horizon']).toContain(r.kind)
    if (r.kind === 'reaches-end-age' || r.kind === 'beyond-horizon') {
      expect(r.solverStatus).toBe('reached_now')
    }
  })

  it('arme gebruiker (bezittingen ×0,25, geen schulden): runway in maanden, uitputting tussen nu en de eindleeftijd, solver niet reached_now', () => {
    // Zonder schulden staat J(0) zeker > 0 (anders is het terecht 'deficit', zie de
    // degradatie-suite); met een kwart van de bezittingen en €48.000/jaar raakt het
    // liquide vermogen vóór de eindleeftijd op.
    const r = computeRunwayFromRawContext(ctx({ assets: scaleAssets(0.25), debts: [] }))
    expect(r.kind).toBe('months')
    if (r.kind !== 'months') return
    expect(r.months).toBeGreaterThan(0)
    expect(r.depletionAge).toBeGreaterThan(PINNED_AGE)
    expect(r.depletionAge).toBeLessThan(r.endAge)
    expect(r.endAge).toBe(90)
    expect(r.solverStatus).toBe('unreachable_within_horizon')
  })

  it('de invariant is één richting: elke deplete-run met reaches-end-age/beyond-horizon draagt reached_now', () => {
    for (const factor of [1, 2, 5, 20]) {
      const r = computeRunwayFromRawContext(ctx({ assets: scaleAssets(factor) }))
      if (r.kind === 'reaches-end-age' || r.kind === 'beyond-horizon') {
        expect(r.solverStatus, `factor ${factor}`).toBe('reached_now')
      }
    }
  })

  it('perpetual-profiel: geldige uitkomst, maar de D7-claim wordt niet gedaan (eindleeftijd 100 = horizon)', () => {
    const perpetual: ConvergentieRawProfileRow = { ...depleteProfile, fire_end_strategy: 'perpetual' }
    const r = computeRunwayFromRawContext(ctx({ profile: perpetual }))
    expect(KINDS).toContain(r.kind)
    if (r.kind === 'months') expect(r.endAge).toBe(100)
  })
})

describe('degradatie — unavailable met een reden', () => {
  it('geen geboortedatum → geen-geboortedatum (vóór de adapter)', () => {
    const r = computeRunwayFromRawContext(ctx({ profile: { ...depleteProfile, date_of_birth: null } }))
    expect(r).toEqual({ kind: 'unavailable', reason: 'geen-geboortedatum' })
  })

  it('geen geloofwaardige pensioen-uitgave (custom_amount €600/jaar = €50/mnd, onder de vloer) → geen-uitgavenbasis', () => {
    // De adapter valt bij essential_budgets = 0 terug op de maandschatting, dus dát
    // pad levert wél een basis; de vloer toets je met een expliciet te laag eigen bedrag.
    const r = computeRunwayFromRawContext(
      ctx({
        profile: {
          ...depleteProfile,
          retirement_expense_method: 'custom_amount',
          retirement_expense_custom_amount: 600,
        },
      }),
    )
    expect(r).toEqual({ kind: 'unavailable', reason: 'geen-uitgavenbasis' })
  })

  it('adapter gooit (ongeldige bezittingen-invoer) → kern-fout, geen exception naar de kop', () => {
    const r = computeRunwayFromRawContext(ctx({ assets: null as unknown as Asset[] }))
    expect(r).toEqual({ kind: 'unavailable', reason: 'kern-fout' })
  })

  it('geen liquide vermogen op T0 → deficit', () => {
    const r = computeRunwayFromRawContext(ctx({ assets: scaleAssets(0) }))
    expect(r.kind).toBe('deficit')
  })
})

describe('resolveRetirementExpenseMethod', () => {
  it('normaliseert de profielkolom; onbekend/leeg valt terug op essential_budgets', () => {
    expect(resolveRetirementExpenseMethod('custom_amount')).toBe('custom_amount')
    expect(resolveRetirementExpenseMethod('current_income')).toBe('current_income')
    expect(resolveRetirementExpenseMethod('essential_budgets')).toBe('essential_budgets')
    expect(resolveRetirementExpenseMethod(null)).toBe('essential_budgets')
    expect(resolveRetirementExpenseMethod('iets-anders')).toBe('essential_budgets')
  })
})
