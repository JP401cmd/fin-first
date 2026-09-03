import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import { buildKernelInputFromApp } from '../adapter'
import {
  buildConvergentieAdapterProfile,
  type ConvergentieRawProfileRow,
} from '../convergentie-router'
import type { KernelInput } from '../types'
import { runMonteCarlo } from './mc'

/**
 * ADR 0129 D3/D9 (bevinding 2) — **de Monte-Carlo onder een pensioen-plan was per
 * constructie 100%.**
 *
 * MC!B8 toetst voor de eindstrategie 'Pensioenleeftijd' `ROUND(P!B16,2) ≥ ES!C15`, en de
 * solver kortsluit P!B16 juist NAAR die AOW-leeftijd — de toets vergelijkt dus een getal
 * met zichzelf. Byte-exact het Excel-oracle, maar als "kans dat je plan het houdt"
 * betekenisloos: de marktcheck meldde voor élke pensioen-gebruiker 100%, ook bij een
 * plan dat in geen enkel marktverloop reikt.
 *
 * Sinds het anker als blok binnenkomt (`stopAnker`) draait ook een pensioen-plan het
 * generieke criterium `gap ≥ 0`. Het ORACLE-pad (selector 'Pensioenleeftijd' zónder
 * blok) houdt zijn oude tak — daar hangen de fixtures aan, en `parity-mc` blijft
 * daardoor cel-exact.
 *
 * Tolerantie-keuze: er wordt hier NIET op een bedrag vergeleken maar op een
 * kansverdeling; de asserties zijn daarom strikt kwalitatief (0 ≤ p ≤ 1, en < 1 waar de
 * simulatie echt faalt). Een numerieke marge zou hier een schijnprecisie zijn.
 */

const PINNED_AGE = 42
const MC_RUNS = 40 // genoeg spreiding, snel genoeg voor CI
const fx = buildCompleetHorizonFixture(PINNED_AGE)

const basis: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(PINNED_AGE),
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  housing_strategy_config: { mode: 'include_full' },
}

function makeInput(
  over: Partial<ConvergentieRawProfileRow>,
  assets: readonly Asset[] = fx.assets,
): KernelInput {
  const input = buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile({ ...basis, ...over }),
    assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
  })
  return { ...input, onzekerheid: { ...input.onzekerheid, mc: { ...input.onzekerheid.mc, aantalRuns: MC_RUNS } } }
}

const scaleAssets = (factor: number): Asset[] =>
  fx.assets.map((a) => ({ ...a, current_value: a.current_value * factor }) as Asset)

describe('Monte-Carlo — generiek slaagcriterium onder een vast anker (D3, bevinding 2)', () => {
  it('een AOW-verankerd plan draait een ECHTE simulatie: slaagkans == de gap-toets', () => {
    const input = makeInput({ fire_stop_anchor: 'aow' })
    const mc = runMonteCarlo(input)
    expect(mc.runs).toBe(MC_RUNS)
    // Het criterium is nu identiek aan de inhoudelijke toets — geen losstaand
    // "B16 ≥ AOW" meer dat altijd 1 oplevert.
    expect(mc.successProbability).toBe(mc.sustainProbability)
  })

  it('een AOW-verankerd plan dat NIET reikt, meldt geen 100% meer', () => {
    const arm = makeInput({ fire_stop_anchor: 'aow' }, scaleAssets(0.05))
    const mc = runMonteCarlo(arm)
    expect(mc.successProbability).toBeLessThan(1)
    expect(mc.successProbability).toBeGreaterThanOrEqual(0)
  })

  it('het ORACLE-pad (selector zonder anker-blok) houdt de oude tak: altijd 1', () => {
    const arm = makeInput({}, scaleAssets(0.05))
    const oracle: KernelInput = {
      ...arm,
      stopAnker: undefined,
      eindstrategie: { ...arm.eindstrategie, selector: 'Pensioenleeftijd' },
    }
    const mc = runMonteCarlo(oracle)
    expect(mc.successProbability).toBe(1)
    // ... en juist dáárom bestaat `sustainProbability`: de inhoudelijke toets ligt op
    // dezelfde run lager. Dat verschil ÍS de bevinding.
    expect(mc.sustainProbability).toBeLessThan(1)
  })

  it('zonder anker blijven deplete/legacy/perpetual ongewijzigd (criterium was al `gap ≥ 0`)', () => {
    for (const strategy of ['deplete', 'legacy', 'perpetual']) {
      const mc = runMonteCarlo(makeInput({ fire_end_strategy: strategy }))
      expect(mc.successProbability).toBe(mc.sustainProbability)
    }
  })
})
