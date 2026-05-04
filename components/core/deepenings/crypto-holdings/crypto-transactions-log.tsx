'use client'

// crypto-transactions-log.tsx — laatste N trades over alle holdings,
// gegroepeerd per maand. Mirror van de transactiegeschiedenis-sectie op de
// holding-detailpagina maar dan portfolio-breed.
//
// Krant-keuzes:
//   - Maand-headers in serif italic ("Mei 2026"), tabel in mono. Dit
//     volgt het "redactionele kop + data-tabel"-patroon van de homepage.
//   - Geen pagination: we tonen wat de loader binnenhaalt (default 50).
//     Een toekomstige "Laad meer"-knop kan toegevoegd via een
//     `onLoadMore` callback — bewust niet nu.
//   - Klik op een rij → holding-detailpagina. Hover-feedback alleen op de
//     rij, geen aparte chevron — krant-toon.

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Receipt } from 'lucide-react'
import type { CryptoTransactionRow } from '@/lib/crypto-holdings-data'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

const TYPE_LABEL: Record<CryptoTransactionRow['type'], string> = {
  buy: 'Koop',
  sell: 'Verkoop',
  deposit: 'Storting',
  withdrawal: 'Opname',
  fee: 'Kosten',
  reward: 'Reward',
}

interface CryptoTransactionsLogProps {
  transactions: CryptoTransactionRow[]
}

interface MonthGroup {
  key: string // "2026-05"
  label: string // "Mei 2026"
  rows: CryptoTransactionRow[]
}

export function CryptoTransactionsLog({ transactions }: CryptoTransactionsLogProps) {
  const groups = useMemo(() => groupByMonth(transactions), [transactions])

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          Recente transacties
        </p>
        {transactions.length > 0 && (
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
            laatste {transactions.length}
          </p>
        )}
      </div>

      {transactions.length === 0 ? (
        <EmptyTransactions />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <MonthSection key={group.key} group={group} />
          ))}
        </div>
      )}
    </section>
  )
}

function MonthSection({ group }: { group: MonthGroup }) {
  const router = useRouter()
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  return (
    <div>
      <h3 className="mb-2 font-serif text-[13px] italic text-[var(--ink-3)]">
        {group.label}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sr-only">
            <tr>
              <th>Datum</th>
              <th>Type</th>
              <th>Coin</th>
              <th>Units</th>
              <th>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((tx) => {
              const totalDisplay = tx.totalAmount != null ? fc(tx.totalAmount) : '—'
              const tone =
                tx.type === 'buy' || tx.type === 'deposit' || tx.type === 'reward'
                  ? 'positive'
                  : tx.type === 'sell' || tx.type === 'withdrawal' || tx.type === 'fee'
                    ? 'negative'
                    : 'neutral'
              return (
                <tr
                  key={tx.id}
                  onClick={() => router.push(`/core/assets/crypto/${tx.holdingId}`)}
                  className="cursor-pointer border-b border-[var(--border-ed)] transition-colors hover:bg-[var(--subtle)]"
                >
                  <td className="py-2 pr-3 font-mono text-[12px] tabular-nums text-[var(--ink-3)]">
                    {formatShortDate(tx.date)}
                  </td>
                  <td className="py-2 px-3 text-[11px] uppercase tracking-[0.06em] text-[var(--ink-2)]">
                    {TYPE_LABEL[tx.type]}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[12px] font-bold tabular-nums text-[var(--ink)]">
                        {tx.symbol.toUpperCase()}
                      </span>
                      <span className="truncate text-[11px] text-[var(--ink-3)]">
                        {tx.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[12px] tabular-nums text-[var(--ink-2)]">
                    {formatUnitsLong(tx.units)}
                  </td>
                  <td
                    className={`py-2 pl-3 text-right font-mono text-[12px] tabular-nums ${
                      tone === 'positive'
                        ? 'text-positive'
                        : tone === 'negative'
                          ? 'text-negative'
                          : 'text-[var(--ink)]'
                    }`}
                  >
                    {totalDisplay}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EmptyTransactions() {
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center bg-[var(--paper)]">
        <Receipt className="h-5 w-5 text-kern-600" aria-hidden="true" />
      </div>
      <p className="font-serif italic text-base leading-relaxed text-[var(--ink-2)]">
        Nog geen trades binnen. Zodra Bitvavo of een andere bron trade-import
        levert verschijnt hier de feed.
      </p>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function groupByMonth(rows: CryptoTransactionRow[]): MonthGroup[] {
  const buckets = new Map<string, CryptoTransactionRow[]>()
  for (const r of rows) {
    const key = r.date.slice(0, 7) // "YYYY-MM"
    const arr = buckets.get(key) ?? []
    arr.push(r)
    buckets.set(key, arr)
  }
  // Map → array, descending op month-key.
  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, rowsForMonth]) => ({
      key,
      label: monthLabel(key),
      rows: rowsForMonth,
    }))
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  if (!year || !month) return monthKey
  const date = new Date(Date.UTC(year, month - 1, 1))
  const fmt = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' })
  const txt = fmt.format(date)
  // Title-case eerste letter (NL locale geeft kleine letters voor maanden).
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

function formatUnitsLong(units: number): string {
  if (!isFinite(units)) return '0'
  const decimals = Math.abs(units) >= 1 ? 6 : 8
  return units.toFixed(decimals).replace(/\.?0+$/, '')
}
