/**
 * Chart event overlay — gedeelde positionerings-logica voor levensgebeurtenissen
 * en natuurlijke mijlpalen die als icoontjes op de horizon-grafiek worden
 * gerenderd (boven de bar voor positief, onder voor negatief).
 *
 * Geen rendering hier — alleen het pure model. De SVG-laag (ChartEventMarkers)
 * en de event-overlay-builder (horizon-client) gebruiken dit type + de
 * helper om events te groeperen en stacking-posities te berekenen.
 */

import type { LifeEvent } from './horizon-data'
import type { NaturalMilestone } from './natural-milestones'

export type ChartEventSide = 'above' | 'below'
/**
 * Marker-soort op de chart.
 * - `life_event` — handmatige levensgebeurtenis (`life_events.target_age`), sleepbaar.
 * - `natural`    — automatisch afgeleide mijlpaal (hypotheek afgelost, eerste miljoen, …).
 * - `goal`       — financieel doel met kalender-streefdatum (`goals.target_date`),
 *                  omgerekend naar leeftijd; read-only (bevinding M36).
 */
export type ChartEventKind = 'life_event' | 'natural' | 'goal'

/** Eén marker-aanvraag voor de chart-overlay. */
export interface ChartEventOverlay {
  /** Stabiel id — LifeEvent.id of `nat-...` */
  id: string
  /** Display-naam (krant-stijl, kort genoeg voor tooltip) */
  label: string
  /** Leeftijd op de x-as (integer of fractional) */
  age: number
  /** Boven of onder de chart-area */
  side: ChartEventSide
  /** Hex/css-kleur voor cirkel-border en icon */
  color: string
  /** Lucide icon-naam (resolved via EVENT_ICONS catalog) */
  icon: string
  /** Een-regel tooltip-detail (bv. "Hypotheek afgelost · €127.500") */
  detail?: string
  /** Voor klik-routing: life-event opent pane, natural opent sheet */
  kind: ChartEventKind
  /** Doorgegeven aan de click-handler — bron-asset/debt voor natural milestones */
  sourceId?: string
  /**
   * Read-only marker (bv. een levensgebeurtenis van de PARTNER in
   * huishouden-/partner-perspectief). Niet sleepbaar en niet bewerkbaar — de
   * viewer mag de gegevens van de partner niet wijzigen. De host kan dit
   * gebruiken om klik-routing te onderdrukken; de marker-laag schakelt drag uit.
   */
  readOnly?: boolean
}

/**
 * Bepaalt of een levensgebeurtenis boven of onder de bar hoort.
 * Positieve cashflow (inkomen, asset-vermeerdering) → boven.
 * Negatieve cashflow (uitgave, schuld) → onder.
 */
export function lifeEventSide(ev: LifeEvent): ChartEventSide {
  const positive = (ev.monthly_income_change * ev.duration_months) + Math.max(-ev.one_time_cost, 0)
  const negative = (ev.monthly_cost_change * ev.duration_months) + Math.max(ev.one_time_cost, 0)
  return positive >= negative ? 'above' : 'below'
}

/**
 * Bepaalt of een natuurlijke mijlpaal boven of onder de bar hoort.
 *
 * Heuristiek:
 * - Schuld-context (payoff, rentereset, schuldenvrij) → onder (debt-zone)
 * - Vermogen-mijlpalen (piek, eerste miljoen) → boven (growth-zone)
 * - Box 3-drempel → onder (fiscaal risico)
 * - Out of cash → onder (waarschuwing)
 * - Asset-uitkeringen / vrij-komst → boven (inkomen)
 * - Voertuig afgeschreven → onder (waardevermindering voltooid)
 */
export function naturalMilestoneSide(m: NaturalMilestone): ChartEventSide {
  switch (m.kind) {
    case 'debt_payoff':
    case 'debt_free':
    case 'fixed_rate_reset':
    case 'sim_out_of_cash':
    case 'sim_box3_threshold':
    case 'vehicle_runoff':
      return 'below'
    case 'sim_peak':
    case 'sim_first_million':
    case 'asset_expiry':
    case 'asset_maturity':
      return 'above'
    default:
      return 'above'
  }
}

/**
 * Resultaat van het groeperen: één "stack-slot" per leeftijd × side.
 * `stackIndex` is 0-based positie binnen de stapel (0 = dichtst bij de bar).
 */
export interface PositionedChartEvent extends ChartEventOverlay {
  /** 0 = direct naast de bar; hogere waarden zijn verder weg. */
  stackIndex: number
  /** Aantal events in dezelfde (age, side)-bucket. */
  bucketSize: number
}

/**
 * Stapel-prioriteit binnen één (leeftijd, side)-bucket: lager = dichter bij de
 * bar/lijn. Door de gebruiker zélf ingevoerde gebeurtenissen staan vooraan,
 * daarna zijn doelen, en pas dan de automatisch afgeleide mijlpalen.
 */
const KIND_STACK_RANK: Record<ChartEventKind, number> = {
  life_event: 0,
  goal: 1,
  natural: 2,
}

/**
 * Groepeer events per (geronde leeftijd, side) zodat we ze kunnen stapelen.
 * Sortering binnen een bucket volgt `KIND_STACK_RANK`: natural milestones
 * krijgen de hoogste stackIndex (verder van de bar) zodat user-events visueel
 * prioriteit hebben, met doelen ertussenin.
 */
export function positionChartEvents(
  events: ChartEventOverlay[],
  options: { ageGroupingStrategy?: 'integer' | 'tenth' } = {},
): PositionedChartEvent[] {
  const strategy = options.ageGroupingStrategy ?? 'integer'
  const bucketKey = (e: ChartEventOverlay) => {
    const age = strategy === 'integer' ? Math.floor(e.age) : Math.round(e.age * 10) / 10
    return `${age}|${e.side}`
  }

  const buckets = new Map<string, ChartEventOverlay[]>()
  for (const e of events) {
    const key = bucketKey(e)
    const list = buckets.get(key) ?? []
    list.push(e)
    buckets.set(key, list)
  }

  const positioned: PositionedChartEvent[] = []
  for (const [, list] of buckets) {
    // User life events eerst (stackIndex 0+), dan doelen, dan natural
    const sorted = [...list].sort((a, b) => {
      const rank = KIND_STACK_RANK[a.kind] - KIND_STACK_RANK[b.kind]
      if (rank !== 0) return rank
      return a.age - b.age
    })
    sorted.forEach((e, idx) => {
      positioned.push({ ...e, stackIndex: idx, bucketSize: sorted.length })
    })
  }

  return positioned
}

/** Hoeveel iconen tonen we maximaal in één stack voordat we naar +N clusteren? */
export const MAX_STACK_VISIBLE = 3
