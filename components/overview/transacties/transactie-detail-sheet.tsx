'use client'

import { useMemo } from 'react'
import { MaskedAmount } from '@/components/app/masked-amount'
import { summarizeFlow, type AnalysisTransaction } from '@/lib/transaction-insights'

/**
 * TransactieDetailSheet — herbruikbare lijst-weergave voor een selectie
 * transacties (één dag vanuit de heatmap, of één weekdag vanuit het
 * weekdag-patroon). Bedoeld als inhoud van een BottomSheet (de orchestrator
 * levert de sheet + titel), in dezelfde stijl als de tegenpartij-drilldown:
 * een samenvatting bovenaan + klikbare transactie-rijen → bewerk-paneel.
 *
 * Presentational: rekent enkel een samenvatting + sorteert; geen data-fetching.
 */

const NL_MONTH_ABBR = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

/** "5 mrt" — lokaal geparsed (geen UTC-drift). */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${NL_MONTH_ABBR[m - 1]}`
}

export function TransactieDetailSheet({
  transactions,
  showDate = false,
  onSelectTx,
}: {
  transactions: AnalysisTransaction[]
  /** Toon de datum per rij (voor de weekdag-weergave over meerdere datums). */
  showDate?: boolean
  onSelectTx: (tx: AnalysisTransaction) => void
}) {
  const sorted = useMemo(
    () =>
      [...transactions].sort(
        (a, b) => b.date.localeCompare(a.date) || Math.abs(b.amount) - Math.abs(a.amount),
      ),
    [transactions],
  )
  const summary = useMemo(() => summarizeFlow(transactions), [transactions])

  if (transactions.length === 0) {
    return <p className="p-5 text-sm text-[var(--ink-3)]">Geen transacties op deze dag.</p>
  }

  return (
    <div className="space-y-4 p-5">
      {/* Samenvatting */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--ink-3)]">
        <span>
          <strong className="font-semibold text-[var(--ink-2)]">{summary.count}</strong>{' '}
          transactie{summary.count === 1 ? '' : 's'}
        </span>
        <span>
          Uit:{' '}
          <strong className="font-semibold text-[var(--color-expense-600)]">
            <MaskedAmount value={summary.expense} tone="inherit" />
          </strong>
        </span>
        <span>
          In:{' '}
          <strong className="font-semibold text-[var(--color-income-700)]">
            <MaskedAmount value={summary.income} tone="inherit" />
          </strong>
        </span>
      </div>

      {/* Transactie-rijen */}
      <div className="divide-y divide-[var(--border-ed)] border border-[var(--border-ed)]">
        {sorted.map((tx) => (
          <button
            key={tx.id}
            type="button"
            onClick={() => onSelectTx(tx)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-[var(--ink)]">{tx.description}</p>
              <p className="truncate text-xs text-[var(--ink-3)]">
                {showDate && <span>{formatShortDate(tx.date)}</span>}
                {showDate && (tx.counterparty_name || tx.category) && <span> · </span>}
                {tx.counterparty_name && <span>{tx.counterparty_name}</span>}
                {tx.counterparty_name && tx.category && <span> · </span>}
                {tx.category && <span>{tx.category}</span>}
              </p>
            </div>
            <span
              className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${
                tx.amount < 0 ? 'text-[var(--ink)]' : 'text-[var(--color-income-700)]'
              }`}
            >
              {tx.amount < 0 ? '−' : '+'}
              <MaskedAmount value={Math.abs(tx.amount)} tone="inherit" />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
