'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Flag, Loader2, CheckCircle2 } from 'lucide-react'

/**
 * ReportSheet — modaal om een gepubliceerde rekenhulp te melden.
 *
 * Eén textarea (max 1000 chars) met voorbeeld-redenen in de placeholder.
 * Submit POST'ed naar `/api/calculators/[id]/report` (Agent A). Na
 * succes tonen we een korte bedankboodschap (~2s) en sluiten dan
 * automatisch — dit ontmoedigt herhaalde melding-spam en bevestigt
 * tegelijk dat de admins het zien.
 *
 * Stijl: zelfde overlay-patroon als `<DoelToevoegenSheet>` /
 * `<CalculatorToLifeEventSheet>` voor visuele consistentie binnen de
 * `components/future/` map.
 */

const MAX_REASON_LENGTH = 1000
const THANKS_DURATION_MS = 2000

export function ReportSheet({
  open,
  onClose,
  calculatorId,
  calculatorName,
}: {
  open: boolean
  onClose: () => void
  calculatorId: string
  calculatorName: string
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  // Bewaar de timer-handle in een ref zodat cleanup bij unmount of
  // vroegtijdige close geen leaked setTimeout achterlaat.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset interne state telkens als de sheet opent zodat een eerdere
  // bedankboodschap of fout-melding niet "blijft hangen" bij hergebruik.
  useEffect(() => {
    if (open) {
      setReason('')
      setError(null)
      setSubmitted(false)
      setSubmitting(false)
    }
  }, [open])

  // Clear pending close-timer als de sheet voortijdig unmount.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('Beschrijf kort wat er mis is.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/calculators/${encodeURIComponent(calculatorId)}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmed.slice(0, MAX_REASON_LENGTH) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Melding kon niet worden verzonden. Probeer het opnieuw.')
        setSubmitting(false)
        return
      }
      setSubmitting(false)
      setSubmitted(true)
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null
        onClose()
      }, THANKS_DURATION_MS)
    } catch {
      setSubmitting(false)
      setError('Netwerkfout — probeer het opnieuw.')
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Meld ${calculatorName}`}
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4 pb-[calc(1rem+var(--safe-area-bottom,0px))]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <Flag className="w-4 h-4 text-amber-700" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
                Rekenhulp melden
              </div>
              <h2 className="font-serif text-lg text-[var(--ink)] mt-0.5 truncate">
                {calculatorName}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        {submitted ? (
          // Bedankt-staat — we sluiten automatisch na 2s, maar tonen wel
          // expliciet dat de melding is binnengekomen zodat de gebruiker
          // het signaal krijgt dat zijn input ergens landt.
          <div
            role="status"
            className="flex flex-col items-center gap-2 rounded-xl border border-positive/20 bg-positive/5 py-6 px-4 text-center"
          >
            <CheckCircle2 className="w-7 h-7 text-positive" aria-hidden="true" />
            <p className="text-sm font-semibold text-[var(--ink)]">
              Bedankt voor je melding
            </p>
            <p className="text-xs text-[var(--ink-2)] leading-snug">
              Een beheerder bekijkt deze rekenhulp zo snel mogelijk.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div
                role="alert"
                className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
              >
                {error}
              </div>
            )}

            <label className="block">
              <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                Wat is er mis met deze rekenhulp?
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON_LENGTH))}
                rows={5}
                maxLength={MAX_REASON_LENGTH}
                placeholder="bv. Onjuiste formules · Specifiek advies · Persoonlijke bedragen in de naam · Anders"
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)] resize-none"
              />
              <span className="mt-1 block text-[11px] text-[var(--ink-3)] text-right tabular-nums">
                {reason.length}/{MAX_REASON_LENGTH}
              </span>
            </label>

            <p className="mt-3 text-[11px] text-[var(--ink-3)] leading-snug">
              Een beheerder bekijkt je melding. Geef bij twijfel ook een
              voorbeeld van wat klopt en wat niet.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
              >
                Annuleer
              </button>
              <button
                type="submit"
                disabled={submitting || !reason.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink)] text-[var(--paper)] px-4 py-2 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Flag className="w-4 h-4" aria-hidden="true" />
                )}
                Versturen
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
