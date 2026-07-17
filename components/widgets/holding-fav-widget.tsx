'use client'

import { memo, type ReactNode } from 'react'
import { WidgetShell } from './widget-shell'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { FavoriteHolding } from './widget-renderer'

/** Truncate display label to max N characters */
function displayLabel(holding: FavoriteHolding, max = 6): string {
  const label = holding.ticker || holding.name
  return label.length > max ? label.slice(0, max) : label
}

/** Korte NL-datum voor de koers-actualiteit (bv. "4 mei"), null bij ontbrekende datum */
function formatPriceDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

/** Aantal hele dagen sinds de laatste koersupdate (null bij ontbrekende datum) */
function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

/* ── Donut Ring SVG ── */
function ReturnRing({
  pct,
  hasEntered,
  diameter = 110,
  strokeWidth = 8,
  fontSize = 14,
}: {
  pct: number
  hasEntered: boolean
  diameter?: number
  strokeWidth?: number
  fontSize?: number
}) {
  const r = (diameter - strokeWidth) / 2
  const c = diameter / 2
  const circumference = 2 * Math.PI * r
  const clampedPct = Math.min(100, Math.max(-100, Math.abs(pct)))
  const dashOffset = circumference - (clampedPct / 100) * circumference
  const isPositive = pct >= 0
  const ringColor = isPositive ? 'var(--positive)' : 'var(--negative)'
  const ariaLabel = `Rendement ${isPositive ? '+' : ''}${pct.toFixed(1)}%`

  return (
    <svg
      width={diameter}
      height={diameter}
      viewBox={`0 0 ${diameter} ${diameter}`}
      className="shrink-0"
      role="img"
      aria-label={ariaLabel}
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border-ed)" strokeWidth={strokeWidth} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={ringColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        pathLength={1}
        style={{
          transform: 'rotate(-90deg)',
          transformOrigin: '50% 50%',
          transition: 'stroke-dashoffset 800ms ease-out',
          strokeDasharray: `${circumference}`,
          strokeDashoffset: hasEntered ? `${dashOffset}` : `${circumference}`,
        }}
      />
      <text
        x={c}
        y={c}
        textAnchor="middle"
        dominantBaseline="central"
        className="font-mono tabular-nums"
        style={{ fontSize: `${fontSize}px`, fontWeight: 600, fill: ringColor }}
      >
        {isPositive ? '+' : ''}{pct.toFixed(1)}%
      </text>
    </svg>
  )
}

/* ── KPI cell for full/xl layout ── */
function KpiCell({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-[var(--ink-3)] leading-none">{label}</span>
      <span className={`font-mono text-[12px] font-semibold tabular-nums leading-none ${color || 'text-[var(--ink)]'}`}>
        {value}
      </span>
    </div>
  )
}

export const HoldingFavWidget = memo(function HoldingFavWidget({
  size,
  holding,
  dailyExp,
}: {
  size: WidgetSize
  holding: FavoriteHolding
  /** Canoniek dagtarief (€/dag) uit de bundel — voedt de vrijheidstijd-regel. */
  dailyExp?: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 400 })
  const isPositive = holding.dailyChangePct >= 0
  const changeSign = isPositive ? '+' : ''
  const returnPositive = holding.returnPct >= 0
  const returnAmount = holding.totalValue - holding.totalCost
  const dailyChangeAmount = holding.totalValue * (holding.dailyChangePct / 100)

  // Vrijheidstijd-equivalent van de positiewaarde ("Geld is opgeslagen tijd").
  // Consume-don't-recompute: dagtarief komt uit de bundel, niet lokaal berekend.
  const freedomStr =
    dailyExp && dailyExp > 0 && holding.totalValue > 0
      ? formatFreedomTimeString(calculateFreedomTime(holding.totalValue, dailyExp), 'short')
      : null

  const priceDate = formatPriceDate(holding.lastPriceUpdate)
  const isStale = (daysSince(holding.lastPriceUpdate) ?? 0) > 5

  /* ── XL (Double): brede positiekaart — ring links, koers + KPI-strip rechts ── */
  if (size === 'xl') {
    return (
      <WidgetShell module="kern" size={size} kicker={holding.name} href={`/core/assets/holdings/${holding.id}`}>
        <div
          ref={ref}
          className="flex h-full items-stretch gap-6"
          style={{
            opacity: hasEntered ? 1 : 0,
            transform: hasEntered ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 400ms ease-out, transform 400ms ease-out',
          }}
        >
          {/* Links: grote rendement-ring + label */}
          <div className="flex w-[38%] shrink-0 flex-col items-center justify-center gap-2 border-r border-dashed border-[var(--border-ed)] pr-6">
            <ReturnRing pct={holding.returnPct} hasEntered={hasEntered} diameter={140} strokeWidth={10} fontSize={20} />
            <p className="text-[11px] uppercase tracking-wide text-[var(--ink-3)]">Totaal rendement</p>
          </div>

          {/* Rechts: koers-header, waarde + vrijheidstijd, KPI-grid */}
          <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
            {/* Header: ticker + huidige koers + dagmutatie */}
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-2 min-w-0">
                {holding.ticker && (
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--ink-3)] shrink-0">
                    {holding.ticker}
                  </span>
                )}
                <span className="text-[var(--ink)]">
                  <MaskedAmount value={holding.currentPrice} tone="kern" className="text-xl font-semibold" />
                </span>
              </div>
              <span
                className={`font-mono text-sm tabular-nums shrink-0 ${
                  isPositive ? 'text-positive' : 'text-negative'
                }`}
              >
                dag {changeSign}{holding.dailyChangePct.toFixed(2)}%
              </span>
            </div>

            {/* Positiewaarde + vrijheidstijd */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Positiewaarde</p>
              <p className="text-[var(--ink)]">
                <MaskedAmount value={holding.totalValue} tone="kern" className="text-2xl font-semibold" />
              </p>
              {freedomStr && (
                <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
                  ≈ {freedomStr} vrijheid
                </p>
              )}
            </div>

            {/* KPI-grid — benut de volle breedte */}
            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
              <KpiCell label="Kostprijs" value={<MaskedAmount value={holding.totalCost} tone="kern" />} />
              <KpiCell
                label="Rendement"
                value={
                  returnPositive
                    ? <MaskedAmount value={returnAmount} signPrefix="+" tone="kern" />
                    : <MaskedAmount value={returnAmount} tone="kern" />
                }
                color={returnPositive ? 'text-positive' : 'text-negative'}
              />
              <KpiCell
                label="Dagverandering"
                value={
                  isPositive
                    ? <MaskedAmount value={dailyChangeAmount} signPrefix="+" tone="kern" />
                    : <MaskedAmount value={dailyChangeAmount} tone="kern" />
                }
                color={isPositive ? 'text-positive' : 'text-negative'}
              />
              <KpiCell label="Eenheden" value={holding.units.toLocaleString('nl-NL', { maximumFractionDigits: 4 })} />
              <KpiCell
                label="Totaal rendement"
                value={`${returnPositive ? '+' : ''}${holding.returnPct.toFixed(1)}%`}
                color={returnPositive ? 'text-positive' : 'text-negative'}
              />
              {priceDate && (
                <KpiCell
                  label="Koers bijgewerkt"
                  value={
                    <span className={isStale ? 'text-[var(--ink-4)]' : 'text-[var(--ink-2)]'}>
                      {priceDate}{isStale ? ' · verouderd' : ''}
                    </span>
                  }
                />
              )}
            </div>
          </div>
        </div>
      </WidgetShell>
    )
  }

  /* ── Full: koers-header + ring + KPI-strip ── */
  if (size === 'full') {
    return (
      <WidgetShell module="kern" size={size} kicker={holding.name} href={`/core/assets/holdings/${holding.id}`}>
        <div
          ref={ref}
          className="flex flex-col gap-2"
          style={{
            opacity: hasEntered ? 1 : 0,
            transform: hasEntered ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 400ms ease-out, transform 400ms ease-out',
          }}
        >
          {/* Header: ticker + current price + daily change */}
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              {holding.ticker && (
                <span className="text-[11px] font-medium text-[var(--ink-3)] uppercase tracking-wide">
                  {holding.ticker}
                </span>
              )}
              <span className="text-[var(--ink)]">
                <MaskedAmount value={holding.currentPrice} tone="kern" className="text-lg font-semibold" />
              </span>
            </div>
            <span
              className={`font-mono text-xs tabular-nums ${
                isPositive ? 'text-positive' : 'text-negative'
              }`}
            >
              {changeSign}{holding.dailyChangePct.toFixed(2)}%
            </span>
          </div>

          {/* Return ring centered */}
          <div className="flex justify-center">
            <ReturnRing pct={holding.returnPct} hasEntered={hasEntered} diameter={100} strokeWidth={7} fontSize={13} />
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-1">
            <KpiCell
              label="Totale waarde"
              value={<MaskedAmount value={holding.totalValue} tone="kern" />}
            />
            <KpiCell label="Kostprijs" value={<MaskedAmount value={holding.totalCost} tone="kern" />} />
            <KpiCell
              label="Rendement"
              value={
                returnPositive
                  ? <MaskedAmount value={returnAmount} signPrefix="+" tone="kern" />
                  : <MaskedAmount value={returnAmount} tone="kern" />
              }
              color={returnPositive ? 'text-positive' : 'text-negative'}
            />
            <KpiCell
              label="Dagverandering"
              value={
                isPositive
                  ? <MaskedAmount value={dailyChangeAmount} signPrefix="+" tone="kern" />
                  : <MaskedAmount value={dailyChangeAmount} tone="kern" />
              }
              color={isPositive ? 'text-positive' : 'text-negative'}
            />
            <KpiCell label="Eenheden" value={holding.units.toLocaleString('nl-NL', { maximumFractionDigits: 4 })} />
            <KpiCell
              label="Totaal rendement"
              value={`${returnPositive ? '+' : ''}${holding.returnPct.toFixed(1)}%`}
              color={returnPositive ? 'text-positive' : 'text-negative'}
            />
          </div>

          {/* Vrijheidstijd op de positiewaarde */}
          {freedomStr && (
            <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
              Positiewaarde ≈ {freedomStr} vrijheid
            </p>
          )}
        </div>
      </WidgetShell>
    )
  }

  /* ── Half: ring links + details rechts ── */
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker={holding.name} href={`/core/assets/holdings/${holding.id}`}>
        <div
          ref={ref}
          className="flex items-center gap-3"
          style={{
            opacity: hasEntered ? 1 : 0,
            transform: hasEntered ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 400ms ease-out, transform 400ms ease-out',
          }}
        >
          {/* Left: compact ring */}
          <ReturnRing pct={holding.returnPct} hasEntered={hasEntered} diameter={80} strokeWidth={6} fontSize={11} />

          {/* Right: details */}
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            {holding.ticker && (
              <p className="text-[11px] font-medium text-[var(--ink-3)] uppercase tracking-wide leading-none">
                {holding.ticker}
              </p>
            )}
            <p className="text-[var(--ink)] leading-none">
              <MaskedAmount value={holding.totalValue} tone="kern" className="text-[15px] font-semibold" />
            </p>
            {freedomStr && (
              <p className="font-serif italic text-[10px] text-[var(--ink-3)] leading-none truncate">
                ≈ {freedomStr} vrijheid
              </p>
            )}
            <p className="text-[var(--ink-3)] leading-none">
              Kosten <MaskedAmount value={holding.totalCost} tone="kern" className="text-[11px]" />
            </p>
            <div className="flex items-center gap-2">
              <span className={`leading-none ${returnPositive ? 'text-positive' : 'text-negative'}`}>
                {returnPositive
                  ? <MaskedAmount value={returnAmount} signPrefix="+" tone="kern" className="text-[11px]" />
                  : <MaskedAmount value={returnAmount} tone="kern" className="text-[11px]" />
                }
              </span>
              <span
                className={`font-mono text-[11px] tabular-nums leading-none ${
                  isPositive ? 'text-positive' : 'text-negative'
                }`}
              >
                dag {changeSign}{holding.dailyChangePct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </WidgetShell>
    )
  }

  /* ── Quarter: naam + ticker + rendement-ring + waarde ── */
  if (size === 'quarter') {
    const label = holding.ticker || holding.name
    return (
      <WidgetShell module="kern" size={size} kicker={label} href={`/core/assets/holdings/${holding.id}`}>
        <div
          ref={ref}
          className="flex flex-col items-center gap-1"
          style={{
            opacity: hasEntered ? 1 : 0,
            transform: hasEntered ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 400ms ease-out, transform 400ms ease-out',
          }}
        >
          {/* Kleinste tegel → kleinste ring (schaal full > half > quarter) */}
          <ReturnRing pct={holding.returnPct} hasEntered={hasEntered} diameter={70} strokeWidth={6} fontSize={11} />
          <p className="text-[var(--ink)] leading-none">
            <MaskedAmount value={holding.totalValue} tone="kern" className="text-[13px] font-semibold" />
          </p>
        </div>
      </WidgetShell>
    )
  }

  /* ── Mini / fallback ── */
  return (
    <WidgetShell module="kern" size={size} kicker={displayLabel(holding)} href={`/core/assets/holdings/${holding.id}`}>
      <div
        ref={ref}
        className="flex items-center justify-between gap-2"
        style={{
          opacity: hasEntered ? 1 : 0,
          transform: hasEntered ? 'translateY(0)' : 'translateY(4px)',
          transition: 'opacity 400ms ease-out, transform 400ms ease-out',
        }}
      >
        <p className="leading-none text-[var(--ink)] truncate">
          <MaskedAmount value={holding.currentPrice} tone="kern" className="text-[15px] font-semibold" />
        </p>
        <span
          className={`font-mono text-xs tabular-nums leading-none whitespace-nowrap ${
            isPositive ? 'text-positive' : 'text-negative'
          }`}
        >
          {changeSign}{holding.dailyChangePct.toFixed(1)}%
        </span>
      </div>
    </WidgetShell>
  )
})
