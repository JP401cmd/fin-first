/**
 * lib/fee-analysis.ts
 *
 * Pure utility module for portfolio fee/TER analysis.
 * No database calls — only imports the FIRE engines for FIRE impact calculations.
 *
 * TER = Total Expense Ratio, stored as decimal (e.g. 0.0022 = 0.22%).
 */

import { runSimulation, type SimCashflow, type ReturnModel } from '@/lib/fire-simulation'
import { DEFAULT_FIRE_STRATEGY, type FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS, type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import { toSimResult, type UnifiedProjectionInput } from '@/lib/unified-projection'
import type { Asset } from '@/lib/asset-data'

// ── Types ──────────────────────────────────────────────────────

/** Per-holding fee breakdown */
export interface HoldingFee {
  /** Holding name */
  name: string
  /** Ticker symbol (if available) */
  ticker: string | null
  /** Current market value in EUR */
  value: number
  /** TER as decimal (0 for holdings without TER) */
  ter: number
  /** Annual fee in EUR (ter × value) */
  annualFee: number
  /** This holding's share of total fees (0–1) */
  percentOfTotalFees: number
}

/** Portfolio-level fee analysis */
export interface FeeAnalysis {
  /** Weighted average TER across portfolio (decimal) */
  weightedTER: number
  /** Total annual fees in EUR */
  totalAnnualFee: number
  /** Per-holding breakdown sorted by annualFee descending */
  perHoldingBreakdown: HoldingFee[]
  /** Total portfolio value used for calculation */
  totalPortfolioValue: number
  /** Number of holdings with a TER set */
  holdingsWithTER: number
  /** Number of holdings without TER (treated as 0%) */
  holdingsWithoutTER: number
}

/** FIRE impact of fees */
export interface FeeImpact {
  /** FIRE age without fee drag (fractional) */
  fireAgeWithoutFees: number | null
  /** FIRE age with fee drag (fractional) */
  fireAgeWithFees: number | null
  /** Difference in months (positive = fees delay FIRE) */
  feeImpactMonths: number
  /** Total missed returns over the horizon due to fees (EUR) */
  feeImpactEuros: number
  /** Whether both simulations reached FIRE */
  bothReachable: boolean
}

/** Parameters needed for FIRE impact simulation */
export interface FeeSimParams {
  currentAge: number
  endAge: number
  currentPortfolio: number
  yearlyExpenses: number
  annualSavings: number
  grossReturn: number
  returnModel: ReturnModel
  inflation: number
  cashflows: SimCashflow[]
  strategyConfig?: FireStrategyConfig
  withdrawalStrategy?: WithdrawalStrategyConfig
}

/** Constraints for TER validation */
export interface FeeConstraints {
  /** Minimum allowed TER (inclusive) */
  minTER: number
  /** Maximum allowed TER (inclusive) */
  maxTER: number
}

export const DEFAULT_FEE_CONSTRAINTS: FeeConstraints = {
  minTER: 0,
  maxTER: 0.10,  // 10% max
}

// ── Minimal holding type for fee calculations ──────────────────

interface HoldingForFees {
  name: string
  ticker?: string | null
  units: number
  current_price?: number | null
  avg_purchase_price: number
  ter?: number | null
  currency?: string
}

// ── Core Functions ─────────────────────────────────────────────

/**
 * Compute portfolio-level fee analysis from holdings.
 *
 * - Holdings without TER are treated as 0% (e.g. individual stocks).
 * - Holdings with TER but zero/negative value are ignored.
 *
 * @param holdings Array of holding objects with optional `ter` field
 * @returns FeeAnalysis with weighted TER, total fees, and per-holding breakdown
 */
export function computePortfolioFees(holdings: HoldingForFees[]): FeeAnalysis {
  const breakdown: HoldingFee[] = []
  let totalValue = 0
  let totalWeightedTER = 0
  let totalAnnualFee = 0
  let holdingsWithTER = 0
  let holdingsWithoutTER = 0

  for (const h of holdings) {
    const price = h.current_price ?? h.avg_purchase_price
    const value = price * h.units

    // Skip holdings with zero or negative value
    if (value <= 0) continue

    const ter = h.ter != null && h.ter > 0 ? h.ter : 0
    const annualFee = ter * value

    if (h.ter != null && h.ter > 0) {
      holdingsWithTER++
    } else {
      holdingsWithoutTER++
    }

    totalValue += value
    totalWeightedTER += ter * value
    totalAnnualFee += annualFee

    breakdown.push({
      name: h.name,
      ticker: h.ticker ?? null,
      value,
      ter,
      annualFee,
      percentOfTotalFees: 0, // will be filled below
    })
  }

  // Compute weighted average TER
  const weightedTER = totalValue > 0 ? totalWeightedTER / totalValue : 0

  // Fill percentOfTotalFees
  for (const item of breakdown) {
    item.percentOfTotalFees = totalAnnualFee > 0 ? item.annualFee / totalAnnualFee : 0
  }

  // Sort by annualFee descending (most expensive first)
  breakdown.sort((a, b) => b.annualFee - a.annualFee)

  return {
    weightedTER,
    totalAnnualFee,
    perHoldingBreakdown: breakdown,
    totalPortfolioValue: totalValue,
    holdingsWithTER,
    holdingsWithoutTER,
  }
}

/**
 * Compute total annual fee across all holdings.
 * Shortcut for computePortfolioFees(holdings).totalAnnualFee.
 */
export function computeTotalAnnualFee(holdings: HoldingForFees[]): number {
  return holdings.reduce((sum, h) => {
    const price = h.current_price ?? h.avg_purchase_price
    const value = price * h.units
    if (value <= 0) return sum
    const ter = h.ter != null && h.ter > 0 ? h.ter : 0
    return sum + ter * value
  }, 0)
}

/**
 * Bouw een `UnifiedProjectionInput` voor een fee-scenario-run (geen itemized
 * assets): het portfolio wordt door één synthetisch liquide investment-asset
 * gerepresenteerd, met `expected_return` = de (effectieve) bruto return. De fee
 * is een return-reductie, dus het scenario "met fees" voert simpelweg een lagere
 * return in op exact dezelfde inputvorm.
 *
 * Identiek van vorm aan de totalen-bridge in `lib/household-projection.ts`
 * (`buildTotalsInput`), maar bewust LOKAAL gehouden zodat dit module puur en
 * DB-vrij blijft (geen koppeling naar de household-laag). Geëxporteerd voor de
 * flag-honouring-regressie (test/fee-analysis-flag.test.ts).
 */
export function buildFeeSimInput(
  simParams: FeeSimParams,
  effectiveReturn: number,
): UnifiedProjectionInput {
  const strategyConfig = simParams.strategyConfig ?? { ...DEFAULT_FIRE_STRATEGY, endAge: simParams.endAge }
  const syntheticAsset = {
    id: 'fee-synthetic-portfolio',
    user_id: 'fee-analysis',
    name: 'Portfolio',
    asset_type: 'investment',
    current_value: Math.max(0, simParams.currentPortfolio),
    purchase_value: Math.max(0, simParams.currentPortfolio),
    purchase_date: null,
    expected_return: effectiveReturn * 100, // decimaal → percentage (asset-veld is %)
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
  return {
    assets: [syntheticAsset],
    debts: [],
    currentAge: simParams.currentAge,
    endAge: strategyConfig.endAge,
    yearlyExpenses: simParams.yearlyExpenses,
    annualSavings: simParams.annualSavings,
    monthlySurplus: simParams.annualSavings / 12,
    monthlyIncome: (simParams.yearlyExpenses + simParams.annualSavings) / 12,
    incomeGrowthRate: 0,
    grossReturn: effectiveReturn,
    inflationRate: simParams.inflation,
    box3Method: 'forfaitair', // returnModel 'nl_box3' → forfaitaire Box 3-drag per asset
    cashflows: simParams.cashflows,
    strategyConfig,
    withdrawalStrategy: simParams.withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
    hasPartner: false,
  }
}

/**
 * Compute the FIRE impact of portfolio fees.
 *
 * Runs TWO FIRE scenarios and reports the delta:
 * 1. With the original grossReturn (no fee drag)
 * 2. With effectiveReturn = grossReturn - weightedTER
 *
 * Engine-selectie (C5-b, engine 3 van 4): met `useV2 = false` (default) draaien
 * beide scenario's byte-identiek op de legacy v1-engine (`runSimulation`) — exact
 * het gedrag van vóór deze migratie. Met `useV2 = true` (de horizon-grootboek-flag
 * van de gebruiker) draaien BEIDE scenario's op v2 via `runSelectedProjection` op
 * de synthetisch-portfolio-bridge. De fee is een return-reductie, die v2 schoon
 * representeert via `grossReturn` in `UnifiedProjectionInput`. v2 rekent reëel, dus
 * de absolute FIRE-leeftijden verschuiven t.o.v. v1 — maar de gerapporteerde DELTA
 * (de fee-impact) blijft betekenisvol en monotoon stijgend met de TER.
 *
 * Returns the difference in FIRE age (months) and the total missed returns.
 */
export function computeFeeImpactOnFire(
  simParams: FeeSimParams,
  weightedTER: number,
  useV2 = false,
): FeeImpact {
  const effectiveReturn = simParams.grossReturn - weightedTER

  let fireAgeWithoutFees: number | null
  let fireAgeWithFees: number | null
  let bothReachable: boolean

  if (useV2) {
    // Beide scenario's op de geselecteerde engine (v2-grootboek). De fee zit in de
    // (lagere) effectieve return op dezelfde input-vorm.
    const simWithout = toSimResult(runSelectedProjection(buildFeeSimInput(simParams, simParams.grossReturn), true))
    const simWith = toSimResult(runSelectedProjection(buildFeeSimInput(simParams, effectiveReturn), true))
    fireAgeWithoutFees = simWithout.fireAgeFractional
    fireAgeWithFees = simWith.fireAgeFractional
    bothReachable = simWithout.fireReachable && simWith.fireReachable
  } else {
    // Byte-identiek aan vóór de migratie: legacy v1-engine (`runSimulation`) direct.
    const simWithout = runSimulation(
      simParams.currentAge,
      simParams.endAge,
      simParams.currentPortfolio,
      simParams.yearlyExpenses,
      simParams.annualSavings,
      simParams.grossReturn,
      simParams.returnModel,
      simParams.inflation,
      simParams.cashflows,
      simParams.strategyConfig,
      simParams.withdrawalStrategy,
    )
    // Simulation with fee drag: reduce gross return by weighted TER
    const simWith = runSimulation(
      simParams.currentAge,
      simParams.endAge,
      simParams.currentPortfolio,
      simParams.yearlyExpenses,
      simParams.annualSavings,
      effectiveReturn,
      simParams.returnModel,
      simParams.inflation,
      simParams.cashflows,
      simParams.strategyConfig,
      simParams.withdrawalStrategy,
    )
    fireAgeWithoutFees = simWithout.fireAgeFractional
    fireAgeWithFees = simWith.fireAgeFractional
    bothReachable = simWithout.fireReachable && simWith.fireReachable
  }

  // Calculate impact in months
  let feeImpactMonths = 0
  if (fireAgeWithoutFees != null && fireAgeWithFees != null) {
    feeImpactMonths = Math.round((fireAgeWithFees - fireAgeWithoutFees) * 12)
  } else if (fireAgeWithoutFees != null && fireAgeWithFees == null) {
    // Fees made FIRE unreachable — use endAge as proxy
    feeImpactMonths = Math.round((simParams.endAge - fireAgeWithoutFees) * 12)
  }

  // Calculate total missed returns over the horizon
  const horizon = simParams.endAge - simParams.currentAge
  const feeImpactEuros = computeFeeOverHorizon(
    weightedTER * simParams.currentPortfolio,
    horizon,
    simParams.grossReturn,
  )

  return {
    fireAgeWithoutFees,
    fireAgeWithFees,
    feeImpactMonths,
    feeImpactEuros,
    bothReachable,
  }
}

/**
 * Compute the compound cost of fees over a time horizon.
 *
 * This calculates how much the fee erodes total wealth over time,
 * accounting for the compounding effect (fees reduce returns which
 * reduces the base for future returns).
 *
 * Formula: portfolio × ((1 + return)^years - (1 + return - ter)^years)
 * Simplified here using the annual fee amount.
 *
 * @param annualFee Current annual fee in EUR
 * @param years Investment horizon
 * @param returnRate Expected gross return (decimal)
 * @returns Total missed returns in EUR
 */
export function computeFeeOverHorizon(
  annualFee: number,
  years: number,
  returnRate: number,
): number {
  if (annualFee <= 0 || years <= 0) return 0

  // The fee compounds: each year's lost return also loses future returns
  // Total impact = annualFee × Σ(1 + returnRate)^k for k = 0..years-1
  // = annualFee × ((1 + returnRate)^years - 1) / returnRate
  const growthFactor = Math.pow(1 + returnRate, years)
  if (returnRate === 0) return annualFee * years
  return annualFee * (growthFactor - 1) / returnRate
}

/**
 * Format fee impact as a user-friendly Dutch string.
 *
 * Examples:
 * - "Je fondsen kosten je €420 per jaar (0,22% TER). Over 25 jaar mis je €18.200 aan rendement."
 * - "Fondskosten vertragen je FIRE met 8 maanden."
 */
export function formatFeeImpactMessage(
  analysis: FeeAnalysis,
  impact?: FeeImpact,
): string {
  const terPercent = (analysis.weightedTER * 100).toFixed(2).replace('.', ',')
  const annualFmt = new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

  let msg = `Je fondsen kosten je ${annualFmt.format(analysis.totalAnnualFee)} per jaar (${terPercent}% gewogen TER).`

  if (impact) {
    if (impact.feeImpactEuros > 0) {
      msg += ` Over de horizon mis je ${annualFmt.format(impact.feeImpactEuros)} aan rendement.`
    }
    if (impact.feeImpactMonths > 0) {
      const years = Math.floor(impact.feeImpactMonths / 12)
      const months = impact.feeImpactMonths % 12
      const timeParts: string[] = []
      if (years > 0) timeParts.push(`${years} jaar`)
      if (months > 0) timeParts.push(`${months} maand${months > 1 ? 'en' : ''}`)
      msg += ` Fondskosten vertragen je FIRE met ${timeParts.join(' en ')}.`
    } else if (impact.feeImpactMonths === 0 && impact.bothReachable) {
      msg += ' Fondskosten hebben geen meetbaar effect op je FIRE-datum.'
    }
  }

  return msg
}
