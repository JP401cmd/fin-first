/**
 * lib/fee-analysis.ts
 *
 * Pure utility module for portfolio fee/TER analysis.
 * No database calls — only imports runSimulation for FIRE impact calculations.
 *
 * TER = Total Expense Ratio, stored as decimal (e.g. 0.0022 = 0.22%).
 */

import { runSimulation, type SimCashflow, type ReturnModel } from '@/lib/fire-simulation'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'

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
 * Compute the FIRE impact of portfolio fees.
 *
 * Runs runSimulation twice:
 * 1. With the original grossReturn (no fee drag)
 * 2. With effectiveReturn = grossReturn - weightedTER
 *
 * Returns the difference in FIRE age (months) and the total missed returns.
 */
export function computeFeeImpactOnFire(
  simParams: FeeSimParams,
  weightedTER: number,
): FeeImpact {
  // Simulation without fee drag
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
  const effectiveReturn = simParams.grossReturn - weightedTER
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

  const fireAgeWithoutFees = simWithout.fireAgeFractional
  const fireAgeWithFees = simWith.fireAgeFractional
  const bothReachable = simWithout.fireReachable && simWith.fireReachable

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
