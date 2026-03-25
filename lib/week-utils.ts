/**
 * Shared week utilities for ISO week calculations.
 * Used by action-edit-modal and action-list-modal.
 */

/** Get ISO week label for a date, e.g. "2026-W13" */
export function getWeekLabel(date: Date): string {
  const year = date.getFullYear()
  const oneJan = new Date(year, 0, 1)
  const days = Math.floor((date.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000))
  const week = Math.ceil((days + oneJan.getDay() + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** Get human-readable date range for a week string, e.g. "24 mrt - 30 mrt" */
export function getWeekDates(weekStr: string): string {
  const [yearStr, weekPart] = weekStr.split('-W')
  const year = parseInt(yearStr)
  const week = parseInt(weekPart)
  const jan1 = new Date(year, 0, 1)
  const dayOffset = (1 - jan1.getDay() + 7) % 7
  const monday = new Date(year, 0, 1 + dayOffset + (week - 1) * 7)
  if (monday.getDay() !== 1) {
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  }
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  return `${fmt(monday)} - ${fmt(sunday)}`
}

/** Get ISO week label for the current week */
export function getCurrentWeek(): string {
  return getWeekLabel(new Date())
}

/** Get ISO week label for next week */
export function getNextWeek(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return getWeekLabel(d)
}

/** Classify a scheduled_week value into a planning bucket */
export function getWeekBucket(scheduledWeek: string | null): 'this_week' | 'next_week' | 'later' | 'unplanned' {
  if (!scheduledWeek) return 'unplanned'
  const current = getCurrentWeek()
  const next = getNextWeek()
  if (scheduledWeek === current) return 'this_week'
  if (scheduledWeek === next) return 'next_week'
  if (scheduledWeek > next) return 'later'
  // Past weeks are also treated as 'later' (overdue)
  return 'later'
}
