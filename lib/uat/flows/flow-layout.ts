// Pure layout voor de UAT-procesflow (verdiepingslaag laag 2).
//
// Berekent in dezelfde SVG-coördinatenruimte (pixels) als lib/uat/plaat-layout.ts
// de posities van de flow-knopen en de edge-paden, zodat de bestaande zoom/pan
// (lib/hooks/use-plaat-zoom-pan.ts) en statusvormen 1-op-1 hergebruikt worden.
//
// Layout-principe:
//   • stage      → kolom (x), links → rechts (dense-rank van de aanwezige stages)
//   • lane       → verticale rijband binnen de kolom
//   • subOf      → ingesprongen kinderen ONDER hun sub-hub, verbonden via een rail
//   • kolommen worden verticaal gecentreerd t.o.v. de hoogste kolom
//
// Deterministisch: dezelfde flow geeft altijd exact dezelfde coördinaten.
// GEEN React, GEEN DOM — alleen geometrie.

import type { UatFlow, UatFlowEdge, UatFlowNode } from './types'

// ── Vaste maatvoering (pixels, zelfde eenheden als plaat-layout.ts) ───────────

const PAD = 28
const NODE_W = 176
const NODE_H = 44
const ROW_GAP = 18
const CHILD_INDENT = 22
const COL_GAP = 46
const COL_W = NODE_W + CHILD_INDENT + COL_GAP // 244
const LANE_GAP = 28
const SUBHUB_GAP = 20
const RAIL_INSET = 12

const ROW_STEP = NODE_H + ROW_GAP // 62

// ── Resultaat-typen ───────────────────────────────────────────────────────────

export interface Point {
  x: number
  y: number
}

export interface FlowNodeLayout {
  node: UatFlowNode
  x: number
  y: number
  w: number
  h: number
}

export interface FlowEdgeLayout {
  edge: UatFlowEdge
  points: Point[]
  path: string
}

export interface FlowLayout {
  nodes: FlowNodeLayout[]
  edges: FlowEdgeLayout[]
  viewBox: string
  width: number
  height: number
}

// ── Hulpfuncties ──────────────────────────────────────────────────────────────

/** SVG-pad uit een polyline. */
function toPath(points: readonly Point[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${round(p.x)} ${round(p.y)}`)
    .join(' ')
}

/** Afronden op 2 decimalen zodat paden compact + byte-stabiel zijn. */
function round(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Hoofdfunctie ──────────────────────────────────────────────────────────────

/**
 * Bouwt de flow-layout uit een gecureerde UatFlow. Puur & deterministisch.
 */
export function computeFlowLayout(flow: UatFlow): FlowLayout {
  const nodesById = new Map<string, UatFlowNode>(flow.nodes.map((n) => [n.id, n]))

  // Dense-rank de aanwezige stages → kolomindex.
  const stages = Array.from(new Set(flow.nodes.map((n) => n.stage))).sort((a, b) => a - b)
  const colIndexByStage = new Map<number, number>(stages.map((s, i) => [s, i]))
  const colX = (stage: number): number => PAD + (colIndexByStage.get(stage) ?? 0) * COL_W

  // Per-kolom verticale layout (lokale y vanaf 0). Sub-hub-kinderen volgen hun
  // ouder, ingesprongen. Tussen lane-wissels en sub-hubs komt extra ruimte.
  interface LocalPos {
    node: UatFlowNode
    x: number
    y: number
  }
  const localByStage = new Map<number, LocalPos[]>()
  const colHeightByStage = new Map<number, number>()

  for (const stage of stages) {
    const colNodes = flow.nodes.filter((n) => n.stage === stage)
    // Top-level = geen subOf, of ouder zit niet in deze kolom.
    const topLevel = colNodes.filter(
      (n) => !n.subOf || !colNodes.some((p) => p.id === n.subOf),
    )

    const placed: LocalPos[] = []
    const x = colX(stage)
    let y = 0
    let prevLane: string | undefined
    let prevHadChildren = false
    let first = true

    for (const parent of topLevel) {
      const children = colNodes.filter((c) => c.subOf === parent.id)
      const hasChildren = children.length > 0

      if (!first) {
        if (parent.lane !== prevLane) y += LANE_GAP
        else if (prevHadChildren || hasChildren) y += SUBHUB_GAP
      }

      placed.push({ node: parent, x, y })
      y += ROW_STEP

      for (const child of children) {
        placed.push({ node: child, x: x + CHILD_INDENT, y })
        y += ROW_STEP
      }

      prevLane = parent.lane
      prevHadChildren = hasChildren
      first = false
    }

    localByStage.set(stage, placed)
    colHeightByStage.set(stage, Math.max(NODE_H, y - ROW_GAP))
  }

  const maxColHeight = Math.max(...colHeightByStage.values())

  // Centreer elke kolom verticaal en materialiseer de knoop-posities.
  const nodeLayouts: FlowNodeLayout[] = []
  const rectById = new Map<string, FlowNodeLayout>()

  for (const stage of stages) {
    const placed = localByStage.get(stage) ?? []
    const colHeight = colHeightByStage.get(stage) ?? NODE_H
    const yOffset = PAD + (maxColHeight - colHeight) / 2
    for (const p of placed) {
      const layout: FlowNodeLayout = { node: p.node, x: p.x, y: p.y + yOffset, w: NODE_W, h: NODE_H }
      nodeLayouts.push(layout)
      rectById.set(p.node.id, layout)
    }
  }

  const maxRight = nodeLayouts.reduce((m, n) => Math.max(m, n.x + n.w), 0)
  const width = maxRight + PAD
  const height = maxColHeight + PAD * 2

  // ── Edges ────────────────────────────────────────────────────────────────
  const edgeLayouts: FlowEdgeLayout[] = flow.edges.map((edge) => {
    const a = rectById.get(edge.from)
    const b = rectById.get(edge.to)
    if (!a || !b) {
      // Referentie-integriteit wordt door de vitest bewaakt; hier degraderen we
      // netjes i.p.v. te crashen.
      return { edge, points: [], path: '' }
    }
    const toNode = nodesById.get(edge.to)
    const points = routeEdge(a, b, toNode?.subOf === edge.from)
    return { edge, points, path: toPath(points) }
  })

  return {
    nodes: nodeLayouts,
    edges: edgeLayouts,
    viewBox: `0 0 ${round(width)} ${round(height)}`,
    width,
    height,
  }
}

// ── Edge-routing ──────────────────────────────────────────────────────────────

/**
 * Bepaalt een orthogonale polyline tussen twee knoop-rechthoeken.
 *  • rail   : kind is subOf-kind van ouder → verticale rail + insprong
 *  • vertical: zelfde kolom (opeenvolgende stap) → recht omlaag/omhoog
 *  • forward : doel rechts → elleboog via het midden
 *  • back    : doel links → gespiegelde elleboog (fallback)
 */
function routeEdge(a: FlowNodeLayout, b: FlowNodeLayout, isRail: boolean): Point[] {
  const aCenterY = a.y + a.h / 2
  const bCenterY = b.y + b.h / 2
  const aCenterX = a.x + a.w / 2

  if (isRail) {
    const railX = a.x + RAIL_INSET
    return [
      { x: railX, y: a.y + a.h },
      { x: railX, y: bCenterY },
      { x: b.x, y: bCenterY },
    ]
  }

  if (Math.abs(a.x - b.x) < 0.5) {
    // Zelfde kolom: recht verticaal tussen de dichtstbijzijnde randen.
    if (b.y >= a.y) {
      return [
        { x: aCenterX, y: a.y + a.h },
        { x: aCenterX, y: b.y },
      ]
    }
    return [
      { x: aCenterX, y: a.y },
      { x: aCenterX, y: b.y + b.h },
    ]
  }

  if (b.x > a.x) {
    // Voorwaartse elleboog: rechterrand a → linkerrand b.
    const ax = a.x + a.w
    const midX = (ax + b.x) / 2
    return [
      { x: ax, y: aCenterY },
      { x: midX, y: aCenterY },
      { x: midX, y: bCenterY },
      { x: b.x, y: bCenterY },
    ]
  }

  // Terugwaartse elleboog (fallback): linkerrand a → rechterrand b.
  const bx = b.x + b.w
  const midX = (a.x + bx) / 2
  return [
    { x: a.x, y: aCenterY },
    { x: midX, y: aCenterY },
    { x: midX, y: bCenterY },
    { x: bx, y: bCenterY },
  ]
}
