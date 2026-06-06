'use client'

import { Kicker } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { CounterpartyAgg } from '@/lib/transaction-insights'

/**
 * NieuweTegenpartijen — tegenpartijen die deze periode voor het eerst
 * verschijnen (t.o.v. de prior-set). De parent rekent de `CounterpartyAgg[]`
 * vooraf uit (via `newCounterparties`), dit component toont enkel.
 *
 * Compacte, klikbare lijst (cap ~6 rijen) → opent counterparty-analyse.
 */

/** Toon maximaal dit aantal rijen — houdt het paneel compact in de zijbalk. */
const MAX_ROWS = 6

export function NieuweTegenpartijen({
  items,
  onSelect,
}: {
  items: CounterpartyAgg[]
  onSelect: (cp: { name: string; iban: string | null }) => void
}) {
  const rows = items.slice(0, MAX_ROWS)

  return (
    <div className="space-y-2.5">
      <Kicker>Nieuwe tegenpartijen</Kicker>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">Geen nieuwe tegenpartijen deze periode.</p>
      ) : (
        <div className="divide-y divide-[var(--border-ed)] border border-[var(--border-ed)]">
          {rows.map((cp, i) => (
            <button
              key={`${cp.name}-${cp.iban ?? i}`}
              type="button"
              onClick={() => onSelect({ name: cp.name, iban: cp.iban })}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--ink)]">{cp.name}</p>
                <p className="text-xs text-[var(--ink-3)]">{cp.count}×</p>
              </div>
              <span className="shrink-0">
                <MaskedAmount value={cp.total} tone="wil" className="text-sm" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
