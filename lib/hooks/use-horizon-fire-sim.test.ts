import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Asset } from '@/lib/asset-data'
import type { FinancialInput } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import { toSimResult } from '@/lib/unified-projection'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'

/**
 * FASE 5, stap 2b — use-horizon-fire-sim: convergentie-flip-tests.
 *
 * Kernpunten: byte-identiteit bij vlag UIT (result deep-equals de directe v2-run),
 * de kernel-tak-doorvoer (engine/status/hint) en de terugval zonder rauwe context.
 * Spiegelt de fixture uit lib/horizon-kernel/convergentie-router.test.ts.
 *
 * De supabase-client wordt gemockt zodat het debounced snapshot-effect inert is:
 * `getUser` resolvet nooit en de update-keten is een no-op. We `unmount()` na elke
 * render zodat de debounce-timer wordt opgeruimd.
 */

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: () => new Promise(() => {}) },
    from: () => ({
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    }),
  }),
}))

import { useHorizonFireSim } from './use-horizon-fire-sim'

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

const FINANCIAL: FinancialInput = {
  totalAssets: 150_000,
  totalDebts: 0,
  monthlyIncome: 4000,
  monthlyExpenses: 2500,
  yearlyMustExpenses: 30_000,
  monthlyContributions: 800,
  dateOfBirth: DOB,
}

type HookParams = NonNullable<Parameters<typeof useHorizonFireSim>[0]>

/** Vaste kleine hook-invoer (pure beleggingsportefeuille, geen woning). */
function makeParams(overrides: Partial<HookParams> = {}): HookParams {
  return {
    horizonInput: FINANCIAL,
    lifeEvents: [],
    fireStrategy: FIRE_STRATEGY,
    withdrawalStrategy: WITHDRAWAL_DEFAULTS,
    grossReturn: 0.07,
    inflation: 0.02,
    assets: makeAssets(),
    debts: [],
    box3Method: 'forfaitair',
    hasPartner: false,
    housingStrategy: { mode: 'include_full' },
    ...overrides,
  }
}

describe('useHorizonFireSim — vlag uit (byte-identiteit)', () => {
  it('result deep-equals de directe v2-run + engine "v2" + kernelStatus null', () => {
    // Bouw dezelfde v2-input als de hook intern (horizonEngineV2 default false).
    const built = buildHorizonInput({
      horizonInput: FINANCIAL,
      lifeEvents: [],
      fireStrategy: FIRE_STRATEGY,
      withdrawalStrategy: WITHDRAWAL_DEFAULTS,
      grossReturn: 0.07,
      inflation: 0.02,
      aowAgeFractional: undefined,
      assets: makeAssets(),
      debts: [],
      box3Method: 'forfaitair',
      hasPartner: false,
      bankAccountCash: undefined,
      monthlySavingsOverride: undefined,
      baseAnnualSavingsFromCashflow: undefined,
      housingStrategy: { mode: 'include_full' },
      potRules: undefined,
      horizonEngineV2: false,
    })
    if (!built) throw new Error('buildHorizonInput gaf null')
    const expected = toSimResult(runSelectedProjection(built.input, false, built.strategyOptions))

    const params = makeParams()
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))

    expect(result.current.engine).toBe('v2')
    expect(result.current.kernelStatus).toBeNull()
    expect(result.current.result).toEqual(expected)
    unmount()
  })
})

describe('useHorizonFireSim — vlag aan (kernel-tak)', () => {
  it('engine "kernel" + solver-status + €/mnd-hint + rijen', () => {
    const params = makeParams({
      kernelConvergentieEnabled: true,
      kernelRawProfile: PROFILE,
      aowRows: [],
    })
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))

    expect(result.current.engine).toBe('kernel')
    expect(['reached_now', 'reached_at', 'unreachable_within_horizon', 'pension_shortfall'])
      .toContain(result.current.kernelStatus)
    expect(typeof result.current.kernelMaandHint).toBe('number')
    expect(result.current.result).not.toBeNull()
    expect(result.current.result?.rows.length ?? 0).toBeGreaterThan(0)
    unmount()
  })
})

describe('useHorizonFireSim — vlag aan zonder rawProfile (terugval)', () => {
  it('valt terug op v2 zonder te crashen', () => {
    const params = makeParams({ kernelConvergentieEnabled: true, kernelRawProfile: null })
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))

    expect(result.current.engine).toBe('v2')
    expect(result.current.result).not.toBeNull()
    unmount()
  })
})
