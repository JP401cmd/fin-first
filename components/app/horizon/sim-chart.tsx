'use client'

import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { SimRow, SimCashflow } from '@/lib/fire-simulation'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import { NL_SWR, type ScenarioPath, type ProjectionMonth } from '@/lib/horizon-data'
import type { ChartEventOverlay, ChartEventKind } from '@/lib/chart-event-overlay'
import {
  buildSimChartGeometry,
  type SimChartGeometry,
  type ScenarioOverlay,
  type MonteCarloOverlay,
  type HouseholdPartnerOverlay,
} from '@/lib/horizon/sim-chart-geometry'
import { ChartStaticLayers } from './chart-static-layers'

// ── Types ───────────────────────────────────────────────────────────────────
//
// De overlay-types wonen sinds de geometrie-extractie in
// `lib/horizon/sim-chart-geometry.ts` (de pure geometrie-bouwer bezit ze). We
// her-exporteren ze hier zodat bestaande consumers (whatif-page-client e.a.) ze
// onveranderd vanuit dit component kunnen blijven importeren.
export type { ScenarioOverlay, MonteCarloOverlay, HouseholdPartnerOverlay }

/** Format an absolute value for the crosshair tooltip (no sign prefix) */
function fmtAbs(val: number): string {
  const abs = Math.abs(val)
  if (abs >= 1_000_000) return `€${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `€${Math.round(abs / 1_000)}K`
  return `€${Math.round(abs)}`
}

// ── Crosshair-laag ────────────────────────────────────────────────────────────
//
// De ENIGE laag die op `hoveredAge` reageert: de onzichtbare hover-rect + de
// verticale crosshair-lijn + de stip op de vermogenslijn. Bewust GEEN memo — de
// parent re-rendert bij elke muisbeweging en deze laag mag dan mee-renderen. De
// zware statische lagen (paden, Monte-Carlo-band) zitten in de gememoiseerde
// `ChartStaticLayers` en blijven ongemoeid.
function CrosshairLayer({
  geometry,
  disableCrosshair,
  onMouseMove,
  onMouseLeave,
  showCrosshair,
  crosshairX,
  crosshairY,
  crosshairDotColor,
}: {
  geometry: SimChartGeometry
  disableCrosshair: boolean
  onMouseMove: (e: React.MouseEvent<SVGRectElement>) => void
  onMouseLeave: () => void
  showCrosshair: boolean
  crosshairX: number | null
  crosshairY: number | null
  crosshairDotColor: string
}) {
  const { PAD, innerW, innerH } = geometry
  return (
    <>
      {/* Crosshair hover overlay — invisible rect covering chart area for mouse tracking */}
      <rect
        x={PAD.left} y={PAD.top}
        width={innerW} height={innerH}
        fill="transparent"
        pointerEvents={disableCrosshair ? 'none' : 'all'}
        style={{ cursor: 'crosshair' }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      />

      {/* Crosshair vertical line */}
      {showCrosshair && crosshairX !== null && (
        <line
          x1={crosshairX} x2={crosshairX}
          y1={PAD.top} y2={PAD.top + innerH}
          stroke="var(--ink-3)" strokeWidth={1} opacity={0.4}
          pointerEvents="none"
        />
      )}

      {/* Crosshair dot on the wealth line */}
      {showCrosshair && crosshairX !== null && crosshairY !== null && (
        <circle
          cx={crosshairX} cy={crosshairY} r={4}
          fill={crosshairDotColor}
          stroke="var(--paper)" strokeWidth={1.5}
          pointerEvents="none"
        />
      )}
    </>
  )
}

// ── Voorgrond-laag ─────────────────────────────────────────────────────────────
//
// FIRE-stip + fase-labels + FIRE-leeftijd/delta-labels. Hover-onafhankelijk,
// dus gememoiseerd zodat een muisbeweging deze laag niet opnieuw tekent.
// `emphasis` (walkthrough-puls) is een render-prop; wijzigt die dan re-rendert
// deze laag éénmalig mee.
const ChartForeground = memo(function ChartForeground({
  geometry,
  emphasis,
  baselineFireAge,
}: {
  geometry: SimChartGeometry
  emphasis: 'accumulation' | 'withdrawal' | 'fire' | null
  baselineFireAge?: number | null
}) {
  const {
    isPensioenMode,
    xFire,
    yFireDot,
    fireAgeFractional,
    minAge,
    maxAge,
    mainStrokeAcc,
    splitFractionalAge,
    xScale,
    PAD,
    COLOR_OPBOUW,
    COLOR_AFBOUW,
    strategy,
    labelSafeTopY,
  } = geometry
  // De FIRE-stip pulseert wanneer het snijpunt-hoofdstuk actief is.
  const firePulse = emphasis === 'fire'

  return (
    <>
      {/* Dot at FIRE junction (hidden in pensioen mode) */}
      {!isPensioenMode && xFire !== null && yFireDot !== null && fireAgeFractional !== null && fireAgeFractional > minAge && fireAgeFractional < maxAge && (
        <>
          {firePulse && (
            <circle cx={xFire} cy={yFireDot} r={5}
              fill="none" stroke={mainStrokeAcc} strokeWidth={2}>
              <animate attributeName="r" from="5" to="16" dur="1.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.7" to="0" dur="1.6s" repeatCount="indefinite" />
            </circle>
          )}
          <circle cx={xFire} cy={yFireDot} r={firePulse ? 6 : 5}
            fill={mainStrokeAcc} stroke="var(--paper)" strokeWidth={1.5} />
        </>
      )}

      {/* Phase label: OPBOUW / VERMOGENSGROEI */}
      {splitFractionalAge !== null && splitFractionalAge > minAge + 3 && (
        <text x={PAD.left + xScale((minAge + splitFractionalAge) / 2)} y={PAD.top + 14}
          textAnchor="middle" fontSize={10} fill={COLOR_OPBOUW}
          fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
          {isPensioenMode ? 'VERMOGENSGROEI' : 'OPBOUW'}
        </text>
      )}

      {/* Phase label: AFBOUW / BEHOUD / PENSIOEN */}
      {splitFractionalAge !== null && splitFractionalAge < maxAge - 3 && (
        <text x={PAD.left + xScale((splitFractionalAge + maxAge) / 2)} y={PAD.top + 14}
          textAnchor="middle" fontSize={10}
          fill={!isPensioenMode && strategy === 'perpetual' ? COLOR_OPBOUW : COLOR_AFBOUW}
          fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
          {isPensioenMode ? 'PENSIOEN' : strategy === 'perpetual' ? 'BEHOUD' : 'AFBOUW'}
        </text>
      )}

      {/* FIRE age label (hidden in pensioen mode). y geclampt onder de
          gereserveerde icoon-marge (labelSafeTopY) zodat het label niet botst
          met een event-icoon dat op/bij de FIRE-leeftijd boven de lijn staat —
          vaak voorkomend (pensioen/erfenis-trigger op FIRE-leeftijd). */}
      {!isPensioenMode && xFire !== null && fireAgeFractional !== null && fireAgeFractional > minAge && fireAgeFractional < maxAge && (
        <text x={xFire + 4} y={Math.max(PAD.top + 24, labelSafeTopY + 18)} fontSize={8}
          fill={COLOR_OPBOUW} fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
          FIRE {fireAgeFractional.toFixed(1)}
        </text>
      )}

      {/* FIRE age delta label (what-if mode) */}
      {xFire !== null && yFireDot !== null && fireAgeFractional !== null && baselineFireAge != null &&
        fireAgeFractional > minAge && fireAgeFractional < maxAge &&
        Math.abs(fireAgeFractional - baselineFireAge) > 0.1 && (
        <text
          x={xFire}
          y={yFireDot - 14}
          textAnchor="middle"
          fontSize={9}
          fontWeight={700}
          fontFamily="var(--font-dm-mono, monospace)"
          fill={fireAgeFractional < baselineFireAge ? COLOR_OPBOUW : COLOR_AFBOUW}
        >
          {fireAgeFractional < baselineFireAge ? '' : '+'}
          {(fireAgeFractional - baselineFireAge).toFixed(1)} jr
        </text>
      )}
    </>
  )
})

// ── SimChart ────────────────────────────────────────────────────────────────

export const SimChart = memo(function SimChart({
  rows,
  fireAge,
  fireAgeFractional,
  currentAge,
  endAge,
  cashflows,
  fireTarget,
  forModal,
  strategy,
  targetEndPortfolio,
  baselineRows,
  scenarioOverlays,
  monteCarloOverlay,
  baselineFireAge,
  dailyExpenseRate,
  householdOverlays,
  mainLineLabel,
  mainLineColor,
  visibleMinAge,
  visibleMaxAge,
  aowAgeFractional,
  planningMode = 'fire',
  showDepletionWarning,
  baselineEmphasis = 'ghost',
  eventOverlay,
  onEventClick,
  onEventDragEnd,
  onEventDragMove,
  emphasis = null,
  targetInflationFactors,
  disableCrosshair = false,
}: {
  rows: SimRow[]
  fireAge: number | null
  fireAgeFractional: number | null
  currentAge: number
  endAge: number
  cashflows: SimCashflow[]
  fireTarget?: number
  forModal?: boolean
  strategy?: FireEndStrategy
  targetEndPortfolio?: number
  /** Optional baseline rows for ghost-line overlay (what-if mode) */
  baselineRows?: SimRow[]
  scenarioOverlays?: ScenarioOverlay[]
  monteCarloOverlay?: MonteCarloOverlay
  /** Optional baseline FIRE age for delta annotation (what-if mode) */
  baselineFireAge?: number | null
  /** Daily expense rate for freedom-time tooltip (optional) */
  dailyExpenseRate?: number
  /** Optional partner trajectories for household perspective */
  householdOverlays?: HouseholdPartnerOverlay[]
  /** Label voor de HOOFDLIJN in de legenda (bv. "Gezamenlijk" / partnernaam).
   *  Wanneer gezet toont de legenda welke lijn de dikke hoofdlijn is. */
  mainLineLabel?: string
  /** Optionele kleur-override voor de HOOFDLIJN (bv. partner-projectie teal,
   *  gelijk aan de partner-event-markers). Default = opbouw-goud/afbouw-bruin. */
  mainLineColor?: string
  /** Zoomed visible range (optional — defaults to full range) */
  visibleMinAge?: number
  visibleMaxAge?: number
  /** AOW pension age as fractional value (e.g. 67.25 for 67j+3m) */
  aowAgeFractional?: number
  /** Planning mode: 'fire' (default) uses FIRE age as split point, 'pensioen' uses AOW age */
  planningMode?: 'fire' | 'pensioen'
  /** Show red depletion zone when portfolio hits zero (AOW-stop mode) */
  showDepletionWarning?: boolean
  /** Baseline rendering: 'ghost' (default, faint gray reference) or 'compare' (solid horizon-700, side-by-side feel) */
  baselineEmphasis?: 'ghost' | 'compare'
  /** Event overlay markers (life events + natural milestones) rendered on the chart */
  eventOverlay?: ChartEventOverlay[]
  /** Click handler for event markers — routes to EventPane or NaturalMilestoneSheet */
  onEventClick?: (id: string, kind: ChartEventKind, sourceId?: string) => void
  /** F-1 directe manipulatie: drag-end handler. Caller persisteert de
   *  nieuwe target_age (typisch via supabase.update op life_events). */
  onEventDragEnd?: (
    id: string,
    sourceId: string | undefined,
    newAge: number,
    kind: ChartEventKind,
  ) => void
  /** F-5 live curve-update: vuurt per kwartaal-crossing tijdens drag. */
  onEventDragMove?: (
    id: string,
    sourceId: string | undefined,
    newAge: number,
    kind: ChartEventKind,
  ) => void
  /** Benadrukt één segment van de lijn (uitleg-walkthrough); rest wordt gedimd.
   *  Default `null` = ongewijzigd gedrag voor alle bestaande call-sites. */
  emphasis?: 'accumulation' | 'withdrawal' | 'fire' | null
  /** Inflatie-indexfactor per leeftijd (uit `unifiedRows`, `inflationFactor` =
   *  (1+inflatie)^jaar). Wanneer aanwezig tekent de legacy/perpetual-doellijn
   *  als OPLOPENDE lijn: het reële doel-van-nu groeit met inflatie mee naar de
   *  nominale eindwaarde (`targetEndPortfolio`). Zonder deze prop blijft de
   *  doellijn vlak (byte-identiek voor call-sites zonder unifiedRows). */
  targetInflationFactors?: { age: number; factor: number }[]
  /** Onderdruk de crosshair-tooltip (bv. in de tips-modus van /toekomst). */
  disableCrosshair?: boolean
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1200, forModal })
  const [hoveredAge, setHoveredAge] = useState<number | null>(null)

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

  // ── Hover-onafhankelijke geometrie in één memo ────────────────────────────
  //
  // Alle punten, d-strings, Monte-Carlo-banden, doellijn, ticks en schaal-
  // functies worden hier één keer berekend. De dep-array bevat ALLE geometrie-
  // inputs (exhaustive-deps dwingt dit af); alleen `hoveredAge` en de daarvan
  // afgeleide crosshair-waarden blijven erbuiten. Zo herberekent een muis-
  // beweging (die enkel `hoveredAge` wijzigt) niets van dit rekenwerk.
  const geometry = useMemo(
    () =>
      buildSimChartGeometry({
        rows,
        fireAge,
        fireAgeFractional,
        currentAge,
        endAge,
        fireTarget,
        strategy,
        targetEndPortfolio,
        baselineRows,
        scenarioOverlays,
        monteCarloOverlay,
        householdOverlays,
        mainLineColor,
        visibleMinAge,
        visibleMaxAge,
        aowAgeFractional,
        planningMode,
        eventOverlay,
        targetInflationFactors,
        containerW,
      }),
    [
      rows,
      fireAge,
      fireAgeFractional,
      currentAge,
      endAge,
      fireTarget,
      strategy,
      targetEndPortfolio,
      baselineRows,
      scenarioOverlays,
      monteCarloOverlay,
      householdOverlays,
      mainLineColor,
      visibleMinAge,
      visibleMaxAge,
      aowAgeFractional,
      planningMode,
      eventOverlay,
      targetInflationFactors,
      containerW,
    ],
  )

  const { W, H, PAD, innerW, innerH, minAge, maxAge, xScale, yScale, allPts, mainStrokeAcc, mainStrokeDec } = geometry

  // ── Crosshair tooltip handlers ──────────────────────────────────────────
  const handleOverlayMouseMove = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    const svgEl = ref.current?.querySelector('svg')
    if (!svgEl) return
    const rect = svgEl.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const raw = minAge + ((svgX - PAD.left) / innerW) * (maxAge - minAge)
    const age = Math.max(minAge, Math.min(maxAge, Math.round(raw)))
    setHoveredAge(age)
  }, [ref, W, minAge, maxAge, PAD.left, innerW])

  const handleOverlayMouseLeave = useCallback(() => {
    setHoveredAge(null)
  }, [])

  /** SimRow for the currently hovered age (null if nothing hovered) */
  const hoveredRow = useMemo(() => {
    if (hoveredAge === null) return null
    return rows.find(r => r.age === hoveredAge) ?? null
  }, [hoveredAge, rows])

  /** SVG x-position of the hovered age crosshair */
  const crosshairX = hoveredAge !== null ? PAD.left + xScale(hoveredAge) : null

  /** Crosshair onderdrukken (tips-modus): verbergt lijn/dot/tooltip — ook bij een
   *  achtergebleven hoveredAge — en de overlay-rect vangt geen muis meer. */
  const showCrosshair = !disableCrosshair && hoveredAge !== null

  /** Compute the portfolio value at hoveredAge for the dot on the line */
  const crosshairY = useMemo(() => {
    if (hoveredAge === null) return null
    // The allPts array maps age → value on the drawn line.
    // At x = hoveredAge the line shows the startPortfolio of that year
    // (which equals endPortfolio of the previous year).
    const pt = allPts.find(([a]) => a === hoveredAge)
    if (pt) return PAD.top + yScale(Math.max(pt[1], 0))
    // Fallback: try the startPortfolio entry at the exact age
    const ptStart = allPts.find(([a]) => a === hoveredAge)
    if (ptStart) return PAD.top + yScale(Math.max(ptStart[1], 0))
    return null
  }, [hoveredAge, allPts, PAD.top, yScale])

  /** Determine the colour for the crosshair dot based on phase.
   *  De stip zit ÓP de hoofdlijn, dus hij volgt de hoofdlijn-kleur: bij een
   *  mainLineColor-override (partner-view = teal) krijgt de stip diezelfde kleur,
   *  anders de fase-afhankelijke opbouw/afbouw-kleur (mainStrokeAcc/mainStrokeDec
   *  vallen terug op COLOR_OPBOUW/COLOR_AFBOUW wanneer er geen override is). */
  const crosshairDotColor = useMemo(() => {
    if (!hoveredRow) return mainStrokeAcc
    return hoveredRow.phase === 'retirement' ? mainStrokeDec : mainStrokeAcc
  }, [hoveredRow, mainStrokeAcc, mainStrokeDec])

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" overflow="hidden" aria-hidden="true">
        {/* Statische lagen (grid → assen → doellijnen → projectiepaden → MC-band
            → event-markers). Gememoiseerd: hover raakt deze subtree niet. */}
        <ChartStaticLayers
          geometry={geometry}
          hasEntered={hasEntered}
          emphasis={emphasis}
          baselineEmphasis={baselineEmphasis}
          showDepletionWarning={showDepletionWarning}
          eventOverlay={eventOverlay}
          onEventClick={onEventClick}
          onEventDragEnd={onEventDragEnd}
          onEventDragMove={onEventDragMove}
        />

        {/* Crosshair-laag (hover-rect + verticale lijn + stip) — de enige laag
            die op hoveredAge reageert. */}
        <CrosshairLayer
          geometry={geometry}
          disableCrosshair={disableCrosshair}
          onMouseMove={handleOverlayMouseMove}
          onMouseLeave={handleOverlayMouseLeave}
          showCrosshair={showCrosshair}
          crosshairX={crosshairX}
          crosshairY={crosshairY}
          crosshairDotColor={crosshairDotColor}
        />

        {/* Voorgrond (FIRE-stip + fase-/FIRE-labels) — bovenop de crosshair,
            gememoiseerd. */}
        <ChartForeground
          geometry={geometry}
          emphasis={emphasis}
          baselineFireAge={baselineFireAge}
        />
      </svg>

      {/* Crosshair tooltip (HTML overlay for crisp text rendering) */}
      {showCrosshair && hoveredRow && crosshairX !== null && (() => {
        // Convert SVG crosshair X to CSS percentage within the container
        const pctX = crosshairX / W
        // Position tooltip to the right by default; flip left if too close to right edge
        const tooltipW = 180
        const flipThreshold = 0.7
        const showLeft = pctX > flipThreshold
        // Vertical position: roughly at chart midpoint
        const pctY = (PAD.top + innerH * 0.2) / H

        // Collect drijvers (positive factors)
        const drijvers: { label: string; value: number }[] = []
        if (hoveredRow.growth > 0) drijvers.push({ label: 'Rendement', value: hoveredRow.growth })
        if (hoveredRow.savings > 0) drijvers.push({ label: 'Sparen', value: hoveredRow.savings })
        if (hoveredRow.cashflowNet > 0) drijvers.push({ label: 'Inkomsten', value: hoveredRow.cashflowNet })
        if (hoveredRow.oneTimeNet > 0) drijvers.push({ label: 'Eenmalig', value: hoveredRow.oneTimeNet })

        // Collect drukkers (negative factors)
        const drukkers: { label: string; value: number }[] = []
        if (hoveredRow.withdrawal > 0) drukkers.push({ label: 'Onttrekking', value: hoveredRow.withdrawal })
        if (hoveredRow.cashflowNet < 0) drukkers.push({ label: 'Uitgaven', value: Math.abs(hoveredRow.cashflowNet) })
        if (hoveredRow.oneTimeNet < 0) drukkers.push({ label: 'Eenmalig', value: Math.abs(hoveredRow.oneTimeNet) })
        if (hoveredRow.growth < 0) drukkers.push({ label: 'Rendement', value: Math.abs(hoveredRow.growth) })

        // Monte Carlo percentile values at hovered age
        const mcPercentiles = monteCarloOverlay ? (() => {
          const idx = hoveredAge - monteCarloOverlay.startAge
          if (idx < 0 || idx >= monteCarloOverlay.p50.length) return null
          return {
            p10: monteCarloOverlay.p10[idx],
            p25: monteCarloOverlay.p25[idx],
            p50: monteCarloOverlay.p50[idx],
            p75: monteCarloOverlay.p75[idx],
            p90: monteCarloOverlay.p90[idx],
          }
        })() : null

        return (
          <div
            className="pointer-events-none absolute z-10"
            style={{
              left: showLeft ? `calc(${(pctX * 100).toFixed(1)}% - ${tooltipW + 12}px)` : `calc(${(pctX * 100).toFixed(1)}% + 12px)`,
              top: `${(pctY * 100).toFixed(1)}%`,
              width: tooltipW,
            }}
          >
            <div
              className="rounded-lg px-3 py-2"
              style={{ background: 'var(--ink)', opacity: 0.94 }}
            >
              {/* Header: age */}
              <div
                className="font-semibold"
                style={{ fontSize: 11, color: 'var(--paper)' }}
              >
                Leeftijd {hoveredRow.age}
              </div>

              {/* Separator */}
              <div className="my-1" style={{ height: 1, background: 'var(--ink-3)', opacity: 0.4 }} />

              {/* Vermogen */}
              <div className="flex items-baseline justify-between" style={{ fontSize: 10, color: 'var(--paper)' }}>
                <span>Vermogen</span>
                <span className="font-mono tabular-nums font-semibold">{fmtAbs(hoveredRow.startPortfolio)}</span>
              </div>

              {/* Drijvers section */}
              {drijvers.length > 0 && (
                <>
                  <div className="mt-1.5" style={{ height: 1, background: 'var(--ink-3)', opacity: 0.25 }} />
                  {drijvers.map(d => (
                    <div key={d.label} className="flex items-baseline justify-between mt-0.5" style={{ fontSize: 9 }}>
                      <span style={{ color: '#6ee7b7' }}>&#9650; {d.label}</span>
                      <span className="font-mono tabular-nums" style={{ color: '#6ee7b7' }}>+{fmtAbs(d.value)}</span>
                    </div>
                  ))}
                </>
              )}

              {/* Drukkers section */}
              {drukkers.length > 0 && (
                <>
                  <div className="mt-1.5" style={{ height: 1, background: 'var(--ink-3)', opacity: 0.25 }} />
                  {drukkers.map(d => (
                    <div key={d.label} className="flex items-baseline justify-between mt-0.5" style={{ fontSize: 9 }}>
                      <span style={{ color: '#fca5a5' }}>&#9660; {d.label}</span>
                      <span className="font-mono tabular-nums" style={{ color: '#fca5a5' }}>{'−'}{fmtAbs(d.value)}</span>
                    </div>
                  ))}
                </>
              )}

              {/* Monte Carlo percentiles section */}
              {mcPercentiles && (
                <>
                  <div className="mt-1.5" style={{ height: 1, background: 'var(--ink-3)', opacity: 0.25 }} />
                  <div className="mt-1" style={{ fontSize: 8, color: 'var(--color-horizon-300, #d4b88a)', fontWeight: 600, letterSpacing: '0.04em' }}>
                    MONTE CARLO
                  </div>
                  {([
                    { label: 'p90', value: mcPercentiles.p90, opacity: 0.5 },
                    { label: 'p75', value: mcPercentiles.p75, opacity: 0.65 },
                    { label: 'p50', value: mcPercentiles.p50, opacity: 1 },
                    { label: 'p25', value: mcPercentiles.p25, opacity: 0.65 },
                    { label: 'p10', value: mcPercentiles.p10, opacity: 0.5 },
                  ] as const).map(p => (
                    <div key={p.label} className="flex items-baseline justify-between mt-0.5" style={{ fontSize: 9, opacity: p.opacity }}>
                      <span style={{ color: p.label === 'p50' ? 'var(--color-horizon-300, #d4b88a)' : 'var(--ink-4, #bbb8b0)' }}>
                        {p.label}{p.label === 'p50' ? ' ●' : ''}
                      </span>
                      <span
                        className="font-mono tabular-nums"
                        style={{
                          color: p.label === 'p50' ? 'var(--color-horizon-300, #d4b88a)' : 'var(--paper)',
                          fontWeight: p.label === 'p50' ? 600 : 400,
                        }}
                      >
                        {fmtAbs(p.value)}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {/* Scenario overlay values at hovered age */}
              {scenarioOverlays && scenarioOverlays.length > 0 && (() => {
                const overlayValues = scenarioOverlays
                  .map(o => {
                    const pt = o.points.find(([age]) => Math.round(age) === hoveredAge)
                    return pt ? { label: o.label, color: o.color, value: pt[1] } : null
                  })
                  .filter((v): v is { label: string; color: string; value: number } => v !== null)
                if (overlayValues.length === 0) return null
                return (
                  <>
                    <div className="mt-1.5" style={{ height: 1, background: 'var(--ink-3)', opacity: 0.25 }} />
                    <div className="mt-1" style={{ fontSize: 8, color: 'var(--ink-4, #bbb8b0)', fontWeight: 600, letterSpacing: '0.04em' }}>
                      SCENARIO&apos;S
                    </div>
                    {overlayValues.map(v => (
                      <div key={v.label} className="flex items-baseline justify-between mt-0.5" style={{ fontSize: 9 }}>
                        <span className="flex items-center gap-1" style={{ color: v.color }}>
                          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />
                          <span className="truncate max-w-[80px]">{v.label}</span>
                        </span>
                        <span className="font-mono tabular-nums" style={{ color: 'var(--paper)' }}>
                          {fmtAbs(v.value)}
                        </span>
                      </div>
                    ))}
                  </>
                )
              })()}
            </div>
          </div>
        )
      })()}

      {/* Hoofdlijn- + household-legenda: maakt duidelijk welke lijn wat is. */}
      {(mainLineLabel || (householdOverlays && householdOverlays.length > 0)) && (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4">
          {mainLineLabel && (
            <div className="flex items-center gap-1.5">
              <svg width="20" height="8" className="shrink-0">
                <line x1="0" y1="4" x2="20" y2="4" stroke={mainStrokeAcc} strokeWidth={2.5} strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-medium text-[var(--ink-3)]">
                {mainLineLabel}
                {(fireAgeFractional ?? fireAge) !== null && (
                  <span className="ml-1 font-mono text-[var(--ink-4)]">
                    ({Math.round((fireAgeFractional ?? fireAge) as number)}j)
                  </span>
                )}
              </span>
            </div>
          )}
          {(householdOverlays ?? []).map(overlay => (
            <div key={overlay.name} className="flex items-center gap-1.5">
              <svg width="20" height="8" className="shrink-0">
                <line
                  x1="0" y1="4" x2="20" y2="4"
                  stroke={overlay.color}
                  strokeWidth={overlay.isDashed ? 2 : 1.8}
                  strokeDasharray={overlay.isDashed ? '4 3' : 'none'}
                  opacity={overlay.isDashed ? 0.7 : 0.55}
                />
              </svg>
              <span className="text-[10px] font-medium text-[var(--ink-3)]">
                {overlay.name}
                {overlay.fireAge !== null && (
                  <span className="ml-1 font-mono text-[var(--ink-4)]">
                    ({Math.round(overlay.fireAge)}j)
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Scenario overlay legend — shows label + color for each active saved scenario */}
      {scenarioOverlays && scenarioOverlays.length > 0 && !householdOverlays?.length && (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4">
          {scenarioOverlays.map(overlay => (
            <div key={overlay.name} className="flex items-center gap-1.5">
              <svg width="20" height="8" className="shrink-0">
                <line
                  x1="0" y1="4" x2="20" y2="4"
                  stroke={overlay.color}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.65}
                />
              </svg>
              <span className="text-[10px] font-medium text-[var(--ink-3)]">
                {overlay.label}
              </span>
            </div>
          ))}
        </div>
      )}

    </div>
  )
})

// ── Scenario variant builder ────────────────────────────────────────────────

/** Return-rate offsets for pessimistic/optimistic variants (percentage points) */
export const SCENARIO_VARIANTS = [
  { name: 'pessimist', label: 'Voorzichtig', color: '#9e6b50', delta: -0.02 },
  { name: 'optimist', label: 'Optimistisch', color: '#5b8c5a', delta: +0.02 },
] as const

/**
 * Build scenario overlay paths that stay symmetric around the main simulation.
 *
 * Instead of compounding the delta on the variant's own (diverged) portfolio,
 * we track an "extra" divergence that compounds at the BASE return rate and
 * accumulates delta applied to the MAIN sim's portfolio each year.
 * This keeps optimist and pessimist equidistant from the main line
 * (main is always the exact midpoint).
 */
export function buildScenarioVariants(
  rows: SimRow[],
  baseReturn: number,
): ScenarioOverlay[] {
  if (rows.length === 0) return []

  return SCENARIO_VARIANTS.map(({ name, label, color, delta }) => {
    let extra = 0
    const points: [number, number][] = [[rows[0].age, rows[0].startPortfolio]]

    for (const row of rows) {
      // Derive base net-of-tax return from the main sim row
      const baseNetReturn = row.startPortfolio > 0
        ? row.growth / row.startPortfolio
        : 0
      // Extra divergence: existing extra grows at base rate,
      // plus delta applied to main sim's portfolio this year
      extra = extra * (1 + baseNetReturn) + row.startPortfolio * delta
      const portfolio = row.endPortfolio + extra
      points.push([row.age + 1, Math.max(portfolio, 0)])
      if (portfolio <= 0) break
    }

    return { name, label, color, points }
  })
}

// ── Simulation-derived scenario paths (for detail modal) ───────────────────

/**
 * Build 3 ScenarioPath objects from the main simulation for the detail modal:
 * Voorzichtig (-2%), Huidige Koers (baseline), Optimistisch (+2%).
 * All paths share the same cashflow pattern — only return rate differs.
 * Returns ScenarioPath[] so the existing DivergingPathsChart and
 * ScenarioDetailModal work without changes.
 */
export function buildScenarioPathsFromSim(
  rows: SimRow[],
  baseReturn: number,
  fireTarget: number,
): ScenarioPath[] {
  if (rows.length === 0) return []

  const startAge = rows[0].age
  const now = new Date()

  function rowsToMonths(pts: { age: number; netWorth: number; contributions: number; growth: number }[]): ProjectionMonth[] {
    return pts.map(pt => {
      const yearOffset = pt.age - startAge
      const month = yearOffset * 12
      const date = new Date(now)
      date.setMonth(date.getMonth() + month)
      return {
        month,
        date: date.toISOString().split('T')[0],
        netWorth: Math.round(pt.netWorth),
        passiveIncome: Math.round((pt.netWorth * NL_SWR) / 12),
        age: pt.age,
        contributions: Math.round(pt.contributions),
        growth: Math.round(pt.growth),
      }
    })
  }

  // Baseline path from main simulation rows
  const baselinePts: { age: number; netWorth: number; contributions: number; growth: number }[] = [
    { age: startAge, netWorth: rows[0].startPortfolio, contributions: 0, growth: 0 },
  ]
  let baselineFireAge: number | null = null
  let baselineFireMonth: number | null = null
  for (const row of rows) {
    baselinePts.push({ age: row.age + 1, netWorth: row.endPortfolio, contributions: row.savings, growth: row.growth })
    if (baselineFireAge === null && row.endPortfolio >= fireTarget && fireTarget > 0) {
      baselineFireAge = row.age + 1
      baselineFireMonth = (row.age + 1 - startAge) * 12
    }
  }

  // Variant paths (symmetric around main, with FIRE detection + richer output)
  function buildVariant(name: string, label: string, color: string, delta: number): ScenarioPath {
    let extra = 0
    const pts: { age: number; netWorth: number; contributions: number; growth: number }[] = [
      { age: startAge, netWorth: rows[0].startPortfolio, contributions: 0, growth: 0 },
    ]
    let varFireAge: number | null = null
    let varFireMonth: number | null = null

    for (const row of rows) {
      const baseNetReturn = row.startPortfolio > 0
        ? row.growth / row.startPortfolio
        : 0
      // Symmetric divergence: extra compounds at base rate + delta on main portfolio
      extra = extra * (1 + baseNetReturn) + row.startPortfolio * delta
      const portfolio = row.endPortfolio + extra
      const clamped = Math.max(portfolio, 0)
      const extraGrowth = Math.round(extra * baseNetReturn + row.startPortfolio * delta)
      pts.push({ age: row.age + 1, netWorth: clamped, contributions: row.savings, growth: extraGrowth })

      if (varFireAge === null && clamped >= fireTarget && fireTarget > 0) {
        varFireAge = row.age + 1
        varFireMonth = (row.age + 1 - startAge) * 12
      }

      if (portfolio <= 0) break
    }

    return { name, label, color, months: rowsToMonths(pts), fireAge: varFireAge, fireMonth: varFireMonth }
  }

  const pessimist = buildVariant('pessimist', 'Voorzichtig', '#9e6b50', -0.02)
  const optimist = buildVariant('optimist', 'Optimistisch', '#5b8c5a', +0.02)

  const baseline: ScenarioPath = {
    name: 'current',
    label: 'Huidige Koers',
    color: 'var(--color-horizon-500, #c4a06b)',
    months: rowsToMonths(baselinePts),
    fireAge: baselineFireAge,
    fireMonth: baselineFireMonth,
  }

  return [pessimist, baseline, optimist]
}
