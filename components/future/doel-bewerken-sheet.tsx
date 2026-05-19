'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * DoelBewerkenSheet — quick-update flow per doel op /toekomst Doelen-tab.
 *
 * Plan §6.3 Tab 2: "Detail-pane bij klik (slide-in, edit + bijdrage-
 * monitor + acties van Will)". MVP-versie: alleen voortgang bijwerken
 * (current_value) + verwijderen. Volledige edit van naam/bedrag/datum
 * blijft op /will (legacy) totdat de detail-pane volledig is.
 *
 * Flow:
 *  1. User klikt op doel-card in Plannen-modus → opent dialog
 *  2. Dialog toont huidige voortgang + input voor nieuwe waarde
 *  3. Submit: supabase.update — router.refresh → card update direct
 *  4. Optioneel: Verwijderen-knop met confirm voor doel-delete
 */
export function DoelBewerkenSheet({
  goalId,
  goalName,
  currentValue,
  targetValue,
  onClose,
}: {
  goalId: string
  goalName: string
  currentValue: number
  targetValue: number
  onClose: () => void
}) {
  const [newValue, setNewValue] = useState(String(currentValue))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const numeric = Number(newValue)
    if (!Number.isFinite(numeric) || numeric < 0) {
      setError('Waarde moet een getal ≥ 0 zijn.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('goals')
      .update({ current_value: numeric })
      .eq('id', goalId)
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
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: deleteError } = await supabase
      .from('goals')
      .delete()
      .eq('id', goalId)
    if (deleteError) {
      setError(`Verwijderen mislukt: ${deleteError.message}`)
      setSaving(false)
      return
    }
    setSaving(false)
    onClose()
    router.refresh()
  }

  const pct = targetValue > 0 ? Math.min(100, (Number(newValue) / targetValue) * 100) : 0

  return (
    <div
      role="dialog"
      aria-label={`Doel bewerken: ${goalName}`}
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
              Voortgang bijwerken
            </div>
            <h2 className="font-serif text-lg text-[var(--ink)] mt-0.5 truncate">
              {goalName}
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
            Huidige waarde (€)
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={100}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
            required
            autoFocus
          />
        </label>

        <div className="mb-1 flex items-baseline justify-between text-[11px] text-[var(--ink-3)]">
          <span>Voortgang</span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
        <div
          className="h-1.5 rounded-full bg-[var(--subtle)] overflow-hidden mb-4"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        {confirmDelete ? (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3">
            <p className="text-xs text-red-800 mb-2">
              Weet je zeker dat je &quot;{goalName}&quot; wilt verwijderen?
              Voortgang gaat verloren.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
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

        <div className="flex items-center justify-between gap-2">
          {!confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1 text-xs text-red-700 hover:text-red-800 hover:underline"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Verwijder doel
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
