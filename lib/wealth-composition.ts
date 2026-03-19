/**
 * Wealth composition projection engine.
 *
 * Groups 13 asset_types into 5 wealth layers + debts as a 6th (negative) layer.
 * Projects each group forward using individual asset returns and contributions,
 * models debt repayment per repayment_type, and distributes post-FIRE
 * withdrawals over liquid categories.
 */

import { type Asset, type AssetType, ASSET_TYPE_COLORS } from './asset-data'
import {
  type Debt,
  type RepaymentType,
  amortizationSchedule,
  linearAmortization,
  interestOnlySchedule,
} from './debt-data'

// ── Wealth Groups ───────────────────────────────────────────

export type WealthGroup =
  | 'spaargeld'
  | 'beleggingen'
  | 'pensioen'
  | 'vastgoed'
  | 'overig'

/**
 * Maps each of the 13 asset_types into one of 5 wealth groups.
 */
export const WEALTH_GROUPS: Record<AssetType, WealthGroup> = {
  cash: 'spaargeld',
  savings: 'spaargeld',
  investment: 'beleggingen',
  retirement: 'pensioen',
  levensverzekering: 'pensioen',
  eigen_huis: 'vastgoed',
  real_estate: 'vastgoed',
  crypto: 'overig',
  vehicle: 'overig',
  physical: 'overig',
  deelneming: 'overig',
  vordering: 'overig',
  other: 'overig',
}

export const WEALTH_GROUP_LABELS: Record<WealthGroup, string> = {
  spaargeld: 'Spaargeld',
  beleggingen: 'Beleggingen',
  pensioen: 'Pensioen',
  vastgoed: 'Vastgoed',
  overig: 'Overig',
}

/**
 * Derived from ASSET_TYPE_COLORS — pick representative colour per group.
 */
export const WEALTH_GROUP_COLORS: Record<WealthGroup, string> = {
  spaargeld: ASSET_TYPE_COLORS.savings,     // #3b82f6  blue
  beleggingen: ASSET_TYPE_COLORS.investment, // #10b981  emerald
  pensioen: ASSET_TYPE_COLORS.retirement,    // #8b5cf6  violet
  vastgoed: ASSET_TYPE_COLORS.real_estate,   // #f59e0b  amber
  overig: ASSET_TYPE_COLORS.other,           // #71717a  zinc
}

/** Colour for the debt (negative) layer */
export const DEBT_LAYER_COLOR = '#ef4444' // red-500

export const DEBT_LAYER_LABEL = 'Schulden'

// ── Types ───────────────────────────────────────────────────

export interface StackedRow {
  age: number
  spaargeld: number
  beleggingen: number
  pensioen: number
  vastgoed: number
  overig: number
  /** Negative value representing total outstanding debt */
  schulden: number
}

// ── Helpers ─────────────────────────────────────────────────

const ALL_GROUPS: WealthGroup[] = ['spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig']

/**
 * Project a single asset value year-by-year using compound growth + linear contributions.
 * value(year) = currentValue * (1 + expectedReturn)^year + monthlyContribution * 12 * year
 */
function projectAssetByYear(
  currentValue: number,
  expectedReturn: number,   // annual decimal, e.g. 0.07
  monthlyContribution: number,
  years: number,
): number[] {
  const values: number[] = []
  for (let y = 0; y <= years; y++) {
    const compounded = currentValue * Math.pow(1 + expectedReturn, y)
    const contributed = monthlyContribution * 12 * y
    values.push(compounded + contributed)
  }
  return values
}

/**
 * Project a single debt's remaining balance year-by-year.
 * Branches on repayment_type: annuiteit, lineair, aflossingsvrij.
 */
function projectDebtByYear(debt: Debt, years: number): number[] {
  const balance = Number(debt.current_balance)
  const rate = Number(debt.interest_rate)
  const payment = Number(debt.monthly_payment)
  const repaymentType = debt.repayment_type as RepaymentType | null
  const totalMonths = years * 12

  if (balance <= 0) {
    return new Array(years + 1).fill(0)
  }

  // Get monthly schedule then sample yearly
  let monthlyBalances: number[]

  if (repaymentType === 'aflossingsvrij') {
    let endMonths = totalMonths
    if (debt.end_date) {
      const end = new Date(debt.end_date)
      const now = new Date()
      endMonths = Math.max(0, Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    }
    const schedule = interestOnlySchedule(balance, rate, Math.min(totalMonths, endMonths))
    monthlyBalances = [balance]
    for (let m = 1; m <= totalMonths; m++) {
      if (m <= schedule.length) {
        monthlyBalances.push(schedule[m - 1].balance)
      } else {
        monthlyBalances.push(0) // balloon payment assumed after end date
      }
    }
  } else if (repaymentType === 'lineair') {
    let termMonths = 360
    if (debt.end_date) {
      const end = new Date(debt.end_date)
      const now = new Date()
      termMonths = Math.max(1, Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    } else if (payment > 0) {
      const monthlyRate = rate / 100 / 12
      const approxPrincipal = payment - (balance * monthlyRate / 2)
      if (approxPrincipal > 0) termMonths = Math.ceil(balance / approxPrincipal)
    }
    const schedule = linearAmortization(balance, rate, termMonths)
    monthlyBalances = [balance]
    for (let m = 1; m <= totalMonths; m++) {
      if (m <= schedule.length) {
        monthlyBalances.push(schedule[m - 1].balance)
      } else {
        monthlyBalances.push(0)
      }
    }
  } else {
    // Default: annuity
    if (payment <= 0) {
      // No payment — balance stays static
      return new Array(years + 1).fill(balance)
    }
    const schedule = amortizationSchedule(balance, rate, payment)
    monthlyBalances = [balance]
    for (let m = 1; m <= totalMonths; m++) {
      if (m <= schedule.length) {
        monthlyBalances.push(schedule[m - 1].balance)
      } else {
        monthlyBalances.push(0)
      }
    }
  }

  // Sample at year boundaries (month 0, 12, 24, …)
  const yearly: number[] = []
  for (let y = 0; y <= years; y++) {
    const m = y * 12
    yearly.push(m < monthlyBalances.length ? monthlyBalances[m] : 0)
  }
  return yearly
}

// ── Main projection ─────────────────────────────────────────

export interface ProjectWealthCompositionInput {
  assets: Asset[]
  debts: Debt[]
  currentAge: number
  endAge: number
  inflation: number    // annual decimal, e.g. 0.02
  fireAge?: number     // if set, withdrawals start at this age
  annualExpenses?: number // yearly spending (needed for post-FIRE withdrawals)
}

/**
 * Project wealth composition per group from currentAge to endAge.
 *
 * - Per asset group: compound growth using individual expected_return + monthly_contribution
 * - Per debt: amortization based on repayment_type
 * - After FIRE age: distribute inflation-adjusted annual expenses over liquid categories
 *   (beleggingen first, then spaargeld)
 */
export function projectWealthComposition(
  input: ProjectWealthCompositionInput,
): StackedRow[] {
  const { assets, debts, currentAge, endAge, inflation, fireAge, annualExpenses } = input

  const years = Math.max(0, endAge - currentAge)
  if (years === 0) return []

  const activeAssets = assets.filter(a => a.is_active)
  const activeDebts = debts.filter(d => d.is_active && Number(d.current_balance) > 0)

  // Project each asset year-by-year
  const assetProjections = activeAssets.map(a => ({
    group: WEALTH_GROUPS[a.asset_type],
    values: projectAssetByYear(
      Number(a.current_value),
      Number(a.expected_return) / 100,
      Number(a.monthly_contribution),
      years,
    ),
  }))

  // Project each debt year-by-year
  const debtProjections = activeDebts.map(d => projectDebtByYear(d, years))

  // Aggregate per group per year
  const rows: StackedRow[] = []

  // Track running group values for withdrawal adjustments
  const groupValues: Record<WealthGroup, number[]> = {
    spaargeld: new Array(years + 1).fill(0),
    beleggingen: new Array(years + 1).fill(0),
    pensioen: new Array(years + 1).fill(0),
    vastgoed: new Array(years + 1).fill(0),
    overig: new Array(years + 1).fill(0),
  }

  // Sum asset projections into groups
  for (const ap of assetProjections) {
    for (let y = 0; y <= years; y++) {
      groupValues[ap.group][y] += ap.values[y]
    }
  }

  // Sum debt projections
  const debtTotals = new Array(years + 1).fill(0)
  for (const dp of debtProjections) {
    for (let y = 0; y <= years; y++) {
      debtTotals[y] += dp[y]
    }
  }

  // Apply post-FIRE withdrawals — subtract from liquid groups
  if (fireAge != null && annualExpenses != null && annualExpenses > 0) {
    for (let y = 0; y <= years; y++) {
      const age = currentAge + y
      if (age < fireAge) continue

      // Inflation-adjusted annual withdrawal
      const yearsAfterFire = age - fireAge
      const withdrawal = annualExpenses * Math.pow(1 + inflation, yearsAfterFire)

      // Also stop contributions after FIRE (already projected — subtract them)
      // Note: we keep the projection as-is and only subtract the withdrawal amount.
      // This is a simplification; contributions are assumed to stop.

      let remaining = withdrawal

      // Draw from beleggingen first
      if (remaining > 0 && groupValues.beleggingen[y] > 0) {
        const draw = Math.min(remaining, groupValues.beleggingen[y])
        groupValues.beleggingen[y] -= draw
        remaining -= draw
      }

      // Then from spaargeld
      if (remaining > 0 && groupValues.spaargeld[y] > 0) {
        const draw = Math.min(remaining, groupValues.spaargeld[y])
        groupValues.spaargeld[y] -= draw
        remaining -= draw
      }

      // If still remaining, draw from overig
      if (remaining > 0 && groupValues.overig[y] > 0) {
        const draw = Math.min(remaining, groupValues.overig[y])
        groupValues.overig[y] -= draw
        remaining -= draw
      }
    }
  }

  // Build StackedRow array
  for (let y = 0; y <= years; y++) {
    rows.push({
      age: currentAge + y,
      spaargeld: Math.round(groupValues.spaargeld[y]),
      beleggingen: Math.round(groupValues.beleggingen[y]),
      pensioen: Math.round(groupValues.pensioen[y]),
      vastgoed: Math.round(groupValues.vastgoed[y]),
      overig: Math.round(groupValues.overig[y]),
      schulden: -Math.round(debtTotals[y]),  // negative
    })
  }

  return rows
}
