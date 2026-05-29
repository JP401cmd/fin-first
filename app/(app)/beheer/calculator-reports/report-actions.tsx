'use client'

import { useState, useTransition } from 'react'
import { Check, EyeOff, Loader2 } from 'lucide-react'
import { hideCalculatorAction, markReviewedAction } from './actions'

/**
 * ReportActions — twee admin-knoppen per melding ("Markeer als beoordeeld"
 * en "Verberg calculator"). Pure UI-laag; alle effecten gaan via
 * server-actions in `./actions.ts`.
 *
 * Bij "Verberg" tonen we een korte bevestigingsstap (geen native confirm)
 * zodat de admin geen calculator per ongeluk uit de bibliotheek trekt.
 * Bij "Markeer" geen confirm — dat is een reversibele administratieve
 * actie.
 */
export function ReportActions({
  reportId,
  calculatorId,
  canHide,
}: {
  reportId: string
  /** null als de calculator inmiddels is verwijderd (FK gebroken). */
  calculatorId: string | null
  /** False als de calculator al `is_public = false` is — dan blokkeren
   *  we de "Verberg"-knop omdat hij geen effect heeft. */
  canHide: boolean
}) {
  const [confirmingHide, setConfirmingHide] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleMarkReviewed() {
    setError(null)
    startTransition(async () => {
      const res = await markReviewedAction(reportId)
      if (!res.ok) {
        setError(res.error ?? 'Markeren mislukt.')
      }
    })
  }

  function handleHide() {
    if (!calculatorId) return
    setError(null)
    startTransition(async () => {
      const res = await hideCalculatorAction(reportId, calculatorId)
      if (!res.ok) {
        setError(res.error ?? 'Verbergen mislukt.')
        setConfirmingHide(false)
      }
    })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {error && (
        <span
          role="alert"
          className="text-[11px] text-amber-700 max-w-[240px] truncate"
          title={error}
        >
          {error}
        </span>
      )}

      <button
        type="button"
        onClick={handleMarkReviewed}
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--ink-2)] hover:border-[var(--ink-3)] transition-colors disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="w-3 h-3" aria-hidden="true" />
        )}
        Markeer als beoordeeld
      </button>

      {canHide && calculatorId &&
        (confirmingHide ? (
          // Inline confirm — geen native dialog. Twee duidelijke takken.
          <span className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/60 px-2 py-1 text-[11px] text-rose-800">
            Weet je het zeker?
            <button
              type="button"
              onClick={handleHide}
              disabled={isPending}
              className="rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {isPending ? '…' : 'Ja, verberg'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingHide(false)}
              disabled={isPending}
              className="rounded-md px-1.5 py-0.5 text-[11px] text-rose-800 hover:bg-rose-100"
            >
              Annuleer
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingHide(true)}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-50"
          >
            <EyeOff className="w-3 h-3" aria-hidden="true" />
            Verberg calculator
          </button>
        ))}
    </div>
  )
}
