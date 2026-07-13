'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'

/**
 * VoorkeurBewerkenSheet — generieke inline-editor voor één markt-aanname.
 * Plan §6.3 Tab 4: "Inline-editor voor deze voorkeuren komt in volgende
 * iteratie." MVP-scope: inflatie + bruto rendement (de twee meest
 * tastbare getallen). Eindstrategie/onttrekking blijven read-only met
 * deeplink naar /identity/parameters.
 *
 * Persist via supabase.from('profiles').update({ [column]: value }).
 * router.refresh() trigt de horizon-kernel om te herrekenen — de
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

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
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
    <ShellOverlay
      open
      onClose={onClose}
      kind="sheet"
      size="sm"
      title="Voorkeur bewerken"
      footer={
        <ModalFooter
          primary={{ label: 'Opslaan', onClick: () => handleSubmit(), loading: saving }}
          secondary={{ label: 'Annuleer', onClick: onClose }}
        />
      }
    >
      <form onSubmit={handleSubmit} className="p-5 sm:p-6">
        <h2 className="font-serif text-lg text-[var(--ink)] mb-4">
          {title}
        </h2>

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
      </form>
    </ShellOverlay>
  )
}
