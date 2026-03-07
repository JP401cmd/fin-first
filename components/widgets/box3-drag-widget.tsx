import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { formatCurrency } from '@/lib/format'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function Box3DragWidget({ size, data, href }: Props) {
  const { totalAssets, yearlyMustExpenses, box3Tax } = data

  // Use pre-computed Box 3 tax (full calculateBox3 calculation)
  const annualDrag = box3Tax ?? 0
  const dailyMustExpense = yearlyMustExpenses > 0 ? yearlyMustExpenses / 365 : 0
  const freedomDaysLost = dailyMustExpense > 0 && annualDrag > 0 ? Math.round(annualDrag / dailyMustExpense) : null

  const pctOfAssets = totalAssets > 0 ? (annualDrag / totalAssets) * 100 : 0

  // ── Quarter-size: jaarlijks bedrag + vrijheidsdagen ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Box 3 Drag" href={href}>
        <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
          {formatCurrency(annualDrag)}
        </p>
        <span className="text-[10px] text-[var(--ink-3)]">/jaar</span>
        {freedomDaysLost != null && (
          <p className="mt-1 text-xs text-horizon-700">
            = <span className="font-mono font-semibold tabular-nums">{freedomDaysLost}d</span> vrijheid
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Full-size: bedrag + tarief + vrijheidsdagen + 5-jaar projectie ──
  if (size === 'full') {
    // Estimate annual growth from netWorthHistory or monthlyContributions
    const history = data.netWorthHistory ?? []
    let annualGrowthRate = 0.05 // default 5%
    if (history.length >= 2) {
      const oldest = history[0].value
      const newest = history[history.length - 1].value
      const months = history.length - 1
      if (oldest > 0 && months > 0) {
        const totalGrowth = (newest - oldest) / oldest
        annualGrowthRate = Math.max(0, totalGrowth * (12 / months))
      }
    }

    // Box 3 effective rate (annualDrag / totalAssets)
    const effectiveRate = totalAssets > 0 ? annualDrag / totalAssets : 0.0212

    // 5-year projection
    const projections: { year: number; wealth: number; tax: number; days: number | null }[] = []
    let projWealth = totalAssets
    let totalTax5y = 0
    let totalDays5y = 0
    for (let y = 1; y <= 5; y++) {
      projWealth = projWealth * (1 + annualGrowthRate)
      const tax = projWealth * effectiveRate
      totalTax5y += tax
      const days = dailyMustExpense > 0 ? Math.round(tax / dailyMustExpense) : null
      if (days != null) totalDays5y += days
      projections.push({ year: y, wealth: projWealth, tax, days })
    }

    return (
      <WidgetShell module="horizon" size={size} kicker="Box 3 Belastingdrag" href={href}>
        {/* Header: bedrag + tarief */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
                {formatCurrency(annualDrag)}
              </p>
              <span className="text-xs text-[var(--ink-3)]">/jaar</span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              {pctOfAssets.toFixed(2)}% effectief tarief
            </p>
          </div>
          {freedomDaysLost != null && (
            <div className="flex-shrink-0 text-right">
              <p className="font-mono text-xl font-semibold tabular-nums text-horizon-700">{freedomDaysLost}d</p>
              <p className="text-[10px] text-[var(--ink-3)]">vrijheid/jaar</p>
            </div>
          )}
        </div>

        {/* 5-jaar projectie tabel */}
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)] mb-1.5">5-jaar projectie</p>
          <div className="space-y-1">
            {projections.map((p) => (
              <div key={p.year} className="flex items-center justify-between text-xs">
                <span className="text-[var(--ink-3)] w-12">Jaar {p.year}</span>
                <span className="font-mono tabular-nums text-[var(--ink-3)]">{formatCurrency(p.wealth)}</span>
                <span className="font-mono tabular-nums text-[var(--ink)]">{formatCurrency(p.tax)}</span>
                {p.days != null && (
                  <span className="font-mono tabular-nums text-horizon-700 w-8 text-right">{p.days}d</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Totalen */}
        <div className="mt-3 pt-2 border-t border-[var(--border-ed)] flex justify-between text-xs">
          <span className="text-[var(--ink-3)]">Totaal 5 jaar</span>
          <div className="flex items-center gap-3">
            <span className="font-mono font-semibold tabular-nums text-[var(--ink)]">{formatCurrency(totalTax5y)}</span>
            {totalDays5y > 0 && (
              <span className="font-mono font-semibold tabular-nums text-horizon-700">{totalDays5y}d</span>
            )}
          </div>
        </div>

        <p className="mt-2 font-serif italic text-[11px] text-[var(--ink-3)]">
          Geschat bij {(annualGrowthRate * 100).toFixed(1)}% jaarlijkse vermogensgroei
        </p>
      </WidgetShell>
    )
  }

  // ── Half-size ──
  return (
    <WidgetShell module="horizon" size={size} kicker="Box 3 Belastingdrag" href={href}>
      <div className="mt-0.5">
        <div className="flex items-baseline gap-1.5">
          <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
            {formatCurrency(annualDrag)}
          </p>
          <span className="text-[10px] text-[var(--ink-3)]">/jaar</span>
        </div>

        <p className="mt-0.5 text-xs text-[var(--ink-3)]">
          {pctOfAssets.toFixed(2)}% effectief tarief
        </p>

        {freedomDaysLost != null && (
          <p className="mt-2 text-xs font-medium text-horizon-700">
            = <span className="font-mono font-semibold">{freedomDaysLost}</span> vrijheidsdagen per jaar
          </p>
        )}
      </div>
    </WidgetShell>
  )
}
