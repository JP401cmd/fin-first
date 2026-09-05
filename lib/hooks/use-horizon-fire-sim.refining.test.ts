/**
 * UR3-07 defect 1 — "wordt berekend…" mag nooit een eindstand zijn.
 *
 * WAT ER MISGING: op een account zonder inkomen én zonder essentiële uitgaven
 * geeft `buildHorizonInput` bewust `null` terug (jaaruitgave 0 — zie
 * `lib/horizon/build-input.ts`). Het worker-effect in deze hook slaat de
 * kernel-aanroep dan over, dus `asyncSimMain` blijft voor altijd `null`. De
 * `isRefining`-vlag toetste echter alleen of de RUWE invoer aanwezig was
 * (`horizonInput`/`kernelRawProfile`), niet of daar een geldige kernel-invoer
 * van te bouwen valt — en bleef daardoor permanent `true`. Op /toekomst stond
 * "VRIJHEIDSLEEFTIJD ··· wordt berekend…" bij élk bezoek, naast tegels die al
 * eerlijk "We missen gegevens" toonden.
 *
 * WAAROM EEN EIGEN BESTAND: deze suite draait de WORKER-tak, en die bestaat in
 * jsdom niet (`isKernelWorkerAvailable()` is daar `false`, waardoor `isRefining`
 * per definitie `false` is en de bug onzichtbaar blijft). We mocken het
 * worker-module daarom op moduleniveau — dat mag de bestaande
 * `use-horizon-fire-sim.test.ts` niet raken, die juist de synchrone
 * parity-tak bewijst.
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Asset } from '@/lib/asset-data'
import type { FinancialInput } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'

/** De worker "bestaat" en levert nooit iets op — precies de first-paint-situatie. */
const { kernelCalls } = vi.hoisted(() => ({ kernelCalls: { count: 0 } }))

vi.mock('@/lib/horizon-kernel/worker/run-in-worker', () => ({
  isKernelWorkerAvailable: () => true,
  runKernelAsync: () => {
    kernelCalls.count += 1
    return new Promise(() => {})
  },
  runForcedStopPathAsync: () => new Promise(() => {}),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: () => new Promise(() => {}) },
    from: () => ({ update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }) }),
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
} as unknown as ConvergentieRawProfileRow

const ASSETS = [
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

function makeFinancial(yearlyMustExpenses: number): FinancialInput {
  return {
    totalAssets: 150_000,
    totalDebts: 0,
    monthlyIncome: yearlyMustExpenses > 0 ? 4000 : 0,
    monthlyExpenses: yearlyMustExpenses / 12,
    yearlyMustExpenses,
    monthlyContributions: 0,
    dateOfBirth: DOB,
  }
}

type HookParams = NonNullable<Parameters<typeof useHorizonFireSim>[0]>

function makeParams(yearlyMustExpenses: number): HookParams {
  return {
    horizonInput: makeFinancial(yearlyMustExpenses),
    lifeEvents: [],
    fireStrategy: FIRE_STRATEGY,
    withdrawalStrategy: WITHDRAWAL_DEFAULTS,
    grossReturn: 0.07,
    inflation: 0.02,
    assets: ASSETS,
    debts: [],
    box3Method: 'forfaitair',
    hasPartner: false,
    housingStrategy: { mode: 'include_full' },
    kernelRawProfile: PROFILE,
    aowRows: [],
  }
}

describe('useHorizonFireSim — isRefining volgt de kernel-invoer, niet de rauwe invoer', () => {
  it('met een berekenbare invoer wacht de hero wél op de worker (isRefining=true)', () => {
    kernelCalls.count = 0
    const { result, unmount } = renderHook(() => useHorizonFireSim(makeParams(30_000)))

    expect(kernelCalls.count, 'de worker hoort aangeroepen te zijn').toBeGreaterThan(0)
    expect(result.current.isRefining).toBe(true)
    expect(result.current.isLoading).toBe(true)
    unmount()
  })

  it('zonder jaaruitgave draait de worker NOOIT — dus is er ook niets aan het rekenen', () => {
    kernelCalls.count = 0
    const { result, unmount } = renderHook(() => useHorizonFireSim(makeParams(0)))

    // De bug in één regel: het effect roept de kernel niet aan (buildHorizonInput
    // geeft null), dus een vlag die zegt "we zijn aan het verfijnen" liegt.
    expect(kernelCalls.count, 'geen berekenbare invoer ⇒ geen kernel-run').toBe(0)
    expect(result.current.isRefining).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.result).toBeNull()
    unmount()
  })

  it('zonder rauw profiel is er evenmin iets aan het rekenen', () => {
    kernelCalls.count = 0
    const { result, unmount } = renderHook(() =>
      useHorizonFireSim({ ...makeParams(30_000), kernelRawProfile: null }),
    )

    expect(kernelCalls.count).toBe(0)
    expect(result.current.isRefining).toBe(false)
    unmount()
  })
})
