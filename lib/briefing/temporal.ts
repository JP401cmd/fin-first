// ── Temporal Context Builder ────────────────────────────────
// Builds time-awareness context for Will's briefing decisions.

import type { TemporalContext } from './types'

const NL_DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']
const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const NL_MONTHS = ['', 'januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

function getTimeOfDay(hour: number): 'ochtend' | 'middag' | 'avond' {
  if (hour < 12) return 'ochtend'
  if (hour < 18) return 'middag'
  return 'avond'
}

function getGreeting(timeOfDay: 'ochtend' | 'middag' | 'avond'): string {
  switch (timeOfDay) {
    case 'ochtend': return 'Goedemorgen'
    case 'middag': return 'Goedemiddag'
    case 'avond': return 'Goedenavond'
  }
}

function getSeasonalNotes(month: number, dayOfMonth: number): string[] {
  const notes: string[] = []

  // Tax season
  if (month === 3 || month === 4) {
    notes.push('Belastingaangifte periode (1 maart - 1 mei)')
  }

  // Year-end / new year
  if (month === 12) {
    notes.push('Jaaroverzicht en feestdagen-budget')
    if (dayOfMonth >= 20) notes.push('Eindejaarsuitgaven piek')
  }
  if (month === 1) {
    notes.push('Nieuw jaar — goede voornemens en jaarplanning')
  }

  // Summer vacation planning
  if (month === 5 || month === 6) {
    notes.push('Vakantiebudget plannen')
  }

  // Back to school
  if (month === 8 && dayOfMonth >= 15) {
    notes.push('Schoolkosten seizoen')
  }

  // Energy bill settlement (typically Jan-Feb in NL)
  if (month === 1 || month === 2) {
    notes.push('Energieafrekening periode')
  }

  return notes
}

function getDaysUntilSalary(dayOfMonth: number, daysInMonth: number): number {
  // Assume salary on 25th (common in NL)
  const salaryDay = 25
  if (dayOfMonth <= salaryDay) {
    return salaryDay - dayOfMonth
  }
  // Next month's salary
  return (daysInMonth - dayOfMonth) + salaryDay
}

export function buildTemporalContext(date: Date = new Date()): TemporalContext {
  const dayOfMonth = date.getDate()
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  const dayOfWeekIdx = date.getDay()
  const hour = date.getHours()

  const daysInMonth = new Date(year, month, 0).getDate()
  const timeOfDay = getTimeOfDay(hour)

  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`,
    dayOfMonth,
    dayOfWeek: NL_DAYS[dayOfWeekIdx],
    dayOfWeekEn: EN_DAYS[dayOfWeekIdx],
    month,
    monthName: NL_MONTHS[month],
    year,
    timeOfDay,
    greeting: getGreeting(timeOfDay),
    seasonalNotes: getSeasonalNotes(month, dayOfMonth),
    daysUntilMonthEnd: daysInMonth - dayOfMonth,
    daysUntilSalary: getDaysUntilSalary(dayOfMonth, daysInMonth),
  }
}
