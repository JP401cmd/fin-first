'use client'

import { WidgetShell } from './widget-shell'
import { formatCurrency } from '@/lib/format'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { WidgetSize } from '@/lib/widget-catalog'

interface FavBudget {
  id: string
  name: string
  icon: string
  budgetType: string
  limit: number
  spent: number
}

export function BudgetFavWidget({ size, budget }: { size: WidgetSize; budget: FavBudget }) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })
  const pct = budget.limit > 0 ? Math.min(budget.spent / budget.limit, 1) : 0
  const isOver = budget.spent > budget.limit && budget.limit > 0
  const cssType = budget.budgetType === 'archive' ? 'other' : budget.budgetType

  const remaining = Math.max(budget.limit - budget.spent, 0)
  const today = new Date()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - today.getDate()

  const daysPassed = today.getDate()
  const dailyAvg = daysPassed > 0 ? budget.spent / daysPassed : 0
  const remainingPerDay = daysLeft > 0 ? remaining / daysLeft : 0

  // Ring dimensions: quarter=110, half=150, full=180
  const ringSize = size === 'full' ? 180 : size === 'half' ? 150 : 110
  const cx = ringSize / 2, cy = ringSize / 2
  const r = size === 'full' ? 72 : size === 'half' ? 60 : 44
  const sw = size === 'full' ? 10 : size === 'half' ? 9 : 7
  const circ = 2 * Math.PI * r
  const trackColor = `color-mix(in srgb, var(--color-${cssType}-300) 35%, transparent)`
  const fillColor = isOver ? '#ef4444' : `var(--color-${cssType}-500)`

  if (size === 'full') {
    return (
      <WidgetShell module="kern" size={size} kicker={budget.name} href={`/core/budgets?budget=${budget.id}`} kickerPosition="left">
        <div ref={ref} className="flex gap-6 items-start">
          {/* Large ring chart 180x180 */}
          <div className="relative shrink-0">
            <svg width={180} height={180}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
              <circle
                cx={cx} cy={cy} r={r} fill="none" stroke={fillColor} strokeWidth={sw}
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={hasEntered ? circ * (1 - pct) : circ}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: hasEntered ? 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)' : 'none' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className={`font-mono text-3xl font-semibold tabular-nums leading-tight ${isOver ? 'text-red-600' : 'text-[var(--ink)]'}`}>
                {Math.round(pct * 100)}%
              </p>
              <p className="font-mono text-xs text-[var(--ink-2)] tabular-nums leading-normal mt-1">
                {formatCurrency(budget.spent)}
              </p>
              <p className="font-mono text-[10px] text-[var(--ink-4)] tabular-nums leading-normal">
                van {formatCurrency(budget.limit)}
              </p>
            </div>
          </div>

          {/* Detailed info */}
          <div className="flex-1 min-w-0 space-y-3 pt-1">
            {/* Status */}
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              isOver
                ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
            }`}>
              {isOver ? '⚠️ Over budget' : '✅ Op schema'}
            </div>

            {/* Spent vs limit */}
            <div>
              <p className="text-[10px] text-[var(--ink-3)] uppercase tracking-wide">Deze maand</p>
              <p className="font-mono text-sm tabular-nums text-[var(--ink)]">
                {formatCurrency(budget.spent)} <span className="text-[var(--ink-4)]">van {formatCurrency(budget.limit)}</span>
              </p>
            </div>

            {/* Progress bar */}
            <div className="h-2 rounded-full overflow-hidden" style={{ background: trackColor }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(pct * 100, 100)}%`,
                  background: fillColor,
                }}
              />
            </div>

            {/* Daily averages */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-[var(--ink-3)] uppercase tracking-wide">Gem. per dag</p>
                <p className="font-mono text-sm tabular-nums text-[var(--ink)]">
                  {formatCurrency(dailyAvg)}<span className="text-[var(--ink-4)]">/dag</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--ink-3)] uppercase tracking-wide">Nog beschikbaar</p>
                <p className={`font-mono text-sm tabular-nums ${isOver ? 'text-red-600' : 'text-emerald-600'}`}>
                  {isOver ? '€ 0' : formatCurrency(remainingPerDay)}<span className="text-[var(--ink-4)]">/dag</span>
                </p>
              </div>
            </div>

            {/* Remaining + days left */}
            <div className="flex items-baseline justify-between border-t border-[var(--border-ed)] pt-2">
              <p className={`font-mono text-xs tabular-nums ${isOver ? 'text-red-600' : 'text-emerald-600'}`}>
                {isOver
                  ? `${formatCurrency(budget.spent - budget.limit)} over budget`
                  : `${formatCurrency(remaining)} over`}
              </p>
              <p className="text-[10px] text-[var(--ink-4)]">
                nog {daysLeft} {daysLeft === 1 ? 'dag' : 'dagen'}
              </p>
            </div>
          </div>
        </div>
      </WidgetShell>
    )
  }

  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker={budget.name} href={`/core/budgets?budget=${budget.id}`} kickerPosition="left">
        <div ref={ref} className="flex gap-4 items-start">
          {/* Larger ring */}
          <div className="relative shrink-0">
            <svg width={ringSize} height={ringSize}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
              <circle
                cx={cx} cy={cy} r={r} fill="none" stroke={fillColor} strokeWidth={sw}
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={hasEntered ? circ * (1 - pct) : circ}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: hasEntered ? 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)' : 'none' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className={`font-mono text-2xl font-semibold tabular-nums leading-tight ${isOver ? 'text-red-600' : 'text-[var(--ink)]'}`}>
                {Math.round(pct * 100)}%
              </p>
              <p className="font-mono text-[10px] text-[var(--ink-3)] tabular-nums leading-normal mt-0.5">
                besteed
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-2 pt-1">
            <div>
              <p className="text-[10px] text-[var(--ink-3)] uppercase tracking-wide">Deze maand</p>
              <p className="font-mono text-sm tabular-nums text-[var(--ink)]">
                {formatCurrency(budget.spent)} <span className="text-[var(--ink-4)]">van {formatCurrency(budget.limit)}</span>
              </p>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: trackColor }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(pct * 100, 100)}%`,
                  background: fillColor,
                }}
              />
            </div>

            <div>
              <p className={`font-mono text-xs tabular-nums ${isOver ? 'text-red-600' : 'text-emerald-600'}`}>
                {isOver
                  ? `${formatCurrency(budget.spent - budget.limit)} over budget`
                  : `${formatCurrency(remaining)} over`}
              </p>
              <p className="text-[10px] text-[var(--ink-4)]">
                nog {daysLeft} {daysLeft === 1 ? 'dag' : 'dagen'}
              </p>
            </div>

            {!isOver && remaining > 0 && daysLeft > 0 && (
              <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
                ≈ {formatCurrency(remaining / daysLeft)}/dag beschikbaar
              </p>
            )}
          </div>
        </div>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="kern" size={size} kicker={budget.name} href={`/core/budgets?budget=${budget.id}`} kickerPosition="left">
      <div ref={ref} className="flex items-center justify-center h-full">
        <div className="relative shrink-0">
          <svg width={ringSize} height={ringSize}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
            <circle
              cx={cx} cy={cy} r={r} fill="none" stroke={fillColor} strokeWidth={sw}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={hasEntered ? circ * (1 - pct) : circ}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: hasEntered ? 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)' : 'none' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className={`font-mono text-lg font-semibold tabular-nums leading-tight ${isOver ? 'text-red-600' : 'text-[var(--ink)]'}`}>
              {Math.round(pct * 100)}%
            </p>
            <p className="font-mono text-[9px] text-[var(--ink-3)] tabular-nums leading-normal mt-0.5 text-center">
              {formatCurrency(budget.spent)}
              <br />
              <span className="text-[var(--ink-4)]">/ {formatCurrency(budget.limit)}</span>
            </p>
          </div>
        </div>
      </div>
    </WidgetShell>
  )
}
