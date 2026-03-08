'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, FolderOpen, Trash2, X, Check, Loader2, ChevronDown } from 'lucide-react'
import type { WhatIfOverrides } from './whatif-sliders'
import type { WhatIfEvent } from './whatif-events'
import type { SavedScenario } from '@/app/api/scenarios/route'
import { formatFireAgeShort } from '@/lib/horizon-data'

interface WhatIfScenariosProps {
  overrides: WhatIfOverrides
  events: WhatIfEvent[]
  fireAge: number | null
  onLoadScenario: (overrides: WhatIfOverrides, events: WhatIfEvent[]) => void
}

export function WhatIfScenarios({
  overrides,
  events,
  fireAge,
  onLoadScenario,
}: WhatIfScenariosProps) {
  const [scenarios, setScenarios] = useState<SavedScenario[]>([])
  const [loading, setLoading] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showList, setShowList] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Auto-clear messages
  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => { setError(null); setSuccess(null) }, 3500)
      return () => clearTimeout(t)
    }
  }, [error, success])

  // Load saved scenarios on mount
  const fetchScenarios = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/scenarios')
      if (res.ok) {
        const data = await res.json()
        setScenarios(data.scenarios ?? [])
      }
    } catch {
      // Silently fail — not critical
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchScenarios() }, [fetchScenarios])

  // Save scenario
  const handleSave = async () => {
    const name = saveName.trim()
    if (!name) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          overrides,
          events: events.map(e => ({
            id: e.id,
            name: e.name,
            event_type: e.event_type,
            target_age: e.target_age,
            one_time_cost: e.one_time_cost,
            monthly_cost_change: e.monthly_cost_change,
            monthly_income_change: e.monthly_income_change,
            duration_months: e.duration_months,
            whatIfDisabled: e.whatIfDisabled,
            metadata: e.metadata,
          })),
          fireAge,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Opslaan mislukt')
        return
      }

      const data = await res.json()
      setScenarios(prev => [...prev, data.scenario])
      setShowSaveDialog(false)
      setSaveName('')
      setSuccess(`"${name}" opgeslagen`)
    } catch {
      setError('Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  // Delete scenario
  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/scenarios?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setScenarios(prev => prev.filter(s => s.id !== id))
        setSuccess('Scenario verwijderd')
      }
    } catch {
      setError('Verwijderen mislukt')
    } finally {
      setDeleting(null)
    }
  }

  // Load scenario
  const handleLoad = (scenario: SavedScenario) => {
    onLoadScenario(
      scenario.overrides,
      scenario.events as WhatIfEvent[],
    )
    setShowList(false)
    setSuccess(`"${scenario.name}" geladen`)
  }

  const canSave = scenarios.length < 5

  return (
    <div className="card-editorial overflow-hidden">
      <div className="h-[3px] bg-horizon-500" />
      <div className="px-4 py-3">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">
            Opgeslagen scenario&apos;s
            {scenarios.length > 0 && (
              <span className="ml-1.5 font-mono text-[10px] font-medium text-[var(--ink-3)]">
                {scenarios.length}/5
              </span>
            )}
          </p>
          <div className="flex items-center gap-1.5">
            {/* Toggle list */}
            {scenarios.length > 0 && (
              <button
                type="button"
                onClick={() => { setShowList(!showList); setShowSaveDialog(false) }}
                className="flex items-center gap-1 rounded-md border border-[var(--border-ed)] px-2 py-1 font-sans text-[11px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
              >
                <FolderOpen className="h-3 w-3" />
                Laden
                <ChevronDown className={`h-3 w-3 transition-transform ${showList ? 'rotate-180' : ''}`} />
              </button>
            )}
            {/* Save button */}
            <button
              type="button"
              onClick={() => {
                if (!canSave) {
                  setError('Maximaal 5 scenario\'s. Verwijder eerst een scenario.')
                  return
                }
                setShowSaveDialog(!showSaveDialog)
                setShowList(false)
              }}
              className="flex items-center gap-1 rounded-md border border-wil-300 bg-wil-50 px-2 py-1 font-sans text-[11px] font-medium text-wil-700 transition-colors hover:bg-wil-100"
            >
              <Save className="h-3 w-3" />
              Opslaan
            </button>
          </div>
        </div>

        {/* Status messages */}
        {error && (
          <div className="mb-2 rounded-[var(--r)] border border-kern-200 bg-kern-50/60 px-3 py-1.5 font-sans text-[11px] text-kern-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-2 rounded-[var(--r)] border border-horizon-200 bg-horizon-50/60 px-3 py-1.5 font-sans text-[11px] text-horizon-700">
            <Check className="mr-1 inline h-3 w-3" />{success}
          </div>
        )}

        {/* Save dialog */}
        {showSaveDialog && (
          <div className="mb-2 rounded-[var(--r)] border border-wil-200 bg-wil-50/40 p-3">
            <label className="mb-1 block font-sans text-[11px] font-medium text-[var(--ink-2)]">
              Naam voor dit scenario
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && saveName.trim()) handleSave()
                  if (e.key === 'Escape') setShowSaveDialog(false)
                }}
                placeholder="bijv. Part-time met kinderen"
                maxLength={100}
                autoFocus
                className="flex-1 rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 font-sans text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-wil-400 focus:outline-none focus:ring-1 focus:ring-wil-300"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !saveName.trim()}
                className="flex items-center gap-1 rounded-md bg-wil-600 px-3 py-1.5 font-sans text-[11px] font-medium text-white transition-colors hover:bg-wil-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Opslaan
              </button>
              <button
                type="button"
                onClick={() => { setShowSaveDialog(false); setSaveName('') }}
                className="rounded-md p-1.5 text-[var(--ink-3)] hover:bg-[var(--subtle)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Scenario list */}
        {showList && (
          <div className="space-y-1">
            {loading ? (
              <div className="flex items-center gap-2 py-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--ink-3)]" />
                <span className="font-sans text-[11px] text-[var(--ink-3)]">Laden...</span>
              </div>
            ) : scenarios.length === 0 ? (
              <p className="py-2 font-sans text-[11px] text-[var(--ink-3)]">
                Nog geen opgeslagen scenario&apos;s.
              </p>
            ) : (
              scenarios.map(scenario => (
                <div
                  key={scenario.id}
                  className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 transition-colors hover:border-horizon-300"
                >
                  {/* Scenario info — clickable to load */}
                  <button
                    type="button"
                    onClick={() => handleLoad(scenario)}
                    className="flex-1 text-left"
                  >
                    <p className="font-sans text-[12px] font-medium text-[var(--ink)]">
                      {scenario.name}
                    </p>
                    <p className="font-sans text-[10px] text-[var(--ink-3)]">
                      FIRE {formatFireAgeShort(scenario.fireAge)}
                      {scenario.events.length > 0 && (
                        <> · {scenario.events.length} event{scenario.events.length !== 1 ? 's' : ''}</>
                      )}
                      <> · {new Date(scenario.createdAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</>
                    </p>
                  </button>
                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => handleDelete(scenario.id)}
                    disabled={deleting === scenario.id}
                    className="rounded-md p-1.5 text-[var(--ink-4)] transition-colors hover:bg-kern-50 hover:text-kern-600"
                    title="Verwijder scenario"
                  >
                    {deleting === scenario.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Empty state when no scenarios saved and list not open */}
        {!showList && !showSaveDialog && scenarios.length === 0 && !loading && (
          <p className="font-sans text-[11px] text-[var(--ink-4)]">
            Sla je favoriete scenario&apos;s op om ze later terug te laden.
          </p>
        )}
      </div>
    </div>
  )
}
