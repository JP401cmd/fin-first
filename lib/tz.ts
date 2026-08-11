/**
 * Tijdzone-vaste kalender- en klokdelen in Europe/Amsterdam (server-safe, geen
 * `'use client'`).
 *
 * WAAROM DIT BESTAAT — de #418-klasse
 * -----------------------------------
 * De server draait op Vercel in **UTC**, de browser van een Nederlandse
 * gebruiker in **Europe/Amsterdam**. De gewone `Date`-getters (`getHours`,
 * `getDate`, …) en `toLocale*`/`Intl.DateTimeFormat` **zonder** expliciete
 * `timeZone` lezen de tijdzone van de runtime. Dezelfde `Date` levert dan
 * server-side een ánder uur (en tussen 00:00 en 02:00 een andere kalenderdag)
 * dan client-side. Staat die tekst zowel in de SSR-HTML als in de eerste
 * client-render, dan is dat een React #418 hydration-text-mismatch.
 *
 * Dat is twee keer onafhankelijk misgegaan (`lib/format.ts#formatTimestamp` en
 * `lib/overview/greeting.ts`), en de sweep vond er nog veertien latente kopieën
 * van hetzelfde patroon — waarvan vier lettérlijke duplicaten. Dit bestand is
 * de gedeelde bron waar die kopieën naartoe migreren.
 *
 * TWEE HARDE REGELS
 * -----------------
 * 1. **Nooit `toISOString()` voor uur- of daggrenzen.** Dat is een UTC-afknip;
 *    hij verschuift de grens.
 * 2. **Nooit `Intl.DateTimeFormat(...).format()` voor tekst die server en
 *    client identiek moeten renderen** — ook niet mét `timeZone`. Node en de
 *    browser kunnen verschillende ICU-versies draaien; die verschillen in
 *    scheidingsteken (U+202F vs. spatie) en in de punt achter een
 *    maandafkorting ("5 mrt." vs. "5 mrt"). Gebruik `formatToParts()` en stel
 *    de string zelf samen — dat doet `amsterdamParts` hieronder, en daarom
 *    dragen de formatters in dit bestand hun eigen NL-woordenlijsten.
 *
 * PRODUCTKEUZE — de app rekent altijd in Nederlandse wandkloktijd. Een
 * gebruiker in een andere tijdzone ziet dus NL-tijd. Die keuze stond al in
 * `lib/format.ts` en `lib/overview/greeting.ts`; dit bestand zet 'm door.
 */

export const AMSTERDAM_TZ = 'Europe/Amsterdam'

/** Index 0 = zondag, conform `Date#getDay()`. */
export const NL_DAY_ABBR = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

/** Index 0 = januari. Bewust zónder punt — één notatie app-breed. */
export const NL_MONTH_ABBR = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

/** Index 0 = januari. */
export const NL_MONTH_FULL = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

export interface AmsterdamParts {
  year: number
  /** 1-12 */
  month: number
  day: number
  /** 0-23 */
  hour: number
  minute: number
  /** 0 = zondag, conform `NL_DAY_ABBR`. */
  weekday: number
}

// `en-US` met numerieke velden: we lezen alleen `formatToParts()`, dus de
// locale bepaalt niets aan de uitkomst — alleen de `timeZone` telt.
const AMSTERDAM_PARTS_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: AMSTERDAM_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/**
 * Kalenderdelen van een moment in Europe/Amsterdam — losgekoppeld van de
 * tijdzone waarin de runtime toevallig draait.
 */
export function amsterdamParts(d: Date): AmsterdamParts {
  const parts = AMSTERDAM_PARTS_FMT.formatToParts(d)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10)

  const year = value('year')
  const month = value('month')
  const day = value('day')
  // Sommige runtimes geven met `hour12: false` '24' terug om middernacht.
  const hour = value('hour') % 24
  const minute = value('minute')

  // Weekdag uit de Amsterdamse kalenderdatum zelf (via een UTC-anker), zodat de
  // uitkomst niet van de locale-weekdagnaam of van de runtime-tijdzone afhangt.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()

  return { year, month, day, hour, minute, weekday }
}

/** Uur (0-23) in Europe/Amsterdam. */
export function amsterdamHour(d: Date): number {
  return amsterdamParts(d).hour
}

/** Vallen beide momenten op dezelfde Amsterdamse kalenderdag? */
export function isSameAmsterdamDay(a: Date, b: Date): boolean {
  const x = amsterdamParts(a)
  const y = amsterdamParts(b)
  return x.year === y.year && x.month === y.month && x.day === y.day
}

/** Vallen beide momenten in hetzelfde Amsterdamse kalenderjaar? */
export function isSameAmsterdamYear(a: Date, b: Date): boolean {
  return amsterdamParts(a).year === amsterdamParts(b).year
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** `HH:mm` in Amsterdamse wandkloktijd (bv. `13:30`). */
export function formatAmsterdamTime(d: Date): string {
  const a = amsterdamParts(d)
  return `${pad2(a.hour)}:${pad2(a.minute)}`
}

/** `d MMM` in Amsterdamse kalendertijd (bv. `5 mrt`). */
export function formatAmsterdamDayMonth(d: Date): string {
  const a = amsterdamParts(d)
  return `${a.day} ${NL_MONTH_ABBR[a.month - 1]}`
}

/** `d MMM yyyy` in Amsterdamse kalendertijd (bv. `5 mrt 2026`). */
export function formatAmsterdamDayMonthYear(d: Date): string {
  const a = amsterdamParts(d)
  return `${a.day} ${NL_MONTH_ABBR[a.month - 1]} ${a.year}`
}

/**
 * Krant-stijl korte datum — de notatie die vier componenten letterlijk
 * gedupliceerd hadden:
 *
 * - vandaag        → `HH:mm`        (`13:30`)
 * - dit jaar       → `d MMM`        (`5 mrt`)
 * - ouder/nieuwer  → `d MMM yyyy`   (`5 mrt 2026`)
 *
 * `now` is injecteerbaar zodat tests hem kunnen vastzetten.
 */
export function formatAmsterdamShortDate(d: Date, now: Date = new Date()): string {
  if (isSameAmsterdamDay(d, now)) return formatAmsterdamTime(d)
  if (isSameAmsterdamYear(d, now)) return formatAmsterdamDayMonth(d)
  return formatAmsterdamDayMonthYear(d)
}

/** `d MMMM yyyy, HH:mm` in Amsterdamse tijd (bv. `5 maart 2026, 13:30`). */
export function formatAmsterdamLongDateTime(d: Date): string {
  const a = amsterdamParts(d)
  return `${a.day} ${NL_MONTH_FULL[a.month - 1]} ${a.year}, ${pad2(a.hour)}:${pad2(a.minute)}`
}
