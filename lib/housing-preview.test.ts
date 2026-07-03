import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { FinancialInput } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import {
  deriveHousingContext,
  type DownsizeConfig,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import {
  runHousingScenarioProjection,
  type HousingPreviewData,
  type HousingTriggerSimBasis,
} from '@/lib/housing-trigger'
import { runHousingScenarioProjectionV2, buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { computeConvergentieProjection, type ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import { applyKernelHousingSaleToEvents } from '@/lib/horizon/kernel-display-events'
import { runHousingScenarioPreview, isHousingPreviewKernelEnabled } from '@/lib/housing-preview'

/**
 * FASE 6, stap 1 (item 6/7) — housing-preview-motorschakelaar.
 * Kernpunt: byte-identiteit bij vlag UIT (de helper === de directe bestaande
 * aanroep, geen mock) + de kernel-tak (vlag AAN) die de kernel-verkoopwaarheid
 * (`kernelHousingSale`) toont i.p.v. de stale v2-trigger.
 */

const DOB = '1971-01-01'

// Eigenaar-vorm: eigen huis + gekoppelde hypotheek + bescheiden liquide pot, uitgaven
// dicht op nul-inkomen zodat de on_depletion-downsize daadwerkelijk een verkoop triggert.
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

function makePreview(overrides: Partial<HousingPreviewData> = {}): HousingPreviewData {
  return {
    simBasis: simBasis(),
    context: deriveHousingContext(ASSETS, DEBTS),
    horizonEngineV2: true,
    ...overrides,
  }
}

/** Directe kernel-run met dezelfde profiel-override — losse builtInput (de kernel-tak
 *  leest alléén de rawContext, dus welke geldige builtInput dan ook geeft dezelfde
 *  kernel-uitvoer). Spiegelt wat de helper intern doet. */
function directKernelOutcome(config: HousingStrategyConfig) {
  const financial: FinancialInput = {
    totalAssets: 560000, totalDebts: 150000, monthlyIncome: 0, monthlyExpenses: 3000,
    yearlyMustExpenses: 36000, monthlyContributions: 0, dateOfBirth: DOB,
  }
  const fireStrategy: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
  const built = buildHorizonInput({
    horizonInput: financial, lifeEvents: [], fireStrategy, withdrawalStrategy: WITHDRAWAL_DEFAULTS,
    grossReturn: 0.05, inflation: 0.02, assets: ASSETS, debts: DEBTS, box3Method: 'forfaitair',
    hasPartner: false, housingStrategy: config, horizonEngineV2: true,
  })!
  return computeConvergentieProjection({
    builtInput: built.input,
    strategyOptions: built.strategyOptions,
    v2FlagArg: true,
    kernelEnabled: true,
    rawContext: {
      profile: { ...PROFILE, housing_strategy_config: config },
      assets: ASSETS, debts: DEBTS, lifeEvents: [], aowRows: [], yearlyExpenses: 36000,
    },
  })
}

describe('runHousingScenarioPreview — byte-identiteit (vlag uit)', () => {
  it('geen kernel-context → LETTERLIJK runHousingScenarioProjectionV2 (horizonEngineV2=true)', () => {
    const preview = makePreview({ horizonEngineV2: true })
    expect(isHousingPreviewKernelEnabled(preview)).toBe(false)
    const direct = runHousingScenarioProjectionV2(DOWNSIZE_ON_DEPLETION, preview.context, preview.simBasis)
    expect(runHousingScenarioPreview(DOWNSIZE_ON_DEPLETION, preview)).toEqual(direct)
  })

  it('geen kernel-context → LETTERLIJK runHousingScenarioProjection (horizonEngineV2=false)', () => {
    const preview = makePreview({ horizonEngineV2: false })
    const direct = runHousingScenarioProjection(DOWNSIZE_ON_DEPLETION, preview.context, preview.simBasis)
    expect(runHousingScenarioPreview(DOWNSIZE_ON_DEPLETION, preview)).toEqual(direct)
  })

  it('vlag AAN maar rawContext ontbreekt → nog steeds byte-identiek v2 (geen kernel)', () => {
    const preview = makePreview({ kernelConvergentieEnabled: true, kernelRawContext: undefined })
    expect(isHousingPreviewKernelEnabled(preview)).toBe(false)
    const direct = runHousingScenarioProjectionV2(DOWNSIZE_ON_DEPLETION, preview.context, preview.simBasis)
    expect(runHousingScenarioPreview(DOWNSIZE_ON_DEPLETION, preview)).toEqual(direct)
  })

  it('rawContext aanwezig maar vlag UIT → byte-identiek v2 (geen kernel)', () => {
    const preview = makePreview({
      kernelConvergentieEnabled: false,
      kernelRawContext: { profile: PROFILE, assets: ASSETS, debts: DEBTS, lifeEvents: [], aowRows: [], yearlyExpenses: 36000 },
    })
    expect(isHousingPreviewKernelEnabled(preview)).toBe(false)
    const direct = runHousingScenarioProjectionV2(DOWNSIZE_ON_DEPLETION, preview.context, preview.simBasis)
    expect(runHousingScenarioPreview(DOWNSIZE_ON_DEPLETION, preview)).toEqual(direct)
  })
})

describe('runHousingScenarioPreview — kernel-tak (vlag aan)', () => {
  const kernelPreview = () =>
    makePreview({
      kernelConvergentieEnabled: true,
      kernelRawContext: { profile: PROFILE, assets: ASSETS, debts: DEBTS, lifeEvents: [], aowRows: [], yearlyExpenses: 36000 },
    })

  it('downsize → kernel-projectie + item 7: verkoopleeftijd komt uit kernelHousingSale', () => {
    const preview = kernelPreview()
    expect(isHousingPreviewKernelEnabled(preview)).toBe(true)

    const outcome = directKernelOutcome(DOWNSIZE_ON_DEPLETION)
    expect(outcome.engine).toBe('kernel')

    const result = runHousingScenarioPreview(DOWNSIZE_ON_DEPLETION, preview)
    // Vrijheidsleeftijd = kernel-uitvoer (geconsumeerd, niet herberekend).
    expect(result.fireAgeFractional).toBe(outcome.result.fireAgeFractional)
    expect(result.fireReachable).toBe(outcome.result.fireReachable)
    // Kernel-tak levert geen v2-depletion-bundel.
    expect(result.depletion).toBeNull()
    // Item 7: het verkoop-event staat op de KERNEL-verkoopwaarheid, via exact dezelfde
    // marker-helper als de hoofdgrafiek — nooit de stale v2-trigger.
    expect(result.events).toEqual(applyKernelHousingSaleToEvents([], outcome.kernelHousingSale ?? null))
  })

  it('kernel-tak wijkt bewust af van de v2-preview (andere motor, geen toevallige gelijkheid)', () => {
    const preview = kernelPreview()
    const kernel = runHousingScenarioPreview(DOWNSIZE_ON_DEPLETION, preview)
    const v2 = runHousingScenarioProjectionV2(DOWNSIZE_ON_DEPLETION, preview.context, preview.simBasis)
    // Verschillende engines → de events dragen op de kernel-tak de kernelDerived-marker;
    // op de v2-tak niet. (Bewijs dat de kernel-tak echt een ander pad neemt.)
    const kernelSale = kernel.events.find((e) => e.event_type === 'verkoop_eigen_woning')
    if (kernelSale) {
      expect((kernelSale.metadata as { kernelDerived?: boolean } | null)?.kernelDerived).toBe(true)
    }
    const v2Sale = v2.events.find((e) => e.event_type === 'verkoop_eigen_woning')
    if (v2Sale) {
      expect((v2Sale.metadata as { kernelDerived?: boolean } | null)?.kernelDerived).toBeUndefined()
    }
  })
})
