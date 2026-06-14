/**
 * Horizon grootboek-engine (v2) — scalar-portefeuille-bridge.
 *
 * Een aantal UI-surfaces (strategie-modal, scenario-overlays, EventPane-preview-
 * fallback) hebben historisch met een SCALAR portefeuille gewerkt: één getal
 * `currentPortfolio` + `annualSavings`, niet de per-asset-arrays die de grafiek
 * gebruikt. Vroeger draaiden die op de legacy v1-engine (`runSimulation` /
 * `runSimulationUnified`). Na de C5-cutover bestaat alleen v2 nog.
 *
 * Deze helper biedt exact dezelfde signatuur als de oude `runSimulation`, maar
 * bouwt een synthetisch investment-asset (identiek aan de oude
 * `runSimulationUnified`-wrapper) en draait het door de v2-grootboek-engine via
 * `runSelectedProjection`. Zo blijven de scalar-callers één-regel-migreerbaar en
 * is er één enkel reëel→nominaal-punt (de adapter). v2 rekent reëel, dus de
 * absolute cijfers verschillen bewust van v1 (zie ADR 0016).
 */

import type { Asset } from '@/lib/asset-data'
import {
  toSimResult,
  type UnifiedProjectionInput,
} from '@/lib/unified-projection'
import {
  type SimCashflow,
  type SimResult,
  type ReturnModel,
} from '@/lib/fire-simulation'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { type WithdrawalStrategyConfig, WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { runSelectedProjection } from './select'

/** Bouw een synthetisch investment-asset dat een scalar-portefeuille representeert. */
export function buildScalarPortfolioAsset(currentPortfolio: number, grossReturn: number): Asset {
  return {
    id: 'synthetic-portfolio',
    user_id: 'scalar-bridge',
    name: 'Portfolio',
    asset_type: 'investment',
    current_value: Math.max(0, currentPortfolio),
    purchase_value: Math.max(0, currentPortfolio),
    purchase_date: null,
    expected_return: grossReturn * 100, // decimaal → percentage (asset-veld is %)
    monthly_contribution: 0, // sparen loopt apart via annualSavings
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: null,
    risk_profile: null,
    tax_benefit: null,
    is_liquid: true,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    has_holdings_tracking: false,
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
  } as Asset
}

/**
 * Scalar-portefeuille → `UnifiedProjectionInput` (één synthetisch investment-asset).
 * Drop-in vervanger voor de input-bouw die `runSimulationUnified` deed.
 */
export function buildScalarProjectionInput(
  currentAge: number,
  endAge: number,
  currentPortfolio: number,
  yearlyExpenses: number,
  annualSavings: number,
  grossReturn: number,
  inflation: number,
  cashflows: SimCashflow[],
  strategyConfig?: FireStrategyConfig,
  withdrawalStrategy?: WithdrawalStrategyConfig,
  forcedFireAge?: number,
): UnifiedProjectionInput {
  return {
    assets: [buildScalarPortfolioAsset(currentPortfolio, grossReturn)],
    debts: [],
    currentAge,
    endAge,
    yearlyExpenses,
    annualSavings,
    monthlySurplus: annualSavings / 12,
    monthlyIncome: (yearlyExpenses + annualSavings) / 12,
    incomeGrowthRate: 0,
    grossReturn,
    inflationRate: inflation,
    box3Method: 'forfaitair', // returnModel 'nl_box3' → forfaitaire Box 3-drag per asset
    cashflows,
    strategyConfig: strategyConfig ?? { strategy: 'deplete', endAge, legacyAmount: 0 },
    withdrawalStrategy: withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
    forcedFireAge,
    hasPartner: false,
  }
}

/**
 * Scalar-portefeuille FIRE-projectie op de v2-grootboek-engine.
 *
 * Identieke signatuur als de oude `runSimulation`/`runSimulationUnified` (incl. de
 * ongebruikte `_returnModel`-positie, zodat bestaande call-sites onveranderd
 * blijven). Levert een `SimResult` via `toSimResult` op de adapter-output.
 */
export function runScalarProjectionV2(
  currentAge: number,
  endAge: number,
  currentPortfolio: number,
  yearlyExpenses: number,
  annualSavings: number,
  grossReturn: number,
  _returnModel: ReturnModel,
  inflation: number,
  cashflows: SimCashflow[],
  strategyConfig?: FireStrategyConfig,
  withdrawalStrategy?: WithdrawalStrategyConfig,
  forcedFireAge?: number,
): SimResult {
  const input = buildScalarProjectionInput(
    currentAge,
    endAge,
    currentPortfolio,
    yearlyExpenses,
    annualSavings,
    grossReturn,
    inflation,
    cashflows,
    strategyConfig,
    withdrawalStrategy,
    forcedFireAge,
  )
  return toSimResult(runSelectedProjection(input, true))
}
