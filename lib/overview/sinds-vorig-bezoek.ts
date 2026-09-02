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
// MARGINALE GROOTHEID (ADR 0126 D1 + PR C). Deze regel is een DELTA — "wat kocht
// de verandering sinds je vorige bezoek aan tijd" — en hoort dus bij het
// dagtarief (`dailyExpenseRate`), niet bij de runway. De runway is
// maandnauwkeurig en kan per definitie geen dag-delta leveren; dat is precies
// waarom deze grootheid marginaal wordt in plaats van te verdwijnen. De som van
// zulke dagen is bewust NIET gelijk aan de runway op de kop van dezelfde pagina
// — een prijs is geen projectie — en de kopij benoemt de grondslag daarom
// expliciet ("tegen je huidige uitgaven").
//
// CONSUME, DON'T RECOMPUTE: het dagtarief komt kant-en-klaar uit de bundel
// (`DashboardData.dailyExpenseRate`, 12-mnd rolling gezuiverde consumptie); hier
// wordt alleen het verschil gedeeld. De bezoekmarker bewaart sinds PR C het
// NETTO VERMOGEN, niet een dagenaantal: anders zou je twee getallen aftrekken die
// met verschillende dagtarieven zijn gemaakt, en bewoog de regel ook wanneer
// alleen het uitgavenpatroon verschoof.

import { isImplausibleFreedomDelta } from '@/lib/briefing/overview-briefing'
import { amsterdamDateString } from '@/lib/briefing/snapshot'

/** Wat de regel toont, of `null` wanneer er niets te melden valt. */
export interface SindsVorigBezoekView {
  /** Verschil in hele vrijheidsdagen t.o.v. je vorige bezoekdag (nooit 0),
   *  gerekend tegen het dagtarief van vandaag. */
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
 * Bouw de delta-regel: Δ netto vermogen ÷ het dagtarief van vandaag.
 *
 * Geeft `null` (= toon niets) wanneer:
 *  - er nog geen vorige bezoekdag bekend is (eerste bezoek, of een marker in de
 *    pre-PR-C-vorm die bewust niet wordt omgerekend);
 *  - het vorige bezoek van vandaag is (twee bezoeken op dezelfde dag);
 *  - een van beide vermogenspeilen niet eindig is;
 *  - er geen geloofwaardig dagtarief is (`dailyExpense <= 0`) — dan is er geen
 *    wisselkoers €→tijd en doet de regel geen uitspraak;
 *  - het verschil afgerond 0 dagen is;
 *  - de sprong implausibel groot is (`isImplausibleFreedomDelta`), zodat een
 *    settelende dataset of een eenmalige vermogenscorrectie geen "−3788 dagen"
 *    bovenaan /overzicht zet.
 *
 * REFERENTIESCHAAL VAN DE GUARD. De relatieve voorwaarde van de guard heeft een
 * "huidig totaal" nodig. Dat is hier het huidige vermogen omgerekend tegen
 * hetzelfde dagtarief — dezelfde eenheid en dezelfde wisselkoers als de delta,
 * dus een zuivere schaalmaat. Het is uitdrukkelijk GEEN vrijheidstijd-grootheid:
 * het getal wordt nergens getoond en mag nergens als totaal gepresenteerd worden
 * (dat totaal is de runway — ADR 0126 D1).
 */
export function buildSindsVorigBezoek(
  current: { netWorth: number },
  previous: { at: string; netWorth: number } | null,
  dailyExpense: number,
  now: Date = new Date(),
): SindsVorigBezoekView | null {
  if (!previous) return null
  if (!Number.isFinite(current.netWorth)) return null
  if (!Number.isFinite(previous.netWorth)) return null
  if (!Number.isFinite(dailyExpense) || dailyExpense <= 0) return null

  const previousAt = new Date(previous.at)
  if (Number.isNaN(previousAt.getTime())) return null

  const sinceLabel = formatSinceLabel(previousAt, now)
  if (!sinceLabel) return null

  const deltaDays = Math.round((current.netWorth - previous.netWorth) / dailyExpense)
  if (deltaDays === 0) return null
  if (isImplausibleFreedomDelta(deltaDays, current.netWorth / dailyExpense)) return null

  return { deltaDays, sinceLabel }
}

/**
 * De zin zelf. Bewust twee kalme varianten zonder waardeoordeel: erbij is geen
 * felicitatie, eraf is geen alarm. Enkelvoud/meervoud correct — "1 dagen" leest
 * als een bug en ondermijnt het vertrouwen dat deze kaart juist wil herstellen.
 *
 * DE GRONDSLAG STAAT VOORAAN (ADR 0126 D1). "Tegen je huidige uitgaven" maakt van
 * meet af aan duidelijk dat dit de MARGINALE lezing is — wat de verandering
 * kostte of opleverde tegen het dagtarief van vandaag — en niet de runway die de
 * kop van dezelfde pagina noemt. Zonder die aanhef leest de lezer twee
 * vrijheidsgetallen op één scherm als hetzelfde soort getal, terwijl ze bewust
 * verschillen (prijs vs. projectie). Definitieve formulering gaat nog langs
 * merkstem/compliance; beschrijvend, geen aansporing.
 */
export function sindsVorigBezoekZin(view: SindsVorigBezoekView): string {
  const abs = Math.abs(view.deltaDays)
  const eenheid = abs === 1 ? 'dag' : 'dagen'
  return view.deltaDays > 0
    ? `Tegen je huidige uitgaven kwam er sinds ${view.sinceLabel} ${abs} ${eenheid} vrijheid bij.`
    : `Tegen je huidige uitgaven ging er sinds ${view.sinceLabel} ${abs} ${eenheid} vrijheid af.`
}
