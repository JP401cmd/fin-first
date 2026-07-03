import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { FinancialInput } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import type { UnifiedProjectionInput } from '@/lib/unified-projection'
import {
  buildConvergentieAdapterProfile,
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
} from './convergentie-router'
import { deriveEigenHuisIds } from './adapter'
import { deriveEigenHuisIds as deriveEigenHuisIdsViaWhatif } from './adapter/whatif-varianten'

/**
 * FASE 5, stap 2b — convergentie-router-tests. Kernpunt: byte-identiteit bij vlag
 * UIT (mock niets, roep beide echt aan), de kernel/terugval-tak-selectie en de
 * V12-solver-doorvoer. Spiegelt de what-if-router-tests (stap 2a).
 */

const DOB = '1986-01-01'

const FIRE_STRATEGY: FireStrategyConfig = { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }

const PROFILE: ConvergentieRawProfileRow = {
  date_of_birth: DOB,
  net_monthly_income: 4000,
  estimated_monthly_expenses: 2500,
  expected_return: 7,
  inflation_rate: 2,
  box3_method: 'forfaitair',
  fire_end_strategy: 'perpetual',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  withdrawal_strategy: 'static',
  housing_strategy_config: { mode: 'include_full' },
  retirement_expense_method: 'current_expenses',
  retirement_expense_custom_amount: null,
}

function makeAssets(): Asset[] {
  return [
    {
      id: 'inv',
      name: 'Beleggingen',
      asset_type: 'investment',
      current_value: 150_000,
      woz_value: null,
      expected_return: 7,
      monthly_contribution: 800,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    },
  ] as unknown as Asset[]
}

/** Bouw een geldige `UnifiedProjectionInput` (pure beleggingsportefeuille, geen woning). */
function makeBuilt() {
  const assets = makeAssets()
  const financial: FinancialInput = {
    totalAssets: 150_000,
    totalDebts: 0,
    monthlyIncome: 4000,
    monthlyExpenses: 2500,
    yearlyMustExpenses: 30_000,
    monthlyContributions: 800,
    dateOfBirth: DOB,
  }
  const built = buildHorizonInput({
    horizonInput: financial,
    lifeEvents: [],
    fireStrategy: FIRE_STRATEGY,
    withdrawalStrategy: WITHDRAWAL_DEFAULTS,
    grossReturn: 0.07,
    inflation: 0.02,
    assets,
    debts: [],
    box3Method: 'forfaitair',
    hasPartner: false,
    housingStrategy: { mode: 'include_full' },
    horizonEngineV2: true,
  })
  if (!built) throw new Error('buildHorizonInput gaf null')
  return { built, assets }
}

describe('computeConvergentieProjection — byte-identiteit (vlag uit)', () => {
  it('vlag uit → .result deep-equals een directe runSelectedProjection-aanroep', () => {
    const { built } = makeBuilt()
    const direct = runSelectedProjection(built.input, true, built.strategyOptions)
    const outcome = computeConvergentieProjection({
      builtInput: built.input,
      strategyOptions: built.strategyOptions,
      v2FlagArg: true,
      kernelEnabled: false,
    })
    expect(outcome.engine).toBe('v2')
    expect(outcome.fallbackReason).toBeUndefined()
    expect(outcome.kernelStatus).toBeUndefined()
    expect(outcome.result).toEqual(direct)
  })

  it('vlag uit met v2FlagArg=false → byte-identiek aan de v1-tak-selectie', () => {
    const { built } = makeBuilt()
    const direct = runSelectedProjection(built.input, false, built.strategyOptions)
    const outcome = computeConvergentieProjection({
      builtInput: built.input,
      strategyOptions: built.strategyOptions,
      v2FlagArg: false,
      kernelEnabled: false,
    })
    expect(outcome.result).toEqual(direct)
  })
})

describe('computeConvergentieProjection — kernel-tak', () => {
  it('vlag aan + schone input → engine "kernel" + solver-doorvoer (V12)', () => {
    const { built, assets } = makeBuilt()
    expect(built.input.assetLiquidations ?? []).toHaveLength(0)
    const outcome = computeConvergentieProjection({
      builtInput: built.input,
      strategyOptions: built.strategyOptions,
      v2FlagArg: true,
      kernelEnabled: true,
      rawContext: {
        profile: PROFILE,
        assets,
        debts: [],
        lifeEvents: [],
        aowRows: [],
        yearlyExpenses: built.input.yearlyExpenses,
      },
    })
    expect(outcome.engine).toBe('kernel')
    expect(outcome.fallbackReason).toBeUndefined()
    expect(outcome.result.rows.length).toBeGreaterThan(0)
    // V12: solver-status + €/mnd-hint reizen mee naar de oppervlakken.
    expect(['reached_now', 'reached_at', 'unreachable_within_horizon', 'pension_shortfall'])
      .toContain(outcome.kernelStatus)
    expect(typeof outcome.kernelMaandHint).toBe('number')
  })
})

describe('computeConvergentieProjection — terugval', () => {
  it('vlag aan + v2-only woningmachinerie → engine "v2" + fallbackReason', () => {
    const { built, assets } = makeBuilt()
    const inputWithHousing: UnifiedProjectionInput = {
      ...built.input,
      assetLiquidations: [
        { assetId: 'huis', age: 65, salePricePct: 1, salesCostsPct: 0.04, payoffDebtIds: [] },
      ],
    }
    const outcome = computeConvergentieProjection({
      builtInput: inputWithHousing,
      strategyOptions: built.strategyOptions,
      v2FlagArg: true,
      kernelEnabled: true,
      rawContext: {
        profile: PROFILE,
        assets,
        debts: [],
        lifeEvents: [],
        aowRows: [],
        yearlyExpenses: built.input.yearlyExpenses,
      },
    })
    expect(outcome.engine).toBe('v2')
    expect(outcome.fallbackReason).toBeTruthy()
    expect(outcome.result).toEqual(
      runSelectedProjection(inputWithHousing, true, built.strategyOptions),
    )
  })

  it('vlag aan zonder rawContext → engine "v2" + reden', () => {
    const { built } = makeBuilt()
    const outcome = computeConvergentieProjection({
      builtInput: built.input,
      strategyOptions: built.strategyOptions,
      v2FlagArg: true,
      kernelEnabled: true,
    })
    expect(outcome.engine).toBe('v2')
    expect(outcome.fallbackReason).toBeTruthy()
  })

  it('vlag aan + kernel-fout (date_of_birth null) → vangnet → engine "v2" + /kernel-fout/', () => {
    const { built, assets } = makeBuilt()
    const brokenProfile: ConvergentieRawProfileRow = { ...PROFILE, date_of_birth: null }
    const outcome = computeConvergentieProjection({
      builtInput: built.input,
      strategyOptions: built.strategyOptions,
      v2FlagArg: true,
      kernelEnabled: true,
      rawContext: {
        profile: brokenProfile,
        assets,
        debts: [],
        lifeEvents: [],
        aowRows: [],
        yearlyExpenses: built.input.yearlyExpenses,
      },
    })
    expect(outcome.engine).toBe('v2')
    expect(outcome.fallbackReason).toMatch(/kernel-fout/)
    expect(outcome.result).toEqual(
      runSelectedProjection(built.input, true, built.strategyOptions),
    )
  })
})

describe('buildConvergentieAdapterProfile — veld-mapping', () => {
  it('mapt de kolom-hernoeming + de superset-velden en laat ontbrekend op null/undefined', () => {
    const mapped = buildConvergentieAdapterProfile({
      ...PROFILE,
      retirement_expense_custom_amount: 24_000,
      marginaal_tarief: 0.37,
      deficit_loan_rate: 0.06,
      withdrawal_profile_config: { fase1: 1 },
      yearly_essential_expenses: 18_000,
    })
    expect(mapped.retirement_custom_amount).toBe(24_000)
    expect(mapped.marginaal_tarief).toBe(0.37)
    expect(mapped.deficit_loan_rate).toBe(0.06)
    expect(mapped.withdrawal_profile_config).toEqual({ fase1: 1 })
    expect(mapped.yearly_essential_expenses).toBe(18_000)
    // Ontbrekend → null (adapter-default-territorium).
    const minimal = buildConvergentieAdapterProfile({ date_of_birth: DOB })
    expect(minimal.deficit_loan_rate).toBeNull()
    expect(minimal.marginaal_tarief).toBeNull()
  })
})

describe('deriveEigenHuisIds — canonieke kernel-API (dedupe stap 2b)', () => {
  it('is via adapter-barrel én whatif-varianten dezelfde functie en filtert op actief eigen_huis', () => {
    expect(deriveEigenHuisIds).toBe(deriveEigenHuisIdsViaWhatif)
    const assets = [
      { id: 'h1', asset_type: 'eigen_huis', is_active: true },
      { id: 'h2', asset_type: 'eigen_huis', is_active: false },
      { id: 'inv', asset_type: 'investment', is_active: true },
    ] as unknown as Asset[]
    expect([...deriveEigenHuisIds(assets)]).toEqual(['h1'])
  })
})
