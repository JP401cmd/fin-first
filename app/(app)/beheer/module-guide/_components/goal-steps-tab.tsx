'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Loader2, AlertCircle, Save, RotateCcw } from 'lucide-react'
import { StepTable } from './step-row'
import {
  DEFAULT_GOAL_GUIDE_STEPS,
  GOAL_GUIDE_DISPLAY_ORDER,
} from '@/lib/briefing/goal-guide-steps'
import { GOAL_CATALOG } from '@/lib/goals/catalog'
import { getGoalIcon } from '@/lib/goals/icons'
import type { GoalSlug } from '@/lib/goals/types'
import type { ModuleGuideStep } from '@/lib/briefing/module-guide-steps'

type GoalStepsData = Record<GoalSlug, ModuleGuideStep[]>

interface Props {
  renderTrailing?: (helpKey: string) => ReactNode
}

interface GoalSectionProps {
  slug: GoalSlug
  steps: ModuleGuideStep[]
  isOpen: boolean
  onToggle: () => void
  hasChanges: boolean
  onMove: (idx: number, direction: 'up' | 'down') => void
  onUpdate: (idx: number, field: 'label' | 'href', value: string) => void
  onAdd: () => void
  onDelete: (idx: number) => void
  renderTrailing?: (helpKey: string) => ReactNode
}

function GoalSection({
  slug,
  steps,
  isOpen,
  onToggle,
  hasChanges,
  onMove,
  onUpdate,
  onAdd,
  onDelete,
  renderTrailing,
}: GoalSectionProps) {
  const entry = GOAL_CATALOG[slug]
  const label = entry?.label ?? slug
  const Icon = getGoalIcon(slug)

  return (
    <div
      className={`rounded-[var(--r)] border bg-[var(--paper)] transition-colors ${
        hasChanges ? 'border-amber-400' : 'border-[var(--border-ed)]'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
      >
        <div className="flex items-center gap-3">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />
          )}
          <Icon
            aria-hidden
            className="h-4 w-4 shrink-0 text-[var(--ink-3)]"
            strokeWidth={1.75}
          />
          <span className="text-sm font-semibold text-[var(--ink)]">
            Stappen voor: {label}
          </span>
          <span className="rounded-full bg-[var(--subtle)] px-2 py-0.5 text-xs font-medium text-[var(--ink-3)]">
            {steps.length} stappen
          </span>
          {hasChanges && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              gewijzigd
            </span>
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-[var(--border-ed)] px-4 py-2">
          <StepTable
            steps={steps}
            onMove={onMove}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onAdd={onAdd}
            hasTrailingColumn={!!renderTrailing}
            renderTrailing={
              renderTrailing
                ? (step) => renderTrailing(`goal:${slug}:${step.key}`)
                : undefined
            }
          />
        </div>
      )}
    </div>
  )
}

/**
 * Tab "Doelen" — beheer van de 6 goal-guide step-sets.
 * Toont één collapsible sectie per goal, in de canonical
 * GOAL_GUIDE_DISPLAY_ORDER. Labels komen uit GOAL_CATALOG zodat ze
 * 1-op-1 overeenkomen met wat de gebruiker op /will ziet
 * ("Stappen voor: {entry.label}").
 */
export function GoalStepsTab({ renderTrailing }: Props) {
  const [steps, setSteps] = useState<GoalStepsData | null>(null)
  const [original, setOriginal] = useState<GoalStepsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [openGoals, setOpenGoals] = useState<Set<GoalSlug>>(new Set())
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/goals-guide/steps')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: GoalStepsData = await res.json()
        // Merge defaults voor goals die nog niet in het overrides-blob staan,
        // zodat een nieuwe goal-toevoeging in code zichtbaar wordt zonder
        // dat de admin eerst moest opslaan.
        const merged: GoalStepsData = {
          ...DEFAULT_GOAL_GUIDE_STEPS,
          ...data,
        }
        setSteps(merged)
        setOriginal(JSON.parse(JSON.stringify(merged)))
        setOpenGoals(new Set(GOAL_GUIDE_DISPLAY_ORDER))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Onbekende fout')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const changedGoals = new Set<GoalSlug>()
  if (steps && original) {
    for (const slug of GOAL_GUIDE_DISPLAY_ORDER) {
      if (JSON.stringify(steps[slug] ?? []) !== JSON.stringify(original[slug] ?? [])) {
        changedGoals.add(slug)
      }
    }
  }
  const hasChanges = changedGoals.size > 0

  const toggleGoal = (slug: GoalSlug) => {
    setOpenGoals((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  const handleMove = useCallback(
    (slug: GoalSlug, idx: number, direction: 'up' | 'down') => {
      setSteps((prev) => {
        if (!prev) return prev
        const arr = [...(prev[slug] ?? [])]
        const to = direction === 'up' ? idx - 1 : idx + 1
        if (to < 0 || to >= arr.length) return prev
        const tmp = arr[idx]
        arr[idx] = arr[to]
        arr[to] = tmp
        return { ...prev, [slug]: arr }
      })
      setSaveMessage(null)
    },
    [],
  )

  const handleUpdate = useCallback(
    (slug: GoalSlug, idx: number, field: 'label' | 'href', value: string) => {
      setSteps((prev) => {
        if (!prev) return prev
        const arr = [...(prev[slug] ?? [])]
        const step = { ...arr[idx] }
        if (!step) return prev
        if (field === 'label') step.label = value
        else step.href = value || undefined
        arr[idx] = step
        return { ...prev, [slug]: arr }
      })
      setSaveMessage(null)
    },
    [],
  )

  const handleAdd = useCallback((slug: GoalSlug) => {
    setSteps((prev) => {
      if (!prev) return prev
      const arr = [...(prev[slug] ?? [])]
      const ts = Date.now().toString(36)
      arr.push({ key: `${slug}_new_${ts}`, label: '' })
      return { ...prev, [slug]: arr }
    })
    setSaveMessage(null)
  }, [])

  const handleDelete = useCallback((slug: GoalSlug, idx: number) => {
    setSteps((prev) => {
      if (!prev) return prev
      const arr = [...(prev[slug] ?? [])]
      arr.splice(idx, 1)
      return { ...prev, [slug]: arr }
    })
    setSaveMessage(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!steps) return
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/goals-guide/steps', {
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
      const res = await fetch('/api/goals-guide/steps', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const defaults = JSON.parse(JSON.stringify(DEFAULT_GOAL_GUIDE_STEPS))
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
        <span className="ml-2 text-sm text-[var(--ink-3)]">Doel-stappen laden…</span>
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

  const totalSteps = GOAL_GUIDE_DISPLAY_ORDER.reduce(
    (sum, slug) => sum + (steps[slug]?.length ?? 0),
    0,
  )

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-[var(--ink-3)]">
          De zes onboarding-doelen uit de doel-keuze ({totalSteps} stappen over {GOAL_GUIDE_DISPLAY_ORDER.length} doelen).
          Per doel verschijnt op /will een eigen kaart "Stappen voor: {'{doel}'}" zodra de gebruiker dat doel heeft gekozen.
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
            Alle aanpassingen aan de doel-stappen worden teruggezet naar de standaardwaarden.
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

      <div className="space-y-3">
        {GOAL_GUIDE_DISPLAY_ORDER.map((slug) => (
          <GoalSection
            key={slug}
            slug={slug}
            steps={steps[slug] ?? []}
            isOpen={openGoals.has(slug)}
            onToggle={() => toggleGoal(slug)}
            hasChanges={changedGoals.has(slug)}
            onMove={(idx, dir) => handleMove(slug, idx, dir)}
            onUpdate={(idx, field, val) => handleUpdate(slug, idx, field, val)}
            onAdd={() => handleAdd(slug)}
            onDelete={(idx) => handleDelete(slug, idx)}
            renderTrailing={renderTrailing}
          />
        ))}
      </div>
    </div>
  )
}
