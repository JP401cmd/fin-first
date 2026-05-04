'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { MaskedAmount } from '@/components/app/masked-amount'
import { isOverPositive, computeBarSegments, type BudgetType } from '@/components/app/budget-shared'
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

export const BudgetFavWidget = memo(function BudgetFavWidget({ size, budget }: { size: WidgetSize; budget: FavBudget }) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })
  const pct = budget.limit > 0 ? Math.min(budget.spent / budget.limit, 1) : 0
  const isOver = budget.spent > budget.limit && budget.limit > 0
  const overPositive = isOver && isOverPositive(budget.budgetType as BudgetType)
  const cssType = budget.budgetType === 'archive' ? 'other' : budget.budgetType

  const remaining = Math.max(budget.limit - budget.spent, 0)
  const today = new Date()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - today.getDate()

  const daysPassed = today.getDate()
  const dailyAvg = daysPassed > 0 ? budget.spent / daysPassed : 0
  const remainingPerDay = daysLeft > 0 ? remaining / daysLeft : 0

  // Ring dimensions: quarter=110, half=80 (compact for 1-row height), full=130
  const ringSize = size === 'full' ? 130 : size === 'half' ? 80 : 110
  const cx = ringSize / 2, cy = ringSize / 2
  const r = size === 'full' ? 52 : size === 'half' ? 32 : 44
  const sw = size === 'full' ? 9 : size === 'half' ? 6 : 7
  const circ = 2 * Math.PI * r
  const trackColor = 'var(--subtle)'
  const fillColor = isOver ? (overPositive ? 'var(--positive)' : 'var(--negative)') : `var(--color-${cssType}-500)`
  const barSeg = computeBarSegments(budget.spent, budget.limit, 80, { barHex: `var(--color-${cssType}-400)`, barHexWarn: `var(--color-${cssType}-600)` }, overPositive)

  // ── Mini: compact spent / limit ──
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker={budget.name} href={`/core/budgets?budget=${budget.id}`}>
        <p className={`leading-none truncate ${isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink)]'}`}>
          <MaskedAmount value={budget.spent} tone="kern" className="text-[15px] font-semibold" /> / <MaskedAmount value={budget.limit} tone="kern" className="text-[15px] font-semibold" />
        </p>
      </WidgetShell>
    )
  }

  // ── Full: vertical layout — ring on top, details below ──
  if (size === 'full') {
    return (
      <WidgetShell module="kern" size={size} kicker={budget.name} href={`/core/budgets?budget=${budget.id}`} kickerPosition="left">
        <div ref={ref} className="flex flex-col items-center gap-3">
          {/* Ring chart centered */}
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
              <p className={`font-mono text-2xl font-semibold tabular-nums leading-tight ${isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink)]'}`}>
                {Math.round(pct * 100)}%
              </p>
              <p className="text-[var(--ink-4)] leading-normal">
                van <MaskedAmount value={budget.limit} tone="kern" className="text-[10px]" />
              </p>
            </div>
          </div>

          {/* Details stacked below ring */}
          <div className="w-full space-y-2">
            {/* Status badge */}
            <div className="flex justify-center">
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isOver
                  ? (overPositive
                    ? 'bg-[color-mix(in_oklab,var(--positive)_10%,transparent)] text-[var(--positive)]'
                    : 'bg-[color-mix(in_oklab,var(--negative)_10%,transparent)] text-[var(--negative)]')
                  : 'bg-[color-mix(in_oklab,var(--positive)_10%,transparent)] text-[var(--positive)]'
              }`}>
                {isOver ? (overPositive ? 'Doel bereikt' : 'Over budget') : 'Op schema'}
              </div>
            </div>

            {/* Spent vs limit */}
            <div className="text-center">
              <p className="text-[var(--ink)]">
                <MaskedAmount value={budget.spent} tone="kern" className="text-sm" /> <span className="text-[var(--ink-4)]">van <MaskedAmount value={budget.limit} tone="kern" className="text-sm" /></span>
              </p>
            </div>

            {/* Progress bar */}
            <div className="relative h-2 overflow-hidden rounded-full" style={{ background: trackColor }}>
              {/* Fill 1 — normaal */}
              <div
                className="absolute inset-y-0 left-0 rounded-l-full transition-all duration-500"
                style={{ width: `${barSeg.normalPct}%`, background: barSeg.normalColor }}
              />
              {/* Fill 2 — waarschuwing */}
              {barSeg.warnPct > 0 && (
                <div
                  className="absolute inset-y-0 rounded-r-full transition-all duration-500"
                  style={{ left: `${barSeg.warnLeft}%`, width: `${barSeg.warnPct}%`, background: barSeg.warnColor, transitionDelay: '30ms' }}
                />
              )}
              {/* Extension */}
              {barSeg.extensionPct > 0 && (
                <div
                  className="absolute inset-y-0 rounded-r-full transition-all duration-500"
                  style={{ left: `${barSeg.extensionLeft}%`, width: `${barSeg.extensionPct}%`, background: barSeg.extensionColor, opacity: 0.7, transitionDelay: '80ms' }}
                />
              )}
            </div>

            {/* Daily averages */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-[var(--ink-3)] uppercase tracking-wide">Gem. per dag</p>
                <p className="text-[var(--ink)]">
                  <MaskedAmount value={dailyAvg} tone="kern" className="text-sm" /><span className="text-[var(--ink-4)]">/dag</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--ink-3)] uppercase tracking-wide">Nog beschikbaar</p>
                <p className={isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-positive'}>
                  {isOver ? <span className="font-mono tabular-nums text-sm">€ 0</span> : <MaskedAmount value={remainingPerDay} tone="kern" className="text-sm" />}<span className="text-[var(--ink-4)]">/dag</span>
                </p>
              </div>
            </div>

            {/* Remaining + days left */}
            <div className="flex items-baseline justify-between border-t border-[var(--border-ed)] pt-2">
              <p className={isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-positive'}>
                {isOver ? (
                  <>
                    <MaskedAmount value={budget.spent - budget.limit} tone="kern" className="text-xs" />
                    {overPositive ? ' boven doel' : ' over budget'}
                  </>
                ) : (
                  <>
                    <MaskedAmount value={remaining} tone="kern" className="text-xs" /> over
                  </>
                )}
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

  // ── Half: compact ring + details side-by-side (smaller ring fits 1-row) ──
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker={budget.name} href={`/core/budgets?budget=${budget.id}`} kickerPosition="left">
        <div ref={ref} className="flex gap-3 items-center">
          {/* Compact ring */}
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
              <p className={`font-mono text-lg font-semibold tabular-nums leading-tight ${isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink)]'}`}>
                {Math.round(pct * 100)}%
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[var(--ink)]">
              <MaskedAmount value={budget.spent} tone="kern" className="text-sm" /> <span className="text-[var(--ink-4)]">van <MaskedAmount value={budget.limit} tone="kern" className="text-sm" /></span>
            </p>

            {/* Progress bar */}
            <div className="relative h-1.5 overflow-hidden rounded-full" style={{ background: trackColor }}>
              {/* Fill 1 — normaal */}
              <div
                className="absolute inset-y-0 left-0 rounded-l-full transition-all duration-500"
                style={{ width: `${barSeg.normalPct}%`, background: barSeg.normalColor }}
              />
              {/* Fill 2 — waarschuwing */}
              {barSeg.warnPct > 0 && (
                <div
                  className="absolute inset-y-0 rounded-r-full transition-all duration-500"
                  style={{ left: `${barSeg.warnLeft}%`, width: `${barSeg.warnPct}%`, background: barSeg.warnColor, transitionDelay: '30ms' }}
                />
              )}
              {/* Extension */}
              {barSeg.extensionPct > 0 && (
                <div
                  className="absolute inset-y-0 rounded-r-full transition-all duration-500"
                  style={{ left: `${barSeg.extensionLeft}%`, width: `${barSeg.extensionPct}%`, background: barSeg.extensionColor, opacity: 0.7, transitionDelay: '80ms' }}
                />
              )}
            </div>

            <p className={isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-positive'}>
              {isOver ? (
                <>
                  <MaskedAmount value={budget.spent - budget.limit} tone="kern" className="text-xs" />
                  {overPositive ? ' boven doel' : ' over budget'}
                </>
              ) : (
                <>
                  <MaskedAmount value={remaining} tone="kern" className="text-xs" /> over · nog {daysLeft}d
                </>
              )}
            </p>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Quarter: centered ring only ──
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
            <p className={`font-mono text-lg font-semibold tabular-nums leading-tight ${isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink)]'}`}>
              {Math.round(pct * 100)}%
            </p>
            <p className="text-[var(--ink-3)] leading-normal mt-0.5 text-center">
              <MaskedAmount value={budget.spent} tone="kern" className="text-[9px]" />
              <br />
              <span className="text-[var(--ink-4)]">/ <MaskedAmount value={budget.limit} tone="kern" className="text-[9px]" /></span>
            </p>
          </div>
        </div>
      </div>
    </WidgetShell>
  )
})
