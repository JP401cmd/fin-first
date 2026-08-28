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
  /**
   * Alleen bij pixel-clustering: de pixel-x (binnen `innerW`, dus vóór
   * `padLeft`) waarop de HELE bucket wordt getekend — het zwaartepunt van de
   * leden. De renderer gebruikt dit i.p.v. `xScale(age)`, anders staan de
   * leden van één cluster alsnog een paar pixels uit elkaar en is de stapel
   * scheef.
   */
  clusterX?: number
  /** Alleen bij pixel-clustering: gemiddelde leeftijd van de bucket (sheet-titel/aria). */
  clusterCenterAge?: number
  /**
   * Alleen bij pixel-clustering: álle leden van deze bucket, in stapel-volgorde.
   * Gedeelde array-referentie tussen de leden — bedoeld voor de cluster-uitgang
   * (de "+N"-badge geeft 'm door aan de sheet), niet om per marker te lezen.
   */
  clusterMembers?: ChartEventOverlay[]
}

/**
 * Pixel-afstand waaronder twee markers als één cluster gelden:
 * icoon-diameter (2 × ICON_R = 16) + minimale gap (12).
 *
 * Eén constante voor de hele app. `EventsTimeline` had dit getal lokaal staan
 * en `ChartEventMarkers` had het helemaal niet — precies de scheefgroei die
 * bevinding M16 opleverde (de tijdstrip clusterde wél op pixels, de iconen ÓP
 * de grafiek alleen op geheel jaar).
 */
export const CLUSTER_THRESHOLD_PX = 28

/** Eén groep markers die binnen `thresholdPx` van elkaar op de x-as liggen. */
export interface PixelCluster<T> {
  /** Zwaartepunt: gemiddelde pixel-x van de leden. */
  x: number
  /** Gemiddelde leeftijd van de leden. */
  centerAge: number
  items: T[]
}

/**
 * Pixel-pack: loop links→rechts en voeg een item bij de vorige groep zodra het
 * binnen `thresholdPx` van dát zwaartepunt ligt.
 *
 * Waarom pixels en niet leeftijden: de leesbaarheid van de as hangt af van de
 * zoomstand, niet van het aantal jaren. Bij de standaard uitgezoomde stand op
 * een 390px-scherm is de resolutie ~5-6 px/jaar, dus zes ópeenvolgende jaren
 * beslaan minder dan één icoon-diameter. Groeperen op afgerond jaar (het oude
 * gedrag van `positionChartEvents`) laat die zes dan als zes losse markers op
 * een paar pixels van elkaar staan — visueel één klodder, en welke marker een
 * tik wint bepaalt de SVG-paint-order.
 *
 * Het zwaartepunt schuift mee terwijl een groep groeit; de incrementele update
 * levert exact het rekenkundig gemiddelde van de leden op. Daardoor loopt een
 * lange keten van net-binnen-de-drempel-items niet oneindig door (de drempel
 * wordt tegen het gemiddelde gemeten, niet tegen het laatste item) en staat de
 * groep tegelijk netjes gecentreerd onder zijn eigen markers.
 *
 * `items` MOET oplopend op x staan; de aanroeper sorteert (beide huidige
 * aanroepers sorteren sowieso al op leeftijd).
 */
export function packByPixelProximity<T>(
  items: T[],
  getX: (item: T) => number,
  getAge: (item: T) => number,
  thresholdPx: number = CLUSTER_THRESHOLD_PX,
): PixelCluster<T>[] {
  const clusters: PixelCluster<T>[] = []
  for (const item of items) {
    const x = getX(item)
    const age = getAge(item)
    const last = clusters[clusters.length - 1]
    if (last && x - last.x < thresholdPx) {
      const n = last.items.length
      last.x = (last.x * n + x) / (n + 1)
      last.centerAge = (last.centerAge * n + age) / (n + 1)
      last.items.push(item)
    } else {
      clusters.push({ x, centerAge: age, items: [item] })
    }
  }
  return clusters
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

/** Sorteert één bucket op stapel-prioriteit; gedeeld door beide groepeer-paden. */
function sortForStack(list: ChartEventOverlay[]): ChartEventOverlay[] {
  return [...list].sort((a, b) => {
    const rank = KIND_STACK_RANK[a.kind] - KIND_STACK_RANK[b.kind]
    if (rank !== 0) return rank
    return a.age - b.age
  })
}

/**
 * Groepeer events per (geronde leeftijd, side) zodat we ze kunnen stapelen.
 * Sortering binnen een bucket volgt `KIND_STACK_RANK`: natural milestones
 * krijgen de hoogste stackIndex (verder van de bar) zodat user-events visueel
 * prioriteit hebben, met doelen ertussenin.
 *
 * Met `pixelClustering` schakelt de groepering over van "afgerond jaar" naar
 * "pixel-afstand op de huidige zoomstand" (bevinding M16). Dat is niet zomaar
 * een fijnere variant van hetzelfde: de leeftijd-strategieën groeperen alléén
 * exacte treffers, terwijl juist ápart liggende jaren op een uitgezoomde as op
 * elkaar landen. Zie `packByPixelProximity`.
 */
export function positionChartEvents(
  events: ChartEventOverlay[],
  options: {
    ageGroupingStrategy?: 'integer' | 'tenth'
    /**
     * Zet de pixel-bewuste groepering aan. `xScale` is dezelfde schaal die de
     * renderer gebruikt (leeftijd → px binnen innerW), zodat de clustering
     * exact de zichtbare afstanden volgt en meebeweegt met in-/uitzoomen.
     */
    pixelClustering?: { xScale: (age: number) => number; thresholdPx?: number }
  } = {},
): PositionedChartEvent[] {
  if (options.pixelClustering) {
    const { xScale, thresholdPx } = options.pixelClustering
    const positioned: PositionedChartEvent[] = []
    // Boven en onder de lijn zijn gescheiden rijen op het scherm; clusteren
    // over die grens heen zou markers naar de verkeerde kant trekken.
    // `e.side === 'above' ? 'above' : 'below'` spiegelt letterlijk hoe de
    // renderer de kant bepaalt (`isAbove = p.side === 'above'`). Een strikte
    // gelijkheid op beide waarden zou een marker met een ontbrekende/onbekende
    // side stil laten verdwijnen in plaats van 'm — net als voorheen — onderaan
    // te tekenen.
    for (const side of ['above', 'below'] as const) {
      const ofSide = events
        .filter(e => (e.side === 'above' ? 'above' : 'below') === side)
        .sort((a, b) => a.age - b.age)
      if (ofSide.length === 0) continue
      const clusters = packByPixelProximity(
        ofSide,
        e => xScale(e.age),
        e => e.age,
        thresholdPx,
      )
      for (const cluster of clusters) {
        const sorted = sortForStack(cluster.items)
        sorted.forEach((e, idx) => {
          positioned.push({
            ...e,
            stackIndex: idx,
            bucketSize: sorted.length,
            clusterX: cluster.x,
            clusterCenterAge: cluster.centerAge,
            clusterMembers: sorted,
          })
        })
      }
    }
    return positioned
  }

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
    const sorted = sortForStack(list)
    sorted.forEach((e, idx) => {
      positioned.push({ ...e, stackIndex: idx, bucketSize: sorted.length })
    })
  }

  return positioned
}

/** Hoeveel iconen tonen we maximaal in één stack voordat we naar +N clusteren? */
export const MAX_STACK_VISIBLE = 3

/**
 * Zet een marker-overlay om naar de rij-vorm die `EventClusterSheet` leest.
 *
 * Alleen bedoeld voor markers die GEEN echte `LifeEvent` achter zich hebben:
 * doel-markers (M36), read-only partner-gebeurtenissen en de
 * tekort-lening-waarschuwing. Voor gewone levensgebeurtenissen en natuurlijke
 * mijlpalen pakt de host het échte object — dan klopt ook de bedragregel.
 *
 * Waarom dit bestaat: de cluster-badge belooft "+N", dus de sheet moet
 * precies díe N tonen. Zonder deze omzetting zouden doelen en
 * partner-gebeurtenissen wél meetellen in de badge maar uit de lijst vallen —
 * een cluster van 5 dat er 3 laat zien is erger dan geen cluster.
 *
 * De bedragvelden blijven bewust 0 en de regel gaat via `metadata.impactLine`:
 * een verzonnen `one_time_cost` zou de sheet een financiële uitspraak laten
 * doen die nergens op slaat.
 */
export function chartEventOverlayToClusterRow(o: ChartEventOverlay): LifeEvent {
  const impactLine =
    o.detail ??
    (o.kind === 'goal'
      ? 'Financieel doel'
      : o.readOnly && o.kind === 'life_event'
        ? 'Levensgebeurtenis van je partner'
        : o.kind === 'natural'
          ? 'Automatisch afgeleide mijlpaal'
          : 'Levensgebeurtenis')
  return {
    id: o.id,
    name: o.label,
    event_type: o.kind,
    target_age: o.age,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    icon: o.icon,
    is_active: true,
    sort_order: 0,
    is_indexed: false,
    metadata: {
      isNatural: o.kind === 'natural',
      impactLine,
      sourceId: o.sourceId,
    },
  }
}
