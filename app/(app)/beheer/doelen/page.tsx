'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Save,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  RotateCcw,
} from 'lucide-react'
import {
  DEFAULT_GOAL_GUIDE_STEPS,
  GOAL_GUIDE_DISPLAY_ORDER,
} from '@/lib/briefing/goal-guide-steps'
import type { ModuleGuideStep } from '@/lib/briefing/module-guide-steps'
import { GOAL_LABELS } from '@/lib/goals/catalog'
import type { GoalSlug } from '@/lib/goals/types'

// ── Types ───────────────────────────────────────────────────
type StepsData = Record<GoalSlug, ModuleGuideStep[]>

// ── Inline Editable Cell ────────────────────────────────────
function InlineEdit({
  value,
  onChange,
  placeholder,
  mono,
  validate,
  autoEdit,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  validate?: (v: string) => string | null
  autoEdit?: boolean
}) {
  const [editing, setEditing] = useState(autoEdit ?? false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const startEdit = useCallback(() => {
    setDraft(value)
    setError(null)
    setEditing(true)
  }, [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const confirmEdit = useCallback(() => {
    if (validate) {
      const err = validate(draft)
      if (err) {
        setError(err)
        return
      }
    }
    onChange(draft)
    setEditing(false)
    setError(null)
  }, [draft, onChange, validate])

  const cancelEdit = useCallback(() => {
    setDraft(value)
    setEditing(false)
    setError(null)
  }, [value])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        confirmEdit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelEdit()
      }
    },
    [confirmEdit, cancelEdit],
  )

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className={`w-full cursor-text rounded px-1.5 py-0.5 text-left transition-colors hover:bg-[var(--subtle)] ${
          mono ? 'font-mono text-xs text-[var(--ink-2)]' : 'text-sm text-[var(--ink)]'
        } ${!value ? 'italic text-[var(--ink-4)]' : ''}`}
        title="Klik om te bewerken"
      >
        {value || placeholder || '—'}
      </button>
    )
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          if (error) setError(null)
        }}
        onKeyDown={handleKeyDown}
        onBlur={confirmEdit}
        placeholder={placeholder}
        className={`w-full rounded border px-1.5 py-0.5 outline-none ${
          mono ? 'font-mono text-xs' : 'text-sm'
        } ${
          error
            ? 'border-red-400 bg-red-50 text-red-800'
            : 'border-[var(--border-md)] bg-white text-[var(--ink)]'
        } focus:ring-1 focus:ring-[var(--ink-3)]`}
      />
      {error && (
        <p className="absolute -bottom-4 left-0 text-[10px] text-red-500">{error}</p>
      )}
    </div>
  )
}

// ── EnableToggle ────────────────────────────────────────────
function EnableToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        enabled ? 'bg-[var(--ink)]' : 'bg-[var(--border-md)]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--paper)] transition-transform ${
          enabled ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ── Collapsible Goal Section ────────────────────────────────
function GoalSection({
  goalSlug,
  steps,
  isOpen,
  onToggle,
  onMoveStep,
  onUpdateStep,
  onAddStep,
  onDeleteStep,
  hasChanges,
  enabled,
  onToggleEnabled,
}: {
  goalSlug: GoalSlug
  steps: ModuleGuideStep[]
  isOpen: boolean
  onToggle: () => void
  onMoveStep: (goalSlug: GoalSlug, fromIndex: number, direction: 'up' | 'down') => void
  onUpdateStep: (goalSlug: GoalSlug, stepIdx: number, field: 'label' | 'href', value: string) => void
  onAddStep: (goalSlug: GoalSlug) => void
  onDeleteStep: (goalSlug: GoalSlug, stepIdx: number) => void
  hasChanges: boolean
  enabled: boolean
  onToggleEnabled: () => void
}) {
  const label = GOAL_LABELS[goalSlug] ?? goalSlug

  const validateLabel = useCallback((v: string) => {
    if (!v.trim()) return 'Label mag niet leeg zijn'
    return null
  }, [])

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  return (
    <div
      className={`rounded-[var(--r)] border bg-[var(--paper)] transition-colors ${
        hasChanges ? 'border-amber-400' : 'border-[var(--border-ed)]'
      } ${!enabled ? 'opacity-60' : ''}`}
    >
      <div className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--subtle)]">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-3 text-left"
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />
          )}
          <span className={`text-sm font-semibold ${enabled ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}>
            {label}
          </span>
          <span className="rounded-full bg-[var(--subtle)] px-2 py-0.5 text-xs font-medium text-[var(--ink-3)]">
            {steps.length} stappen
          </span>
          {!enabled && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
              uitgeschakeld
            </span>
          )}
          {hasChanges && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              gewijzigd
            </span>
          )}
        </button>
        <EnableToggle enabled={enabled} onToggle={onToggleEnabled} />
      </div>

      {isOpen && (
        <div className={`border-t border-[var(--border-ed)] px-4 py-2 ${!enabled ? 'pointer-events-none opacity-50' : ''}`}>
          {steps.length === 0 ? (
            <p className="py-3 text-center text-sm text-[var(--ink-3)]">
              Geen stappen geconfigureerd voor dit doel.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                  <th className="w-16 py-2 pr-2">Volgorde</th>
                  <th className="py-2 pr-4">Key</th>
                  <th className="py-2 pr-4">Label</th>
                  <th className="py-2 pr-2">Href</th>
                  <th className="w-10 py-2" />
                </tr>
              </thead>
              <tbody>
                {steps.map((step, idx) => (
                  <tr
                    key={step.key}
                    className={idx < steps.length - 1 ? 'border-b border-[var(--border-ed)]' : ''}
                  >
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMoveStep(goalSlug, idx, 'up')}
                          className="rounded p-1 transition-colors hover:bg-[var(--subtle)] disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Omhoog"
                        >
                          <ArrowUp className="h-3.5 w-3.5 text-[var(--ink-2)]" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === steps.length - 1}
                          onClick={() => onMoveStep(goalSlug, idx, 'down')}
                          className="rounded p-1 transition-colors hover:bg-[var(--subtle)] disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Omlaag"
                        >
                          <ArrowDown className="h-3.5 w-3.5 text-[var(--ink-2)]" />
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-[var(--ink-3)]">
                      {step.key}
                    </td>
                    <td className="py-1.5 pr-4">
                      <InlineEdit
                        value={step.label}
                        onChange={(v) => onUpdateStep(goalSlug, idx, 'label', v)}
                        validate={validateLabel}
                        autoEdit={!step.label}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <InlineEdit
                        value={step.href ?? ''}
                        onChange={(v) => onUpdateStep(goalSlug, idx, 'href', v)}
                        placeholder="geen link"
                        mono
                      />
                    </td>
                    <td className="py-1.5 text-center">
                      {confirmDelete === idx ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteStep(goalSlug, idx)
                              setConfirmDelete(null)
                            }}
                            className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-red-600"
                            title="Bevestig verwijderen"
                          >
                            Ja
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(null)}
                            className="rounded bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-3)] hover:bg-[var(--border-ed)]"
                            title="Annuleer"
                          >
                            Nee
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(idx)}
                          className="rounded p-1 text-[var(--ink-4)] transition-colors hover:bg-red-50 hover:text-red-500"
                          title="Verwijder stap"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <button
            type="button"
            onClick={() => onAddStep(goalSlug)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--r)] border border-dashed border-[var(--border-md)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] transition-colors hover:border-[var(--ink-3)] hover:text-[var(--ink-2)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Stap toevoegen
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────
export default function BeheerDoelenPage() {
  const [steps, setSteps] = useState<StepsData | null>(null)
  const [originalSteps, setOriginalSteps] = useState<StepsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [openGoals, setOpenGoals] = useState<Set<GoalSlug>>(new Set())
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  const [disabledGoals, setDisabledGoals] = useState<Set<GoalSlug>>(new Set())
  const [originalDisabledGoals, setOriginalDisabledGoals] = useState<Set<GoalSlug>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const [stepsRes, settingsRes] = await Promise.all([
          fetch('/api/goals-guide/steps'),
          fetch('/api/goals-guide/settings'),
        ])

        if (!stepsRes.ok) {
          throw new Error(`HTTP ${stepsRes.status}: ${stepsRes.statusText}`)
        }
        const data = await stepsRes.json()
        setSteps(data)
        setOriginalSteps(JSON.parse(JSON.stringify(data)))

        if (settingsRes.ok) {
          const settingsData = await settingsRes.json()
          const disabled = new Set<GoalSlug>(settingsData.disabledGoals ?? [])
          setDisabledGoals(disabled)
          setOriginalDisabledGoals(new Set(disabled))
        }

        setOpenGoals(new Set(GOAL_GUIDE_DISPLAY_ORDER))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Onbekende fout')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Check which goals have changes ────────────────────────
  const changedGoals = new Set<GoalSlug>()
  if (steps && originalSteps) {
    for (const goalSlug of GOAL_GUIDE_DISPLAY_ORDER) {
      const current = steps[goalSlug] ?? []
      const original = originalSteps[goalSlug] ?? []
      if (JSON.stringify(current) !== JSON.stringify(original)) {
        changedGoals.add(goalSlug)
      }
    }
  }
  const disabledGoalsChanged = (() => {
    if (disabledGoals.size !== originalDisabledGoals.size) return true
    for (const id of disabledGoals) {
      if (!originalDisabledGoals.has(id)) return true
    }
    return false
  })()

  const hasAnyChanges = changedGoals.size > 0 || disabledGoalsChanged

  const handleToggleEnabled = useCallback((goalSlug: GoalSlug) => {
    setDisabledGoals((prev) => {
      const next = new Set(prev)
      if (next.has(goalSlug)) {
        next.delete(goalSlug)
      } else {
        next.add(goalSlug)
      }
      return next
    })
    setSaveMessage(null)
  }, [])

  const handleMoveStep = useCallback(
    (goalSlug: GoalSlug, fromIndex: number, direction: 'up' | 'down') => {
      setSteps((prev) => {
        if (!prev) return prev
        const goalSteps = [...(prev[goalSlug] ?? [])]
        const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
        if (toIndex < 0 || toIndex >= goalSteps.length) return prev

        const temp = goalSteps[fromIndex]
        goalSteps[fromIndex] = goalSteps[toIndex]
        goalSteps[toIndex] = temp

        return { ...prev, [goalSlug]: goalSteps }
      })
      setSaveMessage(null)
    },
    [],
  )

  const handleUpdateStep = useCallback(
    (goalSlug: GoalSlug, stepIdx: number, field: 'label' | 'href', value: string) => {
      setSteps((prev) => {
        if (!prev) return prev
        const goalSteps = [...(prev[goalSlug] ?? [])]
        const step = { ...goalSteps[stepIdx] }
        if (!step) return prev
        if (field === 'label') {
          step.label = value
        } else {
          step.href = value || undefined
        }
        goalSteps[stepIdx] = step
        return { ...prev, [goalSlug]: goalSteps }
      })
      setSaveMessage(null)
    },
    [],
  )

  const handleAddStep = useCallback(
    (goalSlug: GoalSlug) => {
      setSteps((prev) => {
        if (!prev) return prev
        const goalSteps = [...(prev[goalSlug] ?? [])]
        const timestamp = Date.now().toString(36)
        const newStep: ModuleGuideStep = {
          key: `${goalSlug}_new_${timestamp}`,
          label: '',
        }
        goalSteps.push(newStep)
        return { ...prev, [goalSlug]: goalSteps }
      })
      setSaveMessage(null)
    },
    [],
  )

  const handleDeleteStep = useCallback(
    (goalSlug: GoalSlug, stepIdx: number) => {
      setSteps((prev) => {
        if (!prev) return prev
        const goalSteps = [...(prev[goalSlug] ?? [])]
        goalSteps.splice(stepIdx, 1)
        return { ...prev, [goalSlug]: goalSteps }
      })
      setSaveMessage(null)
    },
    [],
  )

  const handleSave = useCallback(async () => {
    if (!steps) return
    setSaving(true)
    setSaveMessage(null)
    try {
      const promises: Promise<Response>[] = []

      if (changedGoals.size > 0) {
        promises.push(
          fetch('/api/goals-guide/steps', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(steps),
          }),
        )
      }

      if (disabledGoalsChanged) {
        promises.push(
          fetch('/api/goals-guide/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ disabledGoals: Array.from(disabledGoals) }),
          }),
        )
      }

      const results = await Promise.all(promises)

      for (const res of results) {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }
      }

      setOriginalSteps(JSON.parse(JSON.stringify(steps)))
      setOriginalDisabledGoals(new Set(disabledGoals))
      setSaveMessage('Instellingen opgeslagen!')
    } catch (err) {
      setSaveMessage(`Fout: ${err instanceof Error ? err.message : 'Opslaan mislukt'}`)
    } finally {
      setSaving(false)
    }
  }, [steps, disabledGoals, changedGoals.size, disabledGoalsChanged])

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
      setOriginalSteps(JSON.parse(JSON.stringify(defaults)))

      setDisabledGoals(new Set())
      setOriginalDisabledGoals(new Set())

      await fetch('/api/goals-guide/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabledGoals: [] }),
      })

      setSaveMessage('Alle stappen teruggezet naar standaardwaarden.')
      setShowResetConfirm(false)
    } catch (err) {
      setSaveMessage(`Fout: ${err instanceof Error ? err.message : 'Reset mislukt'}`)
    } finally {
      setResetting(false)
    }
  }, [])

  const toggleGoal = (id: GoalSlug) => {
    setOpenGoals((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
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
          <p className="text-xs text-red-600">{error ?? 'Geen data ontvangen'}</p>
        </div>
      </div>
    )
  }

  const totalSteps = GOAL_GUIDE_DISPLAY_ORDER.reduce(
    (sum, id) => sum + (steps[id]?.length ?? 0),
    0,
  )
  const enabledCount = GOAL_GUIDE_DISPLAY_ORDER.filter((id) => !disabledGoals.has(id)).length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--ink)]">Doel-stappen</h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Stappenplan per doel uit de onboarding ({totalSteps} stappen over {GOAL_GUIDE_DISPLAY_ORDER.length} doelen, {enabledCount} actief).
            De stappen verschijnen als briefing-card op /will voor gebruikers met dit doel als primair doel.
            Klik op een label of href om te bewerken. Gebruik de toggles om doelen in/uit te schakelen.
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasAnyChanges || saving}
            className={`inline-flex items-center gap-2 rounded-[var(--r)] border px-4 py-2 text-sm font-medium transition-all ${
              hasAnyChanges
                ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:opacity-90'
                : 'border-[var(--border-md)] text-[var(--ink-3)] opacity-50 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Opslaan
          </button>
          {saveMessage && (
            <span
              className={`text-xs font-medium ${
                // eslint-disable-next-line no-restricted-syntax -- statusmelding gelukt/fout, geen winst/verlies
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
          <p className="text-sm font-medium text-red-800">
            Weet je het zeker?
          </p>
          <p className="mt-1 text-xs text-red-600">
            Alle aangepaste stappen, volgorde en doel-instellingen worden teruggezet naar de standaardwaarden. Dit kan niet ongedaan worden gemaakt.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting}
              className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-red-600 bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
            >
              {resetting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Ja, reset naar defaults
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
        {GOAL_GUIDE_DISPLAY_ORDER.map((goalSlug) => (
          <GoalSection
            key={goalSlug}
            goalSlug={goalSlug}
            steps={steps[goalSlug] ?? []}
            isOpen={openGoals.has(goalSlug)}
            onToggle={() => toggleGoal(goalSlug)}
            onMoveStep={handleMoveStep}
            onUpdateStep={handleUpdateStep}
            onAddStep={handleAddStep}
            onDeleteStep={handleDeleteStep}
            hasChanges={changedGoals.has(goalSlug)}
            enabled={!disabledGoals.has(goalSlug)}
            onToggleEnabled={() => handleToggleEnabled(goalSlug)}
          />
        ))}
      </div>
    </div>
  )
}
