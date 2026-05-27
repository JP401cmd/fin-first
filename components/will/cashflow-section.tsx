'use client'

import Link from 'next/link'
import { ArrowUpDown, ArrowRight, TrendingUp, TrendingDown, Minus, Receipt } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { RecurringItem } from './vaste-kosten-analyse'
import type { CancellationMetadata } from '@/lib/cancellation-types'

// ── Sparkline for expense/savings trends ──────────────────────

function MiniSparkline({
  points,
  strokeColor,
  fillColor,
}: {
  points: { month: string; value: number }[]
  strokeColor: string
  fillColor: string
}) {
  if (points.length < 2) return null

  const w = 80
  const h = 24
  const pad = 2
  const vals = points.map((p) => p.value)
  const mn = Math.min(...vals)
  const mx = Math.max(...vals)
  const range = mx - mn || 1

  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - mn) / range) * (h - pad * 2)
    return `${x},${y}`
  })

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      aria-hidden
    >
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        points={`${pts[0].split(',')[0]},${h} ${pts.join(' ')} ${pts[pts.length - 1].split(',')[0]},${h}`}
        fill={fillColor}
        opacity="0.3"
      />
    </svg>
  )
}

// ── Section ─────────────────────────────────────────────────────

interface CashflowSectionProps {
  data: DashboardData
  subscriptions: RecurringItem[]
  vasteKosten: RecurringItem[]
  totalMonthlySubscriptions: number
  totalMonthlyVasteKosten: number
  totalMonthly: number
  userProfile: { full_name: string | null } | null
  loadingRecurring: boolean
  onCancellationOpen: (metadata: CancellationMetadata) => void
  onRefresh: () => Promise<void>
}

export function CashflowSection({
  data,
  totalMonthly,
}: CashflowSectionProps) {
  const { monthlyIncome, monthlyExpenses, savingsRate6m, savingsHistory, expenseHistory } = data
  const monthlyCashflow = monthlyIncome - monthlyExpenses
  const isPositiveCashflow = monthlyCashflow >= 0
  const isPositiveRate = savingsRate6m >= 0

  const CashflowIcon = isPositiveCashflow
    ? TrendingUp
    : monthlyCashflow === 0
      ? Minus
      : TrendingDown

  return (
    <section id="cashflow" className="mt-10 scroll-mt-24" aria-label="Cashflow">
      {/* ── Section header ── */}
      <div className="mb-4 flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-wil-50">
            <ArrowUpDown className="h-4 w-4 text-wil-600" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-[var(--ink-2)]">
            Cashflow
          </h2>
        </div>
        <Link
          href="/overzicht/cashflow"
          className="group flex items-center gap-1 text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
        >
          Budgetten beheren
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* ── Summary strip: spaarquote + cashflow ── */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Spaarquote card */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Spaarquote <span className="normal-case tracking-normal">(6m)</span>
              </p>
              <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${isPositiveRate ? 'text-positive' : 'text-negative'}`}>
                {savingsRate6m.toFixed(1)}%
              </p>
            </div>
            {savingsHistory.length >= 2 && (
              <MiniSparkline
                points={savingsHistory}
                strokeColor={isPositiveRate ? 'var(--color-positive)' : 'var(--color-negative)'}
                fillColor={isPositiveRate ? 'var(--color-positive)' : 'var(--color-negative)'}
              />
            )}
          </div>
          {/* Mini progress bar */}
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div
              className={`h-full rounded-full ${isPositiveRate ? 'bg-positive' : 'bg-negative'}`}
              style={{ width: `${Math.min(Math.abs(savingsRate6m), 100)}%` }}
            />
          </div>
        </div>

        {/* Monthly cashflow card */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Maandelijks netto
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <CashflowIcon className={`h-4 w-4 ${isPositiveCashflow ? 'text-positive' : 'text-negative'}`} />
                <MaskedAmount
                  value={Math.abs(monthlyCashflow)}
                  signPrefix={isPositiveCashflow ? '+' : '-'}
                  className={`font-mono text-lg font-semibold tabular-nums ${isPositiveCashflow ? 'text-positive' : 'text-negative'}`}
                />
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--ink-3)]">
            <span>Inkomen: <MaskedAmount value={monthlyIncome} className="font-mono tabular-nums" /></span>
            <span>Uitgaven: <MaskedAmount value={monthlyExpenses} className="font-mono tabular-nums" /></span>
          </div>
        </div>

        {/* Expense trend card */}
        {expenseHistory.length >= 2 && (
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                  Uitgaventrend
                </p>
                <MaskedAmount
                  value={expenseHistory[expenseHistory.length - 1].value}
                  className="mt-1 font-mono text-lg font-semibold tabular-nums text-[var(--ink)]"
                />
              </div>
              <MiniSparkline
                points={expenseHistory}
                strokeColor="var(--color-expense-500)"
                fillColor="var(--color-expense-200)"
              />
            </div>
            {expenseHistory.length >= 2 && (
              <p className="mt-2 text-[11px] text-[var(--ink-3)]">
                {(() => {
                  const curr = expenseHistory[expenseHistory.length - 1].value
                  const prev = expenseHistory[expenseHistory.length - 2].value
                  const delta = prev > 0 ? ((curr - prev) / prev) * 100 : 0
                  if (Math.abs(delta) < 1) return 'Stabiel t.o.v. vorige maand'
                  return `${delta > 0 ? '+' : ''}${delta.toFixed(0)}% t.o.v. vorige maand`
                })()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Vaste lasten — link naar de canonieke plek (/overzicht/cashflow) ──
          De volledige vaste-kosten-analyse leeft op de Cashflow-hefboom-
          pagina (Vaste-lasten-tab); hier alleen een compacte teaser zodat
          de dashboard-sectie niet dubbelt met die pagina. */}
      {totalMonthly > 0 && (
        <Link
          href="/overzicht/cashflow?view=vaste-lasten"
          className="group flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 transition-colors hover:border-[var(--ink-3)]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-violet-50 text-violet-700 shrink-0">
            <Receipt className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--ink)]">Vaste lasten &amp; abonnementen</p>
            <p className="text-[11px] text-[var(--ink-3)]">
              <MaskedAmount value={totalMonthly} className="font-mono tabular-nums" />/mnd — bekijk de analyse
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-4)] transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </section>
  )
}
