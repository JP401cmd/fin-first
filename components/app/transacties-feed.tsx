'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, ArrowDown, ArrowUp } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { AnalysisTransaction } from '@/lib/transaction-insights'

/**
 * Smalle rij-vorm die de cashflow-Sankey + geldstroom-weergaven gebruiken.
 *
 * BEWAAR DEZE EXPORT: `lib/cashflow-data-loader.ts`,
 * `components/overview/cashflow-sankey.tsx` en
 * `components/overview/transacties-geldstroom.tsx` importeren dit type. De feed
 * zelf draait inmiddels op het rijkere `AnalysisTransaction`-type (zie props),
 * maar `TransactionRow` blijft bestaan voor die afnemers.
 */
export type TransactionRow = {
  id: string
  date: string // ISO yyyy-mm-dd
  description: string
  category?: string | null
  amount: number // negative = uitgave, positive = inkomst
  account_name?: string | null
}

type FilterMode = 'all' | 'expense' | 'income'

/** Budget-pill-selectie: alles, niet-gecategoriseerd, of een concreet budget-id. */
type BudgetFilter = 'all' | 'uncategorized' | string

const FILTERS: { id: FilterMode; label: string }[] = [
  { id: 'all', label: 'Alles' },
  { id: 'expense', label: 'Uitgaven' },
  { id: 'income', label: 'Inkomsten' },
]

function formatDayHeader(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d)
}

/** Gedeelde pill-styling — spiegelt de rekening-filter exact. */
function pillClass(active: boolean): string {
  return [
    'px-2 py-1 rounded font-semibold transition-colors',
    active
      ? 'bg-[var(--ink)] text-[var(--paper)]'
      : 'bg-[var(--subtle)] text-[var(--ink-2)] hover:bg-[var(--border-ed)]',
  ].join(' ')
}

interface Props {
  transactions: AnalysisTransaction[]
  /** Leesbaar periode-label, getoond in de header (vervangt het oude monthLabel). */
  periodLabel?: string
  /** Budget-opties voor de budget-filter. Leeg/weggelaten → budget-filter verborgen. */
  budgetOptions?: { id: string; name: string }[]
  /** Rij-klik-handler. Ontbreekt → rijen zijn niet-interactief. */
  onSelect?: (tx: AnalysisTransaction) => void
}

/**
 * Transactie-feed: list-view van transacties met type-filter, zoek,
 * rekening-filter, budget-filter, dag-groepering en totaal-counter.
 * Pure presentatie-component zonder data-fetching — krijgt transactions als
 * prop (bedragen zijn al perspectief-geschaald door de parent).
 *
 * Gerenderd op de transactie-analysepagina
 * (/overzicht/cashflow/transacties). Rijen zijn klikbaar wanneer `onSelect`
 * is meegegeven.
 */
export function TransactiesFeed({
  transactions,
  periodLabel,
  budgetOptions,
  onSelect,
}: Props) {
  const [filter, setFilter] = useState<FilterMode>('all')
  const [query, setQuery] = useState('')
  const [accountFilter, setAccountFilter] = useState<string>('all')
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>('all')

  // Verzamel unieke rekening-namen voor de rekening-filter.
  const accounts = useMemo(() => {
    const set = new Set<string>()
    for (const tx of transactions) {
      if (tx.account_name) set.add(tx.account_name)
    }
    return Array.from(set).sort()
  }, [transactions])

  // Budget-filter alleen tonen als de parent budget-opties meegeeft.
  const showBudgetFilter = Boolean(budgetOptions && budgetOptions.length > 0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return transactions.filter((tx) => {
      if (filter === 'expense' && tx.amount >= 0) return false
      if (filter === 'income' && tx.amount < 0) return false
      if (accountFilter !== 'all' && tx.account_name !== accountFilter) return false
      if (budgetFilter === 'uncategorized' && tx.budget_id) return false
      if (budgetFilter !== 'all' && budgetFilter !== 'uncategorized' && tx.budget_id !== budgetFilter) {
        return false
      }
      if (q) {
        const inDescription = tx.description.toLowerCase().includes(q)
        const inCounterparty = (tx.counterparty_name ?? '').toLowerCase().includes(q)
        if (!inDescription && !inCounterparty) return false
      }
      return true
    })
  }, [transactions, filter, query, accountFilter, budgetFilter])

  const grouped = useMemo(() => {
    const map = new Map<string, AnalysisTransaction[]>()
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
          {periodLabel && (
            <span className="text-[10px] uppercase tracking-[0.12em] font-mono text-[var(--ink-3)]">
              {periodLabel}
            </span>
          )}
        </div>

        {transactions.length > 0 && (
          <p className="text-xs text-[var(--ink-3)] leading-relaxed">
            Gecombineerd overzicht van alle gekoppelde rekeningen.{' '}
            <Link
              href="/overzicht/bezittingen/cash"
              className="text-violet-700 font-medium hover:underline"
            >
              Beheer koppelingen →
            </Link>
          </p>
        )}

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

        {/* Rekening-filter — alleen tonen als er meerdere rekeningen zijn. */}
        {accounts.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-[var(--ink-3)] font-medium mr-1">Rekening:</span>
            <button
              type="button"
              onClick={() => setAccountFilter('all')}
              aria-pressed={accountFilter === 'all'}
              className={pillClass(accountFilter === 'all')}
            >
              Alle
            </button>
            {accounts.map((acc) => (
              <button
                key={acc}
                type="button"
                onClick={() => setAccountFilter(acc)}
                aria-pressed={accountFilter === acc}
                className={pillClass(accountFilter === acc)}
              >
                {acc}
              </button>
            ))}
          </div>
        )}

        {/* Budget-filter — alleen tonen als de parent budget-opties meegeeft. */}
        {showBudgetFilter && (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-[var(--ink-3)] font-medium mr-1">Categorie:</span>
            <button
              type="button"
              onClick={() => setBudgetFilter('all')}
              aria-pressed={budgetFilter === 'all'}
              className={pillClass(budgetFilter === 'all')}
            >
              Alle
            </button>
            <button
              type="button"
              onClick={() => setBudgetFilter('uncategorized')}
              aria-pressed={budgetFilter === 'uncategorized'}
              className={pillClass(budgetFilter === 'uncategorized')}
            >
              Zonder categorie
            </button>
            {budgetOptions!.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBudgetFilter(b.id)}
                aria-pressed={budgetFilter === b.id}
                className={pillClass(budgetFilter === b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {filtered.length === 0 ? (
        <div className="py-12 flex flex-col items-center text-center text-[var(--ink-3)] max-w-md mx-auto">
          <Search className="w-8 h-8 mb-2 text-[var(--ink-4)]" />
          {query.trim() ? (
            <p className="text-sm">Geen transactie gevonden voor je zoekopdracht.</p>
          ) : transactions.length === 0 ? (
            <>
              <p className="text-sm font-medium text-[var(--ink-2)] mb-1">Nog geen transacties.</p>
              <p className="text-xs">
                Koppel een bankrekening of importeer een MT940/CSV-bestand om je
                transacties hier te zien.
              </p>
            </>
          ) : (
            <p className="text-sm">Geen transacties met dit filter.</p>
          )}
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
                  <TransactionListRow key={tx.id} tx={tx} onSelect={onSelect} />
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
            <strong className="font-semibold text-amber-700">{formatCurrency(totals.expenses)}</strong>
          </span>
          <span>
            In:{' '}
            <strong className="font-semibold text-emerald-700">{formatCurrency(totals.incomes)}</strong>
          </span>
        </footer>
      )}
    </section>
  )
}

/**
 * Eén transactie-rij. Klikbaar (als `<button>`) wanneer `onSelect` is
 * meegegeven; anders een niet-interactief `<li>` met de oude opmaak. De
 * binnen-layout (in/uit-pijl, omschrijving, rekening-badge + categorie, bedrag)
 * is in beide gevallen identiek.
 */
function TransactionListRow({
  tx,
  onSelect,
}: {
  tx: AnalysisTransaction
  onSelect?: (tx: AnalysisTransaction) => void
}) {
  // Tegenpartij alleen tonen als die afwijkt van de omschrijving — anders ruis.
  const counterparty = tx.counterparty_name?.trim()
  const showCounterparty =
    Boolean(counterparty) && counterparty!.toLowerCase() !== tx.description.trim().toLowerCase()

  const content = (
    <>
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
        {showCounterparty && (
          <div className="text-[11px] text-[var(--ink-3)] truncate">{counterparty}</div>
        )}
        <div className="text-[11px] text-[var(--ink-3)] truncate flex items-center gap-1.5">
          {tx.account_name && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--subtle)] text-[var(--ink-2)] font-medium">
              {tx.account_name}
            </span>
          )}
          {tx.category && <span>{tx.category}</span>}
          {!tx.account_name && !tx.category && (
            <span className="italic">Geen rekening</span>
          )}
        </div>
      </div>
      <span
        className={[
          'font-mono text-sm font-semibold shrink-0',
          tx.amount < 0 ? 'text-[var(--ink)]' : 'text-emerald-700',
        ].join(' ')}
      >
        {tx.amount < 0 ? '−' : '+'}
        {formatCurrency(Math.abs(tx.amount))}
      </span>
    </>
  )

  if (onSelect) {
    return (
      <li role="listitem">
        <button
          type="button"
          onClick={() => onSelect(tx)}
          className="w-full flex items-center gap-3 py-2.5 text-left rounded-lg hover:bg-[var(--subtle)] focus:outline-2 focus:outline-[var(--ink)] focus:outline-offset-1 transition-colors"
        >
          {content}
        </button>
      </li>
    )
  }

  return (
    <li role="listitem" className="flex items-center gap-3 py-2.5">
      {content}
    </li>
  )
}
