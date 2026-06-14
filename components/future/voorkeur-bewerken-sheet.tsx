'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * VoorkeurBewerkenSheet — generieke inline-editor voor één markt-aanname.
 * Plan §6.3 Tab 4: "Inline-editor voor deze voorkeuren komt in volgende
 * iteratie." MVP-scope: inflatie + bruto rendement (de twee meest
 * tastbare getallen). Eindstrategie/onttrekking blijven read-only met
 * deeplink naar /identity/parameters.
 *
 * Persist via supabase.from('profiles').update({ [column]: value }).
 * router.refresh() trigt de horizon-engine om te herrekenen — de
 * VoorkeurenView toont meteen de nieuwe waarde, en de tijdas-grafiek
 * + briefing reflecteren de wijziging.
 */
export function VoorkeurBewerkenSheet({
  title,
  column,
  currentValuePct,
  minPct,
  maxPct,
  stepPct,
  helperText,
  onClose,
}: {
  /** Heading-tekst in de sheet ("Inflatie", "Bruto rendement"). */
  title: string
  /** Profile-kolom om te updaten (inflation_rate / expected_return). */
  column: 'inflation_rate' | 'expected_return'
  /** Huidige waarde in percentage-vorm (bv. 2.5 = 2.5%). */
  currentValuePct: number
  /** Validatie-grenzen in percentages (default 0-15). */
  minPct?: number
  maxPct?: number
  /** Step-grootte voor input (default 0.1). */
  stepPct?: number
  /** Helper-tekst onder het input-veld voor context. */
  helperText?: string
  onClose: () => void
}) {
  const [value, setValue] = useState(String(currentValuePct))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const min = minPct ?? 0
  const max = maxPct ?? 15
  const step = stepPct ?? 0.1

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const pct = Number(value)
    if (!Number.isFinite(pct)) {
      setError('Waarde moet een getal zijn.')
      return
    }
    if (pct < min || pct > max) {
      setError(`Waarde moet tussen ${min}% en ${max}% liggen.`)
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Niet ingelogd.')
      setSaving(false)
      return
    }
    // Persist als fractie (0.025 voor 2.5%), conform horizon-data-loader.
    const fraction = pct / 100
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ [column]: fraction })
      .eq('id', user.id)
    if (updateError) {
      setError(`Opslaan mislukt: ${updateError.message}`)
      setSaving(false)
      return
    }
    setSaving(false)
    onClose()
    router.refresh()
  }

  return (
    <div
      role="dialog"
      aria-label={`Bewerk ${title}`}
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
              Voorkeur bewerken
            </div>
            <h2 className="font-serif text-lg text-[var(--ink)] mt-0.5">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            {error}
          </div>
        )}

        <label className="block mb-3">
          <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
            Waarde (%)
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="flex-1 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
              required
              autoFocus
            />
            <span className="text-sm text-[var(--ink-3)]">%</span>
          </div>
          {helperText && (
            <p className="mt-1.5 text-[11px] text-[var(--ink-3)] italic leading-snug">
              {helperText}
            </p>
          )}
        </label>

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
          >
            Annuleer
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--paper)] hover:bg-[var(--ink-2)] transition-colors disabled:opacity-50"
          >
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </form>
    </div>
  )
}
