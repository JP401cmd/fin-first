'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, Check, AlertTriangle, Loader2, Plus, ExternalLink } from 'lucide-react'
import type { CustomCalculatorRow } from '@/lib/calculator/types'
import type { CalculatorRequirementCheck } from '@/lib/calculator/requirements'

/**
 * DuplicateConfirmSheet — bevestigingsmodaal voor "Voeg toe aan mijn
 * rekenhulpen". Toont per-vereiste een groen/grijs vinkje, en:
 *
 *  - Alle vereisten ✓  → groene "Klaar om te gebruiken"-banner + grote knop
 *                        die direct POST'ed naar `/api/calculators/duplicate`.
 *  - Eén of meer gaten → zachte oranje banner met dieplink naar de eerste
 *                        ontbrekende vereiste, plus "Toch toevoegen"-knop
 *                        die met de gaten leeft (rekenhulp werkt nog, alleen
 *                        moet de gebruiker daar handmatig invullen).
 *
 * Het achterliggende contract van de duplicate-route:
 *   POST /api/calculators/duplicate  body: { sourceId: string }
 *   resp: { ok:true, newId } | { ok:false, error }
 */

interface DuplicateApiOk {
  ok: true
  /**
   * De API-route (`/api/calculators/duplicate`) levert het ID van de
   * nieuwe kopie als `id` af. We hernoemen het in de callback naar de
   * algemenere `newId`-naam zodat callers (zoals de bibliotheek-UI)
   * niet hoeven te weten of een kopie of een originele insert was.
   */
  id: string
}
interface DuplicateApiErr {
  ok: false
  error: string
}
type DuplicateApiResponse = DuplicateApiOk | DuplicateApiErr

export function DuplicateConfirmSheet({
  open,
  onClose,
  calculator,
  requirementsChecks,
  onDuplicated,
}: {
  open: boolean
  onClose: () => void
  calculator: CustomCalculatorRow
  requirementsChecks: CalculatorRequirementCheck[]
  onDuplicated?: (newId: string) => void
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Alle vereisten in groen? Dan tonen we de "groene" variant. Een
  // calculator zonder enige vereiste valt ook in deze tak — geen drempels.
  const allMet = requirementsChecks.every((c) => c.met)
  const firstMissing = requirementsChecks.find((c) => !c.met)

  if (!open) return null

  async function handleDuplicate() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/calculators/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: calculator.id }),
      })
      let data: DuplicateApiResponse | null = null
      try {
        data = (await res.json()) as DuplicateApiResponse
      } catch {
        data = null
      }
      if (!res.ok || !data || data.ok === false) {
        const msg = data && data.ok === false ? data.error : 'Toevoegen mislukt — probeer het opnieuw.'
        setError(msg)
        setSubmitting(false)
        return
      }
      setSubmitting(false)
      onDuplicated?.(data.id)
      onClose()
      router.refresh()
    } catch {
      setSubmitting(false)
      setError('Netwerkfout — probeer het opnieuw.')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Voeg ${calculator.name} toe`}
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-horizon-50 flex items-center justify-center shrink-0">
              <Plus className="w-4 h-4 text-horizon-700" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
                Toevoegen aan jouw rekenhulpen
              </div>
              <h2 className="font-serif text-lg text-[var(--ink)] mt-0.5 truncate">
                {calculator.name}
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

        {calculator.description && (
          <p className="text-xs text-[var(--ink-2)] leading-relaxed mb-4">
            {calculator.description}
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            {error}
          </div>
        )}

        {requirementsChecks.length > 0 && (
          <section className="mb-4">
            <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)] mb-2">
              Werkt het beste met
            </div>
            <ul className="space-y-1.5">
              {requirementsChecks.map((req) => (
                <li
                  key={req.kind}
                  className="flex items-start gap-2 text-xs text-[var(--ink-2)]"
                >
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0 mt-0.5 ${
                      req.met
                        ? 'bg-positive/15 text-positive'
                        : 'bg-[var(--subtle)] text-[var(--ink-3)]'
                    }`}
                    aria-hidden="true"
                  >
                    <Check className="w-2.5 h-2.5" strokeWidth={3} />
                  </span>
                  <span className={req.met ? 'text-[var(--ink-2)]' : 'text-[var(--ink-3)]'}>
                    {req.detail}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {allMet ? (
          <div
            role="status"
            className="rounded-xl border border-positive/20 bg-positive/5 px-3 py-2.5 text-xs text-positive"
          >
            <strong className="font-semibold">Klaar om te gebruiken</strong> —
            jouw gegevens worden automatisch ingevuld.
          </div>
        ) : (
          firstMissing && (
            <div
              role="note"
              className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-900"
            >
              Je hebt nog geen{' '}
              <strong className="font-semibold">{firstMissing.label.toLowerCase()}</strong>{' '}
              in je profiel. De rekenhulp werkt wel, maar je vult{' '}
              {firstMissing.label.toLowerCase()} handmatig in.
            </div>
          )
        )}

        <div className="mt-5 flex items-center justify-end gap-2 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
          >
            Annuleer
          </button>
          {!allMet && firstMissing && (
            <Link
              href={firstMissing.deepLink}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm font-semibold text-[var(--ink-2)] hover:border-[var(--ink-3)] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              Eerst toevoegen aan profiel
            </Link>
          )}
          <button
            type="button"
            onClick={handleDuplicate}
            disabled={submitting}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
              allMet
                ? 'bg-positive hover:bg-positive/90'
                : 'bg-[var(--ink)] hover:bg-[var(--ink-2)]'
            }`}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : allMet ? (
              <Plus className="w-4 h-4" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            )}
            {allMet ? 'Toevoegen aan mijn lijst' : 'Toch toevoegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
