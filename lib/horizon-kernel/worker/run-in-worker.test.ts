import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { runForcedStopPath, runScenarioPresetBatch, type ScenarioPresetContext } from '@/lib/horizon/scenario-presets'
import { runMonteCarlo, type FinancialInput } from '@/lib/horizon-data'
import { executeKernelRequest } from '@/lib/horizon-kernel/worker/kernel-protocol'
import {
  isKernelWorkerAvailable,
  runKernelAsync,
  runForcedStopPathAsync,
  runScenarioPresetsAsync,
  runMonteCarloAsync,
} from '@/lib/horizon-kernel/worker/run-in-worker'

/**
 * Task 4.2 — worker-abstractie parity. In jsdom bestaat `Worker` niet, dus deze
 * suite oefent de SYNCHRONE FALLBACK: elke `…Async`-wrapper moet byte-identiek
 * hetzelfde opleveren als een directe aanroep van de onderliggende pure runner.
 * Dat is precies de garantie waarop de 735-parity-suite + de hook-contracttests
 * leunen (de kernel verandert niet van gedrag; alleen wáár hij draait).
 *
 * Daarnaast bewijst een `structuredClone`-round-trip dat de request-payloads én
 * de responses de `postMessage`-grens overleven (structured-clone-veilig), zodat
 * het echte worker-pad in de browser dezelfde uitkomst geeft als de fallback.
 */

const DOB = '1986-01-01'

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
  yearly_essential_expenses: 30_000,
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

const RAW_CONTEXT: ConvergentieRawContext = {
  profile: PROFILE,
  assets: makeAssets(),
  debts: [],
  lifeEvents: [],
  aowRows: [],
  yearlyExpenses: 30_000,
}

const MC_INPUT: FinancialInput = {
  totalAssets: 150_000,
  totalDebts: 0,
  monthlyIncome: 4000,
  monthlyExpenses: 2500,
  yearlyMustExpenses: 30_000,
  monthlyContributions: 800,
  dateOfBirth: DOB,
}

const PRESET_CTX: ScenarioPresetContext = {
  profile: PROFILE,
  assets: makeAssets(),
  debts: [],
  lifeEvents: [],
  aowRows: [],
  yearlyExpenses: 30_000,
  currentAge: 40,
  verwachtFireAge: 55,
  fireEndAge: 90,
  hasEigenHuis: false,
  downsizeStrategyActief: false,
}

describe('run-in-worker — synchrone fallback in jsdom', () => {
  it('jsdom heeft geen Worker → isKernelWorkerAvailable() === false', () => {
    expect(isKernelWorkerAvailable()).toBe(false)
  })

  it('runKernelAsync === directe computeConvergentieProjection', async () => {
    const expected = computeConvergentieProjection({ rawContext: RAW_CONTEXT })
    const got = await runKernelAsync(RAW_CONTEXT)
    expect(got).toEqual(expected)
  })

  it('runForcedStopPathAsync === directe runForcedStopPath', async () => {
    const input = {
      profile: PROFILE,
      assets: makeAssets(),
      debts: [],
      lifeEvents: [],
      aowRows: [],
      yearlyExpenses: 30_000,
      stopAge: 60,
      fireEndAge: 90,
    }
    const expected = runForcedStopPath(input)
    const got = await runForcedStopPathAsync(input)
    expect(got).toEqual(expected)
  })

  it('runScenarioPresetsAsync === directe runScenarioPresetBatch (kaarten + tweede run)', async () => {
    const expected = runScenarioPresetBatch(PRESET_CTX)
    const got = await runScenarioPresetsAsync(PRESET_CTX)
    expect(got).toEqual(expected)
    // ADR 0129 D7 — de batch draagt het veld altijd; op een `solved`-plan is het null.
    expect(got).toHaveProperty('solvedFireAge')
  })

  it('runMonteCarloAsync === directe runMonteCarlo (deterministisch seed)', async () => {
    const expected = runMonteCarlo(MC_INPUT, 200, 30)
    const got = await runMonteCarloAsync(MC_INPUT, 200, 30)
    expect(got).toEqual(expected)
  })
})

describe('run-in-worker — structured-clone-veiligheid (postMessage-grens)', () => {
  it('projection-request én -response overleven een structuredClone-round-trip', () => {
    const req = { id: 1, kind: 'projection' as const, rawContext: RAW_CONTEXT }
    const clonedReq = structuredClone(req)
    const res = executeKernelRequest(clonedReq)
    const clonedRes = structuredClone(res)
    // De gekloonde response is byte-identiek aan de directe uitkomst.
    expect(clonedRes).toEqual(executeKernelRequest(req))
  })

  it('mc- en presets-responses zijn structured-clone-veilig', () => {
    const mcRes = executeKernelRequest({ id: 2, kind: 'mc', input: MC_INPUT, sims: 100, years: 20 })
    expect(structuredClone(mcRes)).toEqual(mcRes)
    const presetRes = executeKernelRequest({ id: 3, kind: 'presets', ctx: PRESET_CTX })
    expect(structuredClone(presetRes)).toEqual(presetRes)
  })
})
