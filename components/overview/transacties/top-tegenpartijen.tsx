'use client'

import { useMemo, useState } from 'react'
import { Kicker } from '@/components/editorial'
import { FinTable } from '@/components/app/fin-table'
import { MaskedAmount } from '@/components/app/masked-amount'
import { topCounterparties, type AnalysisTransaction } from '@/lib/transaction-insights'

/**
 * TopTegenpartijen — top-5 uitgaven-tegenpartijen in de periode, sorteerbaar
 * op bedrag of aantal. Elke rij is klikbaar → opent de counterparty-analyse.
 *
 * Presentational: rekent enkel `topCounterparties` over de doorgegeven
 * transactions; de selectie-callback en het ophalen van detail-data zijn de
 * verantwoordelijkheid van de orchestrator.
 */

type SortBy = 'total' | 'count'

export function TopTegenpartijen({
  transactions,
  onSelect,
}: {
  transactions: AnalysisTransaction[]
  onSelect: (cp: { name: string; iban: string | null }) => void
}) {
  const [sortBy, setSortBy] = useState<SortBy>('total')

  const rows = useMemo(
    () => topCounterparties(transactions, { direction: 'expense', sortBy, limit: 5 }),
    [transactions, sortBy],
  )

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <Kicker>Top tegenpartijen · uitgaven</Kicker>
        <SortToggle value={sortBy} onChange={setSortBy} />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">Geen uitgaven in deze periode.</p>
      ) : (
        <FinTable>
          <FinTable.Header>
            <FinTable.Row dashed={false}>
              <FinTable.Th>#</FinTable.Th>
              <FinTable.Th>Tegenpartij</FinTable.Th>
              <FinTable.Th align="right">Aantal</FinTable.Th>
              <FinTable.Th align="right">Totaal</FinTable.Th>
            </FinTable.Row>
          </FinTable.Header>
          <FinTable.Body>
            {rows.map((cp, i) => (
              <FinTable.Row
                key={`${cp.name}-${cp.iban ?? i}`}
                onClick={() => onSelect({ name: cp.name, iban: cp.iban })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect({ name: cp.name, iban: cp.iban })
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Analyseer ${cp.name}`}
                className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]"
              >
                <FinTable.Td muted>{i + 1}</FinTable.Td>
                <FinTable.Td>
                  <span className="block max-w-[22ch] truncate text-[var(--ink)]">{cp.name}</span>
                </FinTable.Td>
                <FinTable.Td numeric muted>
                  {cp.count}
                </FinTable.Td>
                <FinTable.Td numeric>
                  <MaskedAmount value={cp.total} tone="wil" />
                </FinTable.Td>
              </FinTable.Row>
            ))}
          </FinTable.Body>
        </FinTable>
      )}
    </div>
  )
}

function SortToggle({ value, onChange }: { value: SortBy; onChange: (v: SortBy) => void }) {
  const options: { key: SortBy; label: string }[] = [
    { key: 'total', label: 'Bedrag' },
    { key: 'count', label: 'Aantal' },
  ]
  return (
    <div className="inline-flex border border-[var(--border-ed)]" role="group" aria-label="Sorteren op">
      {options.map((opt) => {
        const active = opt.key === value
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={active}
            className={[
              'min-h-[32px] px-2.5 text-[10px] font-mono uppercase tracking-[0.12em] transition-colors',
              'border-r border-[var(--border-ed)] last:border-r-0',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]',
              active
                ? 'bg-[var(--ink)] text-[var(--paper)]'
                : 'bg-transparent text-[var(--ink-3)] hover:text-[var(--ink)]',
            ].join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
