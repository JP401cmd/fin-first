'use client'

import { useMemo } from 'react'
import { useCategoryTints, useCategoryTintPercents } from '@/lib/category-tints'

interface CardTintOverlayProps {
  /** Bezitting → groen-paar; schuld → amber-paar. */
  variant: 'asset' | 'debt'
  /**
   * 6 maandwaarden (oudste → nieuwste). Optioneel: bij `undefined` of <2
   * punten rendert de overlay alleen tinted zones zonder breuklijn (rechte
   * scheiding op het midden).
   */
  sparklineValues?: number[]
  /**
   * Wanneer de kaart in beeld is (via `useInViewAnimation`) faden de
   * elementen in. Standaard `true` zodat dit component bruikbaar is in
   * contexten zonder eigen animatie-hook.
   */
  hasEntered?: boolean
}

/**
 * Achtergrond-overlay voor de Kern-categoriekaarten en individuele
 * bezitting/schuld-kaarten: twee getinte zones gescheiden door een
 * sparkline ("breuklijn") in `var(--paper)`.
 *
 * - Bovenzone en onderzone gebruiken hex-waarden uit `useCategoryTints()`
 *   (instelbaar in /identity/instellingen) gemixed met papier via
 *   `color-mix()` op vaste percentages (zie `CATEGORY_TINT_PERCENTS`).
 * - Bij ontbrekende of vlakke sparkline-data scheiden de zones op het
 *   verticale midden van de kaart — geen breuklijn maar wel de tweelagentint.
 *
 * Gebruik: render dit component als eerste kind in een `relative`-positioned
 * kaart-container; alle navolgende inhoud moet `relative z-10` zijn om
 * boven de overlay te tekenen.
 */
export function CardTintOverlay({
  variant,
  sparklineValues,
  hasEntered = true,
}: CardTintOverlayProps) {
  const [tints] = useCategoryTints()
  const [percents] = useCategoryTintPercents()

  const aboveHex = variant === 'asset' ? tints.assetAbove : tints.debtAbove
  const belowHex = variant === 'asset' ? tints.assetBelow : tints.debtBelow
  const abovePct = variant === 'asset' ? percents.assetAbove : percents.debtAbove
  const belowPct = variant === 'asset' ? percents.assetBelow : percents.debtBelow
  const tintAbove = `color-mix(in oklch, ${aboveHex} ${abovePct}%, var(--paper))`
  const tintBelow = `color-mix(in oklch, ${belowHex} ${belowPct}%, var(--paper))`

  // Bouw de drie path-strings: stroke-pad voor de breuklijn, plus
  // gevulde regio's boven en onder de lijn die de hele viewBox afdekken.
  const paths = useMemo(() => {
    const centerY = 20
    const amplitude = 14
    const xMax = 100
    const yMax = 40

    if (!sparklineValues || sparklineValues.length < 2) {
      // Geen historie — rechte breuklijn op het midden van de kaart.
      // We tekenen de stroke wel: ook zonder variatie hoort de
      // tweelagentint visueel gescheiden te worden door een papier-
      // kleurige lijn (kaart-DNA, niet alleen "data-driven").
      const flatLine = `M 0,${centerY} L ${xMax},${centerY}`
      const aboveFill = `M 0,0 L ${xMax},0 L ${xMax},${centerY} L 0,${centerY} Z`
      const belowFill = `M 0,${yMax} L ${xMax},${yMax} L ${xMax},${centerY} L 0,${centerY} Z`
      return { line: flatLine, aboveFill, belowFill, drawLine: true }
    }

    const n = sparklineValues.length
    const min = Math.min(...sparklineValues)
    const max = Math.max(...sparklineValues)
    const range = max - min
    const points = sparklineValues.map((v, i) => {
      const x = (i / (n - 1)) * xMax
      const norm = range === 0 ? 0 : (v - min) / range - 0.5
      const y = centerY - norm * amplitude
      return { x, y }
    })
    const pointsStr = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L ')
    const line = `M ${pointsStr}`
    const aboveFill = `M 0,0 L 0,${points[0].y.toFixed(2)} L ${pointsStr} L ${xMax},0 Z`
    const belowFill = `M 0,${yMax} L 0,${points[0].y.toFixed(2)} L ${pointsStr} L ${xMax},${yMax} Z`
    // Bij range=0 valt de lijn samen met de horizontale middenlijn —
    // teken hem dan toch als subtiele markering.
    return { line, aboveFill, belowFill, drawLine: true }
  }, [sparklineValues])

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <path d={paths.aboveFill} fill={tintAbove} stroke="none" />
      <path d={paths.belowFill} fill={tintBelow} stroke="none" />
      {paths.drawLine && (
        <path
          d={paths.line}
          fill="none"
          stroke="var(--paper)"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{
            strokeWidth: 6,
            opacity: hasEntered ? 1 : 0,
            transition: 'opacity 600ms ease-out',
          }}
        />
      )}
    </svg>
  )
}
