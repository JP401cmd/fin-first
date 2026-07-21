/**
 * Net worth growth projection utility for Overzicht.
 *
 * Short-term (1-5 year) projection based on:
 * - Current net worth
 * - Monthly savings (income - expenses)
 * - Assumed annual return on investments (7% default)
 *
 * This differs from Horizon's 30-year FIRE projection:
 * - Kern = short-term tactical view (1-5 years)
 * - Horizon = long-term strategic FIRE projection (30 years)
 */

import { DEFAULT_RETURN } from '@/lib/constants'
import { localMonthStart } from '@/lib/month-range'

export interface NetWorthProjectionPoint {
  /** Month index from now (0 = current) */
  month: number
  /** ISO date string for this month */
  date: string
  /** Projected net worth at this point */
  netWorth: number
  /** Label for display (e.g., "jan 2027") */
  label: string
}

export interface NetWorthProjectionResult {
  /** Array of projected data points (monthly for years 1-5) */
  points: NetWorthProjectionPoint[]
  /** Projected net worth at 1 year */
  year1: number
  /** Projected net worth at 3 years */
  year3: number
  /** Projected net worth at 5 years */
  year5: number
  /** Current net worth (starting point) */
  current: number
  /** Monthly savings used for projection */
  monthlySavings: number
  /** Whether projection shows growth */
  isGrowing: boolean
  /** FIRE target for comparison */
  fireTarget: number
  /** Month when FIRE target is reached (null if not within 5 years) */
  fireReachedMonth: number | null
}

/**
 * Compute a 5-year net worth projection.
 *
 * Uses compound growth model:
 * - Each month: netWorth = netWorth * (1 + monthlyReturn) + monthlySavings
 *
 * @param netWorth - Current net worth
 * @param monthlySavings - Monthly savings (income - expenses)
 * @param fireTarget - FIRE target for comparison line
 * @param annualReturn - Expected annual return (default 7%)
 * @returns Projection result with monthly data points for 5 years
 */
export function computeNetWorthProjection(
  netWorth: number,
  monthlySavings: number,
  fireTarget: number,
  annualReturn: number = DEFAULT_RETURN,
): NetWorthProjectionResult {
  const monthlyReturn = annualReturn / 12
  const totalMonths = 60 // 5 years
  const now = new Date()

  const points: NetWorthProjectionPoint[] = []
  let projected = netWorth
  let fireReachedMonth: number | null = null

  // Add current point
  points.push({
    month: 0,
    date: now.toISOString().split('T')[0],
    netWorth: netWorth,
    label: now.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' }),
  })

  // Project forward month by month
  for (let m = 1; m <= totalMonths; m++) {
    projected = projected * (1 + monthlyReturn) + monthlySavings

    const futureDate = new Date(now.getFullYear(), now.getMonth() + m, 1)
    const dateStr = localMonthStart(futureDate)

    points.push({
      month: m,
      date: dateStr,
      netWorth: projected,
      label: futureDate.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' }),
    })

    // Check if FIRE target is reached this month
    if (fireReachedMonth === null && fireTarget > 0 && projected >= fireTarget) {
      fireReachedMonth = m
    }
  }

  // Sample key milestones
  const year1 = points.find(p => p.month === 12)?.netWorth ?? projected
  const year3 = points.find(p => p.month === 36)?.netWorth ?? projected
  const year5 = points.find(p => p.month === 60)?.netWorth ?? projected

  return {
    points,
    year1,
    year3,
    year5,
    current: netWorth,
    monthlySavings,
    isGrowing: year5 > netWorth,
    fireTarget,
    fireReachedMonth,
  }
}

/**
 * Format a projected value as a readable Dutch string.
 * E.g., "€125.000" or "€1,2M"
 */
export function formatProjectedValue(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `€${(value / 1_000_000).toFixed(1).replace('.', ',')}M`
  }
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Generate the contextual message for the projection.
 * "Op dit tempo bereik je €X over 5 jaar"
 */
export function getProjectionMessage(result: NetWorthProjectionResult): string {
  const { year5, current, isGrowing, fireReachedMonth, monthlySavings } = result

  if (monthlySavings === 0 && current === 0) {
    return 'Voeg inkomsten en uitgaven toe om je vermogensprognose te zien.'
  }

  if (fireReachedMonth !== null && fireReachedMonth <= 60) {
    const years = Math.floor(fireReachedMonth / 12)
    const months = fireReachedMonth % 12
    if (years === 0) {
      return `Op dit tempo bereik je volledige vrijheid over ${months} maand${months !== 1 ? 'en' : ''}.`
    }
    if (months === 0) {
      return `Op dit tempo bereik je volledige vrijheid over ${years} jaar.`
    }
    return `Op dit tempo bereik je volledige vrijheid over ${years} jaar en ${months} maand${months !== 1 ? 'en' : ''}.`
  }

  if (isGrowing) {
    return `Op dit tempo bereik je ${formatProjectedValue(year5)} over 5 jaar.`
  }

  if (year5 < current) {
    return `Let op: op dit tempo daalt je vermogen naar ${formatProjectedValue(year5)} over 5 jaar.`
  }

  return `Je vermogen blijft stabiel rond ${formatProjectedValue(current)}.`
}
