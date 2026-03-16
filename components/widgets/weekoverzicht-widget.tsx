import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { formatCurrency } from '@/lib/format'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// Day labels in Dutch: ma, di, wo, do, vr, za, zo

export function WeekoverzichtWidget({ size, data, href }: Props) {
  const { weekOverview } = data
  const { weekExpenses, weekBudget, dailyExpenses, prevWeekExpenses, topCategories } = weekOverview

  // Budget comparison
  const budgetPct = weekBudget > 0 ? (weekExpenses / weekBudget) * 100 : 0
  const overBudget = budgetPct > 100
  const weekDelta = prevWeekExpenses > 0 ? weekExpenses - prevWeekExpenses : 0
  const weekDeltaPct = prevWeekExpenses > 0 ? Math.round(((weekExpenses - prevWeekExpenses) / prevWeekExpenses) * 100) : 0

  // Daily average
  const daysWithData = dailyExpenses.filter(d => d.amount > 0).length
  const dailyAvg = daysWithData > 0 ? weekExpenses / daysWithData : 0

  // For the bar chart
  const maxDaily = Math.max(...dailyExpenses.map(d => d.amount), weekBudget / 7 || 1)

  // Mini: just week total
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Weekoverzicht" href={href}>
        <p className={`font-mono text-[15px] font-semibold tabular-nums leading-none truncate ${overBudget ? 'text-red-600' : 'text-[var(--ink)]'}`}>
          {formatCurrency(weekExpenses)}
        </p>
      </WidgetShell>
    )
  }

  // Quarter: total + budget comparison
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Weekoverzicht" href={href}>
        <p className={`font-mono text-lg font-semibold tabular-nums ${overBudget ? 'text-red-600' : 'text-[var(--ink)]'}`}>
          {formatCurrency(weekExpenses)}
        </p>
        {weekBudget > 0 && (
          <>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--subtle)] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : budgetPct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              <span className="font-mono tabular-nums">{Math.round(budgetPct)}%</span> van weekbudget ({formatCurrency(weekBudget)})
            </p>
          </>
        )}
      </WidgetShell>
    )
  }

  // Half: daily bar chart (Mon-Sun) with budget line
  if (size === 'half') {
    const BAR_W = 20
    const GAP = 6
    const CHART_W = dailyExpenses.length * (BAR_W + GAP) - GAP
    const CHART_H = 64
    const budgetLineY = weekBudget > 0 ? CHART_H - (((weekBudget / 7) / maxDaily) * CHART_H) : -1

    return (
      <WidgetShell module="kern" size={size} kicker="Weekoverzicht" href={href}>
        <div className="flex items-center justify-between mb-2">
          <p className={`font-mono text-base font-semibold tabular-nums ${overBudget ? 'text-red-600' : 'text-[var(--ink)]'}`}>
            {formatCurrency(weekExpenses)}
          </p>
          {weekBudget > 0 && (
            <p className="text-[10px] text-[var(--ink-3)]">
              budget <span className="font-mono tabular-nums">{formatCurrency(weekBudget)}</span>
            </p>
          )}
        </div>
        <svg width="100%" height={CHART_H + 18} viewBox={`0 0 ${CHART_W} ${CHART_H + 18}`} preserveAspectRatio="xMidYMid meet" className="w-full">
          {/* Budget reference line */}
          {budgetLineY >= 0 && (
            <line x1={0} y1={budgetLineY} x2={CHART_W} y2={budgetLineY} stroke="var(--border-md)" strokeWidth={1} strokeDasharray="4 3" />
          )}
          {dailyExpenses.map((d, i) => {
            const barH = maxDaily > 0 ? (d.amount / maxDaily) * CHART_H : 0
            const x = i * (BAR_W + GAP)
            const isToday = d.day === new Date().toISOString().split('T')[0]
            const barColor = d.amount > (weekBudget / 7) ? 'var(--kern-500)' : 'var(--kern-300)'
            return (
              <g key={d.day}>
                <rect
                  x={x}
                  y={CHART_H - barH}
                  width={BAR_W}
                  height={Math.max(barH, 1)}
                  rx={3}
                  fill={barColor}
                  opacity={isToday ? 1 : 0.7}
                />
                <text
                  x={x + BAR_W / 2}
                  y={CHART_H + 12}
                  textAnchor="middle"
                  fontSize={9}
                  fill={isToday ? 'var(--ink)' : 'var(--ink-4)'}
                  fontWeight={isToday ? 600 : 400}
                >
                  {d.label}
                </text>
              </g>
            )
          })}
        </svg>
      </WidgetShell>
    )
  }

  // Full: chart + top categories + prev week comparison
  // Reuse chart dimensions
  const BAR_W = 28
  const GAP = 8
  const CHART_W = dailyExpenses.length * (BAR_W + GAP) - GAP
  const CHART_H = 80
  const budgetLineY = weekBudget > 0 ? CHART_H - (((weekBudget / 7) / maxDaily) * CHART_H) : -1

  return (
    <WidgetShell module="kern" size={size} kicker="Weekoverzicht" href={href}>
      <div className="space-y-3">
        {/* Header with total + daily avg */}
        <div className="flex items-center justify-between">
          <div>
            <p className={`font-mono text-lg font-semibold tabular-nums ${overBudget ? 'text-red-600' : 'text-[var(--ink)]'}`}>
              {formatCurrency(weekExpenses)}
            </p>
            <p className="text-[10px] text-[var(--ink-3)]">
              gem. <span className="font-mono tabular-nums">{formatCurrency(dailyAvg)}</span>/dag
            </p>
          </div>
          {weekBudget > 0 && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Weekbudget</p>
              <p className="font-mono text-sm tabular-nums text-[var(--ink-2)]">{formatCurrency(weekBudget)}</p>
            </div>
          )}
        </div>

        {/* Daily bar chart */}
        <svg width="100%" height={CHART_H + 18} viewBox={`0 0 ${CHART_W} ${CHART_H + 18}`} preserveAspectRatio="xMidYMid meet" className="w-full">
          {budgetLineY >= 0 && (
            <line x1={0} y1={budgetLineY} x2={CHART_W} y2={budgetLineY} stroke="var(--border-md)" strokeWidth={1} strokeDasharray="4 3" />
          )}
          {dailyExpenses.map((d, i) => {
            const barH = maxDaily > 0 ? (d.amount / maxDaily) * CHART_H : 0
            const x = i * (BAR_W + GAP)
            const isToday = d.day === new Date().toISOString().split('T')[0]
            const barColor = d.amount > (weekBudget / 7) ? 'var(--kern-500)' : 'var(--kern-300)'
            return (
              <g key={d.day}>
                <rect x={x} y={CHART_H - barH} width={BAR_W} height={Math.max(barH, 1)} rx={3} fill={barColor} opacity={isToday ? 1 : 0.7} />
                {d.amount > 0 && (
                  <text x={x + BAR_W / 2} y={CHART_H - barH - 4} textAnchor="middle" fontSize={8} fill="var(--ink-3)" className="font-mono">
                    {Math.round(d.amount)}
                  </text>
                )}
                <text x={x + BAR_W / 2} y={CHART_H + 12} textAnchor="middle" fontSize={9} fill={isToday ? 'var(--ink)' : 'var(--ink-4)'} fontWeight={isToday ? 600 : 400}>
                  {d.label}
                </text>
              </g>
            )
          })}
        </svg>

        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* Top categories */}
        {topCategories.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] mb-1.5">Top categorie&#235;n</p>
            <div className="space-y-1">
              {topCategories.slice(0, 3).map((cat) => {
                const pct = weekExpenses > 0 ? (cat.amount / weekExpenses) * 100 : 0
                return (
                  <div key={cat.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-1.5 rounded-full bg-kern-300" style={{ width: `${Math.max(pct, 4)}%`, minWidth: 8, maxWidth: 60 }} />
                      <span className="text-xs text-[var(--ink-2)] truncate">{cat.name}</span>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-[var(--ink-3)] shrink-0 ml-2">{formatCurrency(cat.amount)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* Previous week comparison */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--ink-3)]">vs. vorige week</p>
          <div className="flex items-center gap-1">
            {weekDelta > 0 ? <TrendingUp className="h-3 w-3 text-red-500" /> : weekDelta < 0 ? <TrendingDown className="h-3 w-3 text-emerald-500" /> : <Minus className="h-3 w-3 text-[var(--ink-4)]" />}
            <p className={`font-mono text-sm tabular-nums ${weekDelta > 0 ? 'text-red-600' : weekDelta < 0 ? 'text-emerald-600' : 'text-[var(--ink-3)]'}`}>
              {weekDelta > 0 ? '+' : ''}{weekDeltaPct}%
            </p>
          </div>
        </div>
      </div>
    </WidgetShell>
  )
}
