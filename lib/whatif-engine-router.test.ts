import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { FinancialInput } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import type { UnifiedProjectionInput } from '@/lib/unified-projection'
import { computeWhatifProjection } from './whatif-engine-router'
import type { WhatifRawProfileRow } from '@/lib/horizon-kernel/adapter/whatif-varianten'

/**
 * FASE 5, stap 2a — router-tests. Kernpunt: byte-identiteit bij vlag UIT (mock niets,
 * roep beide echt aan) + de kernel/fallback-tak-selectie.
 */

const DOB = '1986-01-01'

const FIRE_STRATEGY: FireStrategyConfig = { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }

const PROFILE: WhatifRawProfileRow = {
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

describe('computeWhatifProjection — byte-identiteit (vlag uit)', () => {
  it('vlag uit → .result deep-equals een directe runSelectedProjection-aanroep', () => {
    const { built } = makeBuilt()
    const direct = runSelectedProjection(built.input, true, built.strategyOptions)
    const outcome = computeWhatifProjection({
      builtInput: built.input,
      strategyOptions: built.strategyOptions,
      v2FlagArg: true,
      kernelEnabled: false,
    })
    expect(outcome.engine).toBe('v2')
    expect(outcome.fallbackReason).toBeUndefined()
    expect(outcome.result).toEqual(direct)
  })
})

describe('computeWhatifProjection — kernel-tak', () => {
  it('vlag aan + schone input → engine "kernel"', () => {
    const { built, assets } = makeBuilt()
    // Sanity: geen v2-only woningmachinerie op deze built input.
    expect(built.input.assetLiquidations ?? []).toHaveLength(0)
    const outcome = computeWhatifProjection({
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
  })

  it('withDiff → diff gevuld (kernel + v2 getallen)', () => {
    const { built, assets } = makeBuilt()
    const outcome = computeWhatifProjection({
      builtInput: built.input,
      strategyOptions: built.strategyOptions,
      v2FlagArg: true,
      kernelEnabled: true,
      withDiff: true,
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
    expect(outcome.diff).toBeDefined()
    expect(typeof outcome.diff!.kernelEndPortfolio).toBe('number')
    expect(typeof outcome.diff!.v2EndPortfolio).toBe('number')
  })
})

describe('computeWhatifProjection — fallback', () => {
  it('vlag aan + v2-only woningmachinerie → engine "v2" + fallbackReason', () => {
    const { built, assets } = makeBuilt()
    const inputWithHousing: UnifiedProjectionInput = {
      ...built.input,
      assetLiquidations: [
        { assetId: 'huis', age: 65, salePricePct: 1, salesCostsPct: 0.04, payoffDebtIds: [] },
      ],
    }
    const outcome = computeWhatifProjection({
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
    // Byte-identiek aan de v2-run van diezelfde input.
    expect(outcome.result).toEqual(
      runSelectedProjection(inputWithHousing, true, built.strategyOptions),
    )
  })

  it('vlag aan zonder rawContext → engine "v2" + reden', () => {
    const { built } = makeBuilt()
    const outcome = computeWhatifProjection({
      builtInput: built.input,
      strategyOptions: built.strategyOptions,
      v2FlagArg: true,
      kernelEnabled: true,
    })
    expect(outcome.engine).toBe('v2')
    expect(outcome.fallbackReason).toBeTruthy()
  })

  it('vlag aan + kernel-fout (date_of_birth null) → try/catch-vangnet → engine "v2" + /kernel-fout/', () => {
    // Schone built input (geen woningmachinerie) + geldige rawContext → NIET de
    // !rawContext-guard; de kernel-tak wordt betreden en buildKernelInputFromApp
    // gooit op de ontbrekende geboortedatum → het try/catch-vangnet vangt 'm.
    const { built, assets } = makeBuilt()
    const brokenProfile: WhatifRawProfileRow = { ...PROFILE, date_of_birth: null }
    const outcome = computeWhatifProjection({
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
    // Byte-identiek aan de directe v2-run.
    expect(outcome.result).toEqual(
      runSelectedProjection(built.input, true, built.strategyOptions),
    )
  })
})
