'use client'

import { useState, useEffect, memo, useCallback, useRef } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { StackedRow, WealthGroup } from '@/lib/wealth-composition'
import {
  WEALTH_GROUP_LABELS,
  WEALTH_GROUP_COLORS,
  DEBT_LAYER_COLOR,
  DEBT_LAYER_LABEL,
} from '@/lib/wealth-composition'
import { ChartEventMarkers, topPaddingFor, bottomPaddingFor } from './chart-event-markers'
import type { ChartEventOverlay, ChartEventKind } from '@/lib/chart-event-overlay'

// ── Constants (match SimChart) ──────────────────────────────

const PAD_BASE = { top: 16, right: 16, bottom: 28, left: 60 }

const ALL_GROUPS: WealthGroup[] = ['spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig']

// ── Helpers ─────────────────────────────────────────────────

function fmtEuro(val: number): string {
  const abs = Math.abs(val)
  if (abs >= 1_000_000) return `€${(val / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `€${Math.round(val / 1_000)}k`
  return `€${Math.round(val)}`
}

function pctStr(part: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((part / total) * 100)}%`
}

// ── Component ───────────────────────────────────────────────

export const WealthCompositionChart = memo(function WealthCompositionChart({
  stackedRows,
  currentAge,
  endAge,
  visibleMinAge,
  visibleMaxAge,
  fireAge,
  fireAgeFractional,
  forModal,
  planningMode = 'fire',
  aowAgeFractional,
  housingSaleAge,
  eventOverlay,
  onEventClick,
  onYearClick,
}: {
  stackedRows: StackedRow[]
  currentAge: number
  endAge: number
  visibleMinAge?: number
  visibleMaxAge?: number
  fireAge?: number | null
  fireAgeFractional?: number | null
  forModal?: boolean
  /** Planning mode: 'fire' (default) uses FIRE age as split point, 'pensioen' uses AOW age */
  planningMode?: 'fire' | 'pensioen'
  /** AOW pension age as fractional value (e.g. 67.25 for 67j+3m) */
  aowAgeFractional?: number
  /**
   * Leeftijd waarop de kernel de eigen woning verkoopt (`kernelHousingSale.age`),
   * of `null`/`undefined` wanneer er binnen de horizon geen verkoop is. Consume-
   * only uit de kernel — géén eigen afleiding. Rendert een verticale duidings-
   * marker op het verkoopmoment: in Opbouw-modus valt Vastgoed → 0 en verdwijnt
   * het hypotheek-schuldsegment abrupt (de verkoopopbrengst lost de hypotheek af),
   * wat zonder marker als "fout" leest.
   */
  housingSaleAge?: number | null
  /**
   * Optionele event-markers (levensgebeurtenissen + natuurlijke mijlpalen)
   * die boven of onder de bars worden gerenderd. Wanneer aanwezig vergroot
   * de chart automatisch zijn top/bottom-padding zodat er ruimte is voor
   * een stack van maximaal MAX_STACK_VISIBLE iconen per zijde.
   */
  eventOverlay?: ChartEventOverlay[]
  /**
   * Klik-handler voor een marker. `kind` is `'life_event'` (geopend in de
   * EventPane door de parent) of `'natural'` (geopend in de
   * NaturalMilestoneSheet). `sourceId` wijst naar de bron-asset/debt voor
   * natuurlijke mijlpalen.
   */
  onEventClick?: (id: string, kind: ChartEventKind, sourceId?: string) => void
  /**
   * Klik-handler voor een jaar (kolom). Opent de kassabon-stijl
   * HorizonYearDetailsSheet in de parent. Wanneer gezet wordt elke kolom
   * een keyboard-bereikbare klik-zone met hover-accent.
   */
  onYearClick?: (age: number) => void
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1200, forModal })
  const [hoveredAge, setHoveredAge] = useState<number | null>(null)
  const [hoveredEvent, setHoveredEvent] = useState<ChartEventOverlay | null>(null)

  // Tap-handling voor jaar-klik. Op mobiel (iOS Safari in het bijzonder) zijn
  // `onClick` events op SVG-rects onbetrouwbaar binnen een pointer-capture
  // omgeving zoals ZoomableChartContainer — dus we triggeren primair via
  // `onPointerUp` met motion-check (pan-vs-tap). De `lastTapRef` dedupe
  // voorkomt dat onClick (mouse-synthese) hetzelfde jaar nog eens opent.
  const tapStartRef = useRef<{ x: number; y: number; age: number; pointerId: number } | null>(null)
  const lastTapRef = useRef<{ age: number; ts: number } | null>(null)
  const triggerYearTap = useCallback((age: number) => {
    const now = Date.now()
    if (lastTapRef.current && lastTapRef.current.age === age && now - lastTapRef.current.ts < 250) return
    lastTapRef.current = { age, ts: now }
    setHoveredAge(null) // tooltip verbergen direct bij tap (mobile-friendly)
    onYearClick?.(age)
  }, [onYearClick])

  // ResizeObserver for responsive width (same pattern as SimChart)
  const [containerW, setContainerW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerW(Math.round(w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  const W = containerW
  const isDesktop = containerW >= 768

  // Dynamische extra-padding voor event-markers (boven/onder). Berekend uit
  // de markers-zijde-count zodat de chart-area krimpt om de iconen aan beide
  // randen kwijt te kunnen — geen overlay-overlap met bars of x-axis-labels.
  const aboveCount = eventOverlay
    ? eventOverlay.filter(e => e.side === 'above').length
    : 0
  const belowCount = eventOverlay
    ? eventOverlay.filter(e => e.side === 'below').length
    : 0
  const extraTop = topPaddingFor(aboveCount)
  const extraBottom = bottomPaddingFor(belowCount)
  const PAD = {
    top: PAD_BASE.top + extraTop,
    right: PAD_BASE.right,
    bottom: PAD_BASE.bottom + extraBottom,
    left: PAD_BASE.left,
  }

  // Basis-H + extra ruimte voor marker-stacks
  const H = (isDesktop ? 260 : 180) + extraTop + extraBottom
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const minAge = visibleMinAge ?? currentAge
  const maxAge = visibleMaxAge ?? endAge

  // Hover-handlers — MOETEN onvoorwaardelijk vóór elke early-return worden
  // aangeroepen (Rules of Hooks). Ze hangen enkel af van W/innerW/minAge/
  // maxAge, die hierboven al berekend zijn. Stonden voorheen ná de
  // stackedRows-empty early-return: dat liet het aantal hooks verspringen
  // tussen lege en gevulde render (chartMode-toggle Pad↔Opbouw) en gaf
  // "Rendered more hooks than during the previous render."
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * W - PAD.left
    if (mouseX < 0 || mouseX > innerW) { setHoveredAge(null); return }
    const age = Math.round((mouseX / innerW) * (maxAge - minAge) + minAge)
    const clamped = Math.max(minAge, Math.min(maxAge, age))
    setHoveredAge(clamped)
  }, [W, innerW, minAge, maxAge])

  const handleMouseLeave = useCallback(() => setHoveredAge(null), [])

  // Early-return wanneer er geen data is. Voorkomt dat we een lege
  // SVG renderen + voorziet de gebruiker van een rustige status-tekst.
  //
  // `ref` MOET ook hier hangen. De chart wordt in horizon-client altijd
  // gemount (ook in Pad-modus, verborgen via opacity:0) en start dán met
  // lege stackedRows. Zonder ref koppelen de IntersectionObserver
  // (hasEntered → bar-animatie) en de ResizeObserver (containerW →
  // isDesktop/hoogte) niet aan; beide effects draaien alleen on-mount en
  // re-runnen niet bij de toggle, dus de bars bleven op hoogte 0 en de
  // chart op de mobiele 600px-zoom hangen. React hergebruikt dezelfde
  // <div> bij de empty→data-overgang, zodat de ref stabiel blijft.
  if (stackedRows.length === 0) {
    return (
      <div
        ref={ref}
        className="flex items-center justify-center min-h-[200px] text-sm text-[var(--ink-3)] italic"
      >
        Geen gegevens beschikbaar
      </div>
    )
  }

  // Filter rows to visible range
  const visibleRows = stackedRows.filter(r => r.age >= minAge && r.age <= maxAge)

  // Compute Y range (positive max + negative min for debt layer)
  let yMax = 0
  let yMin = 0
  for (const row of visibleRows) {
    const positiveTotal = row.spaargeld + row.beleggingen + row.pensioen + row.vastgoed + row.overig
    if (positiveTotal > yMax) yMax = positiveTotal
    if (row.schulden < yMin) yMin = row.schulden // schulden is already negative
  }
  // Add 8% padding
  yMax = Math.max(yMax, 1) * 1.08
  yMin = yMin < 0 ? yMin * 1.08 : 0

  const yRange = yMax - yMin

  // Scales
  const xScale = (age: number) =>
    maxAge > minAge ? ((age - minAge) / (maxAge - minAge)) * innerW : 0

  const yearStep = innerW / Math.max(maxAge - minAge, 1)
  const barWidth = Math.max(2, yearStep * (isDesktop ? 0.85 : 0.75))

  const yScale = (val: number) =>
    PAD.top + ((yMax - val) / yRange) * innerH

  const yZero = yScale(0)

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(f => {
    const val = yMin + yRange * (1 - f)
    return { val, y: PAD.top + innerH * f }
  }).filter(t => Math.abs(t.val) > yRange * 0.02 || t.val === 0)

  // X-axis ticks
  const totalAgeSpan = maxAge - minAge
  const xStep = totalAgeSpan <= 10 ? 1 : totalAgeSpan <= 20 ? 2 : totalAgeSpan <= 40 ? 5 : 10
  const xTickAges: number[] = []
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge; a += xStep) {
    xTickAges.push(a)
  }

  // Early return AFTER all hooks
  if (visibleRows.length === 0) {
    return (
      <div ref={ref} className="flex flex-col items-center text-center py-12 px-4 max-w-sm mx-auto">
        <div className="mb-2 flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7"
            style={{ background: 'var(--module-active-500)' }}
          />
          Vermogensopbouw
        </div>
        <p
          className="italic text-[13px] text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Voeg bezittingen toe zodat de vermogenssamenstelling zichtbaar wordt.
        </p>
      </div>
    )
  }

  // Planning mode logic
  const isPensioenMode = planningMode === 'pensioen'

  // Determine which age to use as the split/reference line
  const refAge = isPensioenMode
    ? (aowAgeFractional != null ? Math.ceil(aowAgeFractional) : null)
    : fireAge

  // FIRE vertical line X position (hidden in pensioen mode)
  // Use fireAgeFractional for precise positioning (integer fireAge can be 1 year off)
  const effectiveFireAge = fireAgeFractional ?? fireAge
  const xFire = !isPensioenMode && effectiveFireAge != null && effectiveFireAge >= minAge && effectiveFireAge <= maxAge
    ? PAD.left + xScale(effectiveFireAge)
    : null

  // AOW vertical line X position (promoted in pensioen mode)
  const xAow = isPensioenMode && aowAgeFractional != null && aowAgeFractional >= minAge && aowAgeFractional <= maxAge
    ? PAD.left + xScale(aowAgeFractional)
    : null

  // Huisverkoop-marker X-positie (kernel-verkoopmoment, planning-mode-onafhankelijk).
  // Alleen renderen als de verkoop daadwerkelijk plaatsvindt én binnen het
  // zichtbare leeftijdsbereik valt (null-safe).
  const xSale = housingSaleAge != null && housingSaleAge >= minAge && housingSaleAge <= maxAge
    ? PAD.left + xScale(housingSaleAge)
    : null

  // Tooltip data — gerendered als HTML-strip onder de chart (niet SVG-floating)
  const tooltipRow = hoveredAge != null ? visibleRows.find(r => r.age === hoveredAge) : null
  const tooltipPositiveTotal = tooltipRow
    ? tooltipRow.spaargeld + tooltipRow.beleggingen + tooltipRow.pensioen + tooltipRow.vastgoed + tooltipRow.overig
    : 0
  const tooltipItems: { label: string; value: number; color: string }[] = tooltipRow
    ? [
        ...ALL_GROUPS
          .filter(g => tooltipRow[g] > 0)
          .map(g => ({ label: WEALTH_GROUP_LABELS[g], value: tooltipRow[g], color: WEALTH_GROUP_COLORS[g] })),
        ...(tooltipRow.schulden < 0
          ? [{ label: DEBT_LAYER_LABEL, value: tooltipRow.schulden, color: DEBT_LAYER_COLOR }]
          : []),
      ]
    : []
  const tooltipNetWorth = tooltipRow ? tooltipPositiveTotal + tooltipRow.schulden : 0

  return (
    <div ref={ref}>
      {/* Hover-info-strip — vaste positie BOVEN de chart zodat ze nooit het
          klikgebied van bars of event-markers overlapt. Toont event-info
          wanneer een marker wordt gehoverd, anders de breakdown van het
          gehoverde jaar, en een hint wanneer niets is gehoverd.
          `min-height` voorkomt layout-shift bij hover-toggle.
          Verborgen op mobiel (`hidden md:block`): daar bestaat geen hover —
          alleen tap-to-open via de year-sheet en marker-pane. */}
      <div
        className="mb-2 hidden min-h-[58px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 md:block"
        role="status"
        aria-live="polite"
      >
        {hoveredEvent ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2 min-w-0">
                <span
                  className="inline-block h-2 w-2 rounded-sm shrink-0 self-center"
                  style={{ backgroundColor: hoveredEvent.color }}
                />
                <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                  {hoveredEvent.kind === 'natural' ? 'Mijlpaal' : 'Gebeurtenis'}
                </p>
                <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
                  {hoveredEvent.label}
                </p>
              </div>
              <div className="flex items-baseline gap-1.5 shrink-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                  Leeftijd
                </p>
                <p className="font-mono text-[14px] font-semibold tabular-nums text-[var(--ink)]">
                  {Math.round(hoveredEvent.age)}
                </p>
              </div>
            </div>
            {hoveredEvent.detail && (
              <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[var(--ink-2)]">
                {hoveredEvent.detail}
              </p>
            )}
          </>
        ) : tooltipRow && hoveredAge != null ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                  Leeftijd
                </p>
                <p className="font-mono text-[14px] font-semibold tabular-nums text-[var(--ink)]">
                  {hoveredAge}
                </p>
              </div>
              <div className="flex items-baseline gap-1.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                  Netto
                </p>
                <p className="font-mono text-[14px] font-semibold tabular-nums text-[var(--ink)]">
                  {fmtEuro(tooltipNetWorth)}
                </p>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {tooltipItems.map(item => (
                <span
                  key={item.label}
                  className="inline-flex items-center gap-1.5 text-[10px] text-[var(--ink-2)]"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-sm shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.label}</span>
                  <span className="font-mono tabular-nums text-[var(--ink-3)]">
                    {fmtEuro(item.value)}
                    {item.value > 0 && tooltipPositiveTotal > 0 && (
                      <span className="text-[var(--ink-4)]"> · {pctStr(item.value, tooltipPositiveTotal)}</span>
                    )}
                  </span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="py-2 text-center font-serif text-[11px] italic text-[var(--ink-4)]">
            Beweeg over een jaar voor de samenstelling — tik om alle details te zien
          </p>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        overflow="visible"
        role="img"
        aria-label="Vermogensopbouw stacked-bar grafiek — klikbaar per jaar voor details"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Horizontal grid lines */}
        {yTicks.map(({ val, y }) => (
          <line
            key={val}
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={y}
            y2={y}
            stroke="var(--border-ed)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ))}

        {/* Zero line (emphasized when debts exist) */}
        {yMin < 0 && (
          <line
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={yZero}
            y2={yZero}
            stroke="var(--border-md)"
            strokeWidth={1.5}
          />
        )}

        {/* Y-axis labels */}
        {yTicks.map(({ val, y }) => (
          <text
            key={val}
            x={PAD.left - 5}
            y={y + 4}
            textAnchor="end"
            fontSize={9}
            fill="var(--ink-4)"
            fontFamily="var(--font-dm-mono, monospace)"
          >
            {fmtEuro(val)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTickAges.map(age => (
          <text
            key={age}
            x={PAD.left + xScale(age)}
            y={H - 4}
            textAnchor="middle"
            fontSize={9}
            fill="var(--ink-4)"
            fontFamily="var(--font-dm-mono, monospace)"
          >
            {age}
          </text>
        ))}

        {/* Stacked bars */}
        {visibleRows.map(row => {
          const x = PAD.left + xScale(row.age) - barWidth / 2
          const isHovered = hoveredAge === row.age

          // Positive layers stacked upward from zero
          const layers: { group: WealthGroup; value: number; color: string }[] = ALL_GROUPS
            .map(g => ({ group: g, value: row[g], color: WEALTH_GROUP_COLORS[g] }))
            .filter(l => l.value > 0)

          let cumY = yZero
          const positiveBars = layers.map(layer => {
            const barH = (layer.value / yRange) * innerH
            cumY -= barH
            return {
              ...layer,
              y: cumY,
              height: barH,
            }
          })

          // Debt bar (negative, below zero line)
          const debtValue = Math.abs(row.schulden)
          const debtBarH = debtValue > 0 ? (debtValue / yRange) * innerH : 0

          // Animation: bars grow from zero line
          const animProgress = hasEntered ? 1 : 0

          return (
            <g key={row.age} opacity={hasEntered ? 1 : 0} style={{
              transition: hasEntered ? `opacity 0.4s ease ${Math.min((row.age - minAge) * 0.02, 0.5)}s` : 'none',
            }}>
              {/* Positive stacked bars */}
              {positiveBars.map(bar => (
                <rect
                  key={bar.group}
                  x={x}
                  y={yZero - (yZero - bar.y) * animProgress}
                  width={barWidth}
                  height={bar.height * animProgress}
                  fill={bar.color}
                  opacity={isHovered ? 1 : 0.85}
                  rx={barWidth > 4 ? 1 : 0}
                  style={{ transition: 'opacity 150ms ease, y 0.8s cubic-bezier(.22,1,.36,1), height 0.8s cubic-bezier(.22,1,.36,1)' }}
                />
              ))}

              {/* Debt bar (below zero line) */}
              {debtBarH > 0 && (
                <rect
                  x={x}
                  y={yZero}
                  width={barWidth}
                  height={debtBarH * animProgress}
                  fill={DEBT_LAYER_COLOR}
                  opacity={isHovered ? 1 : 0.85}
                  rx={barWidth > 4 ? 1 : 0}
                  style={{ transition: 'opacity 150ms ease, height 0.8s cubic-bezier(.22,1,.36,1)' }}
                />
              )}

              {/*
                Transparante hover/click-rect — volledige kolom-hoogte zodat
                de gebruiker makkelijk de tooltip triggert én op het hele
                jaar kan klikken zonder precies op de bars te hoeven mikken.
                Hover-fill in horizon-tint wanneer onYearClick beschikbaar
                is, anders volledig transparant. Keyboard-bereikbaar via
                tabIndex + Enter/Space.
              */}
              <rect
                x={PAD.left + xScale(row.age) - yearStep / 2}
                y={PAD.top}
                width={Math.max(yearStep, 4)}
                height={innerH}
                fill={onYearClick && isHovered ? 'var(--color-horizon-100)' : 'transparent'}
                fillOpacity={onYearClick && isHovered ? 0.35 : 1}
                tabIndex={onYearClick ? 0 : -1}
                role={onYearClick ? 'button' : undefined}
                aria-label={
                  onYearClick
                    ? `Bekijk jaardetails voor leeftijd ${row.age}`
                    : undefined
                }
                onMouseEnter={() => setHoveredAge(row.age)}
                onFocus={() => setHoveredAge(row.age)}
                onBlur={() => setHoveredAge(null)}
                /* stopPropagation op pointerDown voorkomt dat de zoom-container
                   setPointerCapture aanroept en zo onze click event afvangt.
                   We slaan de pos op zodat onPointerUp tap-vs-pan kan checken. */
                onPointerDown={onYearClick ? (e) => {
                  e.stopPropagation()
                  tapStartRef.current = { x: e.clientX, y: e.clientY, age: row.age, pointerId: e.pointerId }
                } : undefined}
                /* Touch-betrouwbare tap-detectie: pointerUp met motion-check.
                   `onClick` blijft bestaan als desktop/keyboard-pad — `triggerYearTap`
                   dedupliceert binnen 250ms zodat we niet twee keer openen. */
                onPointerUp={onYearClick ? (e) => {
                  const start = tapStartRef.current
                  tapStartRef.current = null
                  if (!start || start.pointerId !== e.pointerId) return
                  const dx = e.clientX - start.x
                  const dy = e.clientY - start.y
                  if (Math.hypot(dx, dy) > 10) return // pan, geen tap
                  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
                    e.stopPropagation()
                    triggerYearTap(row.age)
                  }
                } : undefined}
                onPointerLeave={() => setHoveredAge(null)}
                onPointerCancel={() => { tapStartRef.current = null }}
                onClick={onYearClick ? () => triggerYearTap(row.age) : undefined}
                onKeyDown={
                  onYearClick
                    ? e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          triggerYearTap(row.age)
                        }
                      }
                    : undefined
                }
                style={{
                  cursor: onYearClick ? 'pointer' : 'default',
                  outline: 'none',
                  touchAction: 'manipulation', // disable 300ms click delay + double-tap-zoom op deze rect
                  transition: 'fill 150ms ease, fill-opacity 150ms ease',
                }}
              />
            </g>
          )
        })}

        {/* FIRE age vertical dashed line (hidden in pensioen mode) */}
        {xFire !== null && (
          <line
            x1={xFire}
            x2={xFire}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="var(--hor-t, #8a6e42)"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            opacity={0.85}
          />
        )}

        {/* FIRE label (hidden in pensioen mode) */}
        {xFire !== null && fireAge != null && (
          <text
            x={xFire + 4}
            y={PAD.top + 12}
            fontSize={8}
            fill="var(--hor-t, #8a6e42)"
            fontFamily="var(--font-inter, sans-serif)"
            fontWeight={600}
          >
            FIRE {fireAgeFractional != null ? fireAgeFractional.toFixed(1) : fireAge}
          </text>
        )}

        {/* AOW pensioenleeftijd vertical dashed line (promoted in pensioen mode) */}
        {xAow !== null && aowAgeFractional != null && (
          <g>
            <line
              x1={xAow}
              x2={xAow}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--hor-t, #8a6e42)"
              strokeWidth={1.8}
              strokeDasharray="4 2"
              opacity={0.85}
            />
            <text
              x={xAow - 4}
              y={PAD.top + 10}
              textAnchor="end"
              fontSize={7}
              fill="var(--hor-t, #8a6e42)"
              fontFamily="var(--font-inter, sans-serif)"
              fontWeight={600}
            >
              AOW
            </text>
            <text
              x={xAow - 4}
              y={PAD.top + 19}
              textAnchor="end"
              fontSize={7}
              fill="var(--hor-t, #8a6e42)"
              fontFamily="var(--font-dm-mono, monospace)"
              fontWeight={500}
            >
              {aowAgeFractional % 1 === 0
                ? `${aowAgeFractional}`
                : `${Math.floor(aowAgeFractional)}+${Math.round((aowAgeFractional % 1) * 12)}m`}
            </text>
          </g>
        )}

        {/* Huisverkoop-marker — verticale stippellijn + compact label op het
            kernel-verkoopmoment (`housingSaleAge` = `kernelHousingSale.age`).
            Duidt het visuele breekpunt in Opbouw-modus: Vastgoed valt naar 0 en
            het hypotheek-schuldsegment verdwijnt doordat de verkoopopbrengst de
            hypotheek aflost — zonder marker leest dat als "fout". Zelfde dashed-
            lijn-patroon als de FIRE-lijn, maar neutrale ink-tint i.p.v. het
            horizon-module-accent (neutrale duiding, geen stoplicht-semantiek) én
            visueel onderscheidbaar van de FIRE/AOW-accentlijnen. `<title>` +
            aria-label dragen de duiding "hypotheek afgelost", spiegelend aan de
            Pad-modus. Label links van de lijn (textAnchor end) zodat het binnen
            de chart blijft (de verkoop ligt doorgaans rechts op de as) en van de
            FIRE-label wegwijst (die staat rechts van z'n lijn); FIRE en verkoop
            liggen in de praktijk ruim uit elkaar — dit is de minimale
            overlap-mitigatie. */}
        {xSale !== null && (
          <g role="img" aria-label="Huis verkocht — hypotheek afgelost">
            <title>Huis verkocht — hypotheek afgelost</title>
            <line
              x1={xSale}
              x2={xSale}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--ink-3)"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              opacity={0.8}
            />
            <text
              x={xSale - 4}
              y={PAD.top + 12}
              textAnchor="end"
              fontSize={8}
              fill="var(--ink-3)"
              fontFamily="var(--font-inter, sans-serif)"
              fontWeight={600}
            >
              Huis verkocht
            </text>
          </g>
        )}

        {/* (Hover-tooltip wordt BOVEN de chart als HTML-strip getoond — zie
            de div vóór <svg> hierboven. Dat houdt het klikgebied van bars en
            event-markers volledig vrij en voorkomt dat de tooltip de hover-
            positie zelf overlapt. Event-markers spelen mee via hun
            `onEventHover` callback in ChartEventMarkers.) */}

        {/* Event-markers (levensgebeurtenissen + natuurlijke mijlpalen) */}
        {/*
          Iconen boven de bar (positieve events, asset-uitkeringen,
          vermogensmijlpalen) of onder de bar (negatieve events, schuld-
          afgelost, out-of-cash). Stapelt verticaal bij meerdere events op
          dezelfde leeftijd. Klik routeert naar EventPane (life events)
          of NaturalMilestoneSheet (natuurlijke mijlpalen) via parent.
        */}
        {eventOverlay && eventOverlay.length > 0 && (
          <ChartEventMarkers
            events={eventOverlay}
            xScale={xScale}
            padLeft={PAD.left}
            chartTopY={PAD.top}
            chartBottomY={H - PAD.bottom}
            visibleMinAge={minAge}
            visibleMaxAge={maxAge}
            onEventClick={onEventClick}
            onEventHover={setHoveredEvent}
          />
        )}
      </svg>

      {/* Legend */}
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4">
        {ALL_GROUPS.map(g => {
          // Only show groups that appear in data
          const hasData = stackedRows.some(r => r[g] > 0)
          if (!hasData) return null
          return (
            <div key={g} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: WEALTH_GROUP_COLORS[g] }}
              />
              <span className="text-[10px] font-medium text-[var(--ink-3)]">
                {WEALTH_GROUP_LABELS[g]}
              </span>
            </div>
          )
        })}
        {stackedRows.some(r => r.schulden < 0) && (
          <div className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: DEBT_LAYER_COLOR }}
            />
            <span className="text-[10px] font-medium text-[var(--ink-3)]">
              {DEBT_LAYER_LABEL}
            </span>
          </div>
        )}
      </div>
    </div>
  )
})
