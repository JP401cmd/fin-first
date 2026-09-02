import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import { buildKernelInputFromApp } from './adapter'
import {
  buildConvergentieAdapterProfile,
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
} from './convergentie-router'
import { solveFire, evaluateFireAt, type SolverStatus } from './solver'
import { computeEs, ACTIEF_MARKER } from './tables/es'
import { eindleeftijdVan, eindMaandVan, prognoseJ } from './gap'
import { buildKernelSlotMeta, kernelToUnifiedResult } from './bridge'
import { deriveEigenHuisIds } from './adapter'
import { depletionMonth } from './runway'

/**
 * ADR 0127 — 'nu-stoppen' als vijfde eindstrategie, kernel-native (D1/D2/D4/D7).
 *
 *  D1  `solveFire` kortsluit op de STARTLEEFTIJD (P!B7, hele jaren), geen bisectie —
 *      het pensioen-patroon op vandaag. Elke solveFire-consument erft het anker.
 *  D2  Eindleeftijd = B51 (`fire_end_age`), doel €0; status `reached_now` óf
 *      `stop_now_shortfall` — nooit `unreachable_within_horizon`/`reached_at` (de
 *      M6-schijnbereik-tak is onbereikbaar: doel 0 + tekortAflossingUitLiquide ⇒
 *      gap < 0 alleen mét tekort-lening > 0).
 *  D4  Bridge markeert `requiredFireIsStartPortfolio`; "requiredFirePortfolio" is J(0).
 *  D7  `reached_now ⇔ runway reikt tot de eindleeftijd` — exact, via het bridge-veld
 *      `kernelDepletionMonth`.
 *
 * Buiten oracle-domein: geen fixture draagt 'Nu stoppen', dus de 736 parity-fixtures
 * blijven byte-identiek (aparte suite, test/horizon-oracle).
 */

const PINNED_AGE = 42
const fx = buildCompleetHorizonFixture(PINNED_AGE)

const profile: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(PINNED_AGE),
  fire_end_strategy: 'nu-stoppen',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  housing_strategy_config: { mode: 'include_full' },
}

const scaleAssets = (factor: number): Asset[] =>
  fx.assets.map((a) => ({ ...a, current_value: a.current_value * factor }) as Asset)

function makeInput(assets: readonly Asset[] = fx.assets, over: Partial<ConvergentieRawProfileRow> = {}) {
  return buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile({ ...profile, ...over }),
    assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
  })
}

describe("ES-tabel — 'Nu stoppen' → code 'nu'", () => {
  it('selector, code, actief-marker op rij 10 (B51) en eindleeftijd = B51 (niet 100)', () => {
    const input = makeInput()
    expect(input.eindstrategie.selector).toBe('Nu stoppen')
    const es = computeEs(input)
    expect(es.interneCode).toBe('nu')
    expect(es.actiefOpeten).toBe(ACTIEF_MARKER)
    expect(es.actiefPensioen).toBe('')
    expect(es.actiefEeuwigdurend).toBe('')
    expect(eindleeftijdVan(es)).toBe(90)
  })
})

describe('solveFire — D1: kortsluiting op de startleeftijd, geen bisectie', () => {
  const input = makeInput()
  const solve = solveFire(input)

  it('FIRE = startleeftijd (hele jaren), één engine-run, FIRE-maand 0', () => {
    expect(Number.isInteger(input.startLeeftijd)).toBe(true)
    expect(input.startLeeftijd).toBe(PINNED_AGE)
    expect(solve.fireAge).toBe(input.startLeeftijd)
    expect(solve.engineRuns).toBe(1)
    expect(solve.projection.summary.fireMonth).toBe(0)
  })

  it('D2: eindleeftijd = fire_end_age (90), doelbedrag 0', () => {
    expect(solve.eindleeftijd).toBe(90)
    expect(solve.doelbedrag).toBe(0)
  })

  it('≡ evaluateFireAt(input, startLeeftijd): dezelfde run, hetzelfde statusblok', () => {
    const forced = evaluateFireAt(input, input.startLeeftijd)
    expect(forced).toEqual(solve)
  })

  it('het guardrails-anker staat op de T0-liquide-stand (engine-init bij FIRE-maand 0), niet op 0', () => {
    expect(solve.projection.summary.guardrailsAnker).toBeGreaterThan(0)
  })
})

describe('status — D2: alleen reached_now of stop_now_shortfall; de M6-tak is onbereikbaar', () => {
  const toegestaan: SolverStatus[] = ['reached_now', 'stop_now_shortfall']

  it.each([0.05, 0.25, 1, 5, 20])('bezittingen ×%s → status ∈ {reached_now, stop_now_shortfall}', (factor) => {
    const solve = solveFire(makeInput(scaleAssets(factor)))
    expect(toegestaan).toContain(solve.status)
    expect(solve.status).not.toBe('unreachable_within_horizon')
    expect(solve.status).not.toBe('reached_at')
    expect(solve.status).not.toBe('pension_shortfall')
  })

  it('arm (×0,05): tekort-lening vóór de eindleeftijd ⇒ stop_now_shortfall (geen pensioen-kopij)', () => {
    const solve = solveFire(makeInput(scaleAssets(0.05)))
    expect(solve.status).toBe('stop_now_shortfall')
    expect(solve.tekortLeningTotEindleeftijd).toBeGreaterThan(0)
  })

  it('rijk (×20): het geld reikt tot 90 ⇒ reached_now, geen tekort-lening', () => {
    const solve = solveFire(makeInput(scaleAssets(20)))
    expect(solve.status).toBe('reached_now')
    expect(solve.tekortLeningTotEindleeftijd).toBe(0)
  })
})

describe('bridge — D4 (geen doelvermogen) en D7 (reached_now ⇔ runway reikt tot eindleeftijd)', () => {
  function bridged(assets: readonly Asset[]) {
    const input = makeInput(assets)
    const solve = solveFire(input)
    const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(assets, fx.debts, deriveEigenHuisIds(assets))
    const unified = kernelToUnifiedResult(solve, { input, yearlyExpenses: 30_000, assetSlotMeta, debtSlotMeta })
    return { input, solve, unified }
  }

  it('markeert requiredFireIsStartPortfolio en levert J(0) als "requiredFirePortfolio" — geen doel', () => {
    const { solve, unified } = bridged(fx.assets)
    expect(unified.requiredFireIsStartPortfolio).toBe(true)
    expect(unified.requiredFireIsEndOfHorizonFallback).toBe(false)
    expect(unified.requiredFirePortfolio).toBe(prognoseJ(solve.projection, 0))
    expect(unified.strategy).toBe('nu-stoppen')
    expect(unified.targetEndPortfolio).toBe(0)
    expect(unified.displayEndAge).toBe(90)
    expect(unified.fireReachable).toBe(true) // stop_now_shortfall blijft reachable, zoals pension_shortfall
    expect(unified.fireAgeFractional).toBe(PINNED_AGE)
  })

  it('de vlag staat NIET op een gewone deplete-run (FIRE-maand ≥ 1)', () => {
    const input = makeInput(fx.assets, { fire_end_strategy: 'deplete' })
    const solve = solveFire(input)
    const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(fx.assets, fx.debts, deriveEigenHuisIds(fx.assets))
    const unified = kernelToUnifiedResult(solve, { input, yearlyExpenses: 30_000, assetSlotMeta, debtSlotMeta })
    expect(unified.requiredFireIsStartPortfolio).toBe(false)
    expect(unified.strategy).toBe('deplete')
  })

  it.each([0.05, 0.25, 1, 5, 20])('D7 exact bij ×%s: reached_now ⇔ kernelDepletionMonth reikt voorbij de eindmaand', (factor) => {
    const { input, solve, unified } = bridged(scaleAssets(factor))
    const eindMaand = eindMaandVan(solve.eindleeftijd, input.startLeeftijd)
    const m = unified.kernelDepletionMonth
    expect(m).toBe(depletionMonth(solve.projection))
    const runwayReiktTotEind = m === null || m > eindMaand
    expect(solve.status === 'reached_now').toBe(runwayReiktTotEind)
    expect(solve.status === 'stop_now_shortfall').toBe(!runwayReiktTotEind)
  })
})

describe('convergentie-router — erft het anker zonder eigen tak', () => {
  it('computeConvergentieProjection: FIRE op de startleeftijd, strategie nu-stoppen, kernelStatus ∈ {reached_now, stop_now_shortfall}', () => {
    const outcome = computeConvergentieProjection({
      rawContext: { profile, assets: fx.assets, debts: fx.debts, lifeEvents: fx.lifeEvents, aowRows: [], yearlyExpenses: 30_000 },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.strategy).toBe('nu-stoppen')
    expect(outcome.result.fireAgeFractional).toBe(PINNED_AGE)
    expect(outcome.result.requiredFireIsStartPortfolio).toBe(true)
    expect(['reached_now', 'stop_now_shortfall']).toContain(outcome.kernelStatus)
  })
})
