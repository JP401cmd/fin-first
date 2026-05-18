'use client'

import { useState } from 'react'
import {
  positionChartEvents,
  MAX_STACK_VISIBLE,
  type ChartEventOverlay,
  type ChartEventKind,
} from '@/lib/chart-event-overlay'
import { EVENT_ICONS } from './log-timeline'

// ── Layout-constanten ────────────────────────────────────────
//
// Marker-cirkel-radius en stack-spacing. We renderen markers in de PAD.top
// resp. PAD.bottom-zones van de chart-SVG; de host-chart moet zijn padding
// vergroten zodat er ruimte is voor MAX_STACK_VISIBLE rijen.

const ICON_R = 8
const ICON_R_HOVER = 10
const STACK_SPACING = 20
const TOP_GUTTER = 6
const BOTTOM_GUTTER = 6
const TICK_DASH = '2 2'

/** Minimale extra PAD-bovenrand zodat events boven de bar passen. */
export function topPaddingFor(eventCount: number): number {
  const stack = Math.min(eventCount, MAX_STACK_VISIBLE)
  return stack > 0 ? TOP_GUTTER + ICON_R * 2 + (stack - 1) * STACK_SPACING + 4 : 0
}

/** Minimale extra PAD-onderrand zodat events onder de bar passen (boven x-axis-labels). */
export function bottomPaddingFor(eventCount: number): number {
  const stack = Math.min(eventCount, MAX_STACK_VISIBLE)
  return stack > 0 ? BOTTOM_GUTTER + ICON_R * 2 + (stack - 1) * STACK_SPACING + 4 : 0
}

/**
 * SVG-laag met event-markers boven en onder de chart-area.
 *
 * Voor consistente uitlijning met de bars/line van de host-chart:
 * - xScale: leeftijd → px binnen innerW
 * - padLeft: linker chart-padding (zelfde als host)
 * - chartTopY: y-coördinaat van de bovenkant van de plot-area
 * - chartBottomY: y-coördinaat van de onderkant van de plot-area
 *
 * Iconen worden in de bovenste/onderste padding-zone gestapeld; een
 * gestreepte verticale tick connect het icoon met de plot-rand.
 */
export function ChartEventMarkers({
  events,
  xScale,
  padLeft,
  chartTopY,
  chartBottomY,
  visibleMinAge,
  visibleMaxAge,
  onEventClick,
  onEventHover,
}: {
  events: ChartEventOverlay[]
  xScale: (age: number) => number
  padLeft: number
  chartTopY: number
  chartBottomY: number
  visibleMinAge: number
  visibleMaxAge: number
  onEventClick?: (id: string, kind: ChartEventKind, sourceId?: string) => void
  /**
   * Wanneer gezet wordt de in-SVG floating tooltip vervangen door een
   * callback — de host-chart toont event-info zelf in een externe strip
   * (boven de chart), zodat de tooltip de marker niet overlapt en het
   * klikgebied vrij blijft. Geeft de volledige overlay door zodat de host
   * label/detail/kleur/icoon kan renderen.
   */
  onEventHover?: (event: ChartEventOverlay | null) => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const showInlineTooltip = !onEventHover

  const filtered = events.filter(e => e.age >= visibleMinAge && e.age <= visibleMaxAge)
  if (filtered.length === 0) return null

  const positioned = positionChartEvents(filtered, { ageGroupingStrategy: 'integer' })

  return (
    <g aria-label="Mijlpalen en levensgebeurtenissen op de chart">
      {positioned.map(p => {
        if (p.stackIndex >= MAX_STACK_VISIBLE) return null // gemarkeerd als cluster hieronder
        const cx = padLeft + xScale(p.age)
        const isAbove = p.side === 'above'

        // Eerste icoon (stackIndex 0) net buiten plot-area; verdere iconen verder weg
        const cy = isAbove
          ? chartTopY - TOP_GUTTER - ICON_R - p.stackIndex * STACK_SPACING
          : chartBottomY + BOTTOM_GUTTER + ICON_R + p.stackIndex * STACK_SPACING

        const isHovered = hoveredId === p.id
        const r = isHovered ? ICON_R_HOVER : ICON_R
        const showCluster = p.stackIndex === MAX_STACK_VISIBLE - 1 && p.bucketSize > MAX_STACK_VISIBLE
        const hiddenCount = p.bucketSize - MAX_STACK_VISIBLE

        // Tick-lijntje van icoon-rand naar plot-area-rand
        const tickStartY = isAbove ? cy + r : cy - r
        const tickEndY = isAbove ? chartTopY : chartBottomY

        return (
          <g
            key={p.id}
            onMouseEnter={() => {
              setHoveredId(p.id)
              onEventHover?.(p)
            }}
            onMouseLeave={() => {
              setHoveredId(null)
              onEventHover?.(null)
            }}
            /*
              stopPropagation op pointerDown is **kritiek**: de host-chart
              wordt typisch gewikkeld in een ZoomableChartContainer die
              `setPointerCapture()` aanroept op elke pointerDown. Zonder
              stopPropagation captureert die container alle pointer-events
              en wordt onze onClick nooit getriggerd. Zie use-chart-zoom.ts.
            */
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onEventClick?.(p.id, p.kind, p.sourceId)
            }}
            style={{ cursor: onEventClick ? 'pointer' : 'default' }}
            role={onEventClick ? 'button' : undefined}
            aria-label={onEventClick ? `Open ${p.label}` : undefined}
          >
            {/*
              Transparant hit-target rondom de cirkel zodat klikken/tikken
              makkelijk is op desktop en mobile. 44×44px voldoet aan WCAG
              2.5.8 (Target Size) en Apple HIG minimale touch-target.
              Bewust onder de cirkel in z-order zodat de visuele cirkel
              onveranderd blijft.
            */}
            <rect
              x={cx - 22}
              y={cy - 22}
              width={44}
              height={44}
              fill="transparent"
              style={{ pointerEvents: 'all' }}
            />

            {/* Gestippelde verticale tick (alleen voor stackIndex 0 — anders rommelig) */}
            {p.stackIndex === 0 && (
              <line
                x1={cx} x2={cx}
                y1={tickStartY} y2={tickEndY}
                stroke={p.color} strokeWidth={1} opacity={0.5}
                strokeDasharray={TICK_DASH}
                style={{ pointerEvents: 'none' }}
              />
            )}

            {/* Marker-cirkel — paper-fill met gekleurde border. Hover: grotere cirkel + vollere fill. */}
            <circle
              cx={cx} cy={cy} r={r}
              fill="var(--paper)"
              stroke={p.color}
              strokeWidth={isHovered ? 2 : 1.5}
              opacity={1}
              style={{
                transition: 'r 150ms ease, stroke-width 150ms ease',
                pointerEvents: 'all',
              }}
            />

            {/* Icoon binnen de cirkel — pointerEvents=none zodat klik door valt naar circle/hit-rect */}
            <foreignObject x={cx - 7} y={cy - 7} width={14} height={14} style={{ pointerEvents: 'none' }}>
              <div className="flex h-3.5 w-3.5 items-center justify-center" style={{ color: p.color }}>
                {EVENT_ICONS[p.icon] || EVENT_ICONS['Calendar']}
              </div>
            </foreignObject>

            {/* Cluster-badge: +N op de buitenste zichtbare marker als er meer events bestaan */}
            {showCluster && (
              <g style={{ pointerEvents: 'none' }}>
                <circle
                  cx={cx + r + 2} cy={cy - r + 2} r={6}
                  fill="var(--ink)"
                />
                <text
                  x={cx + r + 2} y={cy - r + 2 + 2.5}
                  textAnchor="middle"
                  fontSize={7}
                  fontWeight={700}
                  fill="var(--paper)"
                  fontFamily="var(--font-dm-mono, monospace)"
                >
                  +{hiddenCount}
                </text>
              </g>
            )}

            {/* Hover-tooltip — paper-card boven of onder de marker. Volgt EventsTimeline-stijl.
                Alleen actief als de host geen `onEventHover` callback aanlevert (legacy/standalone-modus).
                In de bar-chart wordt de info in een vaste strip boven de chart getoond. */}
            {isHovered && showInlineTooltip && (() => {
              const tooltipW = 168
              const tooltipH = p.detail ? 30 : 18
              const tx = Math.max(2, cx - tooltipW / 2)
              const ty = isAbove
                ? Math.max(2, cy - r - tooltipH - 4)
                : cy + r + 4
              const txCenter = Math.max(2 + tooltipW / 2, cx)
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect
                    x={tx} y={ty}
                    width={tooltipW} height={tooltipH}
                    rx={2}
                    fill="var(--ink)" opacity={0.94}
                  />
                  <text
                    x={txCenter} y={ty + 11}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill="var(--paper)"
                    fontFamily="var(--font-inter, sans-serif)"
                  >
                    {p.label.length > 26 ? p.label.slice(0, 25) + '…' : p.label}
                  </text>
                  {p.detail && (
                    <text
                      x={txCenter} y={ty + 23}
                      textAnchor="middle"
                      fontSize={8}
                      fill="var(--paper)" opacity={0.75}
                      fontFamily="var(--font-dm-mono, monospace)"
                    >
                      {p.detail.length > 32 ? p.detail.slice(0, 31) + '…' : p.detail}
                    </text>
                  )}
                </g>
              )
            })()}
          </g>
        )
      })}
    </g>
  )
}
