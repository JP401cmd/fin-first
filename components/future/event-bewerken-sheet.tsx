'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { LifeEvent } from '@/lib/horizon-data'
import { isStrategyManagedEvent } from '@/lib/strategy-events'

/**
 * EventBewerkenSheet — quick-edit flow per event op /toekomst
 * Gebeurtenissen-tab. Plan §6.3: "events → openen als sheet (kort
 * formulier)".
 *
 * MVP-scope: alleen de meest gebruikte velden bewerkbaar maken
 * (naam, target_age, one_time_cost) + verwijder-knop. Complexere
 * properties (monthly_cost_change, duration_months, metadata) blijven
 * voorlopig via /toekomst/whatif horizon-flow.
 */

export function EventBewerkenSheet({
  event,
  onClose,
}: {
  event: LifeEvent
  onClose: () => void
}) {
  const [name, setName] = useState(event.name)
  const [targetAge, setTargetAge] = useState(
    event.target_age != null ? String(event.target_age) : '',
  )
  const [oneTimeCost, setOneTimeCost] = useState(String(event.one_time_cost))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isStrategyManagedEvent(event)) {
      setError('Deze gebeurtenis wordt via een strategie beheerd — bewerk haar daar.')
      return
    }
    if (!name.trim()) {
      setError('Naam is verplicht.')
      return
    }
    const ageNum = Number(targetAge)
    if (!Number.isFinite(ageNum) || ageNum < 18 || ageNum > 120) {
      setError('Leeftijd moet tussen 18 en 120 liggen.')
      return
    }
    const costNum = Number(oneTimeCost)
    if (!Number.isFinite(costNum)) {
      setError('Eenmalige kosten moet een getal zijn (kan negatief voor opbrengst).')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('life_events')
      .update({
        name: name.trim(),
        target_age: ageNum,
        target_date: null, // gebruik leeftijd-only nu (geen exacte datum-edit MVP)
        one_time_cost: costNum,
      })
      .eq('id', event.id)
    if (updateError) {
      setError(`Opslaan mislukt: ${updateError.message}`)
      setSaving(false)
      return
    }
    setSaving(false)
    onClose()
    router.refresh()
  }

  async function handleDelete() {
    if (isStrategyManagedEvent(event)) {
      setError('Deze gebeurtenis wordt via een strategie beheerd — verwijder haar daar.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: deleteError } = await supabase
      .from('life_events')
      .delete()
      .eq('id', event.id)
    if (deleteError) {
      setError(`Verwijderen mislukt: ${deleteError.message}`)
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
      aria-label={`Event bewerken: ${event.name}`}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
              Gebeurtenis bewerken
            </div>
            <h2 className="font-serif text-lg text-[var(--ink)] mt-0.5 truncate">
              {event.name}
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

        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
              Naam
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
              required
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
              Leeftijd
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={18}
              max={120}
              step={1}
              value={targetAge}
              onChange={(e) => setTargetAge(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
              required
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
              Eenmalig bedrag (€) <span className="font-normal text-[var(--ink-3)]">— negatief = opbrengst</span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              step={100}
              value={oneTimeCost}
              onChange={(e) => setOneTimeCost(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
              required
            />
          </label>
        </div>

        <p className="mt-3 text-[10px] italic text-[var(--ink-4)]">
          Maandelijkse kosten, duur en geavanceerde velden via{' '}
          <span className="font-medium">/toekomst/whatif</span>.
        </p>

        {confirmDelete ? (
          <div className="mt-4 rounded-xl border border-negative/30 bg-negative/10 px-3 py-3">
            <p className="text-xs text-negative mb-2">
              Weet je zeker dat je &quot;{event.name}&quot; wilt verwijderen?
              De tijdas-projectie wordt direct bijgewerkt.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="rounded-lg bg-negative px-3 py-1.5 text-xs font-semibold text-white hover:bg-negative/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Verwijderen…' : 'Ja, verwijder'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]"
              >
                Annuleer
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 mt-4">
          {!confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1 text-xs text-negative hover:underline"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Verwijder
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
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
        </div>
      </form>
    </div>
  )
}
