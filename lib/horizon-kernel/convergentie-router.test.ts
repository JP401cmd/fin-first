import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { HousingStrategyConfig } from '@/lib/housing-strategy'
import {
  buildConvergentieAdapterProfile,
  computeConvergentieProjection,
  type ConvergentieRawContext,
  type ConvergentieRawProfileRow,
} from './convergentie-router'
import { deriveEigenHuisIds } from './adapter'
import { deriveEigenHuisIds as deriveEigenHuisIdsViaWhatif } from './adapter/whatif-varianten'

/**
 * FASE 6 stap 5A — convergentie-router-tests (kernel-only). De vroegere v2/kernel-
 * tak-selectie- en byte-identiteits-tests zijn vervallen (er is nog maar één motor);
 * dit bestand dekt nu: het `{ok:true, result, kernelStatus, kernelMaandHint,
 * kernelHousingSale}`-succespad, de woning-strategieën (kernel-native, BUG 1) en het
 * `{ok:false, reason}`-foutpad.
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

describe('computeConvergentieProjection — kernel-run', () => {
  it('schone input → ok:true + solver-doorvoer (V12)', () => {
    const rawContext: ConvergentieRawContext = {
      profile: PROFILE,
      assets: makeAssets(),
      debts: [],
      lifeEvents: [],
      aowRows: [],
      yearlyExpenses: 30_000,
    }
    const outcome = computeConvergentieProjection({ rawContext })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.rows.length).toBeGreaterThan(0)
    // V12: solver-status + €/mnd-hint reizen mee naar de oppervlakken.
    expect(['reached_now', 'reached_at', 'unreachable_within_horizon', 'pension_shortfall'])
      .toContain(outcome.kernelStatus)
    expect(typeof outcome.kernelMaandHint).toBe('number')
  })
})

// ── BUG 1-fixture: eigenaar-vorm — eigen huis + hypotheek + woning-strategie ──

/**
 * Bouw de "eigenaar-vorm"-rauwe-context: eigen-huis-asset + gekoppelde hypotheek +
 * een bescheiden liquide pot, met een instelbare woning-strategie. Precies de vorm
 * waarop de router vóór de BUG 1-fix permanent op v2 terugviel (nu kernel-native).
 */
function makeHousingFixture(
  housing: HousingStrategyConfig,
  extraAssets: Asset[] = [],
): ConvergentieRawContext {
  const assets = [
    {
      id: 'inv',
      name: 'Beleggingen',
      asset_type: 'investment',
      current_value: 40_000,
      woz_value: null,
      expected_return: 7,
      monthly_contribution: 100,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    },
    {
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
    },
    ...extraAssets,
  ] as unknown as Asset[]
  const debts = [
    {
      id: 'hyp',
      name: 'Hypotheek',
      debt_type: 'mortgage',
      current_balance: 220_000,
      interest_rate: 3.5,
      monthly_payment: 950,
      repayment_type: 'annuity',
      linked_asset_id: 'huis',
      is_active: true,
      net_worth_inclusion_pct: 100,
      include_aflossing_in_savings: false,
    },
  ] as unknown as Debt[]
  const profile: ConvergentieRawProfileRow = {
    ...PROFILE,
    fire_end_strategy: 'deplete',
    housing_strategy_config: housing,
  }
  return {
    profile,
    assets,
    debts,
    lifeEvents: [],
    aowRows: [],
    yearlyExpenses: 36_000,
  }
}

describe('computeConvergentieProjection — woning-strategieën zijn kernel-native (BUG 1)', () => {
  it('EIGENAAR-VORM: downsize + on_depletion (huis + hypotheek) → ok:true', () => {
    const housing: HousingStrategyConfig = {
      mode: 'downsize',
      trigger: 'on_depletion',
      triggerAge: 75,
      depletionThresholdYears: 0,
      salePricePct: 1,
      salesCostsPct: 0.04,
      newMonthlyHousingCost: null,
    }
    const outcome = computeConvergentieProjection({ rawContext: makeHousingFixture(housing) })
    expect(outcome.ok).toBe(true)
  })

  it('downsize + vaste leeftijd → ok:true', () => {
    const housing: HousingStrategyConfig = {
      mode: 'downsize',
      trigger: 'fixed_age',
      triggerAge: 70,
      depletionThresholdYears: 0,
      salePricePct: 1,
      salesCostsPct: 0.04,
      newMonthlyHousingCost: null,
    }
    const outcome = computeConvergentieProjection({ rawContext: makeHousingFixture(housing) })
    expect(outcome.ok).toBe(true)
  })

  it('reverse_mortgage → ok:true (opeethypotheek is kernel-native)', () => {
    const housing: HousingStrategyConfig = {
      mode: 'reverse_mortgage',
      trigger: 'fixed_age',
      triggerAge: 70,
      depletionThresholdYears: 0,
      maxLoanPct: 0.5,
      interestRate: 0.055,
      monthlyPayout: null,
    }
    const outcome = computeConvergentieProjection({ rawContext: makeHousingFixture(housing) })
    expect(outcome.ok).toBe(true)
  })

  it.each<[string, HousingStrategyConfig]>([
    ['include_full', { mode: 'include_full' }],
    ['exclude_from_fire', { mode: 'exclude_from_fire' }],
  ])('%s → ok:true + het eigen huis blijft in de grootboek-rijen', (_label, housing) => {
    const outcome = computeConvergentieProjection({ rawContext: makeHousingFixture(housing) })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    // LOAD-BEARING invariant voor de Opbouw-balken: de kernel houdt het eigen huis
    // voor ÉLKE woningstrategie (óók exclude_from_fire — dat is enkel de
    // V_op-eligibility-selector 'Uitsluiten') in de grootboek-rijen. De chart-laag
    // (`applyHousingToComposition` met `houseInLedger`) slaat daarom álle
    // huis-injectie over op de kernel-tak. Breekt deze assert, dan verdwijnt het
    // huis stil uit de balken — eerst dáár kijken vóór je dit hier "fixt".
    const rows = outcome.result.rows
    expect(
      rows.some((r) => (r.assetBuckets.eigen_huis?.endValue ?? 0) > 0),
    ).toBe(true)
  })

  it('generiek-onondersteund: sale_config "wanneer_nodig" op een niet-huis-asset → ok:true (adapter-notice, geen crash)', () => {
    // De vroegere v2-terugval-met-reden is vervallen: `buildPotLiquidaties` in de
    // adapter meldt deze niet-mapbare liquidatie nu zelf als een info-`notice`
    // (zie lib/horizon-kernel/adapter/potten.ts) i.p.v. de hele run te laten
    // terugvallen op een tweede motor. De boot blijft simpelweg ongeliquideerd
    // staan in de kernel-run — geen crash, geen fout.
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
    const outcome = computeConvergentieProjection({
      rawContext: makeHousingFixture({ mode: 'include_full' }, [boot]),
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.rows.length).toBeGreaterThan(0)
  })
})

describe('computeConvergentieProjection — kern-fout', () => {
  it('ontbrekende geboortedatum → ok:false + reden', () => {
    const brokenProfile: ConvergentieRawProfileRow = { ...PROFILE, date_of_birth: null }
    const outcome = computeConvergentieProjection({
      rawContext: {
        profile: brokenProfile,
        assets: makeAssets(),
        debts: [],
        lifeEvents: [],
        aowRows: [],
        yearlyExpenses: 30_000,
      },
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBeTruthy()
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
