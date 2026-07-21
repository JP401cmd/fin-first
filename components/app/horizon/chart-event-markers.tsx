'use client'

import { useRef, useState } from 'react'
import {
  positionChartEvents,
  MAX_STACK_VISIBLE,
  type ChartEventOverlay,
  type ChartEventKind,
} from '@/lib/chart-event-overlay'
import { EVENT_ICONS } from './log-timeline'
// Geometrie-helpers + gedeelde layout-consts wonen nu in lib/horizon/chart-event-geometry.ts (UI→lib).
import { ICON_R, STACK_SPACING, TOP_GUTTER, BOTTOM_GUTTER, LINE_GAP, topPaddingFor, bottomPaddingFor, iconStackTopFloor } from '@/lib/horizon/chart-event-geometry'
export { topPaddingFor, bottomPaddingFor, iconStackTopFloor }

/** Pixels-drempel voor drag-promotion. Onder deze afstand telt een
 *  pointer-down/up nog als click. F-1 plan: directe manipulatie op de
 *  tijdas zonder de bestaande klik-flow te breken. */
const DRAG_PROMOTE_THRESHOLD_PX = 6

/** Snap-precisie tijdens drag — 0.25 jaar = kwartaal. Geeft een
 *  smoother visueel gedrag dan integer-snapping zonder dat we het
 *  schema hoeven aan te passen (persisten gebeurt nog altijd
 *  als integer-jaar via Math.round in de host). */
const DRAG_SNAP_INCREMENT = 0.25

function snapAge(age: number): number {
  return Math.round(age / DRAG_SNAP_INCREMENT) * DRAG_SNAP_INCREMENT
}

function formatAgeYearsMonths(age: number): { years: number; months: number } {
  const snapped = snapAge(age)
  const years = Math.floor(snapped)
  const months = Math.round((snapped - years) * 12)
  return { years, months }
}

// ── Layout-constanten ────────────────────────────────────────
//
// Marker-cirkel-radius en stack-spacing. We renderen markers in de PAD.top
// resp. PAD.bottom-zones van de chart-SVG; de host-chart moet zijn padding
// vergroten zodat er ruimte is voor MAX_STACK_VISIBLE rijen.

const ICON_R_HOVER = 10
const TICK_DASH = '2 2'



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
  iconClampTopY,
  lineYAt,
  visibleMinAge,
  visibleMaxAge,
  onEventClick,
  onEventHover,
  onEventDragEnd,
  onEventDragMove,
}: {
  events: ChartEventOverlay[]
  xScale: (age: number) => number
  padLeft: number
  chartTopY: number
  chartBottomY: number
  /**
   * Absolute minimum-y voor het centrum van het onderste (stackIndex 0) icoon
   * bij lijn-verankering. Wanneer de vermogenslijn hoog ligt wijken de iconen
   * hierop uit — in de gereserveerde marge BOVEN het plot — i.p.v. tegen de
   * plot-bovenrand te klemmen (waar de doellijn-/FIRE-labels staan). Bereken
   * met `iconStackTopFloor(maxStackAtAge, CHART_PAD.top)`. Zonder deze prop
   * (legacy-consumer zonder lijn-anker) valt de clamp terug op het oude
   * `chartTopY + ICON_R + 2`.
   */
  iconClampTopY?: number
  /**
   * SVG y-coördinaat van de vermogenslijn op een gegeven leeftijd. Wanneer
   * aanwezig ankeren de iconen vlak BOVEN de lijn op het gebeurtenis-jaar en
   * stapelen ze omhoog. Zonder deze prop (legacy/standalone) vallen ze terug
   * op de boven/onder-padding-zones.
   */
  lineYAt?: (age: number) => number | null
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
  /**
   * Live drag-feedback (F-5 MVP): vuurt af telkens wanneer tijdens een
   * drag een nieuwe kwartaal-positie wordt gepasseerd. De host kan
   * hierop optimistic-events bijwerken zodat de NW-curve live mee
   * beweegt. Drag-volgorde:
   *   onEventDragMove (meerdere keren tijdens drag, gesnapt op kwartaal)
   *   → onEventDragEnd (één keer bij release, met definitieve waarde).
   */
  onEventDragMove?: (
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
    /** Pixel-x bij pointer-down (CSS-coordinaten van de muis). */
    startX: number
    /** Huidige pixel-x van de marker in SVG-user-units. */
    currentX: number
    /** Schaal-factor van CSS-pixel → SVG-unit op het moment van drag-
     *  start. Nodig omdat de host-SVG met `className="w-full"` rekt op
     *  een viewBox; zonder deze conversie beweegt de marker te snel of
     *  te langzaam mee t.o.v. de muis. */
    pxToSvg: number
    /** Of we de drag-drempel zijn gepasseerd. */
    moved: boolean
    /** Laatste leeftijd waarop onEventDragMove is gevuurd (snap-gebonden
     *  zodat we niet bij elke pixel een nieuwe move-callback firen). */
    lastEmittedAge: number | null
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

  const anchorOnLine = !!lineYAt
  const filteredRaw = events.filter(e => e.age >= visibleMinAge && e.age <= visibleMaxAge)
  if (filteredRaw.length === 0) return null

  // Bij verankering op de lijn collabeert `side` naar "alles boven de lijn":
  // we normaliseren naar 'above' zodat gebeurtenissen op hetzelfde jaar in één
  // bucket vallen en netjes omhoog stapelen (i.p.v. in twee aparte boven/onder-
  // stapels). Zonder lijn-anker blijft het oorspronkelijke boven/onder-gedrag.
  const filtered = anchorOnLine
    ? filteredRaw.map(e => ({ ...e, side: 'above' as const }))
    : filteredRaw

  const positioned = positionChartEvents(filtered, { ageGroupingStrategy: 'integer' })

  return (
    <g aria-label="Mijlpalen en levensgebeurtenissen op de chart">
      {positioned.map(p => {
        if (p.stackIndex >= MAX_STACK_VISIBLE) return null // gemarkeerd als cluster hieronder
        // F-1: tijdens actieve drag overschrijft de pointer-positie de
        // pre-computed cx zodat de marker met de cursor meebeweegt.
        // Snap visueel naar kwartaal-precisie zodat de marker niet
        // jittert op sub-3-maand-niveau.
        const isDragging = drag?.id === p.id && drag?.moved
        const cxBase = padLeft + xScale(p.age)
        // Effectieve leeftijd onder het icoon (drag-bewust) — bepaalt zowel de
        // x-positie als (bij lijn-verankering) de y op de vermogenslijn.
        const effectiveAge = isDragging
          ? (() => {
              const minX = padLeft + xScale(visibleMinAge)
              const maxX = padLeft + xScale(visibleMaxAge)
              const clampedX = Math.max(minX, Math.min(maxX, drag!.currentX))
              return snapAge(invXScale(clampedX - padLeft))
            })()
          : p.age
        const cx = isDragging ? padLeft + xScale(effectiveAge) : cxBase
        const isAbove = p.side === 'above'

        // Anker-y van het ONDERSTE icoon in de stapel (stackIndex 0).
        // Met lijn-verankering: vlak boven de vermogenslijn op het
        // gebeurtenis-jaar; de stapel groeit omhoog. Geclampt zodat de
        // bovenste marker niet boven de chart-bovenrand clipt. Zonder
        // lijn-anker (legacy): de oude boven/onder-padding-zones.
        const lineY = anchorOnLine ? lineYAt(effectiveAge) : null
        const baseY = lineY != null
          ? lineY - LINE_GAP - ICON_R
          : isAbove
            ? chartTopY - TOP_GUTTER - ICON_R
            : chartBottomY + BOTTOM_GUTTER + ICON_R
        const stackDir = lineY != null ? -1 : isAbove ? -1 : 1
        const rawCy = baseY + stackDir * p.stackIndex * STACK_SPACING
        // Voorkom clipping aan de bovenrand. Bij een hoge lijn wijken de iconen
        // omhoog uit in de gereserveerde marge boven het plot (iconClampTopY),
        // i.p.v. binnen het plot te klemmen op chartTopY + ICON_R + 2 (waar de
        // doellijn-/FIRE-labels staan). De vloer geldt voor het onderste icoon
        // (stackIndex 0); de stapel groeit van daaruit verder omhoog, dus we
        // verrekenen de stack-offset zodat gestapelde iconen niet op één hoop
        // squeezen maar netjes uit elkaar in de marge staan.
        const clampFloor = iconClampTopY ?? chartTopY + ICON_R + 2
        const stackOffset = p.stackIndex * STACK_SPACING
        const cy = lineY != null
          ? Math.max(clampFloor - stackOffset, rawCy)
          : rawCy

        const isHovered = hoveredId === p.id
        const r = isHovered || isDragging ? ICON_R_HOVER : ICON_R
        const showCluster = p.stackIndex === MAX_STACK_VISIBLE - 1 && p.bucketSize > MAX_STACK_VISIBLE
        const hiddenCount = p.bucketSize - MAX_STACK_VISIBLE

        // Tick-lijntje: bij lijn-verankering van de onderkant van het onderste
        // icoon naar het exacte lijn-punt; anders naar de plot-rand (legacy).
        const tickStartY = isAbove ? cy + r : cy - r
        const tickEndY = lineY != null
          ? lineY
          : isAbove
            ? chartTopY
            : chartBottomY

        const canDrag = !!onEventDragEnd && p.kind === 'life_event' && !p.readOnly
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
              // Bereken CSS-pixel → SVG-unit schaal-factor op basis van
              // de SVG-viewBox vs zijn rendered breedte. De host gebruikt
              // `<svg viewBox="0 0 W H" className="w-full">` dus 1 CSS-px
              // muisbeweging is meestal NIET 1 SVG-unit marker-beweging.
              const svg = (e.currentTarget as SVGElement).ownerSVGElement
              let pxToSvg = 1
              if (svg) {
                const rect = svg.getBoundingClientRect()
                if (rect.width > 0 && svg.viewBox?.baseVal?.width > 0) {
                  pxToSvg = svg.viewBox.baseVal.width / rect.width
                }
              }
              setDrag({
                id: p.id,
                sourceId: p.sourceId,
                kind: p.kind,
                startX: e.clientX,
                currentX: cxBase,
                pxToSvg,
                moved: false,
                lastEmittedAge: p.age,
              })
            }}
            onPointerMove={(e) => {
              const d = dragRef.current
              if (!d || d.id !== p.id) return
              // CSS-pixel delta → SVG-unit delta via vooraf-berekende
              // schaal-factor (zie pointer-down). Zorgt dat de marker
              // exact met de muis meebeweegt ongeacht hoe het SVG
              // wordt geschaald in z'n container.
              const dxCss = e.clientX - d.startX
              const dxSvg = dxCss * d.pxToSvg
              const moved = d.moved || Math.abs(dxCss) >= DRAG_PROMOTE_THRESHOLD_PX
              const newCurrentX = cxBase + dxSvg
              // Fire live-callback alleen wanneer we een nieuwe quarter-
              // boundary passeren (= snapped-age verandert). Voorkomt
              // dat onEventDragMove 60× per seconde wordt aangeroepen.
              let nextLastEmittedAge = d.lastEmittedAge
              if (moved && onEventDragMove) {
                const minX = padLeft + xScale(visibleMinAge)
                const maxX = padLeft + xScale(visibleMaxAge)
                const clampedX = Math.max(minX, Math.min(maxX, newCurrentX))
                const snappedAge = snapAge(invXScale(clampedX - padLeft))
                if (snappedAge !== d.lastEmittedAge) {
                  nextLastEmittedAge = snappedAge
                  onEventDragMove(d.id, d.sourceId, snappedAge, d.kind)
                }
              }
              setDrag({
                ...d,
                currentX: newCurrentX,
                moved,
                lastEmittedAge: nextLastEmittedAge,
              })
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
            style={{
              cursor,
              // Voorkom dat de browser scrollt/pinch-zoomt tijdens een
              // F-1 drag op touch-devices. Alleen actief wanneer het
              // event dragbaar is, zodat niet-dragbare markers normaal
              // scroll-gedrag behouden.
              touchAction: canDrag ? 'none' : undefined,
            }}
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

            {/* F-1 drag-tooltip: tijdens slepen verschijnt boven (of onder,
                mirror van de stack-side) de marker een prominente tooltip
                met de geprojecteerde nieuwe leeftijd én delta vs origineel.
                Vervangt visueel de standaard hover-tooltip zodat het jaar
                waar je naartoe sleept altijd duidelijk leesbaar is. */}
            {isDragging && (() => {
              const rawAge = invXScale(cx - padLeft)
              const snappedAge = snapAge(rawAge)
              const ym = formatAgeYearsMonths(snappedAge)
              const ageLabel =
                ym.months === 0 ? `${ym.years} jaar` : `${ym.years} jr ${ym.months} mnd`
              // Delta in maanden voor precieze feedback.
              const deltaMonths = Math.round((snappedAge - p.age) * 12)
              const hasDelta = deltaMonths !== 0
              const tooltipW = 140
              const tooltipH = hasDelta ? 42 : 30
              const tx = Math.max(2, cx - tooltipW / 2)
              // Flip naar onder wanneer er boven het icoon onvoldoende ruimte is
              // (bv. wanneer cy hoog in de marge is geclampt) — anders wordt ty
              // negatief/op y=2 vastgepind en clipt/overlapt de tooltip de icoon.
              const fitsAbove = cy - r - tooltipH - 4 >= 2
              const ty = isAbove && fitsAbove
                ? cy - r - tooltipH - 4
                : cy + r + 4
              const txCenter = Math.max(2 + tooltipW / 2, cx)
              const deltaAbs = Math.abs(deltaMonths)
              const deltaYearsPart = Math.floor(deltaAbs / 12)
              const deltaMonthsPart = deltaAbs % 12
              const deltaUnit =
                deltaYearsPart === 0
                  ? `${deltaMonthsPart} mnd`
                  : deltaMonthsPart === 0
                    ? `${deltaYearsPart} jr`
                    : `${deltaYearsPart}j ${deltaMonthsPart}m`
              const deltaText =
                deltaMonths > 0
                  ? `+${deltaUnit} later`
                  : deltaMonths < 0
                    ? `${deltaUnit} eerder`
                    : ''
              const deltaColor = deltaMonths > 0 ? '#fbbf24' : '#34d399' // amber-400 / emerald-400
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect
                    x={tx} y={ty}
                    width={tooltipW} height={tooltipH}
                    rx={3}
                    fill="var(--ink)" opacity={0.95}
                    stroke="var(--module-active-500, #8b5cf6)"
                    strokeWidth={1.5}
                  />
                  <text
                    x={txCenter} y={ty + 12}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={500}
                    fill="var(--paper)"
                    opacity={0.75}
                    fontFamily="var(--font-inter, sans-serif)"
                  >
                    Verschuif naar
                  </text>
                  <text
                    x={txCenter} y={ty + 24}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={700}
                    fill="var(--paper)"
                    fontFamily="var(--font-dm-mono, monospace)"
                  >
                    {ageLabel}
                  </text>
                  {hasDelta && (
                    <text
                      x={txCenter} y={ty + 36}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight={600}
                      fill={deltaColor}
                      fontFamily="var(--font-dm-mono, monospace)"
                    >
                      {deltaText}
                    </text>
                  )}
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
              // Flip naar onder wanneer er boven het icoon onvoldoende ruimte is
              // (geclampte cy hoog in de marge) — zo clipt de tooltip niet aan de
              // SVG-bovenrand en overlapt 'ie de marker niet.
              const fitsAbove = cy - r - tooltipH - 4 >= 2
              const ty = isAbove && fitsAbove
                ? cy - r - tooltipH - 4
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
