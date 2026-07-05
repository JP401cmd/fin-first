'use client'

// Laag-2 procesmodel-render voor de UAT-plaat. Tekent computeFlowLayout(flow)
// in dezelfde SVG-pixelruimte als de laag-1-plaat, met dezelfde zoom/pan-hook
// (use-plaat-zoom-pan) en dezelfde statuscodering (UAT_STATUS_VISUAL uit
// lib/uat/status.ts). Statusdragende knopen (scenarioId) zijn klikbaar en
// openen hetzelfde detailpaneel; de knopen die de zonestatus bepalen krijgen
// een dik accent + badge "bepaalt zonestatus". GEEN eigen statuslogica — vorm,
// kleur en de veroorzaker-set komen uit status.ts + de pure explainZoneStatus.

import { useMemo } from 'react'
import { Maximize2 } from 'lucide-react'
import type { FlowLayout, FlowNodeLayout } from '@/lib/uat/flows/flow-layout'
import type { UatFlow, UatFlowNode } from '@/lib/uat/flows/types'
import type { ZoneStatusExplanation } from '@/lib/uat/flows/zone-status'
import { UAT_SCENARIOS, type UatScenario } from '@/lib/uat/catalog'
import { UAT_STATUS_VISUAL, type UatStatus } from '@/lib/uat/status'
import { usePlaatZoomPan } from '@/lib/hooks/use-plaat-zoom-pan'

const SCENARIO_BY_ID = new Map<string, UatScenario>(UAT_SCENARIOS.map((s) => [s.id, s]))

interface FlowProps {
  flow: UatFlow
  layout: FlowLayout
  explanation: ZoneStatusExplanation
  /** Scenario-id van het geselecteerde detailpaneel (of null). */
  selectedId: string | null
  onSelectScenario: (scenario: UatScenario) => void
}

// ── Tekst-hulpjes ──────────────────────────────────────────────────────────────

function splitLabel(label: string): { code?: string; name: string } {
  const idx = label.indexOf(' · ')
  if (idx === -1) return { name: label }
  return { code: label.slice(0, idx), name: label.slice(idx + 3) }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

// ── Statusvorm (hergebruikt UAT_STATUS_VISUAL — geen eigen statuslogica) ────────

function StatusMark({ cx, cy, r, status }: { cx: number; cy: number; r: number; status: UatStatus }) {
  const v = UAT_STATUS_VISUAL[status]
  const d = r * 1.18
  let shape: React.ReactNode
  if (v.shape === 'triangle') {
    shape = (
      <polygon
        points={`${cx},${cy - d} ${cx - d},${cy + d * 0.82} ${cx + d},${cy + d * 0.82}`}
        fill={v.fill}
        stroke={v.stroke}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
    )
  } else if (v.shape === 'diamond') {
    shape = (
      <polygon
        points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`}
        fill={v.fill}
        stroke={v.stroke}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
    )
  } else if (v.shape === 'circle-open') {
    shape = <circle cx={cx} cy={cy} r={r} fill="none" stroke={v.stroke} strokeWidth={1.2} strokeDasharray="2 2.2" />
  } else {
    shape = <circle cx={cx} cy={cy} r={r} fill={v.fill} stroke={v.stroke} strokeWidth={1.1} />
  }
  return (
    <g className="pointer-events-none">
      {shape}
      {v.glyph && r >= 5 && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.15} fontWeight={700} fill={v.glyphFill}>
          {v.glyph}
        </text>
      )}
    </g>
  )
}

/** Pill "bepaalt zonestatus", overlapt de bovenrand van een veroorzaker-knoop. */
function CauserBadge({ x, y, status }: { x: number; y: number; status: UatStatus }) {
  const v = UAT_STATUS_VISUAL[status]
  const w = 86
  return (
    <g className="pointer-events-none">
      <rect x={x} y={y - 7.5} width={w} height={13} rx={6.5} fill={v.fill === 'none' ? v.stroke : v.fill} />
      <text x={x + w / 2} y={y - 0.4} textAnchor="middle" fontSize={7.2} fontWeight={700} fill="#ffffff">
        bepaalt zonestatus
      </text>
    </g>
  )
}

// ── Edges ───────────────────────────────────────────────────────────────────────

function FlowEdges({ layout, nodesById }: { layout: FlowLayout; nodesById: Map<string, UatFlowNode> }) {
  return (
    <g fill="none">
      {layout.edges.map((e, i) => {
        if (!e.path) return null
        const isCross = e.edge.kind === 'cross'
        const isRail = nodesById.get(e.edge.to)?.subOf === e.edge.from
        const stroke = isCross || isRail ? 'var(--ink-4)' : 'var(--ink-3)'
        const mid = e.points[Math.floor(e.points.length / 2)]
        return (
          <g key={i} className="pointer-events-none">
            <path
              d={e.path}
              stroke={stroke}
              strokeWidth={isCross ? 1.3 : isRail ? 1.1 : 1.5}
              strokeDasharray={isCross ? '5 3' : undefined}
              opacity={isCross ? 0.7 : isRail ? 0.5 : 0.8}
              markerEnd={!isCross && !isRail ? 'url(#uat-flow-arrow)' : undefined}
            />
            {e.edge.label && mid && (
              <text x={mid.x} y={mid.y - 3} textAnchor="middle" fontSize={7.5} fill="var(--ink-4)">
                {truncate(e.edge.label, 18)}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

// ── Knoop ─────────────────────────────────────────────────────────────────────

function FlowNodeView({
  nl,
  explanation,
  selectedId,
  onSelectScenario,
  hasDragged,
}: {
  nl: FlowNodeLayout
  explanation: ZoneStatusExplanation
  selectedId: string | null
  onSelectScenario: (scenario: UatScenario) => void
  hasDragged: () => boolean
}) {
  const { node, x, y, w, h } = nl
  const cx = x + w / 2
  const cy = y + h / 2
  const status = explanation.statusByNodeId.get(node.id)
  const isCauser = explanation.causeNodeIds.has(node.id)
  const { code, name } = splitLabel(node.label)

  // Statusdragende knoop (screen/action met scenarioId) — klikbaar.
  if (node.scenarioId && status) {
    const v = UAT_STATUS_VISUAL[status]
    const isSel = node.scenarioId === selectedId
    const aria = `${node.label}, status ${v.label}${isCauser ? ', bepaalt de zonestatus' : ''}`
    const activate = () => {
      if (hasDragged()) return
      const sc = SCENARIO_BY_ID.get(node.scenarioId as string)
      if (sc) onSelectScenario(sc)
    }
    return (
      <g
        role="button"
        tabIndex={0}
        aria-label={aria}
        aria-pressed={isSel}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            activate()
          }
        }}
        className="cursor-pointer outline-none [&:focus-visible>rect.uat-flow-focus]:opacity-100"
      >
        <title>{aria}</title>
        {/* focus/selectie-ring */}
        <rect
          className="uat-flow-focus"
          x={x - 3}
          y={y - 3}
          width={w + 6}
          height={h + 6}
          rx={7}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1.4}
          opacity={isSel ? 1 : 0}
        />
        {/* veroorzaker-accent: dikke statusgekleurde ring */}
        {isCauser && (
          <rect x={x - 1.5} y={y - 1.5} width={w + 3} height={h + 3} rx={6} fill="none" stroke={v.stroke} strokeWidth={3} className="pointer-events-none" />
        )}
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={5}
          fill="var(--paper)"
          stroke={v.stroke}
          strokeWidth={isCauser ? 2 : 1.4}
          strokeDasharray={status === 'grijs' ? '3 2.5' : undefined}
        />
        <g transform={`translate(${x + 15}, ${cy})`}>
          <StatusMark cx={0} cy={0} r={6.5} status={status} />
        </g>
        {code ? (
          <>
            <text x={x + 27} y={cy - 5} fontSize={7.5} fontWeight={700} fill="var(--ink-3)" className="pointer-events-none font-mono">
              {truncate(code, 16)}
            </text>
            <text x={x + 27} y={cy + 7.5} fontSize={9} fill="var(--ink)" className="pointer-events-none">
              {truncate(name, 27)}
            </text>
          </>
        ) : (
          <text x={x + 27} y={cy} dominantBaseline="central" fontSize={9.5} fill="var(--ink)" className="pointer-events-none">
            {truncate(name, 27)}
          </text>
        )}
        {isCauser && <CauserBadge x={x + 8} y={y} status={status} />}
      </g>
    )
  }

  // Beslissing — ruit met label, informatief (niet klikbaar).
  if (node.kind === 'decision') {
    const pts = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`
    return (
      <g role="img" aria-label={`Beslissing: ${node.label}`}>
        <title>{`Beslissing: ${node.label}`}</title>
        <polygon points={pts} fill="var(--paper)" stroke="var(--ink-3)" strokeWidth={1.4} strokeLinejoin="round" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={8.5} fontStyle="italic" fill="var(--ink-2)" className="pointer-events-none">
          {truncate(node.label, 20)}
        </text>
      </g>
    )
  }

  // Cross — gestippelde knoop met domein-afhankelijkheid (niet klikbaar).
  if (node.kind === 'cross') {
    const { name: crossName } = splitLabel(node.label)
    return (
      <g role="img" aria-label={`Afhankelijkheid naar ${node.crossZone ?? 'ander domein'}: ${node.label}`}>
        <title>{`Afhankelijkheid naar ${node.crossZone ?? 'ander domein'}: ${node.label}`}</title>
        <rect x={x} y={y} width={w} height={h} rx={5} fill="none" stroke="var(--ink-3)" strokeWidth={1.3} strokeDasharray="5 3" />
        <text x={x + 12} y={cy - 4} fontSize={9} fontStyle="italic" fill="var(--ink-2)" className="pointer-events-none">
          {truncate(crossName, 24)}
        </text>
        <text x={x + 12} y={cy + 9} fontSize={7} fontWeight={700} fill="var(--ink-4)" className="pointer-events-none font-mono">
          → {node.crossZone ?? ''}
        </text>
      </g>
    )
  }

  // Instap/uitkomst — neutrale knoop (niet klikbaar).
  const isOutcome = node.kind === 'outcome'
  return (
    <g role="img" aria-label={`${isOutcome ? 'Uitkomst' : 'Instap'}: ${node.label}`}>
      <title>{node.label}</title>
      <rect x={x} y={y} width={w} height={h} rx={5} fill="var(--subtle,transparent)" stroke="var(--border-ed)" strokeWidth={1.2} />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fontWeight={isOutcome ? 700 : 400}
        fill="var(--ink-2)"
        className="pointer-events-none"
      >
        {truncate(node.label, isOutcome ? 30 : 26)}
      </text>
    </g>
  )
}

// ── Flow-plaat ──────────────────────────────────────────────────────────────────

export function UatFlowSvg({ flow, layout, explanation, selectedId, onSelectScenario }: FlowProps) {
  const nodesById = useMemo(() => new Map(flow.nodes.map((n) => [n.id, n])), [flow])
  const { transform, svgRef, svgHandlers, reset, hasDragged } = usePlaatZoomPan({
    viewW: layout.width,
    viewH: layout.height,
    minScale: 0.4,
    maxScale: 6,
  })

  return (
    <div className="relative">
      {/* Passen (fit-to-screen); toets 0 doet hetzelfde via de container */}
      <button
        type="button"
        onClick={reset}
        className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] shadow-[var(--s1)] hover:bg-[var(--subtle)]"
        aria-label="Procesmodel op scherm passen"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        Passen
      </button>

      <div
        tabIndex={0}
        role="application"
        aria-roledescription="zoombaar procesmodel"
        aria-label={`Procesmodel van ${flow.zone} — scrollwiel of pinch zoomt, slepen pant, toets 0 past op scherm`}
        onKeyDown={(e) => {
          if (e.key === '0') {
            e.preventDefault()
            reset()
          }
        }}
        className="w-full overflow-hidden rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-active-500)]"
        style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
      >
        <svg
          ref={svgRef}
          viewBox={layout.viewBox}
          className="block h-full w-full"
          role="group"
          aria-label={`Procesmodel-knopen van ${flow.zone}`}
          {...svgHandlers}
        >
          <defs>
            <marker id="uat-flow-arrow" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M1,1 L7,4 L1,7 Z" fill="var(--ink-3)" />
            </marker>
          </defs>
          <g transform={`translate(${transform.tx}, ${transform.ty}) scale(${transform.scale})`}>
            <FlowEdges layout={layout} nodesById={nodesById} />
            {layout.nodes.map((nl) => (
              <FlowNodeView
                key={nl.node.id}
                nl={nl}
                explanation={explanation}
                selectedId={selectedId}
                onSelectScenario={onSelectScenario}
                hasDragged={hasDragged}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}
