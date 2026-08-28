// ── "Sinds je vorige bezoek" — de delta-regel onder de begroeting (H11) ──
//
// De briefing bevriest per ISO-week, de krant-editie per zeven dagen en het
// vermogenspunt per maand. Wie dagelijks langskomt ziet daardoor een identiek
// scherm: de verandercadans is een week, de bezoekcadans een dag. Deze regel
// overbrugt dat gat met het enige dat wél per bezoek beweegt — je vrijheidstijd
// — zonder er een aansporing van te maken.
//
// MERKSTEM/WFT (hard): dit is INZICHT, geen advies en geen aansporing. Geen
// streaks, geen gemiste-dagen-teller, geen urgentie, geen "verhoog je inleg".
// Verandert er niets, dan staat er niets — een lege belofte elke dag herhalen
// is precies de ruis die deze kaart moet oplossen.
//
// CONSUME, DON'T RECOMPUTE: het huidige vrijheidstotaal komt uit
// `computeFreedomTotal` (dezelfde canonieke dagbasis als de briefing-hero en de
// kassabon); hier wordt niets opnieuw uitgerekend behalve het verschil.

import { isImplausibleFreedomDelta } from '@/lib/briefing/overview-briefing'
import { amsterdamDateString } from '@/lib/briefing/snapshot'

/** Wat de regel toont, of `null` wanneer er niets te melden valt. */
export interface SindsVorigBezoekView {
  /** Verschil in hele vrijheidsdagen t.o.v. je vorige bezoekdag (nooit 0). */
  deltaDays: number
  /** Hoe we naar dat vorige bezoek verwijzen ("gisteren", "dinsdag", "12 augustus"). */
  sinceLabel: string
}

const NL_WEEKDAYS = [
  'zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag',
]
const NL_MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

/** Hele kalenderdagen tussen twee Amsterdam-datums ('YYYY-MM-DD'). */
function dayGap(fromDay: string, toDay: string): number {
  const [fy, fm, fd] = fromDay.split('-').map(Number)
  const [ty, tm, td] = toDay.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86_400_000)
}

/**
 * Verwijzing naar de vorige bezoekdag. Binnen een week is de weekdagnaam het
 * meest herkenbaar ("sinds dinsdag"); daarbuiten wordt dat dubbelzinnig en
 * noemen we de datum.
 */
export function formatSinceLabel(previousAt: Date, now: Date): string | null {
  const prevDay = amsterdamDateString(previousAt)
  const today = amsterdamDateString(now)
  const gap = dayGap(prevDay, today)
  if (!Number.isFinite(gap) || gap <= 0) return null
  if (gap === 1) return 'gisteren'
  const [y, m, d] = prevDay.split('-').map(Number)
  if (gap < 7) return NL_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${d} ${NL_MONTHS[m - 1]}`
}

/**
 * Bouw de delta-regel. Geeft `null` (= toon niets) wanneer:
 *  - er nog geen vorige bezoekdag bekend is (eerste bezoek);
 *  - het vorige bezoek van vandaag is (twee bezoeken op dezelfde dag);
 *  - een van beide totalen niet eindig is (oneindige vrijheid / geen uitgaven);
 *  - het verschil afgerond 0 dagen is;
 *  - de sprong implausibel groot is — dezelfde dubbele grens als de
 *    week-over-week-hero (`isImplausibleFreedomDelta`), zodat een settelende
 *    dataset geen "−3788 dagen" bovenaan /overzicht zet.
 */
export function buildSindsVorigBezoek(
  current: { totalFreedomDays: number },
  previous: { at: string; totalFreedomDays: number } | null,
  now: Date = new Date(),
): SindsVorigBezoekView | null {
  if (!previous) return null
  if (!Number.isFinite(current.totalFreedomDays)) return null
  if (!Number.isFinite(previous.totalFreedomDays)) return null

  const previousAt = new Date(previous.at)
  if (Number.isNaN(previousAt.getTime())) return null

  const sinceLabel = formatSinceLabel(previousAt, now)
  if (!sinceLabel) return null

  const deltaDays = Math.round(current.totalFreedomDays - previous.totalFreedomDays)
  if (deltaDays === 0) return null
  if (isImplausibleFreedomDelta(deltaDays, current.totalFreedomDays)) return null

  return { deltaDays, sinceLabel }
}

/**
 * De zin zelf. Bewust twee kalme varianten zonder waardeoordeel: erbij is geen
 * felicitatie, eraf is geen alarm. Enkelvoud/meervoud correct — "1 dagen" leest
 * als een bug en ondermijnt het vertrouwen dat deze kaart juist wil herstellen.
 */
export function sindsVorigBezoekZin(view: SindsVorigBezoekView): string {
  const abs = Math.abs(view.deltaDays)
  const eenheid = abs === 1 ? 'dag' : 'dagen'
  return view.deltaDays > 0
    ? `Sinds ${view.sinceLabel} kwam er ${abs} ${eenheid} vrijheid bij.`
    : `Sinds ${view.sinceLabel} ging er ${abs} ${eenheid} vrijheid af.`
}
