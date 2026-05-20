// ── Briefing Engine ──────────────────────────────────────────────────
//
// Server-only aggregator die ruwe data (recommendations, life-events,
// health-pillars, goal-progress, snapshots) omzet in `BriefingEntry[]`
// voor de BriefingPanel op /overzicht.
//
// Plan-context: A-4 "Briefing-engine als first-class server-component".
// Voorheen leefde deze logica inline in `app/(app)/overzicht/page.tsx`;
// extractie hierheen geeft:
//  1. testbaarheid (pure functie, geen Next-deps)
//  2. herbruikbaarheid (andere routes kunnen de zelfde briefing tonen)
//  3. fundament voor toekomstige uitbreiding — natural-language layer
//     (Cleo-stijl) of LLM-templating kan hier inhaken zonder page-rewrite
//
// Categorieën (matchend met BriefingPanel):
//  - observation  Will-recommendations[0]              (analyse-output)
//  - tip          Will-recommendations[1]              (actie-suggestie)
//  - upcoming     eerstvolgend life-event ≤90 dagen
//  - heads_up     laagst-scorende health-pillar < 50
//  - milestone    behaald doel OF +5 punten health-score t.o.v. vorige maand
//  - market       (toekomst) externe feed — voorlopig niet gepowered

import type { HealthScore } from '@/lib/financial-health'
import type { LifeEvent } from '@/lib/horizon-data'
import type { Recommendation } from '@/lib/recommendation-data'
import type { BriefingEntry, HefboomTag } from '@/components/overview/briefing-panel'

/**
 * Health-pillar id → hefboom-tag. Plan T-3: tips visueel gekoppeld aan
 * hefbomen. Wanneer geen 1-op-1 mapping (bv. fire_progress is cross-
 * hefboom) → undefined zodat de briefing-card geen onjuiste tag krijgt.
 */
function pillarToHefboom(pillarId: string): HefboomTag | undefined {
  switch (pillarId) {
    case 'diversification':
      return 'bezittingen'
    case 'debt_ratio':
      return 'schulden'
    case 'savings_rate':
    case 'emergency_fund':
      return 'cashflow'
    case 'tax_optimization':
      return 'belasting'
    case 'fire_progress':
    default:
      return undefined
  }
}

/** Recommendation-type → hefboom-tag. Voorlopig conservatief: alleen
 *  duidelijke 1-op-1 categorieën taggen. */
/** Impact-extractor — leest de freedom_days en EUR-effect uit een
 *  recommendation zodat de BriefingCard dezelfde dual-unit-badge toont
 *  als TipsLijst ("Geld is opgeslagen tijd"). Wanneer yearly ontbreekt
 *  rekenen we maandelijks × 12 om. */
function impactFromRecommendation(
  rec: BriefingEngineInput['recommendations'][number],
): { freedomDaysPerYear?: number | null; euroPerYear?: number | null } | undefined {
  const days = rec.freedom_days_per_year
  const yearly =
    rec.euro_impact_yearly ??
    (rec.euro_impact_monthly != null ? rec.euro_impact_monthly * 12 : null)
  const hasDays = days != null && days > 0
  const hasEuro = yearly != null && yearly > 0
  if (!hasDays && !hasEuro) return undefined
  return { freedomDaysPerYear: days, euroPerYear: yearly }
}

function recommendationToHefboom(recType: string | null | undefined): HefboomTag | undefined {
  if (!recType) return undefined
  if (recType.includes('savings') || recType.includes('budget') || recType.includes('cashflow')) {
    return 'cashflow'
  }
  if (recType.includes('debt') || recType.includes('mortgage') || recType.includes('loan')) {
    return 'schulden'
  }
  if (recType.includes('asset') || recType.includes('invest') || recType.includes('diversif')) {
    return 'bezittingen'
  }
  if (recType.includes('tax') || recType.includes('box')) {
    return 'belasting'
  }
  return undefined
}

/** LifeEvent-type → hefboom-tag. De meeste events raken meerdere
 *  hefbomen; we taggen alleen waar duidelijk één hefboom dominant is. */
function eventToHefboom(eventType: string): HefboomTag | undefined {
  const t = eventType.toLowerCase()
  if (t.includes('housing') || t.includes('huis') || t.includes('hypotheek')) return 'schulden'
  if (t.includes('inherit') || t.includes('erfenis')) return 'bezittingen'
  if (t.includes('income') || t.includes('inkomen') || t.includes('zzp') || t.includes('career')) {
    return 'cashflow'
  }
  return undefined
}

export interface GoalProgressInput {
  current: number
  target: number
  pct: number
  onTrack: boolean
  eta: string | null
}

export interface BriefingEngineInput {
  /** Will-recommendations gesorteerd op prioriteit (eerste = belangrijkste). */
  recommendations: Recommendation[]
  /** Levensgebeurtenissen uit horizonData. */
  events: LifeEvent[]
  /** Gezondheidsscore uit horizonData (inclusief pillars + trend). */
  health: HealthScore | null
  /** Doelen + bijbehorende voortgang. Indices moeten parallel zijn. */
  goalNames: string[]
  goalProgresses: GoalProgressInput[]
  /** Datum-context — default new Date(). Injectable voor tests. */
  now?: Date
}

/**
 * Hoofd-functie: bouwt een BriefingEntry[] uit ruwe inputs. Max-cap
 * van BriefingPanel (= 6) is geen verantwoordelijkheid van de engine —
 * we leveren alle gevonden entries in prioriteit-volgorde; de panel
 * cap't zelf.
 *
 * Volgorde van entries:
 *  1. observation (uit recommendations)
 *  2. tip         (uit recommendations)
 *  3. heads_up    (uit health-pillars)
 *  4. milestone   (uit goals + score-trend)
 *  5. upcoming    (uit life-events)
 *
 * Deze volgorde reflecteert urgentie: feiten over je situatie eerst,
 * dan acties, dan zorgwekkende items, dan positieve hoogtepunten, dan
 * vooruitblik. Markt-content (categorie 'market') volgt zodra dat
 * gepowered wordt.
 */
export function buildBriefingEntries(input: BriefingEngineInput): BriefingEntry[] {
  const now = input.now ?? new Date()
  const entries: BriefingEntry[] = []

  // 1. Observation — eerste Will-recommendation
  const firstRec = input.recommendations[0]
  if (firstRec) {
    entries.push({
      id: 'observation:' + firstRec.id,
      category: 'observation',
      text: firstRec.title,
      // Direct naar /overzicht/tips zodat de gebruiker meteen actie kan
      // ondernemen (i.p.v. eerst weer op /overzicht te landen).
      href: '/overzicht/tips',
      hefboom: recommendationToHefboom(firstRec.recommendation_type),
      impact: impactFromRecommendation(firstRec),
    })
  }

  // 2. Tip — tweede Will-recommendation
  const secondRec = input.recommendations[1]
  if (secondRec) {
    entries.push({
      id: 'tip:' + secondRec.id,
      category: 'tip',
      text: secondRec.title,
      href: '/overzicht/tips',
      impact: impactFromRecommendation(secondRec),
      hefboom: recommendationToHefboom(secondRec.recommendation_type),
    })
  }

  // 3. Heads-up — laagst-scorende health-pillar onder 50
  if (input.health) {
    const weakest = input.health.pillars
      .filter((p) => p.score != null && p.score < 50)
      .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))[0]
    if (weakest) {
      entries.push({
        id: 'heads_up:' + weakest.id,
        category: 'heads_up',
        text: `${weakest.name} vraagt aandacht — ${weakest.improvementTip}`,
        href: weakest.actionHref ?? '/overzicht',
        hefboom: pillarToHefboom(weakest.id),
      })
    }
  }

  // 4. Milestone — twee triggers, één entry per briefing:
  //    (a) doel dat 100% raakt (= behaald)
  //    (b) health-score-trend >= +5 punten t.o.v. vorige maand
  //    Voorkeur: (a) eerst, want concreter dan een score-stijging.
  const completedGoalIdx = input.goalProgresses.findIndex(
    (p) => p.pct >= 100,
  )
  if (completedGoalIdx !== -1) {
    const goalName = input.goalNames[completedGoalIdx]
    if (goalName) {
      entries.push({
        id: 'milestone:goal:' + completedGoalIdx,
        category: 'milestone',
        text: `Mijlpaal: doel "${goalName}" behaald.`,
        href: '/toekomst?tab=doelen',
      })
    }
  } else if (input.health && input.health.trend >= 5) {
    entries.push({
      id: 'milestone:score-trend',
      category: 'milestone',
      text: `Je gezondheidsscore steeg met ${Math.round(input.health.trend)} punten deze maand.`,
      href: '/overzicht',
    })
  }

  // 5. Upcoming — eerstvolgend life-event binnen 90 dagen
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  const upcomingEvent = input.events
    .filter((e) => e.target_date)
    .map((e) => ({ event: e, date: new Date(e.target_date as string) }))
    .filter(({ date }) => date > now && date < ninetyDaysFromNow)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0]
  if (upcomingEvent) {
    entries.push({
      id: 'upcoming:' + upcomingEvent.event.id,
      category: 'upcoming',
      text: `${upcomingEvent.event.name} — ${upcomingEvent.date.toLocaleDateString(
        'nl-NL',
        { day: 'numeric', month: 'long' },
      )}`,
      href: '/toekomst',
      hefboom: eventToHefboom(upcomingEvent.event.event_type),
    })
  }

  return entries
}

// ── Natural-language narrative ─────────────────────────────────────
//
// Plan-context: T-1 (Tier-3 #16) "Wekelijkse briefing in natuurlijke taal,
// gerendered server-side, gecached per gebruiker. 4-zinnen samenvatting
// + 1 concrete actie."
//
// Voorlopig template-based (geen LLM-call). Eén zin per actieve categorie,
// verbonden met natuurlijke connectoren. Tone: rustig en informatief,
// niet casual — past bij TriFinity editorial-stijl. Bij weinig data
// blijft de output beknopt (1-2 zinnen) i.p.v. holle vulling.

interface NarrativeFragment {
  /** Inleidende connector — undefined voor eerste fragment. */
  connector?: string
  /** Body-tekst zonder eindpunt; engine voegt punctuatie toe. */
  body: string
}

const CATEGORY_CONNECTORS: Record<string, string[]> = {
  observation: [], // eerste fragment, geen connector
  tip:         ['Tegelijkertijd', 'Daarnaast', 'Verder'],
  heads_up:    ['Let op', 'Aandacht', 'Wel'],
  milestone:   ['Mooi nieuws', 'Plus', 'En'],
  upcoming:    ['Op de horizon', 'Komende periode', 'Vooruitkijkend'],
  market:      ['Markt', 'Buitenwereld'],
}

function fragmentForEntry(
  entry: BriefingEntry,
  index: number,
): NarrativeFragment {
  // Eerste entry: geen connector (begin van alinea).
  // Daarna: roteer door beschikbare connectoren zodat herhaling
  // beperkt blijft over meerdere weken.
  const options = CATEGORY_CONNECTORS[entry.category] ?? []
  const connector =
    index === 0 || options.length === 0
      ? undefined
      : options[index % options.length]
  // Cap-titel-eerst-woord op één char lowercased zodat de zin
  // grammaticaal vloeit ná een connector ("Tegelijkertijd verschuif...")
  let body = entry.text
  if (connector && body.length > 0) {
    body = body.charAt(0).toLowerCase() + body.slice(1)
  }
  return { connector, body }
}

/**
 * Bouw een natuurlijke-taal samenvatting uit BriefingEntry[]. Returnt
 * `null` wanneer er onvoldoende inhoud is om een zinvolle alinea te
 * vormen (< 1 entry). Anders: 1-5 zinnen aan elkaar geregen.
 *
 * Will-persona: de output is "stem van Will" (plan §6.5). Het is aan
 * de display-component of er een "Will:" prefix wordt getoond.
 *
 * Cap op MAX_NARRATIVE_FRAGMENTS (= 4) zodat de alinea kort en scanbaar
 * blijft — de visuele cards in BriefingPanel kunnen tot 6 entries
 * tonen voor wie meer detail wil.
 */
export const MAX_NARRATIVE_FRAGMENTS = 4

export function buildBriefingNarrative(entries: BriefingEntry[]): string | null {
  if (entries.length === 0) return null
  const capped = entries.slice(0, MAX_NARRATIVE_FRAGMENTS)
  const fragments = capped.map((entry, i) => fragmentForEntry(entry, i))
  const sentences = fragments.map((f) => {
    const text = f.connector ? `${f.connector} ${f.body}` : f.body
    // Eind-punt veiligstellen.
    return text.replace(/[.!?]\s*$/, '') + '.'
  })
  return sentences.join(' ')
}
