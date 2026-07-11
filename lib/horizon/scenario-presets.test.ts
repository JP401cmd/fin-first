import { describe, it, expect } from 'vitest'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import {
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import {
  runScenarioPresets,
  runScenarioPreset,
  resolveScenarioPresets,
  runForcedStopPath,
  SCENARIO_PRESET_SPECS,
  type ScenarioPresetContext,
} from './scenario-presets'

/**
 * Hergebruikt de ronde-2 persona-fixture (compleet + perpetual + essential 30k), zoals
 * scenario-baseline-parity.test.ts, zodat de basislijn FIRE op een echte toekomst-datum
 * bereikt en de scenario-runs meetbaar divergeren.
 */
const PINNED_AGE = 42
const fx = buildCompleetHorizonFixture(PINNED_AGE)

const profile: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(PINNED_AGE),
  yearly_essential_expenses: 30_000,
  retirement_expense_method: 'essential_budgets',
  fire_end_strategy: 'perpetual',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  housing_strategy_config: { mode: 'include_full' },
}

const baseOutcome = computeConvergentieProjection({
  rawContext: { profile, assets: fx.assets, debts: fx.debts, lifeEvents: fx.lifeEvents, aowRows: [], yearlyExpenses: 30_000 },
})
if (!baseOutcome.ok) throw new Error('fixture: baseline niet ok — fixture ongeldig')
const VERWACHT_FIRE = baseOutcome.result.fireAgeFractional
if (VERWACHT_FIRE === null) throw new Error('fixture: baseline bereikt geen FIRE — fixture ongeldig')

function makeCtx(over: Partial<ScenarioPresetContext> = {}): ScenarioPresetContext {
  return {
    profile,
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
    yearlyExpenses: 30_000,
    currentAge: PINNED_AGE,
    verwachtFireAge: VERWACHT_FIRE,
    fireEndAge: 90,
    hasEigenHuis: true,
    downsizeStrategyActief: false,
    ...over,
  }
}

describe('resolveScenarioPresets — slot-4-wissel', () => {
  it('eigen huis + geen verkoop-strategie → downsize op slot 4', () => {
    const ids = resolveScenarioPresets(makeCtx({ hasEigenHuis: true, downsizeStrategyActief: false })).map((s) => s.id)
    expect(ids).toEqual(['basis', 'een-jaar-langer', 'minder-uitgeven', 'downsize', 'eerder-stoppen'])
  })

  it('geen eigen huis → extra-inleg op slot 4', () => {
    const ids = resolveScenarioPresets(makeCtx({ hasEigenHuis: false })).map((s) => s.id)
    expect(ids).toEqual(['basis', 'een-jaar-langer', 'minder-uitgeven', 'extra-inleg', 'eerder-stoppen'])
  })

  it('downsize-strategie al actief → extra-inleg op slot 4', () => {
    const ids = resolveScenarioPresets(makeCtx({ hasEigenHuis: true, downsizeStrategyActief: true })).map((s) => s.id)
    expect(ids[3]).toBe('extra-inleg')
  })
})

describe('runScenarioPresets — vijf doorgerekende kaarten', () => {
  it('levert 5 kaarten, basis eerst met status basis', () => {
    const cards = runScenarioPresets(makeCtx())
    expect(cards).toHaveLength(5)
    expect(cards[0].id).toBe('basis')
    expect(cards[0].status).toBe('basis')
    expect(cards.map((c) => c.id)).toEqual(['basis', 'een-jaar-langer', 'minder-uitgeven', 'downsize', 'eerder-stoppen'])
  })

  it('elke kaart levert een laagste buffer (rijen geproduceerd)', () => {
    for (const card of runScenarioPresets(makeCtx())) {
      expect(card.laagsteBuffer, `${card.id} mist buffer`).not.toBeNull()
    }
  })

  it('eerder-stoppen is de "rood"-kaart: negatieve óf laagste buffer', () => {
    const cards = runScenarioPresets(makeCtx())
    const buffers = cards.map((c) => c.laagsteBuffer?.bedrag ?? Number.POSITIVE_INFINITY)
    const eerder = cards.find((c) => c.id === 'eerder-stoppen')!
    const eenJaar = cards.find((c) => c.id === 'een-jaar-langer')!
    const eerderBedrag = eerder.laagsteBuffer!.bedrag
    // Eerder stoppen (deplete, 2 jaar eerder) heeft nooit méér buffer dan één jaar langer…
    expect(eerderBedrag).toBeLessThanOrEqual(eenJaar.laagsteBuffer!.bedrag)
    // …en is negatief óf het minimum over alle kaarten.
    expect(eerderBedrag < 0 || eerderBedrag <= Math.min(...buffers)).toBe(true)
  })

  it('de maand-delta-kaarten dragen hun toegepaste delta', () => {
    const cards = runScenarioPresets(makeCtx({ hasEigenHuis: false })) // slot4 = extra-inleg
    expect(cards.find((c) => c.id === 'minder-uitgeven')!.maandruimteOfDelta).toBe(-300)
    expect(cards.find((c) => c.id === 'extra-inleg')!.maandruimteOfDelta).toBe(250)
  })
})

describe('input-varianten wijken in de juiste richting af', () => {
  it('minder uitgeven → eerdere (of gelijke) FIRE dan de basis', () => {
    const ctx = makeCtx()
    const basis = runScenarioPreset(SCENARIO_PRESET_SPECS.basis, ctx)
    const minder = runScenarioPreset(SCENARIO_PRESET_SPECS['minder-uitgeven'], ctx)
    expect(minder.fireAgeFractional).not.toBeNull()
    expect(basis.fireAgeFractional).not.toBeNull()
    expect(minder.fireAgeFractional!).toBeLessThanOrEqual(basis.fireAgeFractional!)
  })

  it('extra inleg → eerdere (of gelijke) FIRE dan de basis', () => {
    const ctx = makeCtx()
    const basis = runScenarioPreset(SCENARIO_PRESET_SPECS.basis, ctx)
    const extra = runScenarioPreset(SCENARIO_PRESET_SPECS['extra-inleg'], ctx)
    expect(extra.fireAgeFractional).not.toBeNull()
    expect(extra.fireAgeFractional!).toBeLessThanOrEqual(basis.fireAgeFractional!)
  })
})

describe('runForcedStopPath — geforceerd stopmoment', () => {
  it('forceert FIRE op de stopleeftijd en levert rijen', () => {
    const stopAge = Math.round(VERWACHT_FIRE) + 1
    const run = runForcedStopPath({
      profile,
      assets: fx.assets,
      debts: fx.debts,
      lifeEvents: fx.lifeEvents,
      aowRows: [],
      yearlyExpenses: 30_000,
      stopAge,
      fireEndAge: 90,
    })
    expect(run).not.toBeNull()
    expect(run!.unifiedRows.length).toBeGreaterThan(0)
    if (run!.result.fireAgeFractional !== null) {
      expect(Math.abs(run!.result.fireAgeFractional - stopAge)).toBeLessThan(0.1)
    }
  })

  it('stopleeftijd bepaalt de eindstrategie (deplete) — niet de perpetual basis', () => {
    const stopAge = Math.round(VERWACHT_FIRE) + 1
    const run = runForcedStopPath({
      profile, assets: fx.assets, debts: fx.debts, lifeEvents: fx.lifeEvents, aowRows: [], yearlyExpenses: 30_000, stopAge, fireEndAge: 90,
    })
    expect(run!.result.strategy).toBe('deplete')
  })
})
