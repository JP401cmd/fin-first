/**
 * Ringslot-logica voor de Sleepmodus (drag-&-drop transactie-toewijzing).
 *
 * Het speelveld is een vierkant rond de centrale transactie-bol. Hoofdbudgetten
 * krijgen vaste posities (spiergeheugen): 3 boven, 2×2 op de zijden, 2 onder.
 * Bij meer dan 9 hoofdbudgetten gaan de 8 meest gebruikte op slot 0-7 en bundelt
 * slot 8 ("Meer"-bol) de rest. Puur en deterministisch — geen React, geen DB.
 */

export type RingSlot = {
  /** Horizontale positie als percentage van het speelveld (0-100). */
  x: number
  /** Verticale positie als percentage van het speelveld (0-100). */
  y: number
}

/**
 * 9 vaste posities rondom het centrum (50,50). Verdeling over alle zijden zodat
 * de ring ook op 390px-mobiel past: boven 3, links 2, rechts 2, onder 2 — de
 * onderste rij blijft boven de Eigen rekening/Overslaan-pills in de duim-zone.
 */
export const RING_SLOTS: readonly RingSlot[] = [
  { x: 22, y: 10 },
  { x: 50, y: 10 },
  { x: 78, y: 10 },
  { x: 10, y: 35 },
  { x: 10, y: 58 },
  { x: 90, y: 35 },
  { x: 90, y: 58 },
  { x: 30, y: 80 },
  { x: 70, y: 80 },
]

export const MAX_RING_BUDGETS = RING_SLOTS.length

type RingBudgetLike = {
  id: string
  budget_type: 'income' | 'expense' | 'savings' | 'debt' | 'archive'
  sort_order: number
}

export type SlottedBudget<T> = { budget: T; slot: number }

export type RingAssignment<T> = {
  slotted: SlottedBudget<T>[]
  /** Parents zonder eigen slot — gebundeld achter de "Meer"-bol op het laatste slot. */
  overflow: T[]
}

/**
 * Verdeel hoofdbudgetten over de ringslots.
 *
 * - Archive-parents (Eigen rekening) doen niet mee — die hebben een eigen dropzone.
 * - Past alles (≤ maxSlots)? Dan iedereen op slot, in sort_order-volgorde.
 * - Te veel? Top (maxSlots − 1) op gebruiksfrequentie (tiebreak sort_order),
 *   gepresenteerd in sort_order-volgorde op slot 0..maxSlots−2; de rest is
 *   overflow voor de "Meer"-bol op het laatste slot.
 */
export function assignRingSlots<T extends RingBudgetLike>(
  parents: T[],
  usage: Map<string, number>,
  maxSlots: number = MAX_RING_BUDGETS,
): RingAssignment<T> {
  const eligible = parents
    .filter((p) => p.budget_type !== 'archive')
    .sort((a, b) => a.sort_order - b.sort_order)

  if (eligible.length <= maxSlots) {
    return {
      slotted: eligible.map((budget, slot) => ({ budget, slot })),
      overflow: [],
    }
  }

  const byUsage = [...eligible].sort((a, b) => {
    const diff = (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0)
    return diff !== 0 ? diff : a.sort_order - b.sort_order
  })
  const selectedIds = new Set(byUsage.slice(0, maxSlots - 1).map((p) => p.id))

  const slotted = eligible
    .filter((p) => selectedIds.has(p.id))
    .map((budget, slot) => ({ budget, slot }))
  const overflow = eligible.filter((p) => !selectedIds.has(p.id))

  return { slotted, overflow }
}

/**
 * Posities voor deelbudgetten wanneer een hoofdbudget bij benadering
 * opensplitst: de children waaieren als cluster rond de hóófdbol, met de
 * waaier richting het veldmidden (zodat hij van de rand af wijst). Bewust
 * NIET op de ringslots — daar staan de andere hoofdbudgetten, en eroverheen
 * leggen maakte ze onbereikbaar tijdens het slepen.
 */
const CLUSTER_RADIUS = 19
const CLUSTER_RADIUS_OUTER = 31
const CLUSTER_STEP_DEG = 38
const CLUSTER_MAX_SPREAD_DEG = 140
const CLUSTER_RING_SIZE = 6

/** Schaalfactor van de miniatuur-preview t.o.v. de echte cluster-afstand. */
const PREVIEW_SCALE = 0.42

/**
 * Miniatuur-posities van de deelbudgetten bij een hoofdbol in ruststand: op
 * dezelfde stralen als waar het cluster straks opent (spatial consistency),
 * maar dichter op de parent. Zo zie je vóór het naderen al wáár elk deelbudget
 * komt te staan en kun je er direct heen slepen.
 */
export function childPreviewFor(parentSlot: number, count: number): RingSlot[] {
  const parent = RING_SLOTS[parentSlot] ?? RING_SLOTS[0]
  return childClusterFor(parentSlot, count).map((pos) => ({
    x: parent.x + (pos.x - parent.x) * PREVIEW_SCALE,
    y: parent.y + (pos.y - parent.y) * PREVIEW_SCALE,
  }))
}

/**
 * Valt een punt (veld-%) binnen de deelbudget-ring van een geopende parent?
 * Gebruikt voor de directe (timer-loze) sluiting tijdens het slepen: buiten
 * deze cirkel → cluster dicht.
 *
 * De sluitgrens MOET ruim buiten de buitenste (2e) ring liggen, anders sluit de
 * waaier precies op de plek waar de 2e-rij-deelbudgetten staan en zijn die met
 * slepen vrijwel onbereikbaar. Daarom: CLUSTER_RADIUS_OUTER + marge (niet de
 * voormalige, toevallig samenvallende CLUSTER_RADIUS + 12 === CLUSTER_RADIUS_OUTER).
 * De marge geeft de buitenste bollen (incl. hun eigen straal) een reële hover/
 * drop-zone. Een andere geopende parent wordt los hiervan getriggerd door de
 * DOM-rect-collision van dnd-kit, dus een royalere sluitgrens sluit geen buur af.
 */
const CLUSTER_EXIT_MARGIN = 10
const CLUSTER_EXIT_RADIUS = CLUSTER_RADIUS_OUTER + CLUSTER_EXIT_MARGIN

export function isInsideCluster(point: RingSlot, parentSlot: number): boolean {
  const parent = RING_SLOTS[parentSlot] ?? RING_SLOTS[0]
  return Math.hypot(point.x - parent.x, point.y - parent.y) <= CLUSTER_EXIT_RADIUS
}

export function childClusterFor(parentSlot: number, count: number): RingSlot[] {
  const parent = RING_SLOTS[parentSlot] ?? RING_SLOTS[0]
  const toCenter = Math.atan2(50 - parent.y, 50 - parent.x)
  const clamp = (v: number) => Math.min(94, Math.max(6, v))

  const positions: RingSlot[] = []
  for (let ring = 0; positions.length < count; ring++) {
    const inRing = Math.min(count - positions.length, CLUSTER_RING_SIZE)
    const radius = ring === 0 ? CLUSTER_RADIUS : CLUSTER_RADIUS_OUTER
    const spread = Math.min(CLUSTER_MAX_SPREAD_DEG, CLUSTER_STEP_DEG * (inRing - 1))
    for (let i = 0; i < inRing; i++) {
      const offset = inRing === 1 ? 0 : -spread / 2 + (spread * i) / (inRing - 1)
      const angle = toCenter + (offset * Math.PI) / 180
      positions.push({
        x: clamp(parent.x + radius * Math.cos(angle)),
        y: clamp(parent.y + radius * Math.sin(angle)),
      })
    }
  }
  return positions
}
