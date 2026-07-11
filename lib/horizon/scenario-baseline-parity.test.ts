import { describe, it, expect } from 'vitest'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { computeWhatifProjection } from '@/lib/horizon-kernel/whatif-router'
import { applyReturnDeltasToAssets } from '@/lib/horizon-kernel/adapter/whatif-varianten'
import { expandCategorieReturnDeltas } from './toekomst-scenario'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'

/**
 * GOLDEN — baseline-consistentie van de /toekomst wat-als-scenariolaag (plan §A).
 *
 * De scenario-run MOET via `computeConvergentieProjection` (zelfde motorpad als de
 * hoofdlijn) lopen en NIET via `computeWhatifProjection`: de what-if-adapter
 * (`whatif-varianten.ts:132-161`) laat `yearly_essential_expenses`, `marginaal_tarief`,
 * `deficit_loan_rate` en `withdrawal_profile_config` bewust weg. Deze test pint dat besluit
 * vast met een REALISTISCHE `ConvergentieRawContext` mét juist die velden gezet:
 *   (a) een nul-override-scenario (assets door `applyReturnDeltasToAssets` met lege delta +
 *       identieke events) ≡ de basislijn — deepEqual op rows + fireAgeFractional;
 *   (b) diezélfde fixture via `computeWhatifProjection` wijkt WÉL af (de weggelaten velden
 *       veranderen de uitkomst) — bewijst dat het routerbesluit ertoe doet.
 */

const PINNED_AGE = 42
const fx = buildCompleetHorizonFixture(PINNED_AGE)

/**
 * Realistisch convergentie-profiel: de persona-basis + alle "convergentie-only"-velden
 * expliciet gezet — precies de velden die de what-if-adapter laat vallen. `essential_budgets`
 * mét een `yearly_essential_expenses` (30k) dat duidelijk lager is dan de geschatte
 * jaaruitgaven (~49k) maakt de what-if-divergentie ondubbelzinnig. Perpetual-eindstrategie
 * zodat FIRE op een echte toekomst-datum valt (niet "reached now") en de divergentie
 * meetbaar doorwerkt in fireAge/doelbedrag.
 */
const profile: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(PINNED_AGE),
  yearly_essential_expenses: 30_000,
  retirement_expense_method: 'essential_budgets',
  marginaal_tarief: 0.37,
  deficit_loan_rate: 0.05,
  withdrawal_profile_config: { profiel: 'afnemend', gogo_pct: 100, slowgo_pct: 85, nogo_pct: 70 },
  fire_end_strategy: 'perpetual',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  housing_strategy_config: { mode: 'include_full' },
}

const baseContext: ConvergentieRawContext = {
  profile,
  assets: fx.assets,
  debts: fx.debts,
  lifeEvents: fx.lifeEvents,
  aowRows: [],
  yearlyExpenses: fx.financialInput.yearlyMustExpenses,
}

describe('scenario-baseline-pariteit', () => {
  it('nul-override-scenario ≡ basislijn (deepEqual op rows + fireAgeFractional)', () => {
    const baseline = computeConvergentieProjection({ rawContext: baseContext })
    expect(baseline.ok).toBe(true)
    if (!baseline.ok) return
    // Sanity: de fixture bereikt FIRE op een echte toekomst-datum (geen degeneratie).
    expect(baseline.result.fireReachable).toBe(true)
    expect(baseline.result.fireAgeFractional).not.toBeNull()

    // Scenario-pad: assets door `applyReturnDeltasToAssets` met een via de expand-helper
    // afgeleide LEGE delta (→ {}) + identieke events ⇒ identieke context per constructie.
    const emptyDeltas = expandCategorieReturnDeltas({}, fx.assets)
    expect(emptyDeltas).toEqual({})
    const scenarioAssets = applyReturnDeltasToAssets(fx.assets, emptyDeltas)
    const scenario = computeConvergentieProjection({
      rawContext: { ...baseContext, assets: scenarioAssets },
    })
    expect(scenario.ok).toBe(true)
    if (!scenario.ok) return

    expect(scenario.result.rows).toEqual(baseline.result.rows)
    expect(scenario.result.fireAgeFractional).toEqual(baseline.result.fireAgeFractional)
    expect(scenario.result.requiredFirePortfolio).toEqual(baseline.result.requiredFirePortfolio)
    // Volledige uitkomst voor de zekerheid.
    expect(scenario.result).toEqual(baseline.result)
  })

  it('dezelfde fixture via computeWhatifProjection wijkt WÉL af (pint routerbesluit vast)', () => {
    const conv = computeConvergentieProjection({ rawContext: baseContext })
    const whatif = computeWhatifProjection({
      rawContext: {
        profile,
        assets: [...fx.assets],
        debts: [...fx.debts],
        lifeEvents: [...fx.lifeEvents],
        aowRows: [],
        yearlyExpenses: fx.financialInput.yearlyMustExpenses,
      },
    })
    expect(conv.ok).toBe(true)
    expect(whatif.ok).toBe(true)
    if (!conv.ok || !whatif.ok) return

    // De what-if-adapter laat yearly_essential_expenses (+ marginaal_tarief, deficit_loan_rate,
    // withdrawal_profile_config) vallen → essential_budgets valt terug op de geschatte
    // jaaruitgaven → ander doelbedrag én andere FIRE-leeftijd.
    expect(whatif.result.requiredFirePortfolio).not.toEqual(conv.result.requiredFirePortfolio)
    expect(whatif.result).not.toEqual(conv.result)
  })
})
