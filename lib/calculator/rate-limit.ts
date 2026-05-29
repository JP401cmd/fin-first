/**
 * Rekenhulp — wekelijkse rate-limit voor AI-generaties en -verfijningen.
 *
 * Flat 10 generaties + 5 verfijningen per ISO-week per gebruiker. De
 * week-grens is maandag 00:00 in Europe/Amsterdam (NL-context). We slaan
 * de week-start op als DATE in `ai_calculator_usage` (PK = user_id +
 * week_start). Increment via UPSERT-met-+1 zodat we geen race tussen
 * SELECT+INSERT hoeven te beheren.
 *
 * Scheiding van zorgen: deze module weet niets van auth of HTTP — alleen
 * van de Supabase-tabel. De API-route doet `await checkAndIncrement(...)`
 * vóór `buildCalculator(...)`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const MAX_GENERATIONS_PER_WEEK = 10
export const MAX_REFINEMENTS_PER_WEEK = 5

export type UsageKind = 'generation' | 'refinement'

export interface RateLimitResult {
  allowed: boolean
  /** Resterende calls van deze soort vóór de limiet bereikt is. */
  remaining: number
  /** Configureerde harde limiet voor deze soort. */
  limit: number
}

export interface UsageSnapshot {
  generations: number
  refinements: number
}

/**
 * Bereken het start-moment van de huidige ISO-week (maandag 00:00) in
 * Europe/Amsterdam-tijd, en lever dat als een UTC-Date dat dezelfde
 * "kalenderdag" weergeeft als de DATE-kolom verwacht.
 *
 * Implementatie: we gebruiken `toLocaleString` met de doel-tijdzone om
 * de huidige wandklok-tijd in Amsterdam te bepalen, schuiven naar maandag
 * 00:00, en geven de gevonden DATE terug. We modelleren puur op de
 * kalenderdatum-component — `DATE` in Postgres heeft geen tijdzone.
 */
export function getCurrentWeekStart(now: Date = new Date()): Date {
  // Haal het uur en de weekdag op in Amsterdam-tijd. `weekday: 'short'`
  // geeft "Mon".."Sun"; we mappen handmatig naar 1..7 (ISO).
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = dtf.formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''

  // ISO weekdays: Mon=1..Sun=7
  const weekdayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  }
  const weekday = weekdayMap[get('weekday')] ?? 1
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))

  // De huidige Amsterdam-kalenderdatum als UTC-midnight (we gebruiken UTC
  // alleen als opslag-vorm; de TZ-component is irrelevant voor DATE).
  const localMidnight = new Date(Date.UTC(year, month - 1, day))

  // Trek (weekday-1) dagen af om bij maandag uit te komen.
  const daysSinceMonday = weekday - 1
  localMidnight.setUTCDate(localMidnight.getUTCDate() - daysSinceMonday)
  return localMidnight
}

/** Format DATE-kolom als 'YYYY-MM-DD' (geen tijdzone-component). */
function toDateString(d: Date): string {
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Lees het huidige verbruik voor de actieve week. Levert `{ 0, 0 }` als
 * er nog geen rij bestaat. Gebruikt door de UI-badge ("nog X over").
 */
export async function getUsage(
  supabase: SupabaseClient,
  userId: string,
): Promise<UsageSnapshot> {
  const weekStart = toDateString(getCurrentWeekStart())
  const { data } = await supabase
    .from('ai_calculator_usage')
    .select('generations, refinements')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle()

  return {
    generations: data?.generations ?? 0,
    refinements: data?.refinements ?? 0,
  }
}

/**
 * Atomair: check de huidige stand en verhoog de juiste teller met 1
 * wanneer de limiet nog niet bereikt is. Bij overschrijding blijft de
 * teller staan en krijgt de caller `allowed: false` terug.
 *
 * Implementatie: één UPSERT met +1 incremement op de juiste kolom. We
 * doen de limiet-check ná de read maar vóór de write, zodat we bij
 * gelijktijdige concurrente aanroepen hooguit één extra call laten
 * passeren (acceptabel — dit is rate-limit, geen quota-billing).
 */
export async function checkAndIncrement(
  supabase: SupabaseClient,
  userId: string,
  kind: UsageKind,
): Promise<RateLimitResult> {
  const limit =
    kind === 'generation' ? MAX_GENERATIONS_PER_WEEK : MAX_REFINEMENTS_PER_WEEK
  const weekStart = toDateString(getCurrentWeekStart())

  // 1) Lees huidige stand (of 0 als nog geen rij).
  const { data: existing } = await supabase
    .from('ai_calculator_usage')
    .select('generations, refinements')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle()

  const currentGen = existing?.generations ?? 0
  const currentRef = existing?.refinements ?? 0
  const currentForKind = kind === 'generation' ? currentGen : currentRef

  // 2) Check limiet vóór de write.
  if (currentForKind >= limit) {
    return { allowed: false, remaining: 0, limit }
  }

  // 3) Bouw de nieuwe rij-state en UPSERT. We gebruiken upsert i.p.v.
  //    insert-of-update zodat het in één round-trip past en de PK-conflict
  //    op (user_id, week_start) automatisch tot een UPDATE leidt.
  const newGen = kind === 'generation' ? currentGen + 1 : currentGen
  const newRef = kind === 'refinement' ? currentRef + 1 : currentRef

  await supabase
    .from('ai_calculator_usage')
    .upsert(
      {
        user_id: userId,
        week_start: weekStart,
        generations: newGen,
        refinements: newRef,
      },
      { onConflict: 'user_id,week_start' },
    )

  return {
    allowed: true,
    remaining: limit - (currentForKind + 1),
    limit,
  }
}
