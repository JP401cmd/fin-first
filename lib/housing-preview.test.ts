import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import {
  deriveHousingContext,
  type DownsizeConfig,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import type { HousingPreviewData, HousingTriggerSimBasis } from '@/lib/housing-trigger'
import { computeConvergentieProjection, type ConvergentieRawProfileRow, type ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'
import { applyKernelHousingSaleToEvents } from '@/lib/horizon/kernel-display-events'
import { runHousingScenarioPreview, isHousingPreviewKernelEnabled } from '@/lib/housing-preview'

/**
 * FASE 6, stap 5A — housing-preview kernel-only contract-tests.
 *
 * De v2-grootboek-engine (`runHousingScenarioProjectionV2`/`runHousingScenarioProjection`,
 * `@/lib/horizon-engine/build-input`) is fysiek verwijderd — housing-preview.ts kent nog maar
 * één tak: kernel-native via `kernelRawContext`. De "byte-identiek aan v2 bij vlag uit"-opzet
 * uit de vorige versie van dit bestand is vervangen door een aanwezig/afwezig-contract:
 * geen context → EMPTY_SCENARIO; context aanwezig → identiek aan een directe
 * `computeConvergentieProjection`-aanroep met dezelfde profile-override.
 */

const DOB = '1971-01-01'

// Eigenaar-vorm: eigen huis + gekoppelde hypotheek + bescheiden liquide pot.
const ASSETS: Asset[] = (
  [
    ['huis', 'Woning', 'eigen_huis', 420000, 380000, 3.0, null],
    ['bel', 'Beleggen', 'investment', 120000, null, 5, null],
    ['cash', 'Spaar', 'cash', 20000, null, 0, null],
  ] as const
).map(([id, name, t, v, woz, r, dep]) => ({
  id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r,
  monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep,
}) as unknown as Asset)

const DEBTS: Debt[] = [
  { id: 'hyp', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 150000, interest_rate: 3.0, monthly_payment: 900, repayment_type: 'annuiteit', is_tax_deductible: true, linked_asset_id: 'huis', end_date: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
]

const DOWNSIZE_ON_DEPLETION: DownsizeConfig = {
  mode: 'downsize',
  trigger: 'on_depletion',
  triggerAge: 90,
  salePricePct: 1,
  salesCostsPct: 0.05,
  newMonthlyHousingCost: null,
  depletionThresholdYears: 0,
} as unknown as DownsizeConfig

function simBasis(): HousingTriggerSimBasis {
  return {
    assets: ASSETS,
    debts: DEBTS,
    currentAge: 55,
    endAge: 90,
    yearlyExpenses: 36000,
    annualSavings: 0,
    monthlyIncome: 0,
    grossReturn: 0.05,
    inflationRate: 0.02,
    box3Method: 'forfaitair',
    cashflows: [],
    strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: WITHDRAWAL_DEFAULTS,
    hasPartner: false,
  }
}

const PROFILE: ConvergentieRawProfileRow = {
  date_of_birth: DOB,
  net_monthly_income: 0,
  estimated_monthly_expenses: 3000,
  expected_return: 5,
  inflation_rate: 2,
  box3_method: 'forfaitair',
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  withdrawal_strategy: 'static',
  housing_strategy_config: { mode: 'include_full' },
  retirement_expense_method: 'current_expenses',
  retirement_expense_custom_amount: null,
  yearly_essential_expenses: 36000,
}

const RAW_CONTEXT: ConvergentieRawContext = {
  profile: PROFILE, assets: ASSETS, debts: DEBTS, lifeEvents: [], aowRows: [], yearlyExpenses: 36000,
}

function makePreview(overrides: Partial<HousingPreviewData> = {}): HousingPreviewData {
  return {
    simBasis: simBasis(),
    context: deriveHousingContext(ASSETS, DEBTS),
    ...overrides,
  }
}

/** Directe kernel-run met dezelfde profiel-override — spiegelt wat de helper intern doet. */
function directKernelOutcome(config: HousingStrategyConfig) {
  return computeConvergentieProjection({
    rawContext: { ...RAW_CONTEXT, profile: { ...PROFILE, housing_strategy_config: config } },
  })
}

describe('isHousingPreviewKernelEnabled', () => {
  it('true wanneer kernelRawContext aanwezig is', () => {
    expect(isHousingPreviewKernelEnabled(makePreview({ kernelRawContext: RAW_CONTEXT }))).toBe(true)
  })

  it('false wanneer kernelRawContext ontbreekt', () => {
    expect(isHousingPreviewKernelEnabled(makePreview())).toBe(false)
  })
})

describe('runHousingScenarioPreview — geen kernel-context', () => {
  it('levert de lege scenario-uitkomst (geen crash, geen v2-terugval — die motor bestaat niet meer)', () => {
    const preview = makePreview()
    expect(runHousingScenarioPreview(DOWNSIZE_ON_DEPLETION, preview)).toEqual({
      events: [],
      depletion: null,
      fireAgeFractional: null,
      fireReachable: false,
    })
  })
})

describe('runHousingScenarioPreview — kernel-tak', () => {
  const kernelPreview = () => makePreview({ kernelRawContext: RAW_CONTEXT })

  it('downsize → identiek aan directe computeConvergentieProjection (dezelfde profile-override)', () => {
    const preview = kernelPreview()
    expect(isHousingPreviewKernelEnabled(preview)).toBe(true)

    const outcome = directKernelOutcome(DOWNSIZE_ON_DEPLETION)
    if (!outcome.ok) throw new Error('kernel-outcome was niet ok — fixture ongeldig')

    const result = runHousingScenarioPreview(DOWNSIZE_ON_DEPLETION, preview)
    // Vrijheidsleeftijd = kernel-uitvoer (geconsumeerd, niet herberekend).
    expect(result.fireAgeFractional).toBe(outcome.result.fireAgeFractional)
    expect(result.fireReachable).toBe(outcome.result.fireReachable)
    // Kernel-tak levert geen v2-depletion-bundel.
    expect(result.depletion).toBeNull()
    // Item 7: het verkoop-event staat op de KERNEL-verkoopwaarheid, via exact dezelfde
    // marker-helper als de hoofdgrafiek.
    expect(result.events).toEqual(applyKernelHousingSaleToEvents([], outcome.kernelHousingSale ?? null))
  })

  it('include_full (geen verkoop) → geen verkoop-event, wel een geldige fireAgeFractional-uitkomst', () => {
    const preview = kernelPreview()
    const config: HousingStrategyConfig = { mode: 'include_full' }
    const outcome = directKernelOutcome(config)
    if (!outcome.ok) throw new Error('kernel-outcome was niet ok — fixture ongeldig')

    const result = runHousingScenarioPreview(config, preview)
    expect(result.fireAgeFractional).toBe(outcome.result.fireAgeFractional)
    expect(result.events.some((e) => e.event_type === 'verkoop_eigen_woning')).toBe(false)
  })

  it('kern-fout (geen geboortedatum) → nette degradatie naar de lege scenario-uitkomst', () => {
    const brokenContext: ConvergentieRawContext = {
      ...RAW_CONTEXT,
      profile: { ...PROFILE, date_of_birth: null },
    }
    const preview = makePreview({ kernelRawContext: brokenContext })
    expect(runHousingScenarioPreview(DOWNSIZE_ON_DEPLETION, preview)).toEqual({
      events: [],
      depletion: null,
      fireAgeFractional: null,
      fireReachable: false,
    })
  })
})
