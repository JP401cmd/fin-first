'use client'

// Pure SVG-renderer van het ArchiMate-model. Geen data-fetching: model +
// selectie + overlays komen als props binnen. Zowel elementen als relaties
// zijn klikbaar en toetsenbord-bereikbaar.

import { useMemo } from 'react'
import {
  ARCHI_KIND_META,
  ARCHI_REL_NL,
  type ArchiEdge,
  type ArchiNode,
  type ArchiSide,
  type ArchimateModel,
} from '@/lib/architecture/archimate-model'

interface Point {
  x: number
  y: number
}

function anchor(n: ArchiNode, side: ArchiSide, override?: number): Point {
  if (side === 'L') return { x: n.x, y: override ?? n.y + n.h / 2 }
  if (side === 'R') return { x: n.x + n.w, y: override ?? n.y + n.h / 2 }
  if (side === 'T') return { x: override ?? n.x + n.w / 2, y: n.y }
  return { x: override ?? n.x + n.w / 2, y: n.y + n.h }
}

function edgePoints(e: ArchiEdge, byId: Map<string, ArchiNode>): Point[] {
  const a = anchor(byId.get(e.from)!, e.fromSide, e.fromOffset)
  const b = anchor(byId.get(e.to)!, e.toSide, e.toOffset)
  if (e.via?.length) return [a, ...e.via.map(([x, y]) => ({ x, y })), b]
  const dx = Math.abs(a.x - b.x)
  const dy = Math.abs(a.y - b.y)
  if (dx > 2 && dy > 2) {
    if (e.fromSide === 'L' || e.fromSide === 'R') {
      const mx = e.midX ?? (a.x + b.x) / 2
      return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b]
    }
    const my = (a.y + b.y) / 2
    return [a, { x: a.x, y: my }, { x: b.x, y: my }, b]
  }
  return [a, b]
}

function pathD(pts: Point[]): string {
  return 'M' + pts.map((p) => `${p.x},${p.y}`).join(' L')
}

function midpoint(pts: Point[]): Point {
  const i = Math.floor((pts.length - 1) / 2)
  return { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 }
}

/** Simpele woord-wrap voor SVG-tekst */
function wrapText(s: string, max: number): string[] {
  const words = s.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > max) {
      if (cur) lines.push(cur)
      cur = word
    } else {
      cur = (cur + ' ' + word).trim()
    }
  }
  if (cur) lines.push(cur)
  return lines
}

const GLYPH_STROKE = '#3a3a3a'

function Glyph({ kind, x, y }: { kind: string; x: number; y: number }) {
  const common = { fill: 'none', stroke: GLYPH_STROKE, strokeWidth: 1.3 }
  const body = (() => {
    switch (kind) {
      case 'proc':
        return <path d="M0,1 L9,1 L13,5 L9,9 L0,9 Z" {...common} />
      case 'role':
        return (
          <>
            <circle cx={4} cy={3} r={3} {...common} />
            <rect x={0} y={7} width={13} height={5} {...common} />
          </>
        )
      case 'svc':
        return <rect x={0} y={2} width={14} height={8} rx={4} {...common} />
      case 'comp':
        return (
          <>
            <rect x={3} y={0} width={11} height={11} {...common} />
            <rect x={0} y={2} width={5} height={3} fill="var(--paper)" stroke={GLYPH_STROKE} strokeWidth={1.2} />
            <rect x={0} y={6} width={5} height={3} fill="var(--paper)" stroke={GLYPH_STROKE} strokeWidth={1.2} />
          </>
        )
      case 'func':
        return <path d="M1,9 L6,2 L11,9" {...common} strokeWidth={1.4} />
      case 'tech':
        return (
          <>
            <path d="M0,3 L6,0 L12,3 L6,6 Z" {...common} strokeWidth={1.2} />
            <path d="M0,3 L0,9 L6,12 L6,6" {...common} strokeWidth={1.2} />
            <path d="M12,3 L12,9 L6,12" {...common} strokeWidth={1.2} />
          </>
        )
      case 'data':
        return (
          <>
            <rect x={0} y={1} width={14} height={10} {...common} />
            <rect x={0} y={1} width={14} height={3} fill={GLYPH_STROKE} stroke="none" />
          </>
        )
      case 'req':
        return <path d="M0,1 L11,1 L14,4 L14,11 L0,11 Z" {...common} />
      case 'node':
        return (
          <>
            <path d="M0,3 L3,0 L13,0 L13,8 L10,11 L0,11 Z" {...common} strokeWidth={1.2} />
            <path d="M0,3 L10,3 L13,0 M10,3 L10,11" {...common} strokeWidth={1} />
          </>
        )
      default:
        return null
    }
  })()
  if (!body) return null
  return (
    <g aria-hidden="true" transform={`translate(${x - 21},${y + 7})`} className="pointer-events-none">
      {body}
    </g>
  )
}

export interface PlaatOverlay {
  /** Elementen die geaccentueerd blijven; de rest dimt (lens-modus). */
  emphasisNodeIds?: Set<string>
  /** Relaties die geaccentueerd blijven (lens-modus). */
  emphasisEdgeIds?: Set<string>
  /** Of niet-geaccentueerde elementen gedimd moeten worden. */
  dimOthers?: boolean
  /** Optionele tint per element (bv. churn-heat of concern-severity). */
  nodeTone?: Map<string, string>
  /** Optioneel badge-teken rechtsonder per element (bv. concern-telling). */
  nodeBadge?: Map<string, string>
}

interface PlaatProps {
  model: ArchimateModel
  selectedNodeId: string | null
  selectedEdgeId: string | null
  onSelectNode: (id: string) => void
  onSelectEdge: (id: string) => void
  overlay?: PlaatOverlay
}

export function ArchimatePlaat({
  model,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  overlay,
}: PlaatProps) {
  const byId = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model])

  // Highlight-sets afgeleid uit de selectie (element of relatie).
  const { activeNodes, activeEdges } = useMemo(() => {
    const nodes = new Set<string>()
    const edges = new Set<string>()
    if (selectedNodeId) {
      nodes.add(selectedNodeId)
      for (const e of model.edges) {
        if (e.from === selectedNodeId) {
          nodes.add(e.to)
          edges.add(e.id)
        } else if (e.to === selectedNodeId) {
          nodes.add(e.from)
          edges.add(e.id)
        }
      }
    } else if (selectedEdgeId) {
      const e = model.edges.find((x) => x.id === selectedEdgeId)
      if (e) {
        edges.add(e.id)
        nodes.add(e.from)
        nodes.add(e.to)
      }
    }
    return { activeNodes: nodes, activeEdges: edges }
  }, [model, selectedNodeId, selectedEdgeId])

  const hasSelection = selectedNodeId !== null || selectedEdgeId !== null
  const emphasisNodes = overlay?.emphasisNodeIds
  const emphasisEdges = overlay?.emphasisEdgeIds
  const dimByOverlay = overlay?.dimOthers ?? false

  // Containers (groepen + component) eerst tekenen, dan de rest erbovenop
  const drawOrder = useMemo(() => {
    const isContainer = (n: ArchiNode) => n.kind === 'group' || n.kind === 'appcomp'
    return [...model.nodes].sort((a, b) => Number(isContainer(b)) - Number(isContainer(a)))
  }, [model])

  function nodeOpacity(id: string): number {
    if (hasSelection) return activeNodes.has(id) ? 1 : 0.28
    if (dimByOverlay && emphasisNodes) return emphasisNodes.has(id) ? 1 : 0.26
    return 1
  }
  function edgeState(e: ArchiEdge): { opacity: number; highlight: boolean } {
    if (hasSelection) {
      const on = activeEdges.has(e.id)
      return { opacity: on ? 1 : 0.1, highlight: on }
    }
    if (dimByOverlay && emphasisEdges) {
      const on = emphasisEdges.has(e.id)
      return { opacity: on ? 1 : 0.08, highlight: on }
    }
    return { opacity: 1, highlight: false }
  }

  return (
    <svg
      viewBox={`0 0 ${model.width} ${model.height}`}
      className="block h-auto w-full min-w-[1180px]"
      aria-label="ArchiMate-plaat van TriFinity — klik een element of relatie voor detail"
    >
      <defs>
        <marker id="archi-arrow" markerWidth="12" markerHeight="12" refX="8.5" refY="4" orient="auto">
          <path d="M0,0 L8.5,4 L0,8" fill="none" stroke="#5f5b54" strokeWidth="1.4" />
        </marker>
        <marker id="archi-tri" markerWidth="14" markerHeight="12" refX="10" refY="5" orient="auto">
          <path d="M1,1 L10,5 L1,9 Z" fill="var(--paper)" stroke="#5f5b54" strokeWidth="1.3" />
        </marker>
        <marker id="archi-diamond" markerWidth="16" markerHeight="12" refX="1" refY="5" orient="auto">
          <path d="M1,5 L6,1 L11,5 L6,9 Z" fill="#5f5b54" stroke="#5f5b54" />
        </marker>
        {/* aggregatie = holle ruit (papierkleurig gevuld) aan de geheel-kant */}
        <marker id="archi-diamond-open" markerWidth="16" markerHeight="12" refX="1" refY="5" orient="auto">
          <path d="M1,5 L6,1 L11,5 L6,9 Z" fill="var(--paper)" stroke="#5f5b54" strokeWidth="1.2" />
        </marker>
        {/* assignment = gevulde bol aan de actor-kant */}
        <marker id="archi-ball" markerWidth="12" markerHeight="12" refX="3.4" refY="5" orient="auto">
          <circle cx="4" cy="5" r="3.4" fill="#5f5b54" />
        </marker>
        <marker id="archi-acc" markerWidth="11" markerHeight="11" refX="7" refY="4" orient="auto">
          <path d="M1,1 L7,4 L1,7" fill="none" stroke="#5f5b54" strokeWidth="1.2" />
        </marker>
      </defs>

      {/* ── relaties ── */}
      <g>
        {model.edges.map((e) => {
          const pts = edgePoints(e, byId)
          const d = pathD(pts)
          const { opacity, highlight } = edgeState(e)
          const isSelected = selectedEdgeId === e.id
          const dash = e.type === 'realization' ? '5 4' : e.type === 'access' ? '1.5 3.5' : undefined
          const markerEnd =
            e.type === 'serving' || e.type === 'assignment'
              ? 'url(#archi-arrow)'
              : e.type === 'realization'
                ? 'url(#archi-tri)'
                : e.type === 'access'
                  ? 'url(#archi-acc)'
                  : undefined
          const markerStart =
            e.type === 'composition'
              ? 'url(#archi-diamond)'
              : e.type === 'aggregation'
                ? 'url(#archi-diamond-open)'
                : e.type === 'assignment'
                  ? 'url(#archi-ball)'
                  : e.type === 'access' && e.readWrite
                    ? 'url(#archi-acc)'
                    : undefined
          const m = e.label ? midpoint(pts) : null
          const labelW = e.label ? e.label.length * 6.2 + 8 : 0
          const from = byId.get(e.from)
          const to = byId.get(e.to)
          const a11y = `Relatie: ${from?.title} ${ARCHI_REL_NL[e.type].toLowerCase()} ${to?.title}`
          return (
            <g key={e.id} className="transition-opacity duration-150" opacity={opacity}>
              {/* zichtbaar pad */}
              <path
                d={d}
                fill="none"
                stroke={isSelected ? 'var(--color-horizon-600)' : highlight ? 'var(--ink)' : '#5f5b54'}
                strokeWidth={isSelected ? 2.4 : highlight ? 1.9 : 1.4}
                strokeDasharray={dash}
                markerEnd={markerEnd}
                markerStart={markerStart}
                className="pointer-events-none"
              />
              {/* brede onzichtbare hit-zone, toetsenbord-bereikbaar */}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                role="button"
                tabIndex={0}
                aria-label={a11y}
                onClick={(ev) => {
                  ev.stopPropagation()
                  onSelectEdge(e.id)
                }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    onSelectEdge(e.id)
                  }
                }}
                className="cursor-pointer outline-none [&:focus-visible]:stroke-[color:var(--color-horizon-400)]"
              />
              {e.label && m && (
                <>
                  <rect
                    x={m.x - labelW / 2}
                    y={m.y - 9}
                    width={labelW}
                    height={15}
                    fill="var(--paper)"
                    opacity={0.88}
                    className="pointer-events-none"
                  />
                  <text x={m.x} y={m.y + 2} textAnchor="middle" fontSize={10.5} fill="var(--ink-2)" className="pointer-events-none">
                    {e.label}
                  </text>
                </>
              )}
            </g>
          )
        })}
      </g>

      {/* ── elementen ── */}
      <g>
        {drawOrder.map((n) => {
          const meta = ARCHI_KIND_META[n.kind]
          const isContainer = n.kind === 'group' || n.kind === 'appcomp'
          const active = selectedNodeId === n.id
          const lines = isContainer ? [] : wrapText(n.title, n.w < 170 ? 18 : n.w < 250 ? 26 : 48)
          const fs = n.w < 170 ? 11.5 : 12.5
          const startY = n.y + n.h / 2 - ((lines.length - 1) * (fs + 2)) / 2 + fs / 2 - 1
          const tone = overlay?.nodeTone?.get(n.id)
          const badge = overlay?.nodeBadge?.get(n.id)
          return (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`${meta.label}: ${n.title}`}
              onClick={(ev) => {
                ev.stopPropagation()
                onSelectNode(n.id)
              }}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  onSelectNode(n.id)
                }
              }}
              className="cursor-pointer outline-none transition-opacity duration-150 [&:focus-visible>rect]:stroke-[var(--ink)]"
              opacity={nodeOpacity(n.id)}
            >
              <rect
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx={meta.rounded ? 14 : 0}
                fill={tone ?? meta.fill}
                stroke={meta.stroke}
                strokeWidth={active ? 2.6 : 1.5}
              />
              {meta.glyph !== 'none' && <Glyph kind={meta.glyph} x={n.x + n.w} y={n.y} />}
              {n.badge && (
                <text x={n.x + 8} y={n.y + 13} fontSize={8.5} letterSpacing="0.08em" fill="var(--ink-3)" className="pointer-events-none">
                  {n.badge.toUpperCase()}
                </text>
              )}
              {badge && (
                <>
                  <circle cx={n.x + n.w - 10} cy={n.y + n.h - 10} r={8} fill="var(--color-horizon-600)" className="pointer-events-none" />
                  <text x={n.x + n.w - 10} y={n.y + n.h - 6.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff" className="pointer-events-none">
                    {badge}
                  </text>
                </>
              )}
              {isContainer ? (
                <>
                  <text x={n.x + 14} y={n.y + 22} fontSize={13.5} fontWeight={700} fill="var(--ink)" className="pointer-events-none">
                    {n.title}
                  </text>
                  {n.id === 'app-comp' && (
                    <text x={n.x + 14} y={n.y + 42} fontSize={11} fill="var(--ink-3)" className="pointer-events-none">
                      Functionele modules — door de gebruiker te activeren:
                    </text>
                  )}
                  {n.note && (
                    <text x={n.x + 14} y={n.y + n.h - 14} fontSize={10.5} fill="var(--ink-3)" className="pointer-events-none">
                      {n.note}
                    </text>
                  )}
                </>
              ) : (
                lines.map((ln, i) => (
                  <text
                    key={i}
                    x={n.x + n.w / 2}
                    y={startY + i * (fs + 2)}
                    textAnchor="middle"
                    fontSize={fs}
                    fontWeight={600}
                    fill="var(--ink)"
                    className="pointer-events-none"
                  >
                    {ln}
                  </text>
                ))
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
