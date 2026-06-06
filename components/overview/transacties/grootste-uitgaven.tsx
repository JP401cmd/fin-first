'use client'

import { useMemo } from 'react'
import { Kicker } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { largestTransactions, type AnalysisTransaction } from '@/lib/transaction-insights'

/**
 * GrootsteUitgaven — top-5 grootste enkele uitgaven in de periode. Klikbare
 * lijst-rijen openen de transactie ter bewerking/inzicht (via orchestrator).
 *
 * Presentational: rekent enkel `largestTransactions` over de input.
 */

const NL_MONTH_ABBR = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

/** "5 mrt" — compacte dag+maand-notatie (lokaal geparsed, geen UTC-drift). */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${NL_MONTH_ABBR[m - 1]}`
}

export function GrootsteUitgaven({
  transactions,
  onSelect,
}: {
  transactions: AnalysisTransaction[]
  onSelect: (tx: AnalysisTransaction) => void
}) {
  const rows = useMemo(
    () => largestTransactions(transactions, { direction: 'expense', limit: 5 }),
    [transactions],
  )

  return (
    <div className="space-y-2.5">
      <Kicker>Grootste uitgaven</Kicker>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">Geen uitgaven in deze periode.</p>
      ) : (
        <div className="divide-y divide-[var(--border-ed)] border border-[var(--border-ed)]">
          {rows.map((tx) => (
            <button
              key={tx.id}
              type="button"
              onClick={() => onSelect(tx)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--ink)]">{tx.description}</p>
                <p className="text-xs text-[var(--ink-3)]">
                  {formatShortDate(tx.date)}
                  {tx.counterparty_name && (
                    <span className="ml-1.5">· {tx.counterparty_name}</span>
                  )}
                </p>
              </div>
              <span className="shrink-0">
                <MaskedAmount value={tx.amount} tone="wil" className="text-sm" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
