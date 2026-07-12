'use client'

import { useMemo } from 'react'
import { formatCurrency } from '@/lib/format'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import type { TransactionRow } from '@/components/app/transacties-feed'

/**
 * @audit-kpi-actions skip — banner-style stats; actie via parent feed
 *
 * TransactiesGeldstroom — banner-style cashflow-overzicht boven de
 * TransactiesFeed op /overzicht/cashflow?view=transacties. Aggregeert
 * de transactions uit de HUIDIGE maand (filter op month-match) en toont
 * 4 KPI's: Inkomen / Uitgaven / Saldo / Spaarquote.
 *
 * User-feedback (mei 2026): wil de geldstroom-info uit /core/assets/cash
 * óók terugzien op /overzicht/cashflow/transacties — gecombineerd over
 * alle rekeningen. Deze component levert dat over de transactions-prop
 * zonder extra Supabase-call.
 *
 * Voor uitgebreide chart (dagelijkse aggregatie, forecast, Sankey):
 * gebruik de volledige cash-overview op /overzicht/bezittingen/cash.
 */
export function TransactiesGeldstroom({
  transactions,
  monthLabel,
}: {
  transactions: TransactionRow[]
  monthLabel?: string
}) {
  const { aggregates, dailyFlow } = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()

    let income = 0
    let expenses = 0
    // Per-dag aggregaties voor mini bar-chart
    const dailyIncome = new Array<number>(daysInMonth).fill(0)
    const dailyExpenses = new Array<number>(daysInMonth).fill(0)
    for (const tx of transactions) {
      const d = new Date(tx.date)
      if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) continue
      const day = d.getDate() - 1
      if (tx.amount >= 0) {
        income += tx.amount
        dailyIncome[day] = (dailyIncome[day] ?? 0) + tx.amount
      } else {
        const abs = Math.abs(tx.amount)
        expenses += abs
        dailyExpenses[day] = (dailyExpenses[day] ?? 0) + abs
      }
    }
    const net = income - expenses
    const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0
    return {
      aggregates: { income, expenses, net, savingsRate },
      dailyFlow: { dailyIncome, dailyExpenses, daysInMonth },
    }
  }, [transactions])

  // Verberg bij volledig geen transactie-activiteit
  if (aggregates.income === 0 && aggregates.expenses === 0) {
    return null
  }

  const savingsRateLabel =
    aggregates.savingsRate >= 30 ? 'sterk' : aggregates.savingsRate >= 15 ? 'gezond' : 'laag'

  return (
    <section className="mb-4 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
      <header className="px-4 sm:px-6 pt-4 pb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] uppercase tracking-[0.18em] font-mono font-semibold text-[var(--ink-2)]">
            Geldstroom
          </h3>
          <PerspectiveContextLabel className="normal-case tracking-normal" />
        </div>
        {monthLabel && (
          <span
            className="text-[11px] italic text-[var(--ink-4)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            {monthLabel.toLowerCase()}
          </span>
        )}
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4">
        <Kpi
          label="Inkomen"
          value={formatCurrency(aggregates.income)}
          sub="ontvangen"
          tone="positive"
        />
        <Kpi
          label="Uitgaven"
          value={formatCurrency(aggregates.expenses)}
          sub="besteed"
          tone="negative"
        />
        <Kpi
          label="Saldo"
          value={`${aggregates.net >= 0 ? '+' : ''}${formatCurrency(aggregates.net)}`}
          sub="netto"
          tone={aggregates.net >= 0 ? 'positive' : 'negative'}
        />
        <Kpi
          label="Spaarquote"
          value={`${aggregates.savingsRate}%`}
          sub={`deze maand · ${savingsRateLabel}`}
          tone="neutral"
        />
      </div>

      {/* Mini dagelijkse bar-chart: per dag inkomen (groen, omhoog) en
          uitgaven (rood, omlaag). Compact, geen labels — visuele indruk
          van wanneer in de maand geld in/uit gaat. */}
      <DailyFlowChart
        dailyIncome={dailyFlow.dailyIncome}
        dailyExpenses={dailyFlow.dailyExpenses}
        daysInMonth={dailyFlow.daysInMonth}
      />
    </section>
  )
}

function DailyFlowChart({
  dailyIncome,
  dailyExpenses,
  daysInMonth,
}: {
  dailyIncome: number[]
  dailyExpenses: number[]
  daysInMonth: number
}) {
  const maxValue = Math.max(...dailyIncome, ...dailyExpenses, 1)
  const W = 600
  const H = 80
  const PAD_X = 8
  const PAD_TOP = 6
  const PAD_BOTTOM = 18
  const chartW = W - 2 * PAD_X
  const chartH = (H - PAD_TOP - PAD_BOTTOM) / 2 // helft voor +inkomen, helft voor -uitgaven
  const midY = PAD_TOP + chartH
  const barWidth = chartW / daysInMonth - 1

  // Verberg de chart als de hele maand 0/0 is.
  const hasAnyActivity = dailyIncome.some((v) => v > 0) || dailyExpenses.some((v) => v > 0)
  if (!hasAnyActivity) return null

  const today = new Date().getDate()
  return (
    <div className="px-4 sm:px-6 pb-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        aria-label="Dagelijkse geldstroom"
      >
        {/* Mid-line */}
        <line
          x1={PAD_X}
          y1={midY}
          x2={W - PAD_X}
          y2={midY}
          stroke="var(--border-ed, #e5e5e0)"
          strokeWidth="1"
        />

        {dailyIncome.map((value, i) => {
          if (value <= 0) return null
          const height = (value / maxValue) * chartH
          const x = PAD_X + i * (chartW / daysInMonth) + 0.5
          return (
            <rect
              key={`in-${i}`}
              x={x}
              y={midY - height}
              width={barWidth}
              height={height}
              fill="var(--positive)"
              opacity={i + 1 <= today ? 0.9 : 0.4}
              rx="0.5"
            >
              <title>
                Dag {i + 1}: +€{Math.round(value)} inkomen
              </title>
            </rect>
          )
        })}
        {dailyExpenses.map((value, i) => {
          if (value <= 0) return null
          const height = (value / maxValue) * chartH
          const x = PAD_X + i * (chartW / daysInMonth) + 0.5
          return (
            <rect
              key={`out-${i}`}
              x={x}
              y={midY}
              width={barWidth}
              height={height}
              fill="var(--negative)"
              opacity={i + 1 <= today ? 0.9 : 0.4}
              rx="0.5"
            >
              <title>
                Dag {i + 1}: −€{Math.round(value)} uitgave
              </title>
            </rect>
          )
        })}

        {/* Vandaag-marker */}
        <line
          x1={PAD_X + (today - 0.5) * (chartW / daysInMonth)}
          y1={PAD_TOP}
          x2={PAD_X + (today - 0.5) * (chartW / daysInMonth)}
          y2={H - PAD_BOTTOM}
          stroke="var(--ink-3, #999)"
          strokeWidth="1"
          strokeDasharray="2 2"
          opacity="0.5"
        />

        {/* Schaal-labels */}
        <text
          x={PAD_X}
          y={H - 4}
          className="fill-[var(--ink-3)] font-mono"
          fontSize="9"
          textAnchor="start"
        >
          1
        </text>
        <text
          x={W / 2}
          y={H - 4}
          className="fill-[var(--ink-3)] font-mono"
          fontSize="9"
          textAnchor="middle"
        >
          {Math.round(daysInMonth / 2)}
        </text>
        <text
          x={W - PAD_X}
          y={H - 4}
          className="fill-[var(--ink-3)] font-mono"
          fontSize="9"
          textAnchor="end"
        >
          {daysInMonth}
        </text>
      </svg>
    </div>
  )
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone: 'positive' | 'negative' | 'neutral'
}) {
  const valueColor =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : 'text-[var(--ink)]'
  const labelColor =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : 'text-[var(--ink-3)]'

  return (
    <div className="p-4 border-r border-[var(--border-ed)] last:border-r-0 [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0">
      <div
        className={`text-[10px] uppercase tracking-[0.18em] font-mono ${labelColor} mb-1.5`}
      >
        {label}
      </div>
      <div
        className={`text-[22px] sm:text-[24px] font-black leading-none tracking-[-0.02em] tabular-nums ${valueColor}`}
        style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
      >
        {value}
      </div>
      <div
        className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {sub}
      </div>
    </div>
  )
}
