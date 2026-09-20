/**
 * Het doelen-oordeel — ÉÉN bron voor twee oppervlakken.
 *
 * De Doelen-navkaart op /toekomst (`ToekomstNavCards`) en de paginatitel van
 * /toekomst/doelen (`PageVerdictOpening`) zeggen hetzelfde: hoeveel doelen op
 * koers liggen en wat de stoplichtstand van het slechtste doel is. Dat mag maar
 * één home hebben, dus woont de afleiding hier — bewust ZONDER `'use client'`,
 * zodat de server-page 'm gewoon kan aanroepen (een functie uit een
 * client-module is server-side niet aanroepbaar).
 *
 * Consume-only: geen drempels, geen eigen tempo-som. Alles komt uit het
 * canonieke `computeGoalProgress`-contract (`lib/goal-data.ts`) dat de loader
 * al heeft ingevuld.
 */

import type { GoalWithBudget } from '@/lib/fin-data-loader'
import type { LeverageStatus } from '@/lib/leverage-status'
import { goalReachedFromProgress, type GoalProgress as CanonicalGoalProgress } from '@/lib/goal-data'

/**
 * Voortgang per doel — parallel array met `goals` (zelfde index), exact zoals
 * `loadFinData` (`FinPageData.goalProgresses`) hem teruggeeft.
 *
 * Bewust een SUBSET van het canonieke `computeGoalProgress`-contract, afgeleid
 * i.p.v. lokaal overgetikt.
 *
 * `paceSkipped` MOET hier in. De kaart telt niet alleen aandacht-vragende doelen
 * maar toont ook het positieve tegendeel ("Allemaal op koers", `N/N op koers`),
 * en dáárvoor is `onTrack` alléén te weinig: bij de bron blijft `onTrack: true`
 * zolang er niets te meten valt, dus een ONGEMETEN doel werd hier geteld als een
 * doel dat zijn tempo haalt. Een versmalling die `paceSkipped` weglaat maakt dat
 * compile-onzichtbaar (R5).
 */
export type GoalProgress = Pick<
  CanonicalGoalProgress,
  'current' | 'target' | 'pct' | 'onTrack' | 'eta' | 'paceSkipped'
>

/**
 * Doelen-status: koppel goals[i] aan goalProgresses[i], negeer voltooide
 * doelen (pct ≥ 100). Status van het slechtste actieve doel:
 *  - bad   als een actief doel !onTrack && pct < 50
 *  - warn  als een actief doel !onTrack && pct ≥ 50
 *  - good  als alle actieve doelen op koers zijn
 *  - neutral als er geen actieve doelen zijn
 *
 * CR-M1 — marge-/fire-status is live-only in het lab; spiegelt DoelenView:
 * lab-parameter-doelen (metadata.bron === 'parameter') die (i) een fire_age-doel
 * zijn (marge-status hoort op /toekomst) óf (ii) nog geen meting hebben (pct ≤ 0)
 * tellen WEL mee in het aantal ("2 doelen") maar NIET in attention/status —
 * anders zou een ongemeten of marge-doel de nav-kaart onterecht rood/oranje
 * kleuren. Handmatige doelen (géén bron-tag) blijven volledig meetellen.
 *
 * Geeft naast de status ook het aantal aandacht-vragende doelen terug zodat de
 * substext ("X vraagt aandacht") consistent met de status berekend wordt.
 */
export function deriveDoelenStatus(
  goals: GoalWithBudget[],
  goalProgresses: GoalProgress[],
): { status: LeverageStatus; activeCount: number; attentionCount: number; judgedCount: number } {
  let activeCount = 0
  let attentionCount = 0
  // Doelen waarover wél een tempo-oordeel te vellen valt. `activeCount` telt
  // álle meetellende doelen, ook de ongemeten; "op koers" mag alleen over dit
  // kleinere aantal gaan, anders presenteert de kaart de afwezigheid van een
  // oordeel als een positief oordeel (R5).
  let judgedCount = 0
  let worst: LeverageStatus = 'good'

  goals.forEach((goal, i) => {
    const p = goalProgresses[i]
    if (!p) return
    // Defensieve parameter-herkenning (metadata kan ontbreken/null/{} zijn).
    const isParameter = goal.metadata?.bron === 'parameter'
    // Voltooid → negeren. Via de canonieke toets op de WAARDE, niet via het
    // percentage: bij een omlaag-doel (schuldenvrij-datum, belastingdruk,
    // vrijheidsleeftijd) staat `target / current` afgerond al op 100% terwijl
    // het doel jaren achterloopt — zo'n doel zou stil uit de telling én uit de
    // stoplichtstatus vallen, juist wanneer het aandacht vraagt.
    //
    // Parameterdoelen (de doelsituatie uit het lab) zijn hiervan uitgezonderd:
    // die zijn nooit "af". Ze beschrijven een koers die je aanhoudt, niet iets
    // wat je afvinkt, en horen dus altijd in het aantal mee te tellen.
    if (!isParameter && goalReachedFromProgress(goal.goal_type, p)) return
    activeCount += 1 // fire_age-/ongemeten parameter-doel telt WEL mee in het aantal

    // Parameter-doel zonder betekenisvolle stoplicht-status: fire_age (marge)
    // of nog geen meting (pct ≤ 0) → buiten attention/status houden.
    if (isParameter && (goal.goal_type === 'fire_age' || p.pct <= 0)) return

    // Geen streefdatum, geen meetperiode, of een live-getrackt stand-doel: er is
    // niets te beoordelen. Het doel telt mee in `activeCount` (het bestáát), maar
    // valt buiten zowel "vraagt aandacht" als "op koers".
    if (p.paceSkipped) return
    judgedCount += 1

    if (!p.onTrack) {
      attentionCount += 1
      if (p.pct < 50) {
        worst = 'bad'
      } else if (worst !== 'bad') {
        worst = 'warn'
      }
    }
  })

  if (activeCount === 0) return { status: 'neutral', activeCount: 0, attentionCount: 0, judgedCount: 0 }
  // Zijn er wel doelen maar valt er over geen enkele iets te zeggen, dan is de
  // status neutraal — niet groen. Groen zou hier "alles loopt goed" beweren op
  // grond van nul metingen.
  if (judgedCount === 0) return { status: 'neutral', activeCount, attentionCount: 0, judgedCount: 0 }
  return { status: worst, activeCount, attentionCount, judgedCount }
}

/**
 * Het doelen-oordeel als één zin + stoplichtstand, voor de paginatitel van
 * /toekomst/doelen. Zelfde telling als de navkaart: "op koers" gaat alleen over
 * de BEOORDEELDE doelen — een doel zonder streefdatum heeft geen tempo-oordeel
 * en mag niet als "op koers" gepresenteerd worden (R5).
 *
 * `label: null` wanneer er geen actief doel is; de titel toont dan de kale
 * paginanaam.
 */
export function doelenVerdict(
  goals: GoalWithBudget[],
  goalProgresses: GoalProgress[],
): { label: string | null; status: LeverageStatus } {
  const { status, activeCount, attentionCount, judgedCount } = deriveDoelenStatus(
    goals,
    goalProgresses,
  )
  if (activeCount === 0) return { label: null, status }
  if (judgedCount === 0) return { label: 'Nog niets te meten', status }
  return { label: `${judgedCount - attentionCount} van ${judgedCount} op koers`, status }
}
