import { describe, it, expect } from 'vitest'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import {
  buildConvergentieAdapterProfile,
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { buildKernelInputFromApp, deriveEigenHuisIds } from '@/lib/horizon-kernel/adapter'
import { evaluateFireAt } from '@/lib/horizon-kernel/solver'
import { buildKernelSlotMeta, kernelToUnifiedResult } from '@/lib/horizon-kernel/bridge'
import { startNettoLiquide } from '@/lib/horizon-kernel/jaarrand'
import { depletionMonth } from '@/lib/horizon-kernel/runway'
import { toSimResult } from '@/lib/unified-projection'
import {
  bridgeForcedStop,
  buildForcedStopSolve,
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

// ── endStrategy: 'deplete' (default) vs. 'inherit' ───────────────────────────
//
// `'inherit'` laat de twee geforceerde profielvelden (`fire_end_strategy`, `fire_end_age`)
// weg zodat het profiel z'n eigen eindstrategie draagt — nodig zodra de stop-run als
// doel-lijn naast de hoofdlijn wordt getekend. Default blijft `'deplete'`, zodat elke
// bestaande caller (preset-stopkaarten, AOW-stop-sim) byte-identiek blijft.

describe('runForcedStopPath — endStrategy', () => {
  const STOP_AGE = Math.round(VERWACHT_FIRE) + 1

  function run(over: Partial<Parameters<typeof runForcedStopPath>[0]> = {}) {
    return runForcedStopPath({
      profile,
      assets: fx.assets,
      debts: fx.debts,
      lifeEvents: fx.lifeEvents,
      aowRows: [],
      yearlyExpenses: 30_000,
      stopAge: STOP_AGE,
      fireEndAge: 90,
      ...over,
    })
  }

  it('REGRESSIE-ANKER: zonder endStrategy ≡ expliciet "deplete" (bestaande callers ongewijzigd)', () => {
    const zonder = run()
    const expliciet = run({ endStrategy: 'deplete' })
    expect(zonder).not.toBeNull()
    // Volledige uitkomst — rijen én alle FIRE-scalars.
    expect(expliciet).toEqual(zonder)
  })

  it('inherit + perpetual-profiel: eigen strategie, eigen eindpunt (100), geen deplete-doel', () => {
    // Het fixture-profiel is `fire_end_strategy: 'perpetual'` met `fire_end_age: 90`.
    const geforceerd = run()
    const geerfd = run({ endStrategy: 'inherit' })
    expect(geerfd).not.toBeNull()

    expect(geforceerd!.result.strategy).toBe('deplete')
    expect(geerfd!.result.strategy).toBe('perpetual')
    // Perpetual loopt door tot het einde van de kern-horizon (100) — net als de hoofdlijn —
    // in plaats van tot de geforceerde deplete-eindleeftijd (90). Dít is wat de doel-lijn
    // nodig heeft: `clipRowsToPlanEnd(rows, displayEndAge)` kapt 'm anders 10 jaar te vroeg af.
    expect(geerfd!.result.displayEndAge).toBe(100)
    expect(geforceerd!.result.displayEndAge).toBe(90)

    // "Geen deplete-uitputting" = het doel-eindvermogen is niet 0: deplete stuurt op
    // vermogen-op bij de eindleeftijd, perpetual houdt het kapitaal in stand.
    expect(geforceerd!.result.targetEndPortfolio).toBe(0)
    expect(geerfd!.result.targetEndPortfolio).toBeGreaterThan(0)

    // En het perpetuale pad blijft t/m het eigen eindpunt positief.
    const laatsteRij = geerfd!.unifiedRows[geerfd!.unifiedRows.length - 1]
    expect(laatsteRij.netWorth).toBeGreaterThan(0)
  })

  it('inherit verandert de DUIDING, niet het pad: identieke rijen bij een geforceerde stop', () => {
    // Bij een GEFORCEERDE stop (`evaluateFireAt`) is het pad volledig bepaald door de
    // invoer + het gedwongen FIRE-moment; de eindstrategie (en `fire_end_age`) is een
    // SOLVE-criterium en raakt de projectie zelf niet. `'inherit'` wisselt dus uitsluitend
    // de duiding (strategie/doelbedrag) en het weergave-eindpunt — een belangrijk gegeven
    // voor de doel-lijn: de lijn verandert niet van vorm, alleen van eindpunt.
    expect(run({ endStrategy: 'inherit' })!.unifiedRows).toEqual(run()!.unifiedRows)
  })

  it('inherit + deplete-93-profiel ≡ de default-run met dezelfde eindleeftijd', () => {
    // Draagt het profiel zélf al de deplete-eindstrategie (met `fire_end_age` ≥ 90), dan
    // schrijft `'deplete'` exact hetzelfde voor als wat het profiel al zegt ⇒ identiek.
    const depleteProfiel: ConvergentieRawProfileRow = {
      ...profile,
      fire_end_strategy: 'deplete',
      fire_end_age: 93,
    }
    const geforceerd = run({ profile: depleteProfiel, fireEndAge: 93 })
    const geerfd = run({ profile: depleteProfiel, fireEndAge: 93, endStrategy: 'inherit' })
    expect(geerfd).not.toBeNull()
    expect(geerfd).toEqual(geforceerd)
  })
})

// ── buildForcedStopSolve: de motor-helft (ADR 0126, PR B) ────────────────────
//
// `runForcedStopPath` is gesplitst in `buildForcedStopSolve` (adapter → evaluateFireAt)
// en de bridge-stap. De stop-kaarten, de AOW-stop-sim én de "stop nu"-runway hangen
// aan dat ene recept. Het bestaande gedrag van `runForcedStopPath` moet byte-identiek
// blijven — hier vastgepind tegen het VROEGERE recept (adapter + evaluateFireAt +
// bridge, letterlijk zoals het vóór de split in de functie stond).

describe('buildForcedStopSolve — motor-helft van het geforceerde-stop-recept', () => {
  const STOP_AGE = Math.round(VERWACHT_FIRE) + 1
  const base = {
    profile,
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [] as const,
    yearlyExpenses: 30_000,
    fireEndAge: 90,
  }

  it('REGRESSIE-ANKER: runForcedStopPath ≡ het vroegere recept (adapter + evaluateFireAt + bridge) — byte-identiek', () => {
    // Het OUDE recept, letterlijk (deplete-default: geforceerde eindstrategie + eindleeftijd ≥ 90).
    const basisProfiel = buildConvergentieAdapterProfile(profile)
    const kernelInput = buildKernelInputFromApp({
      profile: { ...basisProfiel, fire_end_strategy: 'deplete', fire_end_age: 90 },
      assets: fx.assets,
      debts: fx.debts,
      lifeEvents: fx.lifeEvents,
      aowRows: [],
    })
    const solve = evaluateFireAt(kernelInput, STOP_AGE)
    const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(fx.assets, fx.debts, deriveEigenHuisIds(fx.assets))
    const unified = kernelToUnifiedResult(solve, { input: kernelInput, yearlyExpenses: 30_000, assetSlotMeta, debtSlotMeta })
    const oud = {
      result: toSimResult(unified),
      unifiedRows: unified.rows,
      kernelHousingSale: unified.kernelHousingSale ?? null,
      maandHint: solve.maandHint,
    }

    const nieuw = runForcedStopPath({ ...base, stopAge: STOP_AGE })
    // De vier bestaande velden byte-identiek; `depletionMonth` is het additieve
    // bridge-veld (ADR 0126) — óók dat komt uit dezelfde bridge, niet uit een eigen lezing.
    expect(nieuw).toEqual({ ...oud, depletionMonth: unified.kernelDepletionMonth })
    expect(nieuw!.depletionMonth).toBe(depletionMonth(solve.projection))
  })

  it('numerieke stopAge: solve ≡ evaluateFireAt (geen verborgen opties; anker via self-capture)', () => {
    const { kernelInput, solve, stopAge } = buildForcedStopSolve({ ...base, stopAge: STOP_AGE })
    expect(stopAge).toBe(STOP_AGE)
    expect(solve).toEqual(evaluateFireAt(kernelInput, STOP_AGE))
    expect(solve.projection.summary.guardrailsAnker).toBeGreaterThan(0) // self-capture op fireMaand − 1
  })

  it("stopAge 'nu': FIRE-maand 0, eigen eindstrategie geërfd, engine ankert guardrails op max(0, T0-liquide)", () => {
    const { kernelInput, solve, stopAge } = buildForcedStopSolve({ ...base, stopAge: 'nu', endStrategy: 'inherit' })
    expect(stopAge).toBe(kernelInput.startLeeftijd)
    expect(solve.fireAge).toBe(kernelInput.startLeeftijd)
    expect(solve.projection.summary.fireMonth).toBe(0)
    expect(solve.projection.summary.guardrailsAnker).toBe(Math.max(0, startNettoLiquide(kernelInput)))
    expect(solve.engineRuns).toBe(1)
    // 'inherit' op het perpetual-fixture-profiel: eindleeftijd = horizon (100).
    expect(solve.eindleeftijd).toBe(100)
    // Een numerieke stop op exact de startleeftijd is hetzelfde pad (de engine ankert, niet het recept).
    expect(buildForcedStopSolve({ ...base, stopAge: kernelInput.startLeeftijd, endStrategy: 'inherit' }).solve).toEqual(solve)
  })

  it('bridgeForcedStop geeft het bridge-veld door: depletionMonth ≡ depletionMonth(solve.projection)', () => {
    const run = buildForcedStopSolve({ ...base, stopAge: 'nu', endStrategy: 'inherit' })
    const bridged = bridgeForcedStop(run, base)
    expect(bridged.depletionMonth).toBe(depletionMonth(run.solve.projection))
    expect(bridged.maandHint).toBe(run.solve.maandHint)
  })

  it('gooit bij een kern-fout — de aanroeper kiest de degradatie (runForcedStopPath → null)', () => {
    const kapot = { ...base, profile: { ...profile, date_of_birth: null }, stopAge: STOP_AGE }
    expect(() => buildForcedStopSolve(kapot)).toThrow()
    expect(runForcedStopPath(kapot)).toBeNull()
  })
})
