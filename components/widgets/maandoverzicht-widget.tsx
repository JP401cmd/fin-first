import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { MaskedAmount } from '@/components/app/masked-amount'
import { formatWithFreedom } from '@/lib/format'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// nl-NL getalnotatie (komma-decimaal) voor de weergaven in deze widget.
function nlNum(value: number, decimals = 0): string {
  return value.toLocaleString('nl-NL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Trendpijl — alléén te gebruiken waar `value` een ECHTE maand-op-maand-Δ is
// (Vermogen, Vrijheidsdagen). Niet voeden met een absoluut niveau of een vaste
// drempel: dan suggereert de pijl een ontwikkeling die er niet is.
function TrendArrow({ value, label }: { value: number; label: string }) {
  const direction = value > 0 ? 'stijgt' : value < 0 ? 'daalt' : 'ongewijzigd'
  const aria = `${label}: ${direction} t.o.v. vorige maand`
  if (value > 0) return <TrendingUp className="h-3 w-3 text-positive shrink-0" role="img" aria-label={aria} />
  if (value < 0) return <TrendingDown className="h-3 w-3 text-negative shrink-0" role="img" aria-label={aria} />
  return <Minus className="h-3 w-3 text-[var(--ink-4)] shrink-0" role="img" aria-label={aria} />
}

function MiniSparkline({ data, color, label }: { data: number[]; color: string; label: string }) {
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
    <svg width={W} height={H} className="shrink-0" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
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
  // Canoniek dagtarief uit de bundel — voor de "Geld is opgeslagen tijd"-vertaling
  // van €-bedragen (geen eigen herberekening). 0 = geen vertaling tonen.
  const dagtarief = data.dailyExpenseRate ?? 0

  // ── Mini: net month balance with color ──────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Maandoverzicht" href={href}>
        <p className={`leading-none truncate ${deltaPositive ? 'text-positive' : 'text-negative'}`}>
          <MaskedAmount
            value={netWorthDelta}
            signPrefix={deltaPositive ? '+' : ''}
            tone="kern"
            className="text-[15px] font-semibold"
          />
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: netto resultaat + vrijheidsdagen ──────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Maandoverzicht" href={href}>
        <p className={deltaPositive ? 'text-positive' : 'text-negative'}>
          <MaskedAmount
            value={netWorthDelta}
            signPrefix={deltaPositive ? '+' : ''}
            tone="kern"
            className="text-lg font-semibold"
          />
        </p>
        <p className={`mt-0.5 font-serif italic text-[11px] ${freedomDaysWon >= 0 ? 'text-positive' : 'text-negative'}`}>
          {freedomDaysWon >= 0 ? '+' : ''}{nlNum(freedomDaysWon)} vrijheidsdagen
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
              <TrendArrow value={netWorthDelta} label="Vermogen" />
            </div>
            <p className={deltaPositive ? 'text-positive' : 'text-negative'}>
              <MaskedAmount
                value={netWorthDelta}
                signPrefix={deltaPositive ? '+' : ''}
                tone="kern"
                className="text-base font-semibold"
              />
            </p>
          </div>

          {/* Vrijheidsdagen */}
          <div>
            <div className="flex items-center gap-1">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Vrijheidsdagen</p>
              <TrendArrow value={freedomDaysWon} label="Vrijheidsdagen" />
            </div>
            <p className={`font-mono text-base font-semibold tabular-nums ${freedomDaysWon >= 0 ? 'text-positive' : 'text-negative'}`}>
              {freedomDaysWon >= 0 ? '+' : ''}{nlNum(freedomDaysWon)}d
            </p>
          </div>

          {/* Spaarquote — absoluut niveau (6-mnd gemiddelde), geen maand-Δ: geen trendpijl */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Spaarquote · 6 mnd</p>
            <p className="font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
              {nlNum(savingsRate, 1)}%
            </p>
          </div>

          {/* Budgetscore — absoluut niveau (0-100), geen maand-Δ: geen trendpijl */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Budgetscore</p>
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

  // ── XL (Double): brede rapportkaart over de volle grid-breedte ────────────
  // 4 KPI's naast elkaar + budgetten en maandvergelijking in één oogopslag.
  // Alleen bereikbaar op desktop (Double is opt-in en niet selecteerbaar op
  // mobiel; daar zakt de weergave via downsizeForMobile terug naar full).
  if (size === 'xl') {
    return (
      <WidgetShell module="kern" size={size} kicker="Maandoverzicht" href={href}>
        <div className="flex h-full flex-col justify-between gap-4">
          {/* Rij 1: 4 KPI's op volle breedte */}
          <div className="grid grid-cols-4 gap-6">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Vermogen</p>
                <MiniSparkline data={histValues.slice(-6)} color={deltaPositive ? 'var(--positive)' : 'var(--negative)'} label="Vermogensverloop laatste 6 maanden" />
              </div>
              <p className={deltaPositive ? 'text-positive' : 'text-negative'}>
                <MaskedAmount
                  value={netWorthDelta}
                  signPrefix={deltaPositive ? '+' : ''}
                  tone="kern"
                  className="text-2xl font-semibold"
                />
              </p>
              {dagtarief > 0 && (
                <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
                  {formatWithFreedom(netWorthDelta, dagtarief, { includeCurrency: false })}
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Vrijheidsdagen</p>
                <TrendArrow value={freedomDaysWon} label="Vrijheidsdagen" />
              </div>
              <p className={`font-mono text-2xl font-semibold tabular-nums ${freedomDaysWon >= 0 ? 'text-positive' : 'text-negative'}`}>
                {freedomDaysWon >= 0 ? '+' : ''}{nlNum(freedomDaysWon)}d
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Spaarquote · 6 mnd</p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
                {nlNum(savingsRate, 1)}%
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Budgetscore</p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
                {budgetScore}<span className="text-sm text-[var(--ink-3)]">/100</span>
              </p>
            </div>
          </div>

          <div className="border-t border-dashed border-[var(--border-ed)]" />

          {/* Rij 2: budgetten + maandvergelijking naast elkaar */}
          <div className="grid grid-cols-4 gap-6">
            {bestBudget && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] mb-1">Beste groep</p>
                <p className="text-sm font-medium text-positive">{bestBudget.label}</p>
                <p className="text-[var(--ink-3)]">
                  <MaskedAmount value={bestBudget.spent} tone="kern" className="text-xs" /> / <MaskedAmount value={bestBudget.limit} tone="kern" className="text-xs" />
                </p>
              </div>
            )}
            {worstBudget && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] mb-1">Aandachtsgroep</p>
                <p className="text-sm font-medium text-[var(--ink-2)]">{worstBudget.label}</p>
                <p className="text-[var(--ink-3)]">
                  <MaskedAmount value={worstBudget.spent} tone="kern" className="text-xs" /> / <MaskedAmount value={worstBudget.limit} tone="kern" className="text-xs" />
                </p>
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] mb-1">3-maandsgemiddelde</p>
              <p className={avg3MonthDelta >= 0 ? 'text-positive' : 'text-negative'}>
                <MaskedAmount
                  value={avg3MonthDelta}
                  signPrefix={avg3MonthDelta >= 0 ? '+' : ''}
                  tone="kern"
                  className="text-sm font-semibold"
                />/mnd
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] mb-1">vs. vorige maand</p>
              <p className={`font-mono text-sm font-semibold tabular-nums ${prevMonthComparison >= 0 ? 'text-positive' : 'text-negative'}`}>
                {prevMonthComparison >= 0 ? '+' : ''}{nlNum(prevMonthComparison, 1)}%
              </p>
            </div>
          </div>
        </div>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="kern" size={size} kicker="Maandoverzicht" href={href}>
      <div className="space-y-4">
        {/* Top 4 KPIs with sparklines */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Vermogen</p>
              <MiniSparkline data={histValues.slice(-6)} color={deltaPositive ? 'var(--positive)' : 'var(--negative)'} label="Vermogensverloop laatste 6 maanden" />
            </div>
            <p className={deltaPositive ? 'text-positive' : 'text-negative'}>
              <MaskedAmount
                value={netWorthDelta}
                signPrefix={deltaPositive ? '+' : ''}
                tone="kern"
                className="text-lg font-semibold"
              />
            </p>
            {dagtarief > 0 && (
              <p className="mt-0.5 font-serif italic text-[10px] text-[var(--ink-3)]">
                {formatWithFreedom(netWorthDelta, dagtarief, { includeCurrency: false })}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Vrijheidsdagen</p>
              <TrendArrow value={freedomDaysWon} label="Vrijheidsdagen" />
            </div>
            <p className={`font-mono text-lg font-semibold tabular-nums ${freedomDaysWon >= 0 ? 'text-positive' : 'text-negative'}`}>
              {freedomDaysWon >= 0 ? '+' : ''}{nlNum(freedomDaysWon)}d
            </p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Spaarquote · 6 mnd</p>
            <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
              {nlNum(savingsRate, 1)}%
            </p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Budgetscore</p>
            <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
              {budgetScore}<span className="text-xs text-[var(--ink-3)]">/100</span>
            </p>
          </div>
        </div>

        {/* Best & Worst budget — leidende separator hoort binnen de conditie, zodat
            zonder budgetten geen dubbele streep ontstaat. */}
        {bestBudget && worstBudget && (
          <>
            <div className="border-t border-dashed border-[var(--border-ed)]" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] mb-1">Beste groep</p>
                <p className="text-sm font-medium text-positive">{bestBudget.label}</p>
                <p className="text-[var(--ink-3)]">
                  <MaskedAmount value={bestBudget.spent} tone="kern" className="text-xs" /> / <MaskedAmount value={bestBudget.limit} tone="kern" className="text-xs" />
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] mb-1">Aandachtsgroep</p>
                <p className="text-sm font-medium text-[var(--ink-2)]">{worstBudget.label}</p>
                <p className="text-[var(--ink-3)]">
                  <MaskedAmount value={worstBudget.spent} tone="kern" className="text-xs" /> / <MaskedAmount value={worstBudget.limit} tone="kern" className="text-xs" />
                </p>
              </div>
            </div>
          </>
        )}

        {/* Separator */}
        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* 3-month average comparison */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--ink-3)]">3-maandsgemiddelde</p>
          <p className={avg3MonthDelta >= 0 ? 'text-positive' : 'text-negative'}>
            <MaskedAmount
              value={avg3MonthDelta}
              signPrefix={avg3MonthDelta >= 0 ? '+' : ''}
              tone="kern"
              className="text-sm font-semibold"
            />/mnd
          </p>
        </div>

        {/* vs vorige maand */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--ink-3)]">vs. vorige maand</p>
          <p className={`font-mono text-sm tabular-nums ${prevMonthComparison >= 0 ? 'text-positive' : 'text-negative'}`}>
            {prevMonthComparison >= 0 ? '+' : ''}{nlNum(prevMonthComparison, 1)}%
          </p>
        </div>
      </div>
    </WidgetShell>
  )
})
