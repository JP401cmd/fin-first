import { describe, it, expect } from 'vitest'
import { runRegelProjection, type RegelSimSnapshot } from '@/lib/future/regel-sim'
import { buildFeeSimInput } from '@/lib/fee-analysis'
import { DEFAULT_FIRE_STRATEGY, type FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'

/**
 * FASE 6, item 5 — convergentie-routing van de /toekomst-Voorkeuren-editors.
 *
 * Harde eis: zonder kernelvelden (of met `kernelEnabled: false`) is `runRegelProjection`
 * byte-identiek aan de bestaande v2-tak. Met vlag + rauwe context draait baseline én
 * draft door de horizon-kernel, en de draft-strategie werkt via het profiel door.
 */

const YEARLY_EXPENSES = 30_000
const ANNUAL_SAVINGS = 24_000
const DOB = '1986-01-01'

// Hergebruik de fee-bridge om een geldige UnifiedProjectionInput (+ synthetische
// investment-pot) te bouwen — puur voor de test-fixture.
const unifiedInput = buildFeeSimInput(
  {
    currentAge: 40,
    endAge: 90,
    currentPortfolio: 300_000,
    yearlyExpenses: YEARLY_EXPENSES,
    annualSavings: ANNUAL_SAVINGS,
    grossReturn: 0.07,
    returnModel: 'nl_box3',
    inflation: 0.02,
    cashflows: [],
  },
  0.07,
)

const fireStrategy: FireStrategyConfig = {
  ...DEFAULT_FIRE_STRATEGY,
  strategy: 'deplete',
  endAge: 90,
  legacyAmount: 0,
}

const baseSnapshot: RegelSimSnapshot = {
  unifiedInput,
  fireStrategy,
  withdrawalStrategy: WITHDRAWAL_DEFAULTS,
  aowAgeInt: 67,
  aowFractional: 67,
  useV2: true,
}

const rawContext: ConvergentieRawContext = {
  profile: {
    date_of_birth: DOB,
    net_monthly_income: (YEARLY_EXPENSES + ANNUAL_SAVINGS) / 12,
    estimated_monthly_expenses: YEARLY_EXPENSES / 12,
    yearly_essential_expenses: YEARLY_EXPENSES,
    retirement_expense_method: 'essential_budgets',
    expected_return: 0.07,
    inflation_rate: 0.02,
    box3_method: 'forfaitair',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    fire_legacy_amount: 0,
  },
  assets: unifiedInput.assets,
  debts: [],
  lifeEvents: [],
  yearlyExpenses: YEARLY_EXPENSES,
}

describe('runRegelProjection — convergentie-routing', () => {
  it('geen kernelvelden ≡ kernelEnabled:false (byte-identiek, v2-tak)', () => {
    const a = runRegelProjection(baseSnapshot)
    const b = runRegelProjection({ ...baseSnapshot, kernelEnabled: false, rawContext: undefined })
    expect(a).toEqual(b)
  })

  it('kernelEnabled zonder rawContext blijft v2 (guard vereist beide)', () => {
    const v2 = runRegelProjection(baseSnapshot)
    const guarded = runRegelProjection({ ...baseSnapshot, kernelEnabled: true, rawContext: undefined })
    expect(guarded).toEqual(v2)
  })

  it('kernelEnabled + rawContext draait daadwerkelijk op de kernel (≠ v2-projectie)', () => {
    const v2 = runRegelProjection(baseSnapshot)
    const kernel = runRegelProjection({ ...baseSnapshot, kernelEnabled: true, rawContext })
    expect(kernel.rows.length).toBeGreaterThan(0)
    // Kernel (nominaal) wijkt structureel af van v2 (reëel) → geen stille terugval.
    expect(kernel).not.toEqual(v2)
  })

  it('draft-eindstrategie werkt via het profiel door in de kernel-run', () => {
    const snap = { ...baseSnapshot, kernelEnabled: true, rawContext }
    const baseline = runRegelProjection(snap)
    const draft = runRegelProjection(snap, {
      fireStrategy: { ...DEFAULT_FIRE_STRATEGY, strategy: 'legacy', endAge: 90, legacyAmount: 500_000 },
    })
    // Een fors nalatenschapsdoel verandert de projectie t.o.v. de deplete-baseline.
    expect(draft).not.toEqual(baseline)
  })
})
