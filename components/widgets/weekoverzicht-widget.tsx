import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { MaskedAmount } from '@/components/app/masked-amount'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { localDateStr } from '@/lib/budget-period'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

function nlNum(value: number, decimals = 0): string {
  return value.toLocaleString('nl-NL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Day labels in Dutch: ma, di, wo, do, vr, za, zo

function DeltaIndicator({ current, previous, compact = false }: { current: number; previous: number; compact?: boolean }) {
  if (previous <= 0) return null
  const delta = current - previous
  const deltaPct = Math.round((delta / previous) * 100)
  if (deltaPct === 0) return <Minus className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} text-[var(--ink-4)]`} />

  const isUp = deltaPct > 0
  const Icon = isUp ? TrendingUp : TrendingDown
  const color = isUp ? 'text-negative' : 'text-positive'

  return (
    <span className={`inline-flex items-center gap-0.5 ${color}`}>
      <Icon className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'}`} />
      <span className={`font-mono tabular-nums ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        {isUp ? '+' : ''}{deltaPct}%
      </span>
    </span>
  )
}

export const WeekoverzichtWidget = memo(function WeekoverzichtWidget({ size, data, href }: Props) {
  const { weekOverview } = data
  const { weekExpenses, weekIncome, weekBudget, dailyExpenses, prevWeekExpenses, topCategories } = weekOverview

  // Budget comparison
  const budgetPct = weekBudget > 0 ? (weekExpenses / weekBudget) * 100 : 0
  const overBudget = budgetPct > 100
  const weekDelta = prevWeekExpenses > 0 ? weekExpenses - prevWeekExpenses : 0
  const weekDeltaPct = prevWeekExpenses > 0 ? Math.round(((weekExpenses - prevWeekExpenses) / prevWeekExpenses) * 100) : 0

  // Daily average
  const daysWithData = dailyExpenses.filter(d => d.amount > 0).length
  const dailyAvg = daysWithData > 0 ? weekExpenses / daysWithData : 0

  // Vrijheidstijd-vertaling (Geld is opgeslagen tijd): weekuitgaven → vrijheidsdagen
  // via het canonieke dagtarief uit de bundel (geen eigen herberekening). 0 = niet tonen.
  const dagtarief = data.dailyExpenseRate ?? 0
  const weekFreedomDays = dagtarief > 0 ? weekExpenses / dagtarief : 0

  // Lokaal "vandaag" (nooit toISOString(): dat schuift de dag in NL) — moet in
  // hetzelfde lokale-datumframe staan als de dag-buckets uit de loader.
  const todayStr = localDateStr(new Date())

  // For the bar chart
  const maxDaily = Math.max(...dailyExpenses.map(d => d.amount), weekBudget / 7 || 1)

  // Mini: just week total
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Weekoverzicht" href={href}>
        <p className={`leading-none truncate ${overBudget ? 'text-negative' : 'text-[var(--ink)]'}`}>
          <MaskedAmount value={weekExpenses} tone="kern" className="text-[15px] font-semibold" />
        </p>
      </WidgetShell>
    )
  }

  // Quarter: total + budget comparison
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Weekoverzicht" href={href}>
        <p className={overBudget ? 'text-negative' : 'text-[var(--ink)]'}>
          <MaskedAmount value={weekExpenses} tone="kern" className="text-lg font-semibold" />
        </p>
        {weekBudget > 0 && (
          <>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--subtle)] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${overBudget ? 'bg-negative' : budgetPct > 80 ? 'bg-[var(--ink-3)]' : 'bg-positive'}`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              <span className="font-mono tabular-nums">{Math.round(budgetPct)}%</span> van weekbudget (<MaskedAmount value={weekBudget} tone="kern" />)
            </p>
          </>
        )}
      </WidgetShell>
    )
  }

  // Half: horizontal layout — left total + delta, right bar chart
  if (size === 'half') {
    const BAR_W = 14
    const GAP = 3
    const CHART_W = dailyExpenses.length * (BAR_W + GAP) - GAP
    const CHART_H = 56
    const budgetLineY = weekBudget > 0 ? CHART_H - (((weekBudget / 7) / maxDaily) * CHART_H) : -1

    return (
      <WidgetShell module="kern" size={size} kicker="Weekoverzicht" href={href}>
        <div className="flex gap-3 h-full">
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p className={overBudget ? 'text-negative' : 'text-[var(--ink)]'}>
              <MaskedAmount value={weekExpenses} tone="kern" className="text-xl font-semibold" />
            </p>
            <DeltaIndicator current={weekExpenses} previous={prevWeekExpenses} compact />
            {weekFreedomDays > 0 && (
              <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
                ≈ {nlNum(weekFreedomDays, 1)} vrijheidsdagen
              </p>
            )}
            {weekBudget > 0 && (
              <p className="mt-1.5 text-[10px] text-[var(--ink-3)]">
                Budget: <MaskedAmount value={weekBudget} tone="kern" />
              </p>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <svg width="100%" height={CHART_H + 14} viewBox={`0 0 ${CHART_W} ${CHART_H + 14}`} preserveAspectRatio="xMidYMid meet" className="w-full">
              {budgetLineY >= 0 && (
                <line x1={0} y1={budgetLineY} x2={CHART_W} y2={budgetLineY} stroke="var(--border-md)" strokeWidth={1} strokeDasharray="3 2" />
              )}
              {dailyExpenses.map((d, i) => {
                const barH = maxDaily > 0 ? (d.amount / maxDaily) * CHART_H : 0
                const x = i * (BAR_W + GAP)
                const isToday = d.day === todayStr
                // Neutrale staafkleur als er geen weekbudget-basislijn is (anders
                // krijgt elke dag met uitgaven onterecht de "over budget"-kleur).
                const barColor = weekBudget > 0 && d.amount > (weekBudget / 7) ? 'var(--kern-500)' : 'var(--kern-300)'
                return (
                  <g key={d.day}>
                    <rect x={x} y={CHART_H - barH} width={BAR_W} height={Math.max(barH, 1)} rx={2} fill={barColor} opacity={isToday ? 1 : 0.7} />
                    <text x={x + BAR_W / 2} y={CHART_H + 10} textAnchor="middle" fontSize={7} fill={isToday ? 'var(--ink)' : 'var(--ink-4)'} fontWeight={isToday ? 600 : 400}>
                      {d.label}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // Full: chart + top categories with prev-week deltas + prev week comparison
  const BAR_W = 28
  const GAP = 8
  const CHART_W = dailyExpenses.length * (BAR_W + GAP) - GAP
  const CHART_H = 72
  const budgetLineY = weekBudget > 0 ? CHART_H - (((weekBudget / 7) / maxDaily) * CHART_H) : -1

  return (
    <WidgetShell module="kern" size={size} kicker="Weekoverzicht" href={href}>
      <div className="space-y-2.5">
        {/* Header with total + daily avg + prev week delta */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className={overBudget ? 'text-negative' : 'text-[var(--ink)]'}>
                <MaskedAmount value={weekExpenses} tone="kern" className="text-lg font-semibold" />
              </p>
              <DeltaIndicator current={weekExpenses} previous={prevWeekExpenses} />
            </div>
            <p className="text-[10px] text-[var(--ink-3)]">
              gem. <MaskedAmount value={dailyAvg} tone="kern" />/dag
            </p>
            {weekFreedomDays > 0 && (
              <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
                ≈ {nlNum(weekFreedomDays, 1)} vrijheidsdagen deze week
              </p>
            )}
            {weekIncome > 0 && (
              <p className="text-[10px] text-[var(--ink-3)]">
                + <MaskedAmount value={weekIncome} tone="kern" /> inkomsten
              </p>
            )}
          </div>
          {weekBudget > 0 && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Weekbudget</p>
              <p className="text-[var(--ink-2)]">
                <MaskedAmount value={weekBudget} tone="kern" className="text-sm" />
              </p>
            </div>
          )}
        </div>

        {/* Daily bar chart */}
        <svg width="100%" height={CHART_H + 16} viewBox={`0 0 ${CHART_W} ${CHART_H + 16}`} preserveAspectRatio="xMidYMid meet" className="w-full">
          {budgetLineY >= 0 && (
            <line x1={0} y1={budgetLineY} x2={CHART_W} y2={budgetLineY} stroke="var(--border-md)" strokeWidth={1} strokeDasharray="4 3" />
          )}
          {dailyExpenses.map((d, i) => {
            const barH = maxDaily > 0 ? (d.amount / maxDaily) * CHART_H : 0
            const x = i * (BAR_W + GAP)
            const isToday = d.day === todayStr
            // Neutrale staafkleur als er geen weekbudget-basislijn is.
            const barColor = weekBudget > 0 && d.amount > (weekBudget / 7) ? 'var(--kern-500)' : 'var(--kern-300)'
            return (
              <g key={d.day}>
                <rect x={x} y={CHART_H - barH} width={BAR_W} height={Math.max(barH, 1)} rx={3} fill={barColor} opacity={isToday ? 1 : 0.7} />
                {d.amount > 0 && (
                  <text x={x + BAR_W / 2} y={CHART_H - barH - 3} textAnchor="middle" fontSize={8} fill="var(--ink-3)" className="font-mono">
                    {Math.round(d.amount)}
                  </text>
                )}
                <text x={x + BAR_W / 2} y={CHART_H + 11} textAnchor="middle" fontSize={9} fill={isToday ? 'var(--ink)' : 'var(--ink-4)'} fontWeight={isToday ? 600 : 400}>
                  {d.label}
                </text>
              </g>
            )
          })}
        </svg>

        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* Top categories with previous week comparison */}
        {topCategories.length > 0 && (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)] mb-1">WEEK HIGHLIGHTS</p>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Top categorieën</p>
              <p className="text-[9px] text-[var(--ink-4)]">vs. vorige week</p>
            </div>
            <div className="space-y-1">
              {topCategories.slice(0, 3).map((cat) => {
                const pct = weekExpenses > 0 ? (cat.amount / weekExpenses) * 100 : 0
                return (
                  <div key={cat.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-1.5 rounded-full bg-kern-300" style={{ width: `${Math.max(pct, 4)}%`, minWidth: 8, maxWidth: 60 }} />
                      <span className="text-xs text-[var(--ink-2)] truncate">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[var(--ink-3)]">
                        <MaskedAmount value={cat.amount} tone="kern" className="text-xs" />
                      </span>
                      <DeltaIndicator current={cat.amount} previous={cat.prevAmount} compact />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* Previous week total comparison */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--ink-3)]">vs. vorige week (t/m vandaag)</p>
          <div className="flex items-center gap-1">
            {weekDelta > 0 ? <TrendingUp className="h-3 w-3 text-negative" /> : weekDelta < 0 ? <TrendingDown className="h-3 w-3 text-positive" /> : <Minus className="h-3 w-3 text-[var(--ink-4)]" />}
            <p className={`font-mono text-sm tabular-nums ${weekDelta > 0 ? 'text-negative' : weekDelta < 0 ? 'text-positive' : 'text-[var(--ink-3)]'}`}>
              {weekDelta > 0 ? '+' : ''}{weekDeltaPct}%
            </p>
            <span className="text-[var(--ink-4)] ml-0.5">
              (<MaskedAmount value={prevWeekExpenses} tone="kern" className="text-[10px]" />)
            </span>
          </div>
        </div>
      </div>
    </WidgetShell>
  )
})
