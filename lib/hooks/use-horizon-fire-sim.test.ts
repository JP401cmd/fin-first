import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Asset } from '@/lib/asset-data'
import type { FinancialInput } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { toSimResult } from '@/lib/unified-projection'
import { computeConvergentieProjection, type ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'

/**
 * FASE 6, stap 5A — use-horizon-fire-sim: kernel-only contract-tests.
 *
 * De v2-grootboek-engine (`@/lib/horizon-engine/*`, `runSelectedProjection`) is fysiek
 * verwijderd; de hook heeft nu geen `engine`/vlag-tak meer — `kernelRawProfile` is
 * verplicht en de kernel is de enige motor (`computeConvergentieProjection`). Deze tests
 * bouwen de verwachte uitkomst met dezelfde router-aanroep (geen mock van de kernel zelf,
 * enkel van de Supabase-client voor het debounced snapshot-effect).
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
    kernelRawProfile: PROFILE,
    aowRows: [],
    ...overrides,
  }
}

describe('useHorizonFireSim — kernel-tak (rawProfile aanwezig)', () => {
  it('result deep-equals een directe computeConvergentieProjection-aanroep met dezelfde rawContext', () => {
    // yearlyExpenses zoals buildHorizonInput 'm afleidt: yearlyMustExpenses (30_000 > 0).
    const outcome = computeConvergentieProjection({
      rawContext: {
        profile: PROFILE,
        assets: makeAssets(),
        debts: [],
        lifeEvents: [],
        aowRows: [],
        yearlyExpenses: 30_000,
      },
    })
    if (!outcome.ok) throw new Error('kernel-outcome was niet ok — fixture ongeldig')
    const expected = toSimResult(outcome.result)

    const params = makeParams()
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))

    expect(result.current.result).toEqual(expected)
    expect(result.current.unifiedRows).toEqual(outcome.result.rows)
    expect(result.current.kernelStatus).toBe(outcome.kernelStatus)
    expect(result.current.kernelMaandHint).toBe(outcome.kernelMaandHint)
    expect(result.current.kernelHousingSale).toEqual(outcome.kernelHousingSale ?? null)
    expect(['reached_now', 'reached_at', 'unreachable_within_horizon', 'pension_shortfall'])
      .toContain(result.current.kernelStatus)
    unmount()
  })
})

describe('useHorizonFireSim — kernelRawProfile ontbreekt', () => {
  it('levert een leeg resultaat zonder te crashen (geen kernel-run mogelijk)', () => {
    const params = makeParams({ kernelRawProfile: null })
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))

    expect(result.current.result).toBeNull()
    expect(result.current.unifiedRows).toBeNull()
    expect(result.current.kernelStatus).toBeNull()
    expect(result.current.kernelMaandHint).toBeNull()
    expect(result.current.kernelHousingSale).toBeNull()
    // Zonder kernel-run vallen de effectieve events terug op de rauwe input-events.
    expect(result.current.effectiveLifeEvents).toEqual([])
    unmount()
  })
})

describe('useHorizonFireSim — kern-fout in de rawProfile (geen geboortedatum)', () => {
  it('degradeert netjes naar een leeg resultaat (computeConvergentieProjection { ok: false })', () => {
    const brokenProfile: ConvergentieRawProfileRow = { ...PROFILE, date_of_birth: null }
    const params = makeParams({ kernelRawProfile: brokenProfile })
    const { result, unmount } = renderHook(() => useHorizonFireSim(params))

    expect(result.current.result).toBeNull()
    expect(result.current.unifiedRows).toBeNull()
    unmount()
  })
})

describe('useHorizonFireSim — geen horizonInput', () => {
  it('isLoading=true en alle velden leeg/null', () => {
    const { result, unmount } = renderHook(() => useHorizonFireSim({ ...makeParams(), horizonInput: null }))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.result).toBeNull()
    expect(result.current.unifiedRows).toBeNull()
    unmount()
  })
})
