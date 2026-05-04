'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Calendar, Hash, ChevronDown, ChevronUp, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  computeCounterpartyStats,
  computeMonthCategoryBreakdown,
  type CounterpartyTransaction,
  type CounterpartyStats,
  type CategoryBreakdown,
} from '@/lib/counterparty-analysis'
import { TransactionForm } from '@/components/app/transaction-form'
import type { Budget } from '@/lib/budget-data'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── Props ────────────────────────────────────────────────────────────────────

type BudgetGroup = { parent: Budget; children: Budget[] }

type EditTx = {
  id: string; account_id: string; budget_id: string | null; date: string; amount: number;
  description: string; counterparty_name: string | null; counterparty_iban: string | null;
  is_income: boolean; notes: string | null; category_source: string; is_split?: boolean
}

type CounterpartyAnalysisPanelProps = {
  counterpartyName: string | null
  counterpartyIban: string | null
  onBack: () => void
  budgetGroups: BudgetGroup[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateNL(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}-${m}-${y}`
}

const CATEGORY_COLORS = [
  'var(--color-kern-500)', 'var(--color-wil-500)', 'var(--color-horizon-500)',
  'var(--color-income-500)', 'var(--color-expense-400)',
  'oklch(0.6 0.15 250)', 'oklch(0.6 0.12 330)', 'oklch(0.55 0.1 80)',
]

// ── Component ────────────────────────────────────────────────────────────────

export function CounterpartyAnalysisPanel({
  counterpartyName,
  counterpartyIban,
  onBack,
  budgetGroups,
}: CounterpartyAnalysisPanelProps) {
  const { masked } = useMaskedAmounts()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<CounterpartyStats | null>(null)
  const [allTxs, setAllTxs] = useState<CounterpartyTransaction[]>([])
  const [showAll, setShowAll] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [editTx, setEditTx] = useState<EditTx | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const monthDetailRef = useRef<HTMLDivElement>(null)

  // Fetch all transactions for this counterparty
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      const supabase = createClient()

      let query = supabase
        .from('transactions')
        .select('id, date, amount, description, budget_id, is_income, budget:budgets(name)')
        .order('date', { ascending: false })
        .limit(1000)

      if (counterpartyIban) {
        query = query.eq('counterparty_iban', counterpartyIban)
      } else if (counterpartyName) {
        query = query.ilike('counterparty_name', counterpartyName)
      } else {
        setLoading(false)
        return
      }

      const { data, error: err } = await query
      if (cancelled) return

      if (err) {
        setError('Fout bij ophalen transacties.')
        setLoading(false)
        return
      }

      // Supabase returns budget as array due to join — unwrap
      const txs: CounterpartyTransaction[] = (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        date: row.date as string,
        amount: Number(row.amount),
        description: row.description as string,
        budget_id: row.budget_id as string | null,
        is_income: row.is_income as boolean,
        budget: Array.isArray(row.budget) ? (row.budget[0] as { name: string } | undefined) ?? null : row.budget as { name: string } | null,
      }))

      setAllTxs(txs)
      setStats(computeCounterpartyStats(txs))
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [counterpartyIban, counterpartyName, refreshKey])

  // Monthly data — last 6 or all
  const visibleMonths = useMemo(() => {
    if (!stats) return []
    return showAll ? stats.monthlyBreakdown : stats.monthlyBreakdown.slice(-6)
  }, [stats, showAll])

  // Month-filtered data
  const monthTransactions = useMemo(() => {
    if (!selectedMonth) return []
    return allTxs.filter(tx => tx.date.startsWith(selectedMonth)).sort((a, b) => b.date.localeCompare(a.date))
  }, [allTxs, selectedMonth])

  const monthCategories = useMemo(() => {
    if (!selectedMonth || monthTransactions.length === 0) return []
    return computeMonthCategoryBreakdown(monthTransactions)
  }, [monthTransactions, selectedMonth])

  // Recent txs (only when no month selected)
  const recentTxs = useMemo(() => allTxs.slice(0, 5), [allTxs])

  const hasEnoughForTrend = (stats?.transactionCount ?? 0) >= 3

  // Open a transaction for editing (stacked BottomSheet)
  const openTxForEdit = useCallback(async (txId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('transactions')
      .select('id, account_id, budget_id, date, amount, description, counterparty_name, counterparty_iban, is_income, notes, category_source, is_split')
      .eq('id', txId)
      .single()
    if (data) setEditTx(data as EditTx)
  }, [])

  // Bar click handler
  const handleBarClick = useCallback((monthKey: string) => {
    setSelectedMonth(prev => prev === monthKey ? null : monthKey)
  }, [])

  // Scroll month detail into view
  useEffect(() => {
    if (selectedMonth && monthDetailRef.current) {
      monthDetailRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedMonth])

  // Keyboard handler for bars
  const handleBarKeyDown = useCallback((e: React.KeyboardEvent, monthKey: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleBarClick(monthKey)
    }
  }, [handleBarClick])

  // ── Loading state ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 p-5">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors">
          <ArrowLeft className="h-4 w-4" /> Terug
        </button>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
          ))}
        </div>
        <p className="text-center text-sm text-[var(--ink-3)]">Transacties analyseren...</p>
      </div>
    )
  }

  // ── Error state ──────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-4 p-5">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors">
          <ArrowLeft className="h-4 w-4" /> Terug
        </button>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  // ── Empty / no match ─────────────────────────────────────────────────
  if (!stats || stats.transactionCount === 0) {
    return (
      <div className="space-y-4 p-5">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors">
          <ArrowLeft className="h-4 w-4" /> Terug
        </button>
        <p className="text-sm text-[var(--ink-3)]">Geen transacties gevonden voor deze tegenpartij.</p>
      </div>
    )
  }

  // ── Chart data ──────────────────────────────────────────────────────
  const months = visibleMonths
  const maxAbs = Math.max(...months.map(m => Math.abs(m.total)), 1)

  // Selected month label for display
  const selectedMonthLabel = selectedMonth
    ? months.find(m => m.month === selectedMonth)?.label ?? selectedMonth
    : null

  return (
    <div className="space-y-5 p-5">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Terug
      </button>

      {/* Header */}
      <div>
        <h4 className="text-base font-semibold text-[var(--ink)]">
          {counterpartyName ?? 'Onbekende tegenpartij'}
        </h4>
        {counterpartyIban && (
          <p className="mt-0.5 font-mono text-xs text-[var(--ink-3)]">{counterpartyIban}</p>
        )}
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-1 gap-2 min-[375px]:grid-cols-2">
        <MetricCell label="Totaal uitgegeven" value={<MaskedAmount value={stats.totalSpent} tone="wil" />} negative={stats.totalSpent < 0} />
        <MetricCell label="Totaal ontvangen" value={<MaskedAmount value={stats.totalReceived} tone="wil" />} positive={stats.totalReceived > 0} />
        <MetricCell label="Aantal transacties" value={String(stats.transactionCount)} icon={<Hash className="h-3 w-3" />} />
        <MetricCell label="Gemiddeld bedrag" value={<MaskedAmount value={stats.averageAmount} tone="wil" />} />
      </div>

      {/* Frequency + Period */}
      <div className="flex flex-wrap items-center gap-3">
        {hasEnoughForTrend && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            stats.frequency.confidence === 'high'
              ? 'bg-kern-50 text-kern-700 border border-kern-200'
              : stats.frequency.confidence === 'medium'
                ? 'bg-[var(--subtle)] text-[var(--ink-2)] border border-[var(--border-ed)]'
                : 'bg-[var(--subtle)] text-[var(--ink-3)] border border-[var(--border-ed)]'
          }`}>
            {stats.frequency.label}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Calendar className="h-3 w-3" />
          {formatDateNL(stats.firstDate)} — {formatDateNL(stats.lastDate)}
        </span>
      </div>

      {/* Monthly trend chart */}
      {hasEnoughForTrend && months.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h5 className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Maandelijks overzicht
            </h5>
            <div className="flex items-center gap-2">
              {selectedMonth && (
                <button
                  type="button"
                  onClick={() => setSelectedMonth(null)}
                  className="inline-flex items-center gap-1 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
                >
                  Alle maanden <X className="h-3 w-3" />
                </button>
              )}
              {!selectedMonth && stats.monthlyBreakdown.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAll(!showAll)}
                  className="inline-flex items-center gap-1 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
                >
                  {showAll ? <><ChevronUp className="h-3 w-3" /> Laatste 6</> : <><ChevronDown className="h-3 w-3" /> Toon alles</>}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-end gap-1" style={{ height: 80 }}>
            {months.map((m) => {
              const barH = (Math.abs(m.total) / maxAbs) * 100
              const isSelected = selectedMonth === m.month
              const isDimmed = selectedMonth !== null && !isSelected
              const barColor = m.total <= 0 ? 'var(--color-expense-400)' : 'var(--color-income-500)'

              return (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => handleBarClick(m.month)}
                  onKeyDown={(e) => handleBarKeyDown(e, m.month)}
                  aria-pressed={isSelected}
                  className="group relative flex flex-1 flex-col items-center focus-visible:outline-none"
                  style={{ height: '100%' }}
                  title={`${m.label}: ${formatMaskedCurrency(m.total, masked)} (${m.count}x)`}
                >
                  {/* Spent bar */}
                  <div className="mt-auto w-full">
                    <div
                      className="w-full rounded-t transition-opacity"
                      style={{
                        height: `${Math.max(barH * 0.8, 2)}px`,
                        backgroundColor: barColor,
                        opacity: isDimmed ? 0.35 : 1,
                        outline: isSelected ? `2px solid var(--color-kern-600)` : undefined,
                        outlineOffset: isSelected ? '2px' : undefined,
                      }}
                    />
                  </div>
                  {/* Month label */}
                  <p className={`mt-1 text-[9px] transition-colors ${isSelected ? 'font-semibold text-[var(--ink-2)]' : 'text-[var(--ink-3)]'}`}>
                    {m.label.split(' ')[0]}
                  </p>
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute -top-10 z-10 rounded bg-zinc-800 px-2 py-1 text-[10px] text-white opacity-0 shadow-[var(--s2)] transition-opacity group-hover:opacity-100">
                    {<MaskedAmount value={m.total} tone="wil" />} ({m.count}x)
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Not enough data message */}
      {!hasEnoughForTrend && (
        <p className="text-sm text-[var(--ink-3)]">Te weinig transacties om een patroon te tonen.</p>
      )}

      {/* ── Month detail (when a bar is selected) ─────────────────── */}
      {selectedMonth && monthTransactions.length > 0 && (
        <div ref={monthDetailRef} key={selectedMonth}>
          {/* Month header */}
          <div className="mb-3 flex items-center justify-between">
            <h5 className="text-sm font-semibold capitalize text-[var(--ink)]">
              {selectedMonthLabel}
            </h5>
            <span className="font-mono text-sm tabular-nums text-[var(--ink-2)]">
              {<MaskedAmount value={monthTransactions.reduce((s, t) => s + t.amount, 0)} tone="wil" />}
              <span className="ml-1.5 text-xs text-[var(--ink-3)]">({monthTransactions.length}x)</span>
            </span>
          </div>

          {/* Month category breakdown */}
          {monthCategories.length > 0 && (
            <div className="mb-3">
              <div className="space-y-1.5">
                {monthCategories.map((cat, i) => (
                  <CategoryRow key={cat.budgetId ?? '__none__'} cat={cat} colorIndex={i} />
                ))}
              </div>
            </div>
          )}

          {/* Month transactions list */}
          <div className="divide-y divide-[var(--border-ed)] rounded-[var(--r)] border border-[var(--border-ed)]">
            {monthTransactions.map(tx => (
              <button
                key={tx.id}
                type="button"
                onClick={() => openTxForEdit(tx.id)}
                disabled={false}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--subtle)] disabled:cursor-default"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--ink)]">{tx.description}</p>
                  <p className="text-xs text-[var(--ink-3)]">
                    {formatDateNL(tx.date)}
                    {tx.budget?.name && <span className="ml-1.5">· {tx.budget.name}</span>}
                  </p>
                </div>
                <span className={`shrink-0 font-mono text-sm tabular-nums ${
                  tx.amount >= 0 ? 'text-[var(--color-income-600)]' : 'text-[var(--ink)]'
                }`}>
                  {<MaskedAmount value={tx.amount} tone="wil" />}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Default bottom sections (when no month selected) ──────── */}
      {!selectedMonth && (
        <>
          {/* Category breakdown */}
          {stats.categoryBreakdown.length > 0 && (
            <div>
              <h5 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Categorieverdeling
              </h5>
              <div className="space-y-1.5">
                {stats.categoryBreakdown.map((cat, i) => (
                  <CategoryRow key={cat.budgetId ?? '__none__'} cat={cat} colorIndex={i} />
                ))}
              </div>
            </div>
          )}

          {/* Trend indicator */}
          {hasEnoughForTrend && stats.monthlyBreakdown.length >= 3 && (
            <TrendIndicator months={stats.monthlyBreakdown} />
          )}

          {/* Recent transactions */}
          {recentTxs.length > 0 && (
            <div>
              <h5 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Recente transacties
              </h5>
              <div className="divide-y divide-[var(--border-ed)] rounded-[var(--r)] border border-[var(--border-ed)]">
                {recentTxs.map(tx => (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => openTxForEdit(tx.id)}
                    disabled={false}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--subtle)] disabled:cursor-default"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[var(--ink)]">{tx.description}</p>
                      <p className="text-xs text-[var(--ink-3)]">{formatDateNL(tx.date)}</p>
                    </div>
                    <span className={`shrink-0 font-mono text-sm tabular-nums ${
                      tx.amount >= 0 ? 'text-[var(--color-income-600)]' : 'text-[var(--ink)]'
                    }`}>
                      {<MaskedAmount value={tx.amount} tone="wil" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {/* Stacked TransactionForm for editing a tx from within analysis */}
      {editTx && (
        <TransactionForm
          transaction={editTx}
          accountId={editTx.account_id}
          budgetGroups={budgetGroups}
          disableAnalysis
          onClose={() => setEditTx(null)}
          onSaved={() => {
            setEditTx(null)
            setRefreshKey(k => k + 1)
          }}
        />
      )}
    </div>
  )
}

// ── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({ cat, colorIndex }: { cat: CategoryBreakdown; colorIndex: number }) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] px-2.5 py-1.5">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length] }}
      />
      <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">
        {cat.budgetName}
      </span>
      <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--ink-2)]">
        {<MaskedAmount value={cat.total} tone="wil" />}
      </span>
      <span className="shrink-0 text-xs text-[var(--ink-3)]">
        {cat.percentage}%
      </span>
    </div>
  )
}

// ── Metric cell ──────────────────────────────────────────────────────────────

function MetricCell({ label, value, negative, positive, icon }: {
  label: string
  value: React.ReactNode
  negative?: boolean
  positive?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${
        negative ? 'text-[var(--color-expense-500)]'
        : positive ? 'text-[var(--color-income-600)]'
        : 'text-[var(--ink)]'
      }`}>
        {icon && <span className="mr-1 inline-flex align-text-bottom">{icon}</span>}
        {value}
      </p>
    </div>
  )
}

// ── Trend indicator ──────────────────────────────────────────────────────────

function TrendIndicator({ months }: { months: { total: number }[] }) {
  const recent = months.slice(-3)
  const prior = months.slice(-6, -3)
  if (prior.length < 3) return null

  const avgRecent = recent.reduce((s, m) => s + m.total, 0) / recent.length
  const avgPrior = prior.reduce((s, m) => s + m.total, 0) / prior.length
  const diff = avgRecent - avgPrior
  const pctChange = avgPrior !== 0 ? Math.round((diff / Math.abs(avgPrior)) * 100) : 0

  if (Math.abs(pctChange) < 5) return null

  const isExpenseIncrease = diff < 0
  const Icon = isExpenseIncrease ? TrendingUp : diff > 0 ? TrendingDown : Minus

  return (
    <div className={`flex items-center gap-2 rounded-[var(--r)] border px-3 py-2 text-xs ${
      isExpenseIncrease
        ? 'border-[var(--color-expense-200)] bg-[var(--color-expense-50)] text-[var(--color-expense-600)]'
        : 'border-[var(--color-income-200)] bg-[var(--color-income-50)] text-[var(--color-income-600)]'
    }`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>
        {isExpenseIncrease ? 'Stijgende uitgaven' : 'Dalende uitgaven'}
        {' '}({Math.abs(pctChange)}% t.o.v. vorige periode)
      </span>
    </div>
  )
}
