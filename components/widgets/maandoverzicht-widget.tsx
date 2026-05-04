import { memo } from 'react'
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

function TrendArrow({ value }: { value: number }) {
  if (value > 0) return <TrendingUp className="h-3 w-3 text-positive shrink-0" />
  if (value < 0) return <TrendingDown className="h-3 w-3 text-negative shrink-0" />
  return <Minus className="h-3 w-3 text-[var(--ink-4)] shrink-0" />
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const W = 60
  const H = 20
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * H
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={W} height={H} className="shrink-0" viewBox={`0 0 ${W} ${H}`}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const MaandoverzichtWidget = memo(function MaandoverzichtWidget({ size, data, href }: Props) {
  const { monthSummary, netWorthHistory } = data
  const { netWorthDelta, freedomDaysWon, savingsRate, budgetScore, prevMonthComparison } = monthSummary
  const deltaPositive = netWorthDelta >= 0

  // ── Mini: net month balance with color ──────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Maandoverzicht" href={href}>
        <p className={`font-mono text-[15px] font-semibold tabular-nums leading-none truncate ${deltaPositive ? 'text-positive' : 'text-negative'}`}>
          {deltaPositive ? '+' : ''}{formatCurrency(netWorthDelta)}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: netto resultaat + vrijheidsdagen ──────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Maandoverzicht" href={href}>
        <p className={`font-mono text-lg font-semibold tabular-nums ${deltaPositive ? 'text-positive' : 'text-negative'}`}>
          {deltaPositive ? '+' : ''}{formatCurrency(netWorthDelta)}
        </p>
        <p className={`mt-0.5 font-serif italic text-[11px] ${freedomDaysWon >= 0 ? 'text-positive' : 'text-negative'}`}>
          {freedomDaysWon >= 0 ? '+' : ''}{freedomDaysWon} vrijheidsdagen
        </p>
      </WidgetShell>
    )
  }

  // ── Half: 4 KPIs in 2x2 grid with trend arrows ────────────
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker="Maandoverzicht" href={href}>
        <div className="grid grid-cols-2 gap-3">
          {/* Delta Vermogen */}
          <div>
            <div className="flex items-center gap-1">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Vermogen</p>
              <TrendArrow value={netWorthDelta} />
            </div>
            <p className={`font-mono text-base font-semibold tabular-nums ${deltaPositive ? 'text-positive' : 'text-negative'}`}>
              {deltaPositive ? '+' : ''}{formatCurrency(netWorthDelta)}
            </p>
          </div>

          {/* Vrijheidsdagen */}
          <div>
            <div className="flex items-center gap-1">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Vrijheidsdagen</p>
              <TrendArrow value={freedomDaysWon} />
            </div>
            <p className={`font-mono text-base font-semibold tabular-nums ${freedomDaysWon >= 0 ? 'text-positive' : 'text-negative'}`}>
              {freedomDaysWon >= 0 ? '+' : ''}{freedomDaysWon}d
            </p>
          </div>

          {/* Spaarquote */}
          <div>
            <div className="flex items-center gap-1">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Spaarquote</p>
              <TrendArrow value={savingsRate} />
            </div>
            <p className="font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
              {savingsRate.toFixed(1)}%
            </p>
          </div>

          {/* Budgetscore */}
          <div>
            <div className="flex items-center gap-1">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Budgetscore</p>
              <TrendArrow value={budgetScore - 50} />
            </div>
            <p className="font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
              {budgetScore}<span className="text-xs text-[var(--ink-3)]">/100</span>
            </p>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full: complete report card ─────────────────────────────
  // Compute 3-month averages from netWorthHistory
  const histValues = netWorthHistory.map(h => h.value)
  const last3Deltas: number[] = []
  for (let i = Math.max(1, histValues.length - 3); i < histValues.length; i++) {
    last3Deltas.push(histValues[i] - histValues[i - 1])
  }
  const avg3MonthDelta = last3Deltas.length > 0
    ? Math.round(last3Deltas.reduce((a, b) => a + b, 0) / last3Deltas.length)
    : 0

  // Budget best/worst from budgetTotals
  const budgetEntries = Object.entries(data.budgetTotals)
    .filter(([key]) => key === 'expense' || key === 'savings')
    .map(([key, val]) => {
      const pct = val.limit > 0 ? (val.spent / val.limit) * 100 : 0
      const label = key === 'expense' ? 'Uitgaven' : 'Sparen'
      return { key, label, pct, spent: val.spent, limit: val.limit }
    })
  const bestBudget = budgetEntries.reduce((best, b) => {
    if (b.limit === 0) return best
    const score = b.key === 'expense' ? (100 - b.pct) : b.pct
    const bestScore = best.key === 'expense' ? (100 - best.pct) : best.pct
    return score > bestScore ? b : best
  }, budgetEntries[0])
  const worstBudget = budgetEntries.reduce((worst, b) => {
    if (b.limit === 0) return worst
    const score = b.key === 'expense' ? (100 - b.pct) : b.pct
    const worstScore = worst.key === 'expense' ? (100 - worst.pct) : worst.pct
    return score < worstScore ? b : worst
  }, budgetEntries[0])

  return (
    <WidgetShell module="kern" size={size} kicker="Maandoverzicht" href={href}>
      <div className="space-y-4">
        {/* Top 4 KPIs with sparklines */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Vermogen</p>
              <MiniSparkline data={histValues.slice(-6)} color={deltaPositive ? 'var(--positive)' : 'var(--negative)'} />
            </div>
            <p className={`font-mono text-lg font-semibold tabular-nums ${deltaPositive ? 'text-positive' : 'text-negative'}`}>
              {deltaPositive ? '+' : ''}{formatCurrency(netWorthDelta)}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Vrijheidsdagen</p>
              <TrendArrow value={freedomDaysWon} />
            </div>
            <p className={`font-mono text-lg font-semibold tabular-nums ${freedomDaysWon >= 0 ? 'text-positive' : 'text-negative'}`}>
              {freedomDaysWon >= 0 ? '+' : ''}{freedomDaysWon}d
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Spaarquote</p>
              <TrendArrow value={savingsRate} />
            </div>
            <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
              {savingsRate.toFixed(1)}%
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Budgetscore</p>
              <TrendArrow value={budgetScore - 50} />
            </div>
            <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
              {budgetScore}<span className="text-xs text-[var(--ink-3)]">/100</span>
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* Best & Worst budget */}
        {bestBudget && worstBudget && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] mb-1">Beste budget</p>
              <p className="text-sm font-medium text-positive">{bestBudget.label}</p>
              <p className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
                {formatCurrency(bestBudget.spent)} / {formatCurrency(bestBudget.limit)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] mb-1">Aandachtspunt</p>
              <p className="text-sm font-medium text-[var(--ink-2)]">{worstBudget.label}</p>
              <p className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
                {formatCurrency(worstBudget.spent)} / {formatCurrency(worstBudget.limit)}
              </p>
            </div>
          </div>
        )}

        {/* Separator */}
        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* 3-month average comparison */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--ink-3)]">3-maandsgemiddelde</p>
          <p className={`font-mono text-sm font-semibold tabular-nums ${avg3MonthDelta >= 0 ? 'text-positive' : 'text-negative'}`}>
            {avg3MonthDelta >= 0 ? '+' : ''}{formatCurrency(avg3MonthDelta)}/mnd
          </p>
        </div>

        {/* vs vorige maand */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--ink-3)]">vs. vorige maand</p>
          <p className={`font-mono text-sm tabular-nums ${prevMonthComparison >= 0 ? 'text-positive' : 'text-negative'}`}>
            {prevMonthComparison >= 0 ? '+' : ''}{prevMonthComparison.toFixed(1)}%
          </p>
        </div>
      </div>
    </WidgetShell>
  )
})
