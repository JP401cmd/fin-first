'use client'

import { useMemo, useState } from 'react'
import { Search, ArrowDown, ArrowUp } from 'lucide-react'

export type TransactionRow = {
  id: string
  date: string // ISO yyyy-mm-dd
  description: string
  category?: string | null
  amount: number // negative = uitgave, positive = inkomst
  account_name?: string | null
}

type FilterMode = 'all' | 'expense' | 'income'

const FILTERS: { id: FilterMode; label: string }[] = [
  { id: 'all', label: 'Alles' },
  { id: 'expense', label: 'Uitgaven' },
  { id: 'income', label: 'Inkomsten' },
]

function formatEUR(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDayHeader(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d)
}

/**
 * Transactie-feed: list-view van transacties met filter + zoek + dag-
 * groepering + totaal-counter. Stand-alone client-component zonder
 * data-fetching — krijgt transactions als prop.
 *
 * Gebruikt door de toekomstige CashflowViewSwitcher op
 * /overzicht/cashflow?view=transacties.
 */
export function TransactiesFeed({
  transactions,
  monthLabel,
}: {
  transactions: TransactionRow[]
  monthLabel?: string
}) {
  const [filter, setFilter] = useState<FilterMode>('all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return transactions.filter((tx) => {
      if (filter === 'expense' && tx.amount >= 0) return false
      if (filter === 'income' && tx.amount < 0) return false
      if (q && !tx.description.toLowerCase().includes(q)) return false
      return true
    })
  }, [transactions, filter, query])

  const grouped = useMemo(() => {
    const map = new Map<string, TransactionRow[]>()
    for (const tx of filtered) {
      const existing = map.get(tx.date) ?? []
      existing.push(tx)
      map.set(tx.date, existing)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  const totals = useMemo(() => {
    let expenses = 0
    let incomes = 0
    for (const tx of filtered) {
      if (tx.amount < 0) expenses += Math.abs(tx.amount)
      else incomes += tx.amount
    }
    return { count: filtered.length, expenses, incomes }
  }, [filtered])

  return (
    <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
      <header className="mb-4 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-semibold text-[var(--ink)]">
            Transacties
          </h2>
          {monthLabel && (
            <span className="text-[10px] uppercase tracking-[0.12em] font-mono text-[var(--ink-3)]">
              {monthLabel}
            </span>
          )}
        </div>

        {/* Filter-segmented + zoek-input */}
        <div className="flex flex-col sm:flex-row gap-2">
          <nav
            aria-label="Filter transacties op type"
            className="flex gap-1 rounded-2xl border border-[var(--border-ed)] bg-[var(--subtle)] p-1"
          >
            {FILTERS.map(({ id, label }) => {
              const active = filter === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  aria-pressed={active}
                  className={[
                    'flex-1 min-w-[72px] min-h-[44px] text-center text-xs sm:text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors',
                    active
                      ? 'bg-[var(--paper)] text-[var(--ink)] shadow-[var(--s1)]'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
                  ].join(' ')}
                >
                  {label}
                </button>
              )
            })}
          </nav>

          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-3)]"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek transactie..."
              className="w-full min-h-[44px] rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] pl-10 pr-3 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-2 focus:outline-[var(--ink)] focus:outline-offset-1"
            />
          </div>
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="py-12 flex flex-col items-center text-center text-[var(--ink-3)]">
          <Search className="w-8 h-8 mb-2 text-[var(--ink-4)]" />
          <p className="text-sm">
            {query.trim() ? 'Geen transactie gevonden voor je zoekopdracht.' : 'Geen transacties deze maand.'}
          </p>
        </div>
      ) : (
        <div role="list" className="space-y-4">
          {grouped.map(([date, rows]) => (
            <div key={date}>
              <div className="text-[10px] uppercase tracking-[0.12em] font-mono text-[var(--ink-3)] mb-1">
                {formatDayHeader(date)}
              </div>
              <ul className="divide-y divide-[var(--border-ed)]">
                {rows.map((tx) => (
                  <li
                    key={tx.id}
                    role="listitem"
                    className="flex items-center gap-3 py-2.5"
                  >
                    <span
                      className={[
                        'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center',
                        tx.amount < 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
                      ].join(' ')}
                      aria-hidden
                    >
                      {tx.amount < 0 ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--ink)] truncate">
                        {tx.description}
                      </div>
                      {(tx.category || tx.account_name) && (
                        <div className="text-[11px] text-[var(--ink-3)] truncate">
                          {tx.category}
                          {tx.category && tx.account_name ? ' · ' : ''}
                          {tx.account_name}
                        </div>
                      )}
                    </div>
                    <span
                      className={[
                        'font-mono text-sm font-semibold shrink-0',
                        tx.amount < 0 ? 'text-[var(--ink)]' : 'text-emerald-700',
                      ].join(' ')}
                    >
                      {tx.amount < 0 ? '−' : '+'}
                      {formatEUR(Math.abs(tx.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <footer className="mt-4 pt-4 border-t border-[var(--border-ed)] flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--ink-3)]">
          <span>
            <strong className="font-semibold text-[var(--ink-2)]">{totals.count}</strong>{' '}
            transactie{totals.count === 1 ? '' : 's'}
          </span>
          <span>
            Uit:{' '}
            <strong className="font-semibold text-amber-700">{formatEUR(totals.expenses)}</strong>
          </span>
          <span>
            In:{' '}
            <strong className="font-semibold text-emerald-700">{formatEUR(totals.incomes)}</strong>
          </span>
        </footer>
      )}
    </section>
  )
}
