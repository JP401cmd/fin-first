/**
 * B-057 — regressiecase: de hook meldt een HERSOLVE van de hoofdlijn via `mainPending`.
 *
 * WAT DE MELDER ZAG: na het omzetten van het stop-anker ("zo vroeg als het kan" →
 * een vaste leeftijd) duurt het merkbaar even voordat de grafiek meebeweegt, en
 * ondertussen was er niets op de grafiek dat zei dat er gerekend werd.
 *
 * NORM (sinds B-057): `isRefining` blijft de first-paint-staat (`simResult == null`,
 * ADR 0054 — de hero draagt die). Landt er daarna een nieuwe kernel-invoer (ander
 * plan), dan post het worker-effect een nieuwe hoofdrun; de hook laat het OUDE
 * `result` staan (stale-while-revalidate) maar meldt via `mainPending` dat het
 * verouderd is, tot het antwoord met het hoogste reqId landt. Consumenten voeden
 * daarmee de Fin-laadlaag op de grafiek (`ProjectieLaadlaag`) en dempen de
 * hoofdpaden (`ChartStaticLayers#mainPending`).
 *
 * Deze suite draait de WORKER-tak (jsdom heeft geen `Worker`), dus het
 * worker-module wordt op moduleniveau gemockt — zelfde opzet als
 * `use-horizon-fire-sim.refining.test.ts`. Elke run landt met een ÉCHTE
 * kernel-uitkomst (`executeKernelRequest`, de synchrone runner) op het moment dat
 * de test dat kiest.
 */

import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Asset } from '@/lib/asset-data'
import type { FinancialInput } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type {
  ConvergentieProjectionOutcome,
  ConvergentieRawContext,
  ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { executeKernelRequest } from '@/lib/horizon-kernel/worker/kernel-protocol'

/** Elke worker-aanroep wordt vastgehouden; de test beslist wanneer (en of) hij landt. */
const { runs } = vi.hoisted(() => ({
  runs: [] as Array<{
    rawContext: unknown
    resolve: (outcome: unknown) => void
  }>,
}))

vi.mock('@/lib/horizon-kernel/worker/run-in-worker', () => ({
  isKernelWorkerAvailable: () => true,
  runKernelAsync: (rawContext: unknown) =>
    new Promise((resolve) => {
      runs.push({ rawContext, resolve })
    }),
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
const FIRE_STRATEGY: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }

const BASE_PROFILE = {
  date_of_birth: DOB,
  net_monthly_income: 4000,
  estimated_monthly_expenses: 2500,
  expected_return: 7,
  inflation_rate: 2,
  box3_method: 'forfaitair',
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  fire_stop_anchor: 'solved',
  fire_stop_age: null,
  withdrawal_strategy: 'static',
  housing_strategy_config: { mode: 'include_full' },
  retirement_expense_method: 'current_expenses',
  retirement_expense_custom_amount: null,
} as unknown as ConvergentieRawProfileRow

/** Hetzelfde profiel, maar met het stop-anker op een vaste leeftijd — de melder-casus. */
const PROFILE_MET_LEEFTIJD = {
  ...BASE_PROFILE,
  fire_stop_anchor: 'age',
  fire_stop_age: 58,
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

const FINANCIAL: FinancialInput = {
  totalAssets: 150_000,
  totalDebts: 0,
  monthlyIncome: 4000,
  monthlyExpenses: 2500,
  yearlyMustExpenses: 30_000,
  monthlyContributions: 0,
  dateOfBirth: DOB,
}

type HookParams = NonNullable<Parameters<typeof useHorizonFireSim>[0]>

function makeParams(profile: ConvergentieRawProfileRow): HookParams {
  return {
    horizonInput: FINANCIAL,
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
    kernelRawProfile: profile,
    aowRows: [],
  }
}

/** Laat een vastgehouden worker-run landen met de ÉCHTE kernel-uitkomst (synchrone runner). */
async function landRun(run: (typeof runs)[number]) {
  const res = executeKernelRequest({
    id: 0,
    kind: 'projection',
    rawContext: run.rawContext as ConvergentieRawContext,
  })
  if (!res.ok || res.kind !== 'projection') throw new Error('synchrone kernel-run faalde in de fixture')
  const outcome: ConvergentieProjectionOutcome = res.result
  await act(async () => {
    run.resolve(outcome)
  })
}

describe('B-057 — hersolve van de hoofdlijn draagt een pending-signaal (mainPending)', () => {
  it('na een planwijziging blijft de oude lijn staan én meldt de hook dat er gerekend wordt, tot de nieuwe run landt', async () => {
    runs.length = 0
    const { result, rerender, unmount } = renderHook((p: HookParams) => useHorizonFireSim(p), {
      initialProps: makeParams(BASE_PROFILE),
    })

    // First paint: één run onderweg, hero wacht (bestaand gedrag, ADR 0054) — en de
    // hoofdrun is onderweg, dus ook mainPending.
    expect(runs).toHaveLength(1)
    expect(result.current.isRefining).toBe(true)
    expect(result.current.mainPending).toBe(true)

    await landRun(runs[0])
    const eersteResultaat = result.current.result
    expect(eersteResultaat, 'de eerste hoofdrun hoort geland te zijn').not.toBeNull()
    expect(result.current.isRefining).toBe(false)
    expect(result.current.mainPending, 'in rust: niets onderweg').toBe(false)

    // De melder-casus: het stop-anker gaat van "zo vroeg als het kan" naar een leeftijd.
    // Dat is een nieuwe kernel-invoer → het worker-effect post een tweede run …
    await act(async () => {
      rerender(makeParams(PROFILE_MET_LEEFTIJD))
    })
    expect(runs, 'de planwijziging hoort een hersolve te posten').toHaveLength(2)

    // … die nog niet geland is: de grafiek toont nog de OUDE projectie (stale-while-
    // revalidate) …
    expect(result.current.result).toBe(eersteResultaat)
    // … en de hook meldt dat via `mainPending` — NIET via `isRefining`/`isLoading`
    // (die blijven de first-paint-staat van de hero).
    expect(result.current.mainPending, 'hersolve in de worker ⇒ mainPending').toBe(true)
    expect(result.current.isRefining).toBe(false)
    expect(result.current.isLoading).toBe(false)

    // Landt de hersolve, dan is de nieuwe lijn er en is het signaal weg.
    await landRun(runs[1])
    expect(result.current.result).not.toBe(eersteResultaat)
    expect(result.current.mainPending).toBe(false)

    unmount()
  })
})
