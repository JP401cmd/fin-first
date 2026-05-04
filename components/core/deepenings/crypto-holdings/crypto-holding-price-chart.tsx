'use client'

// crypto-holding-price-chart.tsx — koers-evolutie voor één crypto-holding op
// de detail-pagina (`/core/assets/crypto/[holdingId]`). Mirror van de
// portfolio performance-chart, met twee verschillen:
//
//   1. We tonen prijs-per-eenheid (geen EUR-waarde van de positie). Dat
//      maakt de DCA-lijn (gemiddelde aankoopprijs) zinvol — die zit immers
//      ook op prijs-niveau, niet op portefeuille-niveau.
//   2. Er ligt een horizontale gestippelde referentielijn op de gemiddelde
//      aankoopprijs (`avg_purchase_price`). Snijpunten zijn de momenten
//      waarop de huidige koers boven of onder break-even passeert — visueel
//      duidelijk zonder kruisarcering nodig.
//
// Krant-esthetiek (UX-skill):
//   - Kicker boven de chart in `text-[10px] uppercase tracking-[0.08em]`
//   - Geen kaart-rand — alleen subtiele baseline + gestippelde DCA-lijn in
//     `text-[var(--ink-3)]` (subtiel, niet dominant)
//   - SVG-pad met `pathLength={1}` + draw-in animatie via `useInViewAnimation`
//   - Drie X-as labels (start / midden / eind) in krant-datum-stijl

import { useMemo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { CryptoHoldingPricePoint } from '@/lib/crypto-holdings-data'

interface CryptoHoldingPriceChartProps {
  /**
   * Chronologisch (oud → nieuw) gesorteerde prijs-snapshots van deze holding.
   * Lege of singleton arrays leiden tot een placeholder.
   */
  points: CryptoHoldingPricePoint[]
  /**
   * Gemiddelde aankoopprijs in EUR (kan NULL zijn — dan toont de chart geen
   * DCA-lijn maar wel de prijs-evolutie).
   */
  avgPurchasePrice: number | null
  /** Symbool voor screenreader-beschrijving (BTC, ETH, …). */
  symbol: string
  /** Periode-label voor de kicker. */
  daysBack?: number
}

export function CryptoHoldingPriceChart({
  points,
  avgPurchasePrice,
  symbol,
  daysBack = 90,
}: CryptoHoldingPriceChartProps) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  const stats = useMemo(() => {
    if (points.length < 2) return null
    let min = Infinity
    let max = -Infinity
    for (const p of points) {
      if (p.close < min) min = p.close
      if (p.close > max) max = p.close
    }
    // DCA-lijn moet ook in de Y-range vallen, anders snijdt de chart hem af
    // en lijkt break-even buiten beeld te liggen.
    if (avgPurchasePrice != null && avgPurchasePrice > 0) {
      if (avgPurchasePrice < min) min = avgPurchasePrice
      if (avgPurchasePrice > max) max = avgPurchasePrice
    }
    const first = points[0]
    const last = points[points.length - 1]
    const deltaPct =
      first.close > 0 ? ((last.close - first.close) / first.close) * 100 : null
    return { first, last, min, max, deltaPct }
  }, [points, avgPurchasePrice])

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          Koers-evolutie · {daysBack} dagen
        </p>
        {stats?.deltaPct != null && (
          <p
            className={`font-mono text-[12px] tabular-nums ${
              stats.deltaPct >= 0 ? 'text-positive' : 'text-negative'
            }`}
          >
            {stats.deltaPct >= 0 ? '+' : ''}
            {stats.deltaPct.toFixed(1)}%
          </p>
        )}
      </div>

      {!stats ? (
        <PriceChartPlaceholder />
      ) : (
        <PriceLine
          points={points}
          min={stats.min}
          max={stats.max}
          avgPurchasePrice={avgPurchasePrice}
          deltaPositive={(stats.deltaPct ?? 0) >= 0}
          symbol={symbol}
        />
      )}

      {/* Onderschrift: DCA-prijs in DM Mono — geeft context aan de
          gestippelde lijn zonder hover-tooltip. */}
      {stats && avgPurchasePrice != null && avgPurchasePrice > 0 && (
        <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.06em] text-[var(--ink-4)]">
          <span
            aria-hidden="true"
            className="inline-block h-[1px] w-3 border-t border-dashed border-[var(--ink-3)]"
          />
          <span>
            Gem. aankoopprijs ·{' '}
            <span className="font-mono tabular-nums text-[var(--ink-3)]">
              {fc(avgPurchasePrice)}
            </span>
          </span>
        </p>
      )}
    </section>
  )
}

interface PriceLineProps {
  points: CryptoHoldingPricePoint[]
  min: number
  max: number
  avgPurchasePrice: number | null
  deltaPositive: boolean
  symbol: string
}

function PriceLine({
  points,
  min,
  max,
  avgPurchasePrice,
  deltaPositive,
  symbol,
}: PriceLineProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 900 })
  const width = 600
  const height = 160
  const padX = 8
  const padY = 14

  const range = max - min
  const safeRange = range < 0.0001 ? 1 : range

  const xStep = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0
  const path = points
    .map((p, i) => {
      const x = padX + i * xStep
      const y = padY + ((max - p.close) / safeRange) * (height - padY * 2)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')

  // DCA-lijn: horizontale gestippelde lijn op `avgPurchasePrice` — alleen
  // tekenen als de prijs in de Y-range valt en > 0 is.
  const dcaY =
    avgPurchasePrice != null && avgPurchasePrice > 0
      ? padY + ((max - avgPurchasePrice) / safeRange) * (height - padY * 2)
      : null

  const firstLabel = formatShortDate(points[0].date)
  const lastLabel = formatShortDate(points[points.length - 1].date)
  const midLabel = formatShortDate(points[Math.floor(points.length / 2)].date)

  const stroke = deltaPositive
    ? 'oklch(0.50 0.09 162)' // var(--positive)
    : 'oklch(0.50 0.09 25)' // var(--negative)

  return (
    <div ref={ref} className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Koers-evolutie van ${symbol} met gemiddelde aankoopprijs als referentie`}
        className="h-[160px] w-full"
      >
        {/* Subtiele baseline op het minimum */}
        <line
          x1={padX}
          x2={width - padX}
          y1={height - padY}
          y2={height - padY}
          stroke="var(--border-ed)"
          strokeWidth="1"
        />
        {/* DCA-lijn — gestippeld in --ink-3, ligt onder de prijslijn zodat
            snijpunten visueel doorlopen. Renderen vóór het pad zodat de
            kleurintensiteit van de prijslijn dominant blijft. */}
        {dcaY != null && (
          <line
            x1={padX}
            x2={width - padX}
            y1={dcaY}
            y2={dcaY}
            stroke="var(--ink-3)"
            strokeWidth="1"
            strokeDasharray="4 3"
            opacity={0.7}
          />
        )}
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={hasEntered ? 0 : 1}
          style={{
            transition: hasEntered
              ? 'stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)'
              : 'none',
          }}
        />
      </svg>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.06em] text-[var(--ink-4)]">
        <span>{firstLabel}</span>
        <span>{midLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  )
}

function PriceChartPlaceholder() {
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-4 py-6 text-center">
      <p className="font-serif italic text-sm text-[var(--ink-2)]">
        Koers-historie bouwt nog op. Zodra er meerdere dagen aan snapshots
        beschikbaar zijn verschijnt hier de prijs-evolutie.
      </p>
    </div>
  )
}

function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}
