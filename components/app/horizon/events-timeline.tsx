'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { LifeEvent } from '@/lib/horizon-data'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { CHART_PAD } from '@/lib/chart-constants'
import { EVENT_ICONS } from './log-timeline'

// ── EventsTimeline ──────────────────────────────────────────────────────────
// Compact timeline below SimChart showing life events on the same linear age axis.
// Kern = cost/expense events, Wil = income/positive events.
// Supports drag-and-drop: user can drag a solo event to a new age position.

/** Minimum pointer displacement (px) before we consider it a drag, not a click. */
const DRAG_THRESHOLD_PX = 5

/**
 * Touch-target minimum size in SVG units. WCAG 2.5.8 Target Size requires
 * 44×44 CSS-px for touch; we use this for the transparent hit-rects around
 * event markers and cluster badges in the SVG.
 */
const TOUCH_TARGET_SIZE = 44

/**
 * Direction disambiguation threshold (px). When a touch starts on a
 * draggable event, we track the first N px of movement. If vertical
 * displacement exceeds horizontal, we release the pointer capture and
 * let the page scroll. If horizontal, we keep the drag gesture.
 */
const DIRECTION_THRESHOLD_PX = 8

export function EventsTimeline({
  events,
  currentAge,
  endAge,
  visibleMinAge,
  visibleMaxAge,
  scenarioEvents,
  scenarioColor,
  onViewEvent,
  onEditEvent,
  onClusterOpen,
  onEventDragEnd,
}: {
  events: LifeEvent[]
  currentAge: number
  endAge: number
  /** Zoomed visible range (optional — defaults to full range) */
  visibleMinAge?: number
  visibleMaxAge?: number
  scenarioEvents?: Array<{ name: string; target_age: number | null; event_type: string }>
  scenarioColor?: string
  /** Klik op event-marker → opent view-pane */
  onViewEvent?: (eventId: string) => void
  /** Klik op bewerk-knopje in tooltip → opent edit-pane direct */
  onEditEvent?: (eventId: string) => void
  /** Klik op een geclusterde +N marker → opent een sheet met de events in dat cluster. */
  onClusterOpen?: (events: LifeEvent[], centerAge: number) => void
  /** Callback when an event is dragged to a new age. */
  onEventDragEnd?: (eventId: string, newAge: number) => void
}) {
  const { masked } = useMaskedAmounts()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [containerW, setContainerW] = useState(600)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // ── Drag state ──
  const [dragState, setDragState] = useState<{
    eventId: string
    startSvgX: number   // SVG-space X where drag started
    currentSvgX: number // SVG-space X of current pointer
    hasMoved: boolean    // true once pointer exceeds DRAG_THRESHOLD_PX
    startClientX: number // client-space X for direction disambiguation
    startClientY: number // client-space Y for direction disambiguation
    directionResolved: boolean // true once we've determined scroll vs drag
  } | null>(null)

  /** Convert a client-space pointer coordinate to SVG-space X. */
  const clientToSvgX = useCallback((clientX: number): number => {
    const svg = svgRef.current
    if (!svg) return clientX
    const rect = svg.getBoundingClientRect()
    // SVG viewBox maps 0..containerW to rect.width
    return ((clientX - rect.left) / rect.width) * containerW
  }, [containerW])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerW(Math.round(w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Ref to capture drag end info without calling parent setState during render
  const pendingDragEndRef = useRef<{ eventId: string; newAge: number } | null>(null)

  // ── Drag handlers (pointer move + up on document level) ──
  useEffect(() => {
    if (!dragState) return

    const handlePointerMove = (e: PointerEvent) => {
      const svgX = clientToSvgX(e.clientX)
      setDragState(prev => {
        if (!prev) return prev

        // ── Direction disambiguation for touch ──
        // In the first DIRECTION_THRESHOLD_PX of movement, check whether
        // the dominant direction is vertical (= user wants to scroll page)
        // or horizontal (= user wants to drag the event). If vertical,
        // abort the drag and let the browser handle scroll.
        if (!prev.directionResolved) {
          const dx = Math.abs(e.clientX - prev.startClientX)
          const dy = Math.abs(e.clientY - prev.startClientY)
          const totalDisplacement = Math.max(dx, dy)
          if (totalDisplacement >= DIRECTION_THRESHOLD_PX) {
            if (dy > dx) {
              // Vertical dominant → abort drag, let browser scroll
              return null
            }
            // Horizontal dominant → commit to drag
            return { ...prev, currentSvgX: svgX, directionResolved: true }
          }
          // Not enough movement yet — update position but don't commit
          return { ...prev, currentSvgX: svgX }
        }

        const moved = prev.hasMoved || Math.abs(svgX - prev.startSvgX) > DRAG_THRESHOLD_PX
        return { ...prev, currentSvgX: svgX, hasMoved: moved }
      })
    }

    const handlePointerUp = () => {
      // Read current drag state, compute result, and clear state.
      // We store the pending drag info in a ref and let a separate
      // effect call the parent callback — avoids "setState during render".
      setDragState(prev => {
        if (!prev) return null
        if (prev.hasMoved && onEventDragEnd) {
          const PAD = CHART_PAD
          const innerW = containerW - PAD.left - PAD.right
          const rangeMinLocal = visibleMinAge ?? currentAge
          const rangeMaxLocal = visibleMaxAge ?? endAge
          const fraction = Math.max(0, Math.min(1, (prev.currentSvgX - PAD.left) / innerW))
          const rawAge = rangeMinLocal + fraction * (rangeMaxLocal - rangeMinLocal)
          const newAge = Math.round(rawAge * 2) / 2
          const clampedAge = Math.max(Math.ceil(currentAge), Math.min(endAge, newAge))
          pendingDragEndRef.current = { eventId: prev.eventId, newAge: clampedAge }
        }
        return null
      })
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState, clientToSvgX, containerW, visibleMinAge, visibleMaxAge, currentAge, endAge, onEventDragEnd])

  // Fire the drag-end callback after state has settled (not during render)
  useEffect(() => {
    if (dragState === null && pendingDragEndRef.current) {
      const { eventId, newAge } = pendingDragEndRef.current
      pendingDragEndRef.current = null
      onEventDragEnd?.(eventId, newAge)
    }
  }, [dragState, onEventDragEnd])

  // Use zoomed range if provided, else full range
  const rangeMin = visibleMinAge ?? currentAge
  const rangeMax = visibleMaxAge ?? endAge

  // Filter to events with a target_age within visible range
  const visibleEvents = events
    .filter(e => e.target_age != null && e.target_age >= rangeMin && e.target_age <= rangeMax)
    .sort((a, b) => (a.target_age ?? 0) - (b.target_age ?? 0))

  const hasScenarioEvents = scenarioEvents?.some(
    e => e.target_age != null && e.target_age >= rangeMin && e.target_age <= rangeMax
  ) ?? false

  if (visibleEvents.length === 0 && !hasScenarioEvents) return null

  // Uses shared CHART_PAD to match SimChart's padding exactly
  const W = containerW
  const PAD = CHART_PAD
  const innerW = W - PAD.left - PAD.right
  const H = 52 // compact height
  const Y_LINE = 26

  const xScale = (age: number) =>
    rangeMax > rangeMin ? PAD.left + ((age - rangeMin) / (rangeMax - rangeMin)) * innerW : PAD.left

  // Determine if event is net positive (income) or net negative (cost)
  function eventDirection(ev: LifeEvent): 'income' | 'expense' {
    const totalPositive = (ev.monthly_income_change * ev.duration_months) + Math.max(-ev.one_time_cost, 0)
    const totalNegative = (ev.monthly_cost_change * ev.duration_months) + Math.max(ev.one_time_cost, 0)
    return totalPositive > totalNegative ? 'income' : 'expense'
  }

  /** Is dit event een automatisch afgeleide mijlpaal (geen DB-row)? */
  function isNaturalEvent(ev: LifeEvent): boolean {
    return ev.metadata?.isNatural === true
  }

  /** Categorie van een natuurlijke mijlpaal voor kleur-keuze. */
  function naturalCategory(ev: LifeEvent): 'asset' | 'debt' | 'simulation' {
    const cat = ev.metadata?.category
    if (cat === 'asset' || cat === 'debt' || cat === 'simulation') return cat
    return 'simulation'
  }

  /** Eén-regel-tooltip voor natuurlijke mijlpalen (geen edit-knop, geen amount-uitsplitsing). */
  function naturalTooltipLine(ev: LifeEvent): string {
    const kind = ev.metadata?.kind as string | undefined
    const amount = ev.metadata?.amount as number | undefined
    if (kind === 'sim_out_of_cash') return 'Vermogen op — overweeg langer doorwerken'
    if (kind === 'sim_peak' && amount) return `Piek ${formatMaskedCurrency(amount, masked)}`
    if (kind === 'sim_first_million') return 'Mijlpaal bereikt'
    if (kind === 'sim_box3_threshold' && amount) return `Boven heffingsvrij ${formatMaskedCurrency(amount, masked)}`
    if (kind === 'debt_payoff' && amount) return `Resterend bedrag ${formatMaskedCurrency(amount, masked)}`
    if (kind === 'debt_free') return 'Alle schulden afgelost'
    if (kind === 'fixed_rate_reset') return 'Rentevast eindigt — heronderhandel'
    if (kind === 'asset_expiry' && amount) return `Uitkering ${formatMaskedCurrency(amount, masked)}`
    if (kind === 'asset_maturity' && amount) return `Vrij beschikbaar ${formatMaskedCurrency(amount, masked)}`
    if (kind === 'vehicle_runoff') return 'Volledig afgeschreven'
    return 'Automatisch afgeleide mijlpaal'
  }

  /** Build tooltip lines for each non-zero financial impact */
  function eventAmountLines(ev: LifeEvent): { label: string; color: string }[] {
    const lines: { label: string; color: string }[] = []
    if (ev.one_time_cost > 0) {
      lines.push({ label: `−${formatMaskedCurrency(ev.one_time_cost, masked)} eenmalig`, color: '#ef4444' })
    } else if (ev.one_time_cost < 0) {
      lines.push({ label: `+${formatMaskedCurrency(Math.abs(ev.one_time_cost), masked)} eenmalig`, color: '#10b981' })
    }
    if (ev.monthly_cost_change > 0) {
      lines.push({ label: `−${formatMaskedCurrency(ev.monthly_cost_change, masked)}/mnd · ${ev.duration_months} mnd`, color: '#ef4444' })
    }
    if (ev.monthly_income_change > 0) {
      lines.push({ label: `+${formatMaskedCurrency(ev.monthly_income_change, masked)}/mnd · ${ev.duration_months} mnd`, color: '#10b981' })
    }
    return lines
  }

  // Zoom-aware event-placement.
  //
  // Drie regimes, afgehankelijk van zoom-niveau:
  //   1. Uitgezoomd (zoomLevel < SPLIT_ZOOM_THRESHOLD): pixel-pack clustering
  //      — events binnen CLUSTER_THRESHOLD_PX worden gebundeld als +N marker.
  //   2. Ingezoomd (zoomLevel ≥ SPLIT_ZOOM_THRESHOLD): elk event z'n eigen
  //      slot, met een minimum pixel-gap-fan-out. Events op exact dezelfde
  //      leeftijd worden zo automatisch horizontaal naast elkaar gezet — bij
  //      flink inzoomen worden ze allemaal individueel zichtbaar.
  //
  // De zoomLevel-detectie kijkt naar visibleSpan vs. fullSpan (currentAge →
  // endAge), zodat het regime mee-schaalt met de useChartZoom-state.
  const CLUSTER_THRESHOLD_PX = 28 // icon-diameter (16) + minimale gap (12)
  const SPLIT_ZOOM_THRESHOLD = 2  // ≥ 2× zoom → elk event z'n eigen slot
  const SPLIT_MIN_GAP_PX = 18     // minimum horizontale afstand tussen markers in split-modus
  const xPositions = visibleEvents.map(ev => xScale(ev.target_age!))

  const fullSpan = Math.max(1, endAge - currentAge)
  const visibleSpan = Math.max(0.001, rangeMax - rangeMin)
  const zoomLevel = fullSpan / visibleSpan
  const isSplitMode = zoomLevel >= SPLIT_ZOOM_THRESHOLD

  type Slot = {
    x: number              // (gemiddelde) pixel-x van events in dit slot
    centerAge: number      // (gemiddelde) leeftijd voor sheet-titel
    events: LifeEvent[]    // alle events in dit slot (1 = solo, ≥2 = cluster)
    indices: number[]      // originele indices in visibleEvents
  }
  const slots: Slot[] = []

  if (isSplitMode) {
    // Split-modus: één slot per event, met minimum pixel-gap fan-out.
    // Events op zelfde of bijna-zelfde leeftijd worden hierdoor zichtbaar
    // naast elkaar geplaatst i.p.v. te clusteren.
    let lastX = -Infinity
    for (let i = 0; i < visibleEvents.length; i++) {
      const ev = visibleEvents[i]
      const baseX = xPositions[i]
      const adjustedX = Math.max(baseX, lastX + SPLIT_MIN_GAP_PX)
      slots.push({
        x: adjustedX,
        centerAge: ev.target_age!,
        events: [ev],
        indices: [i],
      })
      lastX = adjustedX
    }
  } else {
    // Cluster-modus: pixel-pack groepering met +N marker.
    for (let i = 0; i < visibleEvents.length; i++) {
      const ev = visibleEvents[i]
      const x = xPositions[i]
      const age = ev.target_age!
      const last = slots[slots.length - 1]
      if (last && x - last.x < CLUSTER_THRESHOLD_PX) {
        const n = last.events.length
        last.x = (last.x * n + x) / (n + 1)
        last.centerAge = (last.centerAge * n + age) / (n + 1)
        last.events.push(ev)
        last.indices.push(i)
      } else {
        slots.push({ x, centerAge: age, events: [ev], indices: [i] })
      }
    }
  }

  const totalH = H

  // Module-kleuren: Horizon voor positief/inkomen (toekomstige cashflow), Kern voor negatief/uitgaven
  const COLOR_INCOME = 'var(--color-horizon, #c4a06b)'
  const COLOR_EXPENSE = 'var(--color-kern, #6b4339)'
  // Natuurlijke mijlpalen krijgen ingetogen kleuren — ze zijn afgeleid, niet door
  // de gebruiker bewust geplaatst, dus mogen visueel minder schreeuwen.
  const COLOR_NAT_ASSET = 'var(--color-horizon, #c4a06b)'      // payout/maturity: positief
  const COLOR_NAT_DEBT = '#3b7a57'                              // afgelost/schuldenvrij: groen-accent
  const COLOR_NAT_SIM = 'var(--ink-3)'                          // sim-momenten: neutraal
  const COLOR_NAT_DANGER = '#c4584a'                            // out-of-cash: rood-accent

  function naturalColor(ev: LifeEvent): string {
    const kind = ev.metadata?.kind as string | undefined
    if (kind === 'sim_out_of_cash') return COLOR_NAT_DANGER
    const cat = naturalCategory(ev)
    if (cat === 'debt') return COLOR_NAT_DEBT
    if (cat === 'asset') return COLOR_NAT_ASSET
    return COLOR_NAT_SIM
  }

  return (
    <div ref={containerRef} className="relative w-full overflow-x-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${totalH}`}
        className="w-full"
        style={{
          maxHeight: totalH,
          minHeight: 40,
          touchAction: dragState?.directionResolved ? 'none' : 'pan-y',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        aria-label="Levensgebeurtenissen tijdlijn"
        role="img"
      >
        {/* Horizontal timeline axis */}
        <line
          x1={PAD.left} x2={PAD.left + innerW}
          y1={Y_LINE} y2={Y_LINE}
          stroke="var(--border-ed)" strokeWidth={1}
        />

        {/* Slot markers — solo of cluster */}
        {slots.map((slot, slotIdx) => {
          const isCluster = slot.events.length >= 2
          const cx = slot.x
          const labelY = Y_LINE + 14

          if (!isCluster) {
            // ── Solo-event rendering ──
            const ev = slot.events[0]
            const age = ev.target_age!
            const natural = isNaturalEvent(ev)
            const color = natural
              ? naturalColor(ev)
              : (eventDirection(ev) === 'income' ? COLOR_INCOME : COLOR_EXPENSE)
            const isDragging = dragState?.eventId === ev.id && dragState.hasMoved
            const isDragCandidate = dragState?.eventId === ev.id
            const isHovered = hoveredId === ev.id && !isDragCandidate
            const canDrag = !natural && !!onEventDragEnd

            // During drag: use current drag position instead of slot position
            const displayX = isDragging ? dragState!.currentSvgX : cx
            // Compute drag age for label
            const dragAge = isDragging
              ? (() => {
                  const fraction = Math.max(0, Math.min(1, (displayX - PAD.left) / innerW))
                  const raw = rangeMin + fraction * (rangeMax - rangeMin)
                  return Math.max(Math.ceil(currentAge), Math.min(endAge, Math.round(raw * 2) / 2))
                })()
              : age

            return (
              <g
                key={ev.id}
                onMouseEnter={() => { if (!dragState) setHoveredId(ev.id) }}
                onMouseLeave={() => { if (!dragState) setHoveredId(null) }}
                onPointerDown={canDrag ? (e) => {
                  // Only primary button (mouse) or touch
                  if (e.button !== 0) return
                  e.stopPropagation() // Prevent ZoomableChartContainer capturing
                  const svgX = clientToSvgX(e.clientX)
                  setDragState({
                    eventId: ev.id,
                    startSvgX: svgX,
                    currentSvgX: svgX,
                    hasMoved: false,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    directionResolved: e.pointerType === 'mouse', // mouse skips disambiguation
                  })
                  setHoveredId(null)
                  ;(e.target as Element)?.setPointerCapture?.(e.pointerId)
                  e.preventDefault()
                } : undefined}
                onClick={() => {
                  // Suppress click if we just finished a drag
                  if (isDragCandidate) return
                  onViewEvent?.(ev.id)
                }}
                style={{ cursor: isDragging ? 'grabbing' : canDrag ? 'grab' : onViewEvent ? 'pointer' : 'default' }}
                role={onViewEvent ? 'button' : undefined}
                aria-label={onViewEvent ? `Bekijk ${ev.name}` : undefined}
              >
                {/* Ghost origin marker when dragging */}
                {isDragging && (
                  <>
                    <line
                      x1={cx} x2={cx}
                      y1={Y_LINE - 10} y2={Y_LINE + 2}
                      stroke={color} strokeWidth={1} opacity={0.2}
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={cx} cy={Y_LINE - 14}
                      r={6}
                      fill="none"
                      stroke={color} strokeWidth={1} opacity={0.2}
                      strokeDasharray="3 2"
                    />
                  </>
                )}

                {/* Touch hit target — 44×44 transparent rect for WCAG 2.5.8 compliance */}
                <rect
                  x={displayX - TOUCH_TARGET_SIZE / 2}
                  y={Y_LINE - 14 - TOUCH_TARGET_SIZE / 2}
                  width={TOUCH_TARGET_SIZE}
                  height={TOUCH_TARGET_SIZE}
                  fill="transparent"
                  style={{ pointerEvents: 'all' }}
                />

                {/* Main marker (moves during drag) */}
                <line
                  x1={displayX} x2={displayX}
                  y1={Y_LINE - 10} y2={Y_LINE + 2}
                  stroke={color} strokeWidth={1.5} opacity={isDragging ? 0.8 : (natural ? 0.45 : 0.6)}
                  strokeDasharray={natural ? '2 2' : undefined}
                />
                <circle
                  cx={displayX} cy={Y_LINE - 14}
                  r={isDragging ? 10 : (isHovered ? (natural ? 8 : 10) : (natural ? 6 : 8))}
                  fill={natural ? 'var(--paper)' : color}
                  opacity={isDragging ? 0.35 : (natural ? 1 : (isHovered ? 0.25 : 0.15))}
                  stroke={color}
                  strokeWidth={isDragging ? 2 : (natural ? 1.5 : 1)}
                  strokeDasharray={natural ? '3 1.5' : undefined}
                  style={{ transition: isDragging ? 'none' : 'r 150ms ease, opacity 150ms ease' }}
                />
                <foreignObject x={displayX - 8} y={Y_LINE - 22} width={16} height={16}>
                  <div className="flex h-4 w-4 items-center justify-center" style={{ color, pointerEvents: 'none' }}>
                    {EVENT_ICONS[ev.icon] || EVENT_ICONS['Calendar']}
                  </div>
                </foreignObject>
                <text
                  x={displayX} y={labelY}
                  textAnchor="middle" fontSize={8} fontWeight={isDragging ? 600 : 500}
                  fill={color}
                  fontFamily="var(--font-inter, sans-serif)"
                >
                  {ev.name.length > 10 ? ev.name.slice(0, 9) + '…' : ev.name}
                </text>
                <text
                  x={displayX} y={labelY + 10}
                  textAnchor="middle" fontSize={isDragging ? 8 : 7}
                  fill={isDragging ? color : 'var(--ink-4)'}
                  fontWeight={isDragging ? 700 : 400}
                  fontFamily="var(--font-dm-mono, monospace)"
                >
                  {isDragging ? `${dragAge}j` : `${age}j`}
                </text>

                {/* Drag tooltip — show new age prominently */}
                {isDragging && dragAge !== age && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={displayX - 32} y={0}
                      width={64} height={16}
                      rx={4}
                      fill="var(--ink)" opacity={0.92}
                    />
                    <text
                      x={displayX} y={11}
                      textAnchor="middle" fontSize={8} fontWeight={600}
                      fill="var(--paper)"
                      fontFamily="var(--font-dm-mono, monospace)"
                    >
                      {age}j → {dragAge}j
                    </text>
                  </g>
                )}

                {isHovered && !isDragCandidate && (() => {
                  const lines = natural
                    ? [{ label: naturalTooltipLine(ev), color: color }]
                    : eventAmountLines(ev)
                  const showEditBtn = !natural && !!onEditEvent
                  const editBtnH = showEditBtn ? 16 : 0
                  const tooltipH = 14 + lines.length * 11 + editBtnH
                  const tooltipW = 140
                  const tx = Math.max(PAD.left, Math.min(cx - tooltipW / 2, W - PAD.right - tooltipW))
                  const txCenter = Math.max(PAD.left + tooltipW / 2, Math.min(cx, W - PAD.right - tooltipW / 2))
                  return (
                    <g>
                      <rect
                        x={tx} y={0}
                        width={tooltipW} height={tooltipH}
                        rx={4}
                        fill="var(--ink)" opacity={0.92}
                      />
                      <text
                        x={txCenter} y={11}
                        textAnchor="middle" fontSize={8} fontWeight={600}
                        fill="var(--paper)"
                        fontFamily="var(--font-inter, sans-serif)"
                      >
                        {ev.name}
                      </text>
                      {lines.map((line, li) => (
                        <text
                          key={li}
                          x={txCenter} y={22 + li * 11}
                          textAnchor="middle" fontSize={7}
                          fill={line.color}
                          fontFamily="var(--font-dm-mono, monospace)"
                        >
                          {line.label}
                        </text>
                      ))}
                      {showEditBtn && (
                        <g
                          onClick={e => {
                            e.stopPropagation()
                            onEditEvent?.(ev.id)
                          }}
                          style={{ cursor: 'pointer' }}
                          role="button"
                          aria-label={`Bewerk ${ev.name}`}
                        >
                          <rect
                            x={tx + tooltipW - 56}
                            y={tooltipH - 14}
                            width={52}
                            height={11}
                            rx={2}
                            fill="var(--paper)"
                            opacity={0.18}
                          />
                          <text
                            x={tx + tooltipW - 30}
                            y={tooltipH - 5}
                            textAnchor="middle"
                            fontSize={7}
                            fontWeight={600}
                            fill="var(--paper)"
                            fontFamily="var(--font-inter, sans-serif)"
                          >
                            ✎ Bewerk
                          </text>
                        </g>
                      )}
                    </g>
                  )
                })()}
              </g>
            )
          }

          // ── Cluster-rendering (slot.events.length ≥ 2) ──
          // Kleur: dominante richting in de bundel. Natuurlijke mijlpalen
          // tellen mee als 'neutraal' — we pakken income vs expense van de
          // niet-natuurlijke events; fallback op COLOR_EXPENSE.
          let incomeCount = 0
          let expenseCount = 0
          for (const ev of slot.events) {
            if (isNaturalEvent(ev)) continue
            if (eventDirection(ev) === 'income') incomeCount++
            else expenseCount++
          }
          const clusterColor = incomeCount > expenseCount ? COLOR_INCOME : COLOR_EXPENSE
          const clusterId = `cluster-${slotIdx}`
          const isHovered = hoveredId === clusterId
          const n = slot.events.length
          const firstEv = slot.events[0]

          return (
            <g
              key={clusterId}
              onMouseEnter={() => setHoveredId(clusterId)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onClusterOpen?.(slot.events, slot.centerAge)}
              style={{ cursor: onClusterOpen ? 'pointer' : 'default' }}
              role={onClusterOpen ? 'button' : undefined}
              aria-label={onClusterOpen ? `${n} gebeurtenissen rond leeftijd ${Math.round(slot.centerAge)} — open lijst` : undefined}
            >
              {/* Touch hit target — 44×44 transparent rect for WCAG 2.5.8 compliance */}
              <rect
                x={cx - TOUCH_TARGET_SIZE / 2}
                y={Y_LINE - 14 - TOUCH_TARGET_SIZE / 2}
                width={TOUCH_TARGET_SIZE}
                height={TOUCH_TARGET_SIZE}
                fill="transparent"
                style={{ pointerEvents: 'all' }}
              />

              <line
                x1={cx} x2={cx}
                y1={Y_LINE - 10} y2={Y_LINE + 2}
                stroke={clusterColor} strokeWidth={1.5} opacity={0.6}
              />
              <circle
                cx={cx} cy={Y_LINE - 14}
                r={isHovered ? 10 : 8}
                fill={clusterColor}
                opacity={isHovered ? 0.32 : 0.18}
                stroke={clusterColor}
                strokeWidth={1.5}
                style={{ transition: 'r 150ms ease, opacity 150ms ease' }}
              />
              <foreignObject x={cx - 8} y={Y_LINE - 22} width={16} height={16}>
                <div className="flex h-4 w-4 items-center justify-center" style={{ color: clusterColor }}>
                  {EVENT_ICONS[firstEv.icon] || EVENT_ICONS['Calendar']}
                </div>
              </foreignObject>

              {/* +N badge — consistent met chart-event-markers.tsx */}
              <g style={{ pointerEvents: 'none' }}>
                <circle
                  cx={cx + 7} cy={Y_LINE - 14 - 6} r={6}
                  fill="var(--ink)"
                />
                <text
                  x={cx + 7} y={Y_LINE - 14 - 6 + 2.5}
                  textAnchor="middle"
                  fontSize={7}
                  fontWeight={700}
                  fill="var(--paper)"
                  fontFamily="var(--font-dm-mono, monospace)"
                >
                  +{n - 1}
                </text>
              </g>

              <text
                x={cx} y={labelY}
                textAnchor="middle" fontSize={8} fontWeight={500}
                fill={clusterColor}
                fontFamily="var(--font-inter, sans-serif)"
              >
                {n} events
              </text>
              <text
                x={cx} y={labelY + 10}
                textAnchor="middle" fontSize={7}
                fill="var(--ink-4)"
                fontFamily="var(--font-dm-mono, monospace)"
              >
                ~{Math.round(slot.centerAge)}j
              </text>

              {/* Hover tooltip — mini-lijst van events */}
              {isHovered && (() => {
                const MAX_LINES = 5
                const shown = slot.events.slice(0, MAX_LINES)
                const overflow = n - shown.length
                const lineCount = shown.length + (overflow > 0 ? 1 : 0)
                const hintLine = onClusterOpen ? 1 : 0
                const tooltipH = 14 + lineCount * 11 + (hintLine ? 12 : 0)
                const tooltipW = 168
                const tx = Math.max(PAD.left, Math.min(cx - tooltipW / 2, W - PAD.right - tooltipW))
                const txCenter = Math.max(PAD.left + tooltipW / 2, Math.min(cx, W - PAD.right - tooltipW / 2))
                return (
                  <g>
                    <rect
                      x={tx} y={0}
                      width={tooltipW} height={tooltipH}
                      rx={4}
                      fill="var(--ink)" opacity={0.92}
                    />
                    <text
                      x={txCenter} y={11}
                      textAnchor="middle" fontSize={8} fontWeight={600}
                      fill="var(--paper)"
                      fontFamily="var(--font-inter, sans-serif)"
                    >
                      {n} gebeurtenissen rond {Math.round(slot.centerAge)}j
                    </text>
                    {shown.map((ev, li) => (
                      <text
                        key={ev.id}
                        x={txCenter} y={22 + li * 11}
                        textAnchor="middle" fontSize={7}
                        fill="var(--paper)" opacity={0.85}
                        fontFamily="var(--font-inter, sans-serif)"
                      >
                        {ev.name.length > 28 ? ev.name.slice(0, 27) + '…' : ev.name} · {ev.target_age}j
                      </text>
                    ))}
                    {overflow > 0 && (
                      <text
                        x={txCenter} y={22 + shown.length * 11}
                        textAnchor="middle" fontSize={7}
                        fill="var(--paper)" opacity={0.6}
                        fontFamily="var(--font-dm-mono, monospace)"
                      >
                        + {overflow} meer…
                      </text>
                    )}
                    {hintLine > 0 && (
                      <text
                        x={txCenter} y={tooltipH - 4}
                        textAnchor="middle" fontSize={7}
                        fill="var(--paper)" opacity={0.55}
                        fontFamily="var(--font-inter, sans-serif)"
                        fontStyle="italic"
                      >
                        Tik voor lijst
                      </text>
                    )}
                  </g>
                )
              })()}
            </g>
          )
        })}

        {/* Scenario overlay events (ghost markers) */}
        {scenarioEvents && scenarioColor && scenarioEvents
          .filter(e => e.target_age != null && e.target_age >= rangeMin && e.target_age <= rangeMax)
          .map((ev, i) => {
            const cx = xScale(ev.target_age!)
            // Offset vertically if overlapping with a real event at same age
            const hasRealOverlap = visibleEvents.some(
              re => re.target_age != null && Math.abs(re.target_age - ev.target_age!) < 1
            )
            const cy = hasRealOverlap ? Y_LINE - 14 : Y_LINE

            return (
              <g key={`scenario-${i}`} opacity={0.6}>
                <circle
                  cx={cx} cy={cy} r={6}
                  fill={scenarioColor} fillOpacity={0.3}
                  stroke={scenarioColor} strokeWidth={1.5}
                  strokeDasharray="3 2"
                />
                <rect
                  x={cx + 8} y={cy - 3} width={6} height={6}
                  fill={scenarioColor}
                />
                <text
                  x={cx} y={cy + 18}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--ink-4)"
                  fontFamily="var(--font-inter, sans-serif)"
                  fontStyle="italic"
                >
                  {ev.name}
                </text>
              </g>
            )
          })
        }
      </svg>
    </div>
  )
}
