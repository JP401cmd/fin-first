/**
 * Recurring transaction types and helpers.
 */

export type RecurringTransaction = {
  id: string
  user_id: string
  account_id: string
  budget_id: string | null
  name: string
  amount: number
  description: string | null
  counterparty_name: string | null
  frequency: 'monthly' | 'weekly' | 'yearly' | 'quarterly'
  day_of_month: number | null
  day_of_week: number | null
  start_date: string
  end_date: string | null
  is_active: boolean
  last_generated: string | null
  sort_order: number
  created_at: string
}

export const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Maandelijks',
  weekly: 'Wekelijks',
  yearly: 'Jaarlijks',
  quarterly: 'Per kwartaal',
}

const DAY_NAMES = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']

/**
 * Get the expected monthly cost/income from a set of recurring transactions.
 */
export function getExpectedMonthlyTotal(recurrings: RecurringTransaction[]): number {
  let total = 0
  for (const r of recurrings) {
    if (!r.is_active) continue
    const amount = Number(r.amount)
    switch (r.frequency) {
      case 'weekly':
        total += amount * (52 / 12)
        break
      case 'monthly':
        total += amount
        break
      case 'quarterly':
        total += amount / 3
        break
      case 'yearly':
        total += amount / 12
        break
    }
  }
  return Math.round(total * 100) / 100
}

/**
 * Get the next occurrence date for a recurring transaction.
 */
export function getNextOccurrence(r: RecurringTransaction): Date | null {
  if (!r.is_active) return null

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (r.end_date && new Date(r.end_date) < today) return null

  if (r.frequency === 'weekly' && r.day_of_week != null) {
    const currentDay = today.getDay()
    let daysAhead = r.day_of_week - currentDay
    if (daysAhead <= 0) daysAhead += 7
    const next = new Date(today)
    next.setDate(next.getDate() + daysAhead)
    return next
  }

  if (r.frequency === 'monthly' || r.frequency === 'quarterly') {
    const day = r.day_of_month ?? 1
    let next = new Date(today.getFullYear(), today.getMonth(), day)
    if (next <= today) {
      const monthsAhead = r.frequency === 'quarterly' ? 3 : 1
      next = new Date(today.getFullYear(), today.getMonth() + monthsAhead, day)
    }
    return next
  }

  if (r.frequency === 'yearly') {
    const day = r.day_of_month ?? 1
    const startDate = new Date(r.start_date)
    let next = new Date(today.getFullYear(), startDate.getMonth(), day)
    if (next <= today) {
      next = new Date(today.getFullYear() + 1, startDate.getMonth(), day)
    }
    return next
  }

  return null
}

/**
 * Get upcoming transactions within a number of days.
 */
export function getUpcomingTransactions(
  recurrings: RecurringTransaction[],
  daysAhead: number = 30,
): { recurring: RecurringTransaction; nextDate: Date }[] {
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() + daysAhead)

  const upcoming: { recurring: RecurringTransaction; nextDate: Date }[] = []

  for (const r of recurrings) {
    const next = getNextOccurrence(r)
    if (next && next <= cutoff) {
      upcoming.push({ recurring: r, nextDate: next })
    }
  }

  return upcoming.sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())
}

/**
 * Format the schedule description for display.
 */
export function formatSchedule(r: RecurringTransaction): string {
  const freq = FREQUENCY_LABELS[r.frequency] ?? r.frequency
  if (r.frequency === 'weekly' && r.day_of_week != null) {
    return `${freq} op ${DAY_NAMES[r.day_of_week]}`
  }
  if ((r.frequency === 'monthly' || r.frequency === 'quarterly') && r.day_of_month) {
    return `${freq} op de ${r.day_of_month}e`
  }
  return freq
}
