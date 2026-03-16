'use client'

import { WidgetShell } from './widget-shell'
import { formatCurrency } from '@/lib/format'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { FavoriteHolding } from './widget-renderer'

/** Truncate display label to max 6 characters */
function displayLabel(holding: FavoriteHolding): string {
  const label = holding.ticker || holding.name
  return label.length > 6 ? label.slice(0, 6) : label
}

export function HoldingFavWidget({ size, holding }: { size: WidgetSize; holding: FavoriteHolding }) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 400 })
  const isPositive = holding.dailyChangePct >= 0
  const changeSign = isPositive ? '+' : ''

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
        <p className="font-mono text-[15px] font-semibold tabular-nums leading-none text-[var(--ink)] truncate">
          {formatCurrency(holding.currentPrice)}
        </p>
        <span
          className={`font-mono text-xs tabular-nums leading-none whitespace-nowrap ${
            isPositive ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {changeSign}{holding.dailyChangePct.toFixed(1)}%
        </span>
      </div>
    </WidgetShell>
  )
}
