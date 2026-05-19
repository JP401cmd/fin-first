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
import type { BriefingEntry } from '@/components/overview/briefing-panel'

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
      href: '/overzicht',
    })
  }

  // 2. Tip — tweede Will-recommendation
  const secondRec = input.recommendations[1]
  if (secondRec) {
    entries.push({
      id: 'tip:' + secondRec.id,
      category: 'tip',
      text: secondRec.title,
      href: '/overzicht',
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
    })
  }

  return entries
}
