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
import { buildKernelInputFromApp } from '@/lib/horizon-kernel/adapter'
import { buildConvergentieAdapterProfile } from '@/lib/horizon-kernel/convergentie-router'
import { computeRunwayFromRawContext } from './runway'
import { buildForcedStopSolve } from './scenario-presets'
import { buildBriefingHeadline, runwaySentence, summarizeRunway } from '@/lib/briefing/overview-briefing'

/**
 * ADR 0129 F3a — de kop volgt het PLAN-anker (kruisverwijzing ADR 0126). `computeRunway
 * FromRawContext(ctx, { stop: 'plan' })` draait de run op het stopmoment van het plan:
 * onder `solved`/`now` valt dat samen met de stop-nu-runway, onder aow/age is het de
 * ankerleeftijd via DE resolver. De zinnen komen uit de bijlage van het besluit.
 */
const PINNED_AGE = 42
const fx = buildCompleetHorizonFixture(PINNED_AGE)

const basisProfiel: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(PINNED_AGE),
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  housing_strategy_config: { mode: 'include_full' },
}

const scaleAssets = (factor: number): Asset[] =>
  fx.assets.map((a) => ({ ...a, current_value: a.current_value * factor }) as Asset)

function ctx(over: Partial<ConvergentieRawProfileRow> = {}, assets: readonly Asset[] = fx.assets): ConvergentieRawContext {
  return {
    profile: { ...basisProfiel, ...over },
    assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
    yearlyExpenses: 30_000,
  }
}

describe("computeRunwayFromRawContext — stop: 'plan'", () => {
  it("solved: 'plan' ≡ 'nu' (geen anker ⇒ de stop-nu-runway), en de kop blijft de bestaande zin", () => {
    const nu = computeRunwayFromRawContext(ctx())
    const plan = computeRunwayFromRawContext(ctx(), { stop: 'plan' })
    expect(plan).toEqual(nu)
    if (plan.kind === 'unavailable') throw new Error('fixture: runway niet beschikbaar')
    expect(plan.planAnker).toBeNull()
    expect(plan.stopAge).toBe(plan.startAge)
    const kop = buildBriefingHeadline(plan)
    expect(kop).toMatch(/^Als je nu zou stoppen, reikt je vermogen/)
  })

  it("now-anker: dezelfde run als 'nu', maar de kop zegt niet meer 'zou' — het plan ÍS stoppen", () => {
    const plan = computeRunwayFromRawContext(ctx({ fire_stop_anchor: 'now' }), { stop: 'plan' })
    if (plan.kind === 'unavailable') throw new Error('fixture: runway niet beschikbaar')
    expect(plan.planAnker).toEqual({ soort: 'nu' })
    expect(plan.stopAge).toBe(PINNED_AGE)
    const point = summarizeRunway(plan)
    expect(point?.stop).toEqual({ kind: 'now' })
    const kop = runwaySentence(point!)
    expect(kop).toMatch(/^Je liquide vermogen reikt/)
    expect(kop).not.toMatch(/zou/)
  })

  it('age 58: de run stopt op 58 (de ankerleeftijd via de resolver) en de kop noemt het stopmoment', () => {
    const plan = computeRunwayFromRawContext(ctx({ fire_stop_anchor: 'age', fire_stop_age: 58 }), { stop: 'plan' })
    if (plan.kind === 'unavailable') throw new Error('fixture: runway niet beschikbaar')
    expect(plan.planAnker).toEqual({ soort: 'leeftijd', leeftijd: 58 })
    expect(plan.stopAge).toBe(58)
    const point = summarizeRunway(plan)
    if (!point) throw new Error('fixture: geen meetpunt (D7-strijdig of deficit)')
    expect(point.stop).toEqual({ kind: 'age', stopAge: 58 })
    const kop = runwaySentence(point)
    // De compleet-persona is rijk: bij een stop op 58 reikt het geld tot de eindleeftijd of
    // voorbij de horizon — beide zinsvormen dragen het stopmoment als getal.
    expect(kop).toMatch(
      /^Als je op 58 stopt, reikt je liquide vermogen (tot (voorbij )?je \d+e|zover het model rekent: tot je 100e)\.$/,
    )
    // Dezelfde uitkomst als een geforceerde stop op 58 via de motor-helft — één recept.
    const forced = buildForcedStopSolve({ ...ctx({ fire_stop_anchor: 'age', fire_stop_age: 58 }), stopAge: 58, endStrategy: 'inherit' })
    expect(plan.solverStatus).toBe(forced.solve.status)
  })

  it('aow: de run stopt op de AOW-leeftijd uit de kernel-invoer; de kop noemt het getal, nooit het woord AOW', () => {
    const c = ctx({ fire_stop_anchor: 'aow' })
    const plan = computeRunwayFromRawContext(c, { stop: 'plan' })
    if (plan.kind === 'unavailable') throw new Error('fixture: runway niet beschikbaar')
    const input = buildKernelInputFromApp({ profile: buildConvergentieAdapterProfile(c.profile), assets: c.assets, debts: c.debts, lifeEvents: c.lifeEvents, aowRows: c.aowRows })
    expect(plan.stopAge).toBe(input.persoon.aowLeeftijd)
    expect(plan.planAnker).toEqual({ soort: 'aow' })
    const point = summarizeRunway(plan)
    if (!point) throw new Error('fixture: geen meetpunt')
    expect(point.stop).toEqual({ kind: 'aow', stopAge: input.persoon.aowLeeftijd })
    const kop = runwaySentence(point)
    expect(kop).toMatch(/^Als je op \d+ stopt, reikt je liquide vermogen/)
    expect(kop).not.toMatch(/\bAOW\b/)
  })

  it("stop: 'nu' onder een aow-plan blijft de hypothetische stop-nu-vraag (stopAge = start ⇒ 'nu'-zin)", () => {
    const nu = computeRunwayFromRawContext(ctx({ fire_stop_anchor: 'aow' }))
    if (nu.kind === 'unavailable') throw new Error('fixture: runway niet beschikbaar')
    expect(nu.planAnker).toEqual({ soort: 'aow' })
    expect(nu.stopAge).toBe(PINNED_AGE)
    const point = summarizeRunway(nu)
    if (point) {
      expect(point.stop).toBeUndefined()
      expect(runwaySentence(point)).toMatch(/^Als je nu zou stoppen/)
    }
  })

  it('arm plan (×0,05) op age 58: het bereik ligt vóór het plan-einde en de zin draagt het tekort', () => {
    const plan = computeRunwayFromRawContext(ctx({ fire_stop_anchor: 'age', fire_stop_age: 58 }, scaleAssets(0.05)), { stop: 'plan' })
    if (plan.kind === 'unavailable') throw new Error('fixture: runway niet beschikbaar')
    expect(['months', 'deficit']).toContain(plan.kind)
    const point = summarizeRunway(plan)
    if (point) {
      expect(point.kind).toBe('months')
      expect(runwaySentence(point)).toMatch(/^Als je op 58 stopt, reikt je liquide vermogen tot je \d+e\.$/)
    }
  })
})

describe('summarizeRunway / runwaySentence — de anker-variant zonder de bestaande zin te raken', () => {
  const opeten = {
    strategy: 'Vermogen opeten' as const,
    expenseBasis: { yearly: 36_000, method: 'essential_budgets' as const },
    startAge: 45,
    solverStatus: 'reached_now' as const,
  }

  it('een meetpunt zonder stop (oude snapshots) leest als het nu-anker — byte-identiek aan vóór F3a', () => {
    const point = summarizeRunway({ ...opeten, kind: 'months', months: 100, depletionAge: 53.33, endAge: 90 })
    expect(point).toEqual({ kind: 'months', months: 100, reachesAge: 53.33 })
    expect(runwaySentence(point!)).toBe('Als je nu zou stoppen, reikt je vermogen tot je 53e.')
  })

  it('age-stop: gedekt en tekort volgens de bijlage', () => {
    const gedekt = summarizeRunway({ ...opeten, kind: 'reaches-end-age', endAge: 90, stopAge: 62, planAnker: { soort: 'leeftijd', leeftijd: 62 } })
    expect(gedekt?.stop).toEqual({ kind: 'age', stopAge: 62 })
    expect(runwaySentence(gedekt!)).toBe('Als je op 62 stopt, reikt je liquide vermogen tot voorbij je 90e.')
    const tekort = summarizeRunway({ ...opeten, kind: 'months', months: 460, depletionAge: 83.4, endAge: 90, stopAge: 62, planAnker: { soort: 'leeftijd', leeftijd: 62 } })
    expect(runwaySentence(tekort!)).toBe('Als je op 62 stopt, reikt je liquide vermogen tot je 83e.')
  })

  it('now-stop: "Je liquide vermogen reikt …" (geen "zou"), ook de maanden-variant', () => {
    const p = summarizeRunway({ ...opeten, kind: 'months', months: 7, depletionAge: 45.6, endAge: 90, stopAge: 45, planAnker: { soort: 'nu' } })
    expect(runwaySentence(p!)).toBe('Je liquide vermogen reikt nog 7 maanden.')
    const q = summarizeRunway({ ...opeten, kind: 'beyond-horizon', stopAge: 45, planAnker: { soort: 'nu' } })
    expect(runwaySentence(q!)).toBe('Je liquide vermogen reikt zover het model rekent: tot je 100e.')
  })

  it('halve jaren blijven staan in de kop (58,5 is geen 59)', () => {
    const p = summarizeRunway({ ...opeten, kind: 'reaches-end-age', endAge: 90, stopAge: 58.5, planAnker: { soort: 'leeftijd', leeftijd: 58.5 } })
    expect(runwaySentence(p!)).toBe('Als je op 58,5 stopt, reikt je liquide vermogen tot voorbij je 90e.')
  })
})
