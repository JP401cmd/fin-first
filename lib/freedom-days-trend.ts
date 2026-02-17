/**
 * Freedom Days Monthly Trend - utility functions
 * Shared between client component and server-side verification
 */

export interface MonthlyFreedomData {
  /** ISO month string e.g. "2026-01" */
  month: string
  /** Short label e.g. "jan" */
  label: string
  /** Total freedom days won that month */
  days: number
}

/**
 * Builds 12-month array of freedom days won per month from completed actions.
 * Months with no completed actions get 0.
 */
export function buildMonthlyFreedomData(
  completedActions: { freedom_days_impact: number; completed_at: string | null }[]
): MonthlyFreedomData[] {
  const now = new Date()
  const months: MonthlyFreedomData[] = []

  // Build 12 months going back from current month
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('nl-NL', { month: 'short' }).replace('.', '')
    months.push({ month, label, days: 0 })
  }

  // Sum freedom days per month from completed actions
  for (const action of completedActions) {
    if (!action.completed_at) continue
    const days = Number(action.freedom_days_impact) || 0
    if (days <= 0) continue

    const completedDate = new Date(action.completed_at)
    const monthKey = `${completedDate.getFullYear()}-${String(completedDate.getMonth() + 1).padStart(2, '0')}`

    const monthEntry = months.find(m => m.month === monthKey)
    if (monthEntry) {
      monthEntry.days += days
    }
  }

  // Round to 1 decimal
  for (const m of months) {
    m.days = Math.round(m.days * 10) / 10
  }

  return months
}
