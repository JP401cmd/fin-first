/**
 * Pure cadans-helpers voor de check-in-historie.
 *
 * Geldcheck-ins zijn een maandelijks ritueel: per kalendermaand bestaat er
 * hooguit één snapshot (opgeslagen onder de sleutel `..._YYYY-MM`). Daaruit
 * is deterministisch af te leiden wanneer de eerstvolgende check-in "klaar"
 * staat. Geen Supabase, geen I/O — spiegelt lib/checkin/gespreksstarters.ts,
 * zodat de afleiding als losse eenheid te pinnen is (cadence.test.ts).
 */

// Standaard-cadans: elke kalendermaand één check-in.
export const CHECKIN_CADENCE_MONTHS = 1

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

/**
 * Zet een check-in-`monthKey` om naar { year, month } (month is 1-based).
 * Accepteert zowel de canonieke `2026-03` als de gelokaliseerde `maart 2026`
 * (oudere snapshots slaan het label op). Geeft `null` bij onparseerbaar.
 */
export function parseCheckinMonth(
  monthKey: string,
): { year: number; month: number } | null {
  if (!monthKey) return null
  const trimmed = monthKey.trim()

  // Canonieke vorm "2026-03"
  const iso = /^(\d{4})-(\d{1,2})$/.exec(trimmed)
  if (iso) {
    const year = Number.parseInt(iso[1], 10)
    const month = Number.parseInt(iso[2], 10)
    if (month >= 1 && month <= 12) return { year, month }
    return null
  }

  // Gelokaliseerde vorm "maart 2026"
  const parts = trimmed.toLowerCase().split(/\s+/)
  if (parts.length === 2) {
    const monthIdx = MONTH_NAMES.indexOf(parts[0])
    const year = Number.parseInt(parts[1], 10)
    if (monthIdx >= 0 && !Number.isNaN(year)) {
      return { year, month: monthIdx + 1 }
    }
  }

  return null
}

/**
 * Canonieke `YYYY-MM`-sleutel voor een datum — spiegelt de sleutel die de
 * save-route (`app/api/checkin/save/route.ts`) opbouwt, zodat de historie
 * dezelfde grondslag hanteert als de opslag.
 */
// Canonieke bron verhuisd naar lib/checkin/reeks.ts (importrichting: lib mag
// nooit uit app/** lezen); her-export zodat bestaande consumenten blijven werken.
export { monthKeyFromDate } from '@/lib/checkin/reeks'

/**
 * De datum waarop de eerstvolgende check-in "klaar" staat: de eerste dag van
 * de maand `cadenceMonths` ná de laatste check-in. `Date` rolt maand-overflow
 * automatisch door naar het volgende jaar (december → januari).
 */
export function nextCheckinDate(
  lastMonthKey: string,
  cadenceMonths: number = CHECKIN_CADENCE_MONTHS,
): Date | null {
  const parsed = parseCheckinMonth(lastMonthKey)
  if (!parsed) return null
  // month is 1-based; Date-maand is 0-based → parsed.month - 1 is de laatste
  // check-in-maand, + cadenceMonths de doelmaand.
  return new Date(parsed.year, parsed.month - 1 + cadenceMonths, 1)
}

/**
 * Hele dagen tot de eerstvolgende check-in, gemeten vanaf `now` op dag-
 * granulariteit (lokale middernacht). ≤ 0 betekent: de volgende check-in is
 * al aan de beurt ("staat klaar"). `null` als de laatste maand onparseerbaar is.
 */
export function daysUntilNextCheckin(
  lastMonthKey: string,
  now: Date,
  cadenceMonths: number = CHECKIN_CADENCE_MONTHS,
): number | null {
  const next = nextCheckinDate(lastMonthKey, cadenceMonths)
  if (!next) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const MS_PER_DAY = 86_400_000
  return Math.ceil((next.getTime() - today.getTime()) / MS_PER_DAY)
}

/**
 * Krant-toon microcopy voor de "volgende check-in"-teaser. `null` wanneer de
 * cadans niet af te leiden is (dan toont de UI geen teaser).
 */
export function describeNextCheckin(daysUntil: number | null): string | null {
  if (daysUntil === null) return null
  if (daysUntil <= 0) return 'Je volgende check-in staat klaar.'
  if (daysUntil === 1) return 'Je volgende check-in is morgen.'
  return `Je volgende check-in over ${daysUntil} dagen.`
}
