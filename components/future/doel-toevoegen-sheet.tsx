'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * DoelToevoegenSheet — plan §6.3 Tab 2 detail-pane: doelen toevoegen
 * direct op de Doelen-tab zonder doorklikken naar /will.
 *
 * Form-velden (minimaal):
 *  - Naam (verplicht, max 100 chars)
 *  - Doelbedrag in EUR (verplicht, positief getal)
 *  - Streefdatum (optioneel, ISO yyyy-mm-dd)
 *  - Doel-type (savings / wealth / debt) — default 'savings'
 *
 * Edit-flow blijft op /will (legacy). Deze sheet is alleen voor het
 * snel toevoegen-pad zodat de Doelen-tab een complete CRUD-plek
 * wordt zonder bestaande pagina te dupliceren.
 */

type GoalType = 'savings' | 'wealth' | 'debt'

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  savings: 'Sparen',
  wealth: 'Vermogen groeien',
  debt: 'Schuld aflossen',
}

/**
 * Doel-presets — drie veel-gebruikte startsjablonen (CBS-/Nibud-typische
 * bedragen). Klik vult naam + bedrag + type in zodat de gebruiker niet
 * vanaf nul hoeft te beginnen. Datum blijft leeg; gebruiker stelt zelf in
 * wanneer hij dat doel wil bereiken.
 */
type GoalPreset = {
  key: string
  emoji: string
  name: string
  target: number
  goalType: GoalType
  hint: string
}

const PRESETS: GoalPreset[] = [
  {
    key: 'noodfonds',
    emoji: '🛟',
    name: 'Noodfonds',
    target: 5000,
    goalType: 'savings',
    hint: '3 maanden vaste lasten',
  },
  {
    key: 'schuldvrij',
    emoji: '✂️',
    name: 'Schuldvrij',
    target: 10000,
    goalType: 'debt',
    hint: 'Aflossen tot 0',
  },
  {
    key: 'vrijheidsgetal',
    emoji: '🏁',
    name: 'Vrijheidsgetal',
    target: 500000,
    goalType: 'wealth',
    hint: 'FIRE = 25× jaaruitgaven',
  },
]

export function DoelToevoegenSheet() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [goalType, setGoalType] = useState<GoalType>('savings')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function reset() {
    setName('')
    setTargetValue('')
    setTargetDate('')
    setGoalType('savings')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Naam is verplicht.')
      return
    }
    const numericTarget = Number(targetValue)
    if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
      setError('Doelbedrag moet een positief getal zijn.')
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
    const { error: insertError } = await supabase.from('goals').insert({
      user_id: user.id,
      name: name.trim(),
      goal_type: goalType,
      target_value: numericTarget,
      current_value: 0,
      target_date: targetDate || null,
      icon: 'Target',
      color: 'teal',
      is_completed: false,
    })
    if (insertError) {
      setError(`Opslaan mislukt: ${insertError.message}`)
      setSaving(false)
      return
    }
    setSaving(false)
    setOpen(false)
    reset()
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        Doel toevoegen
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Doel toevoegen"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={() => {
            setOpen(false)
            reset()
          }}
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
                  <Target className="w-4 h-4 text-teal-700" aria-hidden="true" />
                </span>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
                    Toekomst — nieuw doel
                  </div>
                  <h2 className="font-serif text-lg text-[var(--ink)] mt-0.5">
                    Doel toevoegen
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  reset()
                }}
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

            {/* Snel-start presets — één klik vult naam/bedrag/type in. */}
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)] mb-2">
                Snel starten met
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => {
                      setName(preset.name)
                      setTargetValue(String(preset.target))
                      setGoalType(preset.goalType)
                    }}
                    className="flex flex-col items-start gap-0.5 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-2.5 text-left hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
                  >
                    <span className="text-base leading-none" aria-hidden="true">
                      {preset.emoji}
                    </span>
                    <span className="text-xs font-semibold text-[var(--ink)] mt-1">
                      {preset.name}
                    </span>
                    <span className="text-[10px] text-[var(--ink-3)] leading-snug">
                      {preset.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Naam
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="bv. Spaargeld voor woning"
                  maxLength={100}
                  className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
                  required
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Doelbedrag (€)
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={100}
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="50000"
                  className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
                  required
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Streefdatum (optioneel)
                </span>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Type
                </span>
                <select
                  value={goalType}
                  onChange={(e) => setGoalType(e.target.value as GoalType)}
                  className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
                >
                  {(Object.keys(GOAL_TYPE_LABELS) as GoalType[]).map((t) => (
                    <option key={t} value={t}>
                      {GOAL_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  reset()
                }}
                className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
              >
                Annuleer
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--paper)] hover:bg-[var(--ink-2)] transition-colors disabled:opacity-50"
              >
                {saving ? 'Opslaan…' : 'Doel toevoegen'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
