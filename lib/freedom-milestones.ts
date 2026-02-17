/**
 * Freedom milestone projection utility.
 *
 * Calculates projected dates for reaching 25%, 50%, 75%, 100% freedom milestones.
 * Uses the same math as computeFireProjection (inflation-adjusted compound growth + monthly savings).
 *
 * "Geld is opgeslagen tijd" — each milestone represents a step closer to full freedom.
 */

import { DEFAULT_RETURN, INFLATION, SWR } from '@/lib/horizon-data'

export interface FreedomMilestone {
  /** Milestone percentage (25, 50, 75, 100) */
  percent: number
  /** Label for display: "25% vrijheid" */
  label: string
  /** Target net worth for this milestone */
  targetNetWorth: number
  /** Whether this milestone has already been reached */
  reached: boolean
  /** Projected date when milestone is reached (null if unreachable or already reached) */
  projectedDate: string | null
  /** Months from now until milestone is reached (0 if already reached, null if unreachable) */
  monthsAway: number | null
  /** Contextual message in Dutch */
  message: string
  /** Icon hint for rendering */
  icon: 'check' | 'target' | 'clock' | 'unreachable'
}

export interface FreedomMilestoneResult {
  milestones: FreedomMilestone[]
  /** Current freedom percentage */
  currentFreedomPct: number
  /** The next upcoming milestone (first one not yet reached) */
  nextMilestone: FreedomMilestone | null
  /** Whether all milestones are reached */
  allReached: boolean
  /** Whether any milestones are reachable */
  anyReachable: boolean
}

const MILESTONE_PERCENTS = [25, 50, 75, 100]

/**
 * Calculate projected dates for freedom milestones.
 *
 * @param netWorth - Current net worth
 * @param monthlyExpenses - Monthly expenses
 * @param monthlySavings - Monthly savings (income - expenses)
 * @param annualReturn - Expected annual return (default 7%)
 * @param inflationRate - Annual inflation rate (default 2%)
 * @param swrRate - Safe withdrawal rate (default 4%)
 */
export function computeFreedomMilestones(
  netWorth: number,
  monthlyExpenses: number,
  monthlySavings: number,
  annualReturn: number = DEFAULT_RETURN,
  inflationRate: number = INFLATION,
  swrRate: number = SWR,
): FreedomMilestoneResult {
  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / swrRate : 0
  const currentFreedomPct = fireTarget > 0
    ? Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0)
    : 0

  // Inflation-adjusted real return (same as computeFireProjection)
  const realReturn = (1 + annualReturn) / (1 + inflationRate) - 1
  const monthlyReturn = realReturn / 12

  // Pre-compute: simulate month-by-month to find when each target is reached
  // Only need to simulate if there are unreached milestones and savings > 0
  const milestoneTargets = MILESTONE_PERCENTS.map(pct => ({
    percent: pct,
    target: fireTarget * (pct / 100),
  }))

  // Find the month each milestone is reached
  const milestoneMonths: Map<number, number> = new Map()

  // Mark already-reached milestones
  for (const { percent, target } of milestoneTargets) {
    if (fireTarget > 0 && netWorth >= target) {
      milestoneMonths.set(percent, 0) // Already reached
    }
  }

  // Simulate forward if there are unreached milestones and positive savings
  if (monthlySavings > 0 && fireTarget > 0) {
    let projected = netWorth
    const unreachedTargets = milestoneTargets.filter(
      mt => !milestoneMonths.has(mt.percent)
    )

    if (unreachedTargets.length > 0) {
      // Sort by target ascending so we can find them in order
      const sorted = [...unreachedTargets].sort((a, b) => a.target - b.target)
      let nextIdx = 0

      for (let month = 1; month <= 600 && nextIdx < sorted.length; month++) {
        projected = projected * (1 + monthlyReturn) + monthlySavings

        // Check if we've reached any milestones this month
        while (nextIdx < sorted.length && projected >= sorted[nextIdx].target) {
          milestoneMonths.set(sorted[nextIdx].percent, month)
          nextIdx++
        }
      }
    }
  }

  // Build milestone objects
  const now = new Date()
  const milestones: FreedomMilestone[] = MILESTONE_PERCENTS.map(pct => {
    const target = fireTarget * (pct / 100)
    const monthsResult = milestoneMonths.get(pct)

    // Edge case: no expenses = no FIRE target
    if (fireTarget <= 0) {
      return {
        percent: pct,
        label: `${pct}% vrijheid`,
        targetNetWorth: 0,
        reached: false,
        projectedDate: null,
        monthsAway: null,
        message: 'Voeg uitgaven toe om je vrijheidsmijlpalen te berekenen',
        icon: 'unreachable' as const,
      }
    }

    // Already reached
    if (monthsResult === 0) {
      return {
        percent: pct,
        label: `${pct}% vrijheid`,
        targetNetWorth: target,
        reached: true,
        projectedDate: null,
        monthsAway: 0,
        message: pct === 100
          ? 'Volledige financiële vrijheid bereikt! 🎉'
          : `${pct}% vrijheid bereikt ✓`,
        icon: 'check' as const,
      }
    }

    // Reachable in the future
    if (monthsResult !== undefined && monthsResult > 0) {
      const projDate = new Date(now.getFullYear(), now.getMonth() + monthsResult, 1)
      const dateStr = projDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
      const years = Math.floor(monthsResult / 12)
      const months = monthsResult % 12

      let timeStr: string
      if (years > 0 && months > 0) {
        timeStr = `${years} jaar en ${months} ${months === 1 ? 'maand' : 'maanden'}`
      } else if (years > 0) {
        timeStr = `${years} jaar`
      } else {
        timeStr = `${months} ${months === 1 ? 'maand' : 'maanden'}`
      }

      return {
        percent: pct,
        label: `${pct}% vrijheid`,
        targetNetWorth: target,
        reached: false,
        projectedDate: dateStr,
        monthsAway: monthsResult,
        message: `Je bereikt ${pct}% vrijheid rond ${dateStr}`,
        icon: (pct === 100 ? 'target' : 'clock') as 'target' | 'clock',
      }
    }

    // Unreachable (no savings or too far out)
    return {
      percent: pct,
      label: `${pct}% vrijheid`,
      targetNetWorth: target,
      reached: false,
      projectedDate: null,
      monthsAway: null,
      message: monthlySavings <= 0
        ? `Verhoog je spaarcapaciteit om ${pct}% vrijheid te bereiken`
        : `${pct}% vrijheid is nog niet in zicht — blijf sparen!`,
      icon: 'unreachable' as const,
    }
  })

  const nextMilestone = milestones.find(m => !m.reached && m.monthsAway !== null) ?? null
  const allReached = milestones.every(m => m.reached)
  const anyReachable = milestones.some(m => m.reached || m.monthsAway !== null)

  return {
    milestones,
    currentFreedomPct,
    nextMilestone,
    allReached,
    anyReachable,
  }
}
