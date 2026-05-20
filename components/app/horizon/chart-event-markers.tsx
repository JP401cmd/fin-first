'use client'

import { useRef, useState } from 'react'
import {
  positionChartEvents,
  MAX_STACK_VISIBLE,
  type ChartEventOverlay,
  type ChartEventKind,
} from '@/lib/chart-event-overlay'
import { EVENT_ICONS } from './log-timeline'

/** Pixels-drempel voor drag-promotion. Onder deze afstand telt een
 *  pointer-down/up nog als click. F-1 plan: directe manipulatie op de
 *  tijdas zonder de bestaande klik-flow te breken. */
const DRAG_PROMOTE_THRESHOLD_PX = 6

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
  onEventDragEnd,
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
  /**
   * F-1 directe manipulatie: drag-handler die wordt aangeroepen wanneer
   * de gebruiker een marker horizontaal heeft versleept en de pointer
   * heeft losgelaten. Newage = de nieuwe leeftijd gebaseerd op de x-pos.
   * Wanneer afwezig blijft de chart read-only en gedraagt zich als
   * voorheen (alleen klik/hover).
   */
  onEventDragEnd?: (
    id: string,
    sourceId: string | undefined,
    newAge: number,
    kind: ChartEventKind,
  ) => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const showInlineTooltip = !onEventHover

  // Drag-state. We tracken alleen de geselecteerde marker + de pixel-
  // delta zodat de UI tijdens slepen smooth voelt zonder van re-renders
  // van de host-chart afhankelijk te zijn.
  type DragState = {
    id: string
    sourceId: string | undefined
    kind: ChartEventKind
    /** Pixel-x bij pointer-down. */
    startX: number
    /** Huidige pixel-x van de pointer (relatief aan dezelfde origin). */
    currentX: number
    /** Of we de drag-drempel zijn gepasseerd. */
    moved: boolean
  }
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  // Click fires na pointerUp; we hebben drag op dat moment al genuld om
  // visueel terug naar de ankerpositie te springen. Met deze ref weet de
  // click-handler dat de pointerUp het gevolg van een drag was en
  // onderdrukt hij onEventClick.
  const justDraggedRef = useRef<string | null>(null)

  // Inverse xScale via lineaire interpolatie over visibleMinAge–visibleMaxAge.
  // We bouwen 'm hier op zodat de host alleen xScale hoeft mee te geven.
  const innerWidth = xScale(visibleMaxAge) - xScale(visibleMinAge)
  const ageSpan = Math.max(1, visibleMaxAge - visibleMinAge)
  function invXScale(px: number): number {
    if (innerWidth <= 0) return visibleMinAge
    const offsetPx = px - xScale(visibleMinAge)
    const age = visibleMinAge + (offsetPx / innerWidth) * ageSpan
    return Math.max(visibleMinAge, Math.min(visibleMaxAge, age))
  }

  const filtered = events.filter(e => e.age >= visibleMinAge && e.age <= visibleMaxAge)
  if (filtered.length === 0) return null

  const positioned = positionChartEvents(filtered, { ageGroupingStrategy: 'integer' })

  return (
    <g aria-label="Mijlpalen en levensgebeurtenissen op de chart">
      {positioned.map(p => {
        if (p.stackIndex >= MAX_STACK_VISIBLE) return null // gemarkeerd als cluster hieronder
        // F-1: tijdens actieve drag overschrijft de pointer-positie de
        // pre-computed cx zodat de marker met de cursor meebeweegt.
        const isDragging = drag?.id === p.id && drag?.moved
        const cxBase = padLeft + xScale(p.age)
        const cx = isDragging
          ? Math.max(
              padLeft + xScale(visibleMinAge),
              Math.min(padLeft + xScale(visibleMaxAge), drag!.currentX),
            )
          : cxBase
        const isAbove = p.side === 'above'

        // Eerste icoon (stackIndex 0) net buiten plot-area; verdere iconen verder weg
        const cy = isAbove
          ? chartTopY - TOP_GUTTER - ICON_R - p.stackIndex * STACK_SPACING
          : chartBottomY + BOTTOM_GUTTER + ICON_R + p.stackIndex * STACK_SPACING

        const isHovered = hoveredId === p.id
        const r = isHovered || isDragging ? ICON_R_HOVER : ICON_R
        const showCluster = p.stackIndex === MAX_STACK_VISIBLE - 1 && p.bucketSize > MAX_STACK_VISIBLE
        const hiddenCount = p.bucketSize - MAX_STACK_VISIBLE

        // Tick-lijntje van icoon-rand naar plot-area-rand
        const tickStartY = isAbove ? cy + r : cy - r
        const tickEndY = isAbove ? chartTopY : chartBottomY

        const canDrag = !!onEventDragEnd && p.kind === 'life_event'
        const cursor = isDragging
          ? 'grabbing'
          : canDrag
            ? 'grab'
            : onEventClick
              ? 'pointer'
              : 'default'

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

              F-1: tegelijk starten we hier de drag-tracking als de host
              een onEventDragEnd-callback heeft aangeleverd én het event
              dragbaar is (kind === 'life_event').
            */
            onPointerDown={(e) => {
              e.stopPropagation()
              if (!canDrag) return
              ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
              setDrag({
                id: p.id,
                sourceId: p.sourceId,
                kind: p.kind,
                startX: e.clientX,
                currentX: cxBase,
                moved: false,
              })
            }}
            onPointerMove={(e) => {
              const d = dragRef.current
              if (!d || d.id !== p.id) return
              const dx = e.clientX - d.startX
              const moved = d.moved || Math.abs(dx) >= DRAG_PROMOTE_THRESHOLD_PX
              setDrag({ ...d, currentX: cxBase + dx, moved })
            }}
            onPointerUp={(e) => {
              const d = dragRef.current
              if (!d || d.id !== p.id) {
                return
              }
              ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
              // Als de drempel niet is gehaald, was het een click.
              if (!d.moved) {
                setDrag(null)
                return
              }
              const finalCx = d.currentX
              const newAge = Math.round(invXScale(finalCx - padLeft))
              setDrag(null)
              // Markeer "just dragged" zodat de daaropvolgende click niet
              // de detail-pane opent.
              justDraggedRef.current = p.id
              onEventDragEnd?.(d.id, d.sourceId, newAge, d.kind)
            }}
            onPointerCancel={() => setDrag(null)}
            onClick={(e) => {
              e.stopPropagation()
              // Onderdruk click die direct volgt op een afgeronde drag.
              if (justDraggedRef.current === p.id) {
                justDraggedRef.current = null
                return
              }
              onEventClick?.(p.id, p.kind, p.sourceId)
            }}
            style={{ cursor }}
            role={onEventClick ? 'button' : undefined}
            aria-label={onEventClick ? `Open ${p.label}` : undefined}
            data-testid={`chart-event-marker-${p.id}`}
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

            {/* F-1 drag-feedback: tijdens slepen toon een klein label met
                de geprojecteerde nieuwe leeftijd boven (of onder, mirror
                van de stack-side) de marker zodat de gebruiker direct
                ziet waar hij naartoe schuift. */}
            {isDragging && (() => {
              const projectedAge = Math.round(invXScale(cx - padLeft))
              const labelY = isAbove ? cy - r - 10 : cy + r + 14
              const text = `→ ${projectedAge} jaar`
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect
                    x={cx - 32} y={labelY - 9}
                    width={64} height={14}
                    rx={2}
                    fill="var(--ink)" opacity={0.92}
                  />
                  <text
                    x={cx} y={labelY + 1}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill="var(--paper)"
                    fontFamily="var(--font-dm-mono, monospace)"
                  >
                    {text}
                  </text>
                </g>
              )
            })()}

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
