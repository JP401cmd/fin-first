'use client'

import { useId, useMemo } from 'react'
import { useCategoryTints, useCategoryTintPercents } from '@/lib/category-tints'

interface CardTintOverlayProps {
  /** Bezitting → groen-paar; schuld → amber-paar. */
  variant: 'asset' | 'debt'
  /**
   * Tot 12 maandwaarden (oudste → nieuwste). Variabele lengte: bij
   * categorieën/entities die korter dan 12 maanden geleden begonnen te
   * meten knipt de loader het venster af op de eerste meting. Bij
   * `undefined` of <2 punten rendert de overlay alleen tinted zones zonder
   * breuklijn (rechte scheiding op het midden).
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
 * bezitting/schuld-kaarten: een bergsilhouet (onderste helft) op een
 * paper-achtergrond, met diagonale drop-shadow op het sky-vlak erboven.
 *
 * - Sky-vlak gebruikt `tintAbove` (subtiel papier-tint, "wand").
 * - Bergmassa gebruikt `tintBelow`; toppen reflecteren `sparklineValues`
 *   (tot 12-maand-historie) zodat elke categorie een uniek silhouet krijgt.
 * - Schaduw projecteert diagonaal rechtsboven (licht van linksonder),
 *   geblurd via SVG `<filter>`. Diagonale richting is essentieel voor
 *   het 3D-effect.
 * - Bij ontbrekende of vlakke data: vlakke berg op halve hoogte —
 *   behoudt de visuele taal zonder dataclaim.
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
  const rawId = useId()
  // useId() bevat ':' wat in oudere Safari sneuvelt in url(#...) referenties.
  const filterId = `mountain-shadow-${rawId.replace(/:/g, '')}`

  const aboveHex = variant === 'asset' ? tints.assetAbove : tints.debtAbove
  const belowHex = variant === 'asset' ? tints.assetBelow : tints.debtBelow
  const abovePct = variant === 'asset' ? percents.assetAbove : percents.debtAbove
  const belowPct = variant === 'asset' ? percents.assetBelow : percents.debtBelow
  const tintAbove = `color-mix(in oklch, ${aboveHex} ${abovePct}%, var(--paper))`
  const tintBelow = `color-mix(in oklch, ${belowHex} ${belowPct}%, var(--paper))`

  // Bouw twee path-strings: sky-vlak (volledige viewBox) en bergsilhouet
  // (gesloten naar viewBox-bodem). Schaduw hergebruikt het bergpad.
  const paths = useMemo(() => {
    const centerY = 20
    const amplitude = 14
    const xMax = 100
    const yMax = 40

    const skyFill = `M 0,0 L ${xMax},0 L ${xMax},${yMax} L 0,${yMax} Z`

    const buildMountain = (pts: { x: number; y: number }[]) => {
      const pointsStr = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L ')
      // Sluit langs de viewBox-bodem zodat de berg een gesloten massa is.
      return `M ${pointsStr} L ${xMax},${yMax} L 0,${yMax} Z`
    }

    if (!sparklineValues || sparklineValues.length < 2) {
      const flat = [
        { x: 0, y: centerY },
        { x: xMax, y: centerY },
      ]
      return { skyFill, mountainFill: buildMountain(flat) }
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
    return { skyFill, mountainFill: buildMountain(points) }
  }, [sparklineValues])

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.76" />
          <feOffset dx="1.26" dy="-1.58" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.41" />
          </feComponentTransfer>
        </filter>
      </defs>
      <path d={paths.skyFill} fill={tintAbove} stroke="none" />
      <g
        style={{
          opacity: hasEntered ? 1 : 0,
          transition: 'opacity 600ms ease-out',
        }}
      >
        <path
          d={paths.mountainFill}
          fill="var(--ink)"
          fillOpacity={0.18}
          stroke="none"
          filter={`url(#${filterId})`}
        />
        <path d={paths.mountainFill} fill={tintBelow} stroke="none" />
      </g>
    </svg>
  )
}
