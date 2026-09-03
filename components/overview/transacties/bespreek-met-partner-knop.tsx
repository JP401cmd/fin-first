'use client'

/**
 * "Bespreken met {partner}" — zet een vlag op een gedeelde boeking zodat hij
 * in de "Te bespreken"-lijst van het huishouden verschijnt (ADR 0128).
 *
 * Wordt als `secondaryAction` in het bewerkformulier gerenderd, alleen wanneer
 * de gebruiker een huishouden heeft én de boeking gedeeld is. Of de rekening
 * ook op 'full' staat weet de client niet — dat beslist de database
 * (INSERT-policy); een weigering komt als 403 met een leesbare tekst terug en
 * wordt hier inline getoond. Geen GET, geen eigen state buiten deze knop: na
 * succes ververst `router.refresh()` de server-geladen lijst.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquarePlus } from 'lucide-react'
import { TRANSACTION_FLAG_NOTE_MAX } from '@/lib/household/transaction-flags'

export function BespreekMetPartnerKnop({
  transactionId,
  partnerName,
}: {
  transactionId: string
  partnerName: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const partner = partnerName ?? 'je partner'

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/transaction-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, note: note.trim() || null }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error || 'Markeren mislukt. Probeer het opnieuw.')
        return
      }
      setDone(true)
      setOpen(false)
      startTransition(() => router.refresh())
    } catch {
      setError('Markeren mislukt. Probeer het opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <p className="mt-4 text-sm text-[var(--ink-2)]" data-testid="tx-flag-done">
        Staat op jullie lijst <span className="font-medium text-[var(--ink)]">Te bespreken</span>.
      </p>
    )
  }

  return (
    <div className="mt-4 space-y-2" data-testid="tx-flag">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-full items-center justify-center gap-2 border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden />
          Bespreken met {partner}
        </button>
      ) : (
        <div className="space-y-2 border border-[var(--border-ed)] p-3">
          <label htmlFor="tx-flag-note" className="block text-xs font-medium text-[var(--ink-2)]">
            Waarom wil je dit bespreken? (optioneel)
          </label>
          <textarea
            id="tx-flag-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={TRANSACTION_FLAG_NOTE_MAX}
            rows={2}
            placeholder="Bijv. hoort dit bij de vakantiepot?"
            className="w-full border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)]"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-[var(--paper)] disabled:opacity-50"
            >
              {busy ? 'Bezig…' : 'Op de lijst zetten'}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-negative">
          {error}
        </p>
      )}
    </div>
  )
}
