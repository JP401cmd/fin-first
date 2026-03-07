import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function NoodfondsWidget({ size, data, href }: Props) {
  const { emergencyFund } = data
  const { currentAmount, targetAmount, monthsCovered, targetMonths, isComplete } = emergencyFund
  const pct = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0

  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Noodfonds" href={href}>
        <p className={`font-mono text-2xl font-semibold tabular-nums ${isComplete ? 'text-emerald-600' : 'text-[var(--ink)]'}`}>
          {monthsCovered}<span className="text-sm text-[var(--ink-3)]">/{targetMonths} mnd</span>
        </p>
        {isComplete && <p className="mt-1 text-xs text-emerald-600 font-medium">Compleet</p>}
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="kern" size={size} kicker="Noodfonds" href={href}>
      <p className={`font-mono text-2xl font-semibold tabular-nums ${isComplete ? 'text-emerald-600' : 'text-[var(--ink)]'}`}>
        {monthsCovered}<span className="text-base text-[var(--ink-3)]">/{targetMonths} maanden</span>
      </p>

      {/* Progress bar */}
      <div className="mt-2 h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
        <div
          className={`h-full rounded-full transition-all ${isComplete ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      <div className="mt-2 flex justify-between text-xs text-[var(--ink-3)]">
        <span>{formatCurrency(currentAmount)}</span>
        <span>Doel: {formatCurrency(targetAmount)}</span>
      </div>

      {isComplete && (
        <p className="mt-1 font-serif italic text-[12px] text-emerald-600">
          Je noodfonds is op het streefniveau
        </p>
      )}
    </WidgetShell>
  )
}
