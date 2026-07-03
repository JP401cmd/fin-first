import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import {
  computeWhatifProjection,
  type WhatifRawContext,
} from './whatif-router'
import type { WhatifRawProfileRow } from '@/lib/horizon-kernel/adapter/whatif-varianten'

/**
 * FASE 6 stap 5A — what-if-router-tests (kernel-only, poort dit bestand ver de
 * verwijderde `lib/whatif-engine-router.ts`). De vroegere `builtInput`/`v2FlagArg`/
 * `kernelEnabled`-schakelaar, de `withDiff`/`WhatifEngineDiff`-kern↔v2-vergelijking
 * en de generieke v2-terugval-machinerie (`detectV2OnlyMachinery`) zijn vervallen —
 * er is nog maar één motor: `{ok:true, result} | {ok:false, reason}`.
 */

const DOB = '1986-01-01'

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

function makeRawContext(over: Partial<WhatifRawContext> = {}): WhatifRawContext {
  return {
    profile: PROFILE,
    assets: makeAssets(),
    debts: [],
    lifeEvents: [],
    aowRows: [],
    yearlyExpenses: 30_000,
    ...over,
  }
}

describe('computeWhatifProjection — kernel-run', () => {
  it('schone rawContext → ok:true met gevulde rijen', () => {
    const outcome = computeWhatifProjection({ rawContext: makeRawContext() })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.rows.length).toBeGreaterThan(0)
  })
})

describe('computeWhatifProjection — woning-strategie is kernel-native (BUG 1, spiegel convergentie-router)', () => {
  it('downsize-huis-strategie op het profiel → ok:true, geen fout', () => {
    const huis = {
      id: 'huis',
      name: 'Eigen huis',
      asset_type: 'eigen_huis',
      current_value: 450_000,
      woz_value: 420_000,
      expected_return: 2,
      monthly_contribution: 0,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    } as unknown as Asset
    const outcome = computeWhatifProjection({
      rawContext: makeRawContext({
        assets: [...makeAssets(), huis],
        profile: {
          ...PROFILE,
          housing_strategy_config: {
            mode: 'downsize', trigger: 'fixed_age', triggerAge: 65,
            depletionThresholdYears: 0, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null,
          },
        },
      }),
    })
    expect(outcome.ok).toBe(true)
  })
})

describe('computeWhatifProjection — rendement-slider', () => {
  it('per-asset-type rendement-delta beïnvloedt de kernel-run zonder te crashen', () => {
    const outcome = computeWhatifProjection({
      rawContext: makeRawContext({ returnDeltaByAssetType: { investment: 0.02 } }),
    })
    expect(outcome.ok).toBe(true)
  })

  it('uniforme rendement-delta beïnvloedt de kernel-run zonder te crashen', () => {
    const outcome = computeWhatifProjection({
      rawContext: makeRawContext({ uniformReturnDelta: 0.01 }),
    })
    expect(outcome.ok).toBe(true)
  })
})

describe('computeWhatifProjection — generieke liquidatie op "wanneer nodig" (niet-huis-asset)', () => {
  it('sale_config "wanneer_nodig" → ok:true (adapter-notice, geen crash — spiegel convergentie-router)', () => {
    // De vroegere v2-terugval-met-reden is vervallen: `buildPotLiquidaties` in de
    // adapter meldt deze niet-mapbare liquidatie nu zelf als een info-`notice`
    // i.p.v. de hele run te laten terugvallen op een tweede motor.
    const boot = {
      id: 'boot',
      name: 'Vakantiewoning',
      asset_type: 'real_estate',
      current_value: 120_000,
      woz_value: null,
      expected_return: 2,
      monthly_contribution: 0,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
      sale_config: { stand: 'wanneer_nodig' },
    } as unknown as Asset
    const outcome = computeWhatifProjection({
      rawContext: makeRawContext({ assets: [...makeAssets(), boot] }),
    })
    expect(outcome.ok).toBe(true)
  })
})

describe('computeWhatifProjection — kern-fout', () => {
  it('ontbrekende geboortedatum → ok:false + /date_of_birth/', () => {
    const brokenProfile: WhatifRawProfileRow = { ...PROFILE, date_of_birth: null }
    const outcome = computeWhatifProjection({
      rawContext: makeRawContext({ profile: brokenProfile }),
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toMatch(/date_of_birth/)
  })
})
