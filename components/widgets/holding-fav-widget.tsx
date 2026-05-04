'use client'

import { memo, type ReactNode } from 'react'
import { WidgetShell } from './widget-shell'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { FavoriteHolding } from './widget-renderer'

/** Truncate display label to max N characters */
function displayLabel(holding: FavoriteHolding, max = 6): string {
  const label = holding.ticker || holding.name
  return label.length > max ? label.slice(0, max) : label
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

  return (
    <svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`} className="shrink-0">
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

/* ── KPI cell for full layout ── */
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

export const HoldingFavWidget = memo(function HoldingFavWidget({ size, holding }: { size: WidgetSize; holding: FavoriteHolding }) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 400 })
  const isPositive = holding.dailyChangePct >= 0
  const changeSign = isPositive ? '+' : ''
  const returnPositive = holding.returnPct >= 0
  const returnAmount = holding.totalValue - holding.totalCost
  const dailyChangeAmount = holding.totalValue * (holding.dailyChangePct / 100)

  /* ── Full: sparkline area + KPI strip ── */
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
            <KpiCell label="Totale waarde" value={<MaskedAmount value={holding.totalValue} tone="kern" />} />
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
          <ReturnRing pct={holding.returnPct} hasEntered={hasEntered} />
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
