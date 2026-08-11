/**
 * Groet + NL-datumlabel voor de /overzicht-hero — deterministisch in
 * Europe/Amsterdam.
 *
 * ÉÉN bron van waarheid voor de tijd: de server berekent groet én datumtekst en
 * geeft ze als props door aan de hero, zodat SSR en de EERSTE client-render exact
 * gelijk zijn. Voorheen leidde de client beide af uit `new Date()` in de hero —
 * de server draait in UTC (Vercel), de client in Europe/Amsterdam, dus rond de
 * uur-/daggrens verschilden groet ("Goedemorgen/-middag/-avond/-nacht") en datum.
 * Dat gaf een React #418 hydration-text-mismatch die bij ELKE /overzicht-pageload
 * naar `POST /api/log-error` werd gerapporteerd (taak 1.5b, deel A).
 *
 * TZ-projectregel: geen `toISOString()` voor uur-/daggrenzen. Het uur en de datum
 * worden in Europe/Amsterdam bepaald via `Intl.DateTimeFormat` (met expliciete
 * `timeZone`), niet uit een UTC-ISO-afknip — zo is de uitkomst onafhankelijk van
 * de server-tijdzone.
 */

import { AMSTERDAM_TZ, amsterdamHour } from '@/lib/tz'

export interface OverviewGreeting {
  /** "Goedemorgen" / "Goedemiddag" / "Goedenavond" / "Goedenacht". */
  greeting: string
  /** Bv. "Donderdag 16 juli 2026" (eerste letter gekapitaliseerd). */
  dateLabel: string
}

/** Tijd-van-de-dag-groet op basis van het uur (0-23). */
export function greetingForHour(hour: number): string {
  if (hour < 6) return 'Goedenacht'
  if (hour < 12) return 'Goedemorgen'
  if (hour < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

/** Volledig NL-datumlabel (weekdag dag maand jaar) in Europe/Amsterdam,
 *  met gekapitaliseerde eerste letter. */
export function formatOverviewDateNL(now: Date): string {
  const formatted = new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: AMSTERDAM_TZ,
  }).format(now)
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

/**
 * Bereken groet + datumlabel voor een moment (default: nu), altijd in
 * Europe/Amsterdam. Server-side aangeroepen; het resultaat gaat als props naar
 * de hero zodat SSR en eerste client-render identiek zijn.
 */
export function resolveOverviewGreeting(now: Date = new Date()): OverviewGreeting {
  return {
    greeting: greetingForHour(amsterdamHour(now)),
    dateLabel: formatOverviewDateNL(now),
  }
}
