'use client'

/**
 * "Te bespreken" op /overzicht/cashflow/transacties — de open vlaggen die jij
 * of je partner op gedeelde boekingen hebt gezet (ADR 0128, fase 1).
 *
 * DATAPAD (ADR 0058): krijgt zijn gegevens als props van de server-page
 * (`loadTransactionFlags`) en haalt zelf niets op om te tonen. Muteren gaat via
 * /api/transaction-flags; na een geslaagde mutatie doet `router.refresh()` de
 * server-loader opnieuw draaien — dezelfde bron als bij een volle paginalading.
 *
 * ZICHTBAARHEID is hier geen zorg van dit component: de RLS op
 * `transaction_flags` erft de SELECT-policy van `transactions`, dus wat hier
 * binnenkomt mag de kijker zien. Het component filtert niets.
 *
 * Rendert alleen wanneer de page een huishouden mét partner heeft gevonden
 * (`data` is dan niet null). Bedragen via <MaskedAmount> (privacy-modus).
 *
 * KLEUR: module-identiteit via `--module-active-*` (dit leeft op /overzicht).
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, MessageSquare, Undo2 } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'
import { CardEditorial, SectionLabel } from '@/components/editorial'
import type { TransactionFlagItem, TransactionFlagsData } from '@/lib/household/transaction-flags'

const NL_MONTH_ABBR = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

/** "5 mrt" — lokaal geparsed (geen UTC-drift), zelfde vorm als de detail-sheet. */
function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${NL_MONTH_ABBR[m - 1]}`
}

type Busy = { id: string; action: 'resolve' | 'withdraw' } | null

export function TeBesprekenSection({
  data,
  onOpenTransaction,
}: {
  data: TransactionFlagsData
  /** Klik op een rij opent de boeking in het bestaande bewerkformulier. */
  onOpenTransaction?: (transactionId: string) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)

  const partner = data.partnerName ?? 'je partner'

  async function mutate(item: TransactionFlagItem, action: 'resolve' | 'withdraw') {
    setBusy({ id: item.id, action })
    setError(null)
    try {
      const res =
        action === 'resolve'
          ? await fetch('/api/transaction-flags', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: item.id, status: 'resolved' }),
            })
          : await fetch(`/api/transaction-flags?id=${encodeURIComponent(item.id)}`, {
              method: 'DELETE',
            })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error || 'Bijwerken mislukt. Probeer het opnieuw.')
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError('Bijwerken mislukt. Probeer het opnieuw.')
    } finally {
      setBusy(null)
    }
  }

  const count = data.open.length

  return (
    <CardEditorial className="p-4 sm:p-6">
      <SectionLabel num={count > 0 ? String(count) : undefined}>
        Te bespreken met {partner}
      </SectionLabel>

      {count === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">
          Niets open. Open een gedeelde boeking en kies{' '}
          <span className="font-medium text-[var(--ink-2)]">Bespreken met {partner}</span> om ’m hier
          te zetten.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-ed)] border border-[var(--border-ed)]">
          {data.open.map((item) => {
            const tx = item.transaction
            const rowBusy = busy?.id === item.id
            return (
              <li key={item.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3">
                <button
                  type="button"
                  onClick={() => onOpenTransaction?.(tx.id)}
                  disabled={!onOpenTransaction}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left enabled:hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[var(--ink)]">{tx.description}</span>
                    <span className="block truncate text-xs text-[var(--ink-3)]">
                      {formatShortDate(tx.date)}
                      {tx.counterparty_name ? ` · ${tx.counterparty_name}` : ''}
                      {' · gemarkeerd door '}
                      {item.flaggedByLabel}
                    </span>
                    {item.note && (
                      <span className="mt-1 block text-xs italic text-[var(--ink-2)]">“{item.note}”</span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${
                      tx.amount < 0 ? 'text-[var(--ink)]' : 'text-[var(--color-income-700)]'
                    }`}
                  >
                    {tx.amount < 0 ? '−' : '+'}
                    <MaskedAmount value={Math.abs(tx.amount)} tone="inherit" />
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void mutate(item, 'resolve')}
                    disabled={rowBusy || isPending}
                    className="inline-flex items-center gap-1.5 border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    {rowBusy && busy?.action === 'resolve' ? 'Bezig…' : 'Besproken'}
                  </button>
                  {item.flaggedByMe && (
                    <button
                      type="button"
                      onClick={() => void mutate(item, 'withdraw')}
                      disabled={rowBusy || isPending}
                      aria-label="Markering intrekken"
                      className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] disabled:opacity-50"
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden />
                      Intrekken
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {data.resolvedCount > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          {data.resolvedCount} eerder besproken
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-negative">
          {error}
        </p>
      )}
    </CardEditorial>
  )
}
