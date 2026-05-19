'use client'

import { useMemo } from 'react'
import { formatCurrency } from '@/lib/format'
import type { TransactionRow } from '@/components/app/transacties-feed'

/**
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
  const aggregates = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    let income = 0
    let expenses = 0
    for (const tx of transactions) {
      const d = new Date(tx.date)
      if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) continue
      if (tx.amount >= 0) income += tx.amount
      else expenses += Math.abs(tx.amount)
    }
    const net = income - expenses
    const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0
    return { income, expenses, net, savingsRate }
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
        <h3 className="text-[10px] uppercase tracking-[0.18em] font-mono font-semibold text-[var(--ink-2)]">
          Geldstroom
        </h3>
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
          sub={savingsRateLabel}
          tone="neutral"
        />
      </div>
    </section>
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
      ? 'text-emerald-700'
      : tone === 'negative'
        ? 'text-red-700'
        : 'text-[var(--ink)]'
  const labelColor =
    tone === 'positive'
      ? 'text-emerald-700'
      : tone === 'negative'
        ? 'text-red-700'
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
