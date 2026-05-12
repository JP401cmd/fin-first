'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Loader2, AlertCircle, Save, RotateCcw } from 'lucide-react'
import { StepTable } from './step-row'
import {
  DEFAULT_STANDARD_GUIDE_STEPS,
  type StandardGuideStep,
} from '@/lib/briefing/standard-guide-steps'

interface Props {
  /** Render-prop voor de uitleg-badge per stap (optioneel, geactiveerd in taak 7). */
  renderTrailing?: (helpKey: string) => ReactNode
}

/**
 * Tab "Algemene stappen" — beheer van de 4 standard-guide stappen.
 * Spiegelt de UX van de module-tab maar zonder module-grouping en zonder
 * enable/disable-toggle (standard-stappen gelden altijd voor iedereen).
 */
export function StandardStepsTab({ renderTrailing }: Props) {
  const [steps, setSteps] = useState<StandardGuideStep[] | null>(null)
  const [original, setOriginal] = useState<StandardGuideStep[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/standard-guide/steps')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: StandardGuideStep[] = await res.json()
        setSteps(data)
        setOriginal(JSON.parse(JSON.stringify(data)))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Onbekende fout')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const hasChanges =
    steps !== null && original !== null
      ? JSON.stringify(steps) !== JSON.stringify(original)
      : false

  const handleMove = useCallback((idx: number, direction: 'up' | 'down') => {
    setSteps((prev) => {
      if (!prev) return prev
      const arr = [...prev]
      const to = direction === 'up' ? idx - 1 : idx + 1
      if (to < 0 || to >= arr.length) return prev
      const tmp = arr[idx]
      arr[idx] = arr[to]
      arr[to] = tmp
      return arr
    })
    setSaveMessage(null)
  }, [])

  const handleUpdate = useCallback(
    (idx: number, field: 'label' | 'href', value: string) => {
      setSteps((prev) => {
        if (!prev) return prev
        const arr = [...prev]
        const step = { ...arr[idx] }
        if (!step) return prev
        if (field === 'label') step.label = value
        else step.href = value || undefined
        arr[idx] = step
        return arr
      })
      setSaveMessage(null)
    },
    [],
  )

  const handleAdd = useCallback(() => {
    setSteps((prev) => {
      if (!prev) return prev
      const ts = Date.now().toString(36)
      return [...prev, { key: `sg_new_${ts}`, label: '' } as StandardGuideStep]
    })
    setSaveMessage(null)
  }, [])

  const handleDelete = useCallback((idx: number) => {
    setSteps((prev) => {
      if (!prev) return prev
      const arr = [...prev]
      arr.splice(idx, 1)
      return arr
    })
    setSaveMessage(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!steps) return
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/standard-guide/steps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(steps),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      setOriginal(JSON.parse(JSON.stringify(steps)))
      setSaveMessage('Opgeslagen!')
    } catch (err) {
      setSaveMessage(`Fout: ${err instanceof Error ? err.message : 'Mislukt'}`)
    } finally {
      setSaving(false)
    }
  }, [steps])

  const handleReset = useCallback(async () => {
    setResetting(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/standard-guide/steps', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const defaults = JSON.parse(JSON.stringify(DEFAULT_STANDARD_GUIDE_STEPS))
      setSteps(defaults)
      setOriginal(defaults)
      setSaveMessage('Teruggezet naar defaults.')
      setShowResetConfirm(false)
    } catch (err) {
      setSaveMessage(`Fout: ${err instanceof Error ? err.message : 'Mislukt'}`)
    } finally {
      setResetting(false)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-3)]" />
        <span className="ml-2 text-sm text-[var(--ink-3)]">Algemene stappen laden…</span>
      </div>
    )
  }

  if (error || !steps) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--r)] border border-red-200 bg-red-50 px-4 py-3">
        <AlertCircle className="h-5 w-5 text-red-500" />
        <div>
          <p className="text-sm font-medium text-red-800">Fout bij laden</p>
          <p className="text-xs text-red-600">{error ?? 'Geen data'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-[var(--ink-3)]">
          Algemene onboarding-stappen die voor iedere gebruiker gelden ({steps.length} stappen).
          Verschijnen op de "Algemene stappen"-kaart op /will. Klik label of href om te bewerken.
        </p>
        <div className="flex flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`inline-flex items-center gap-2 rounded-[var(--r)] border px-4 py-2 text-sm font-medium transition-all ${
              hasChanges
                ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:opacity-90'
                : 'border-[var(--border-md)] text-[var(--ink-3)] opacity-50 cursor-not-allowed'
            }`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Opslaan
          </button>
          {saveMessage && (
            <span
              className={`text-xs font-medium ${
                saveMessage.startsWith('Fout') ? 'text-red-600' : 'text-emerald-600'
              }`}
            >
              {saveMessage}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            disabled={resetting}
            className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] transition-colors hover:border-red-300 hover:text-red-600 hover:bg-red-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset naar defaults
          </button>
        </div>
      </div>

      {showResetConfirm && (
        <div className="rounded-[var(--r)] border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Weet je het zeker?</p>
          <p className="mt-1 text-xs text-red-600">
            Alle aanpassingen aan de algemene stappen worden teruggezet. Dit kan niet ongedaan worden gemaakt.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting}
              className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-red-600 bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
            >
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Ja, reset
            </button>
            <button
              type="button"
              onClick={() => setShowResetConfirm(false)}
              className="rounded-[var(--r)] border border-[var(--border-md)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}

      <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
        <StepTable
          steps={steps}
          onMove={handleMove}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
          hasTrailingColumn={!!renderTrailing}
          renderTrailing={
            renderTrailing
              ? (step) => renderTrailing(`standard:${step.key}`)
              : undefined
          }
        />
      </div>
    </div>
  )
}
