/**
 * Pure helpers om de canonieke agenda-bronnen (terugkerende transacties +
 * fiscale deadlines) om te zetten naar `UpcomingEvent`s voor de Agenda-widget.
 *
 * "Consume, don't recompute": de widget-databron rolt GEEN eigen event-lijst
 * meer — hij consumeert `getUpcomingTransactions` (lib/recurring-data.ts) en
 * `getTaxDeadlines` (lib/tax-calendar.ts) en mapt die hier naar één vorm.
 *
 * Alle datum-vergelijkingen gebeuren op de LOKALE kalenderdag — nooit via
 * `new Date('YYYY-MM-DD')` (dat parseert op UTC-middernacht en schuift in NL
 * een dag) of `toISOString()` (idem, andere richting). Dit is exact de
 * tijdzone-val uit de conventies (zie lib/recurring-data.ts en
 * components/overview/cashflow-kalender.tsx die om dezelfde reden op het
 * middaguur ankeren).
 */

import type { RecurringTransaction } from '@/lib/recurring-data'
import type { TaxDeadline } from '@/lib/tax-calendar'
import type { UpcomingEvent } from '@/lib/types/dashboard'

const MS_PER_DAY = 1000 * 60 * 60 * 24

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Lokale 'YYYY-MM-DD' uit een Date (lokale kalenderdag, geen UTC-shift). */
export function toLocalIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * Parseert de 'YYYY-MM-DD'-prefix van een datumstring naar lokale middernacht.
 * Accepteert ook volledige ISO-datetime-strings (alleen het dagdeel telt).
 */
export function parseLocalDate(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (m) {
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  }
  // Val terug op native parse maar normaliseer naar lokale kalenderdag.
  const d = new Date(dateStr)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Hele kalenderdagen tussen vandaag en de doeldatum (beide lokaal, op
 * middernacht genormaliseerd). Positief = in de toekomst, 0 = vandaag.
 */
export function calendarDaysUntil(dateStr: string, now: Date): number {
  const target = parseLocalDate(dateStr)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / MS_PER_DAY)
}

/**
 * Relatief-datumlabel ("vandaag", "morgen", "over N dagen", of "3 mrt").
 * Een event van vandaag wordt door de kalenderdag-vergelijking nooit meer
 * abusievelijk "morgen" (de gefixte off-by-one).
 */
export function relativeDayLabel(dateStr: string, now: Date): string {
  const diffDays = calendarDaysUntil(dateStr, now)
  if (diffDays <= 0) return 'vandaag'
  if (diffDays === 1) return 'morgen'
  if (diffDays === 2) return 'overmorgen'
  if (diffDays <= 7) return `over ${diffDays} dagen`
  return parseLocalDate(dateStr).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

/** Korte dag/maand-label ("3 mrt"), TZ-veilig. */
export function formatShortDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

/**
 * Mapt de output van `getUpcomingTransactions(recurrings, days)` naar
 * `UpcomingEvent`s. Teken bepaalt richting (amount < 0 = uitgave), het bedrag
 * wordt als absolute waarde getoond.
 */
export function recurringToUpcomingEvents(
  upcoming: { recurring: RecurringTransaction; nextDate: Date }[],
): UpcomingEvent[] {
  return upcoming.map(({ recurring: r, nextDate }) => {
    const amount = Number(r.amount)
    return {
      id: `recurring-${r.id}`,
      name: r.name || r.counterparty_name || 'Terugkerend',
      date: toLocalIsoDate(nextDate),
      amount: amount !== 0 ? Math.abs(amount) : null,
      direction: amount < 0 ? 'out' : amount > 0 ? 'in' : 'neutral',
      source: 'recurring',
    }
  })
}

/**
 * Mapt fiscale deadlines binnen `maxDaysAhead` dagen naar `UpcomingEvent`s.
 * Deadlines hebben geen bedrag/richting (planningsmomenten, geen kasstroom).
 */
export function taxDeadlinesToUpcomingEvents(
  deadlines: TaxDeadline[],
  maxDaysAhead: number,
): UpcomingEvent[] {
  return deadlines
    .filter((d) => d.daysUntil >= 0 && d.daysUntil <= maxDaysAhead)
    .map((d) => ({
      id: `tax-${d.id}`,
      name: d.label,
      date: d.date,
      amount: null,
      direction: 'neutral',
      source: 'tax_deadline',
    }))
}
