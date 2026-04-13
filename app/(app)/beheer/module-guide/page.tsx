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
} from 'lucide-react'
import { MODULE_CATALOG } from '@/lib/module-registry'
import { MODULE_GUIDE_DISPLAY_ORDER, type ModuleGuideStep } from '@/lib/briefing/module-guide-steps'
import type { ModuleId } from '@/lib/module-registry'

// ── Module label lookup ─────────────────────────────────────
const MODULE_LABELS: Record<ModuleId, string> = Object.fromEntries(
  MODULE_CATALOG.map((m) => [m.id, m.label]),
) as Record<ModuleId, string>

// ── Types ───────────────────────────────────────────────────
type StepsData = Record<ModuleId, ModuleGuideStep[]>

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

  // Sync draft when value changes externally (e.g. after save)
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
        {value || placeholder || '\u2014'}
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

// ── EnableToggle (reused pattern from /beheer/briefing) ─────
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

// ── Collapsible Module Section ──────────────────────────────
function ModuleSection({
  moduleId,
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
  moduleId: ModuleId
  steps: ModuleGuideStep[]
  isOpen: boolean
  onToggle: () => void
  onMoveStep: (moduleId: ModuleId, fromIndex: number, direction: 'up' | 'down') => void
  onUpdateStep: (moduleId: ModuleId, stepIdx: number, field: 'label' | 'href', value: string) => void
  onAddStep: (moduleId: ModuleId) => void
  onDeleteStep: (moduleId: ModuleId, stepIdx: number) => void
  hasChanges: boolean
  enabled: boolean
  onToggleEnabled: () => void
}) {
  const label = MODULE_LABELS[moduleId] ?? moduleId

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
        </div>
        <EnableToggle enabled={enabled} onToggle={onToggleEnabled} />
      </button>

      {isOpen && (
        <div className={`border-t border-[var(--border-ed)] px-4 py-2 ${!enabled ? 'pointer-events-none opacity-50' : ''}`}>
          {steps.length === 0 ? (
            <p className="py-3 text-center text-sm text-[var(--ink-3)]">
              Geen stappen geconfigureerd voor deze module.
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
                          onClick={() => onMoveStep(moduleId, idx, 'up')}
                          className="rounded p-1 transition-colors hover:bg-[var(--subtle)] disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Omhoog"
                        >
                          <ArrowUp className="h-3.5 w-3.5 text-[var(--ink-2)]" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === steps.length - 1}
                          onClick={() => onMoveStep(moduleId, idx, 'down')}
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
                        onChange={(v) => onUpdateStep(moduleId, idx, 'label', v)}
                        validate={validateLabel}
                        autoEdit={!step.label}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <InlineEdit
                        value={step.href ?? ''}
                        onChange={(v) => onUpdateStep(moduleId, idx, 'href', v)}
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
                              onDeleteStep(moduleId, idx)
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

          {/* Add step button */}
          <button
            type="button"
            onClick={() => onAddStep(moduleId)}
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
export default function BeheerModuleGuidePage() {
  const [steps, setSteps] = useState<StepsData | null>(null)
  const [originalSteps, setOriginalSteps] = useState<StepsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [openModules, setOpenModules] = useState<Set<ModuleId>>(new Set())

  // ── Disabled modules state ────────────────────────────────
  const [disabledModules, setDisabledModules] = useState<Set<ModuleId>>(new Set())
  const [originalDisabledModules, setOriginalDisabledModules] = useState<Set<ModuleId>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const [stepsRes, settingsRes] = await Promise.all([
          fetch('/api/module-guide/steps'),
          fetch('/api/module-guide/settings'),
        ])

        if (!stepsRes.ok) {
          throw new Error(`HTTP ${stepsRes.status}: ${stepsRes.statusText}`)
        }
        const data = await stepsRes.json()
        setSteps(data)
        setOriginalSteps(JSON.parse(JSON.stringify(data)))

        // Load disabled modules
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json()
          const disabled = new Set<ModuleId>(settingsData.disabledModules ?? [])
          setDisabledModules(disabled)
          setOriginalDisabledModules(new Set(disabled))
        }

        // Open all modules by default
        setOpenModules(new Set(MODULE_GUIDE_DISPLAY_ORDER))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Onbekende fout')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Check which modules have changes ──────────────────────
  const changedModules = new Set<ModuleId>()
  if (steps && originalSteps) {
    for (const moduleId of MODULE_GUIDE_DISPLAY_ORDER) {
      const current = steps[moduleId] ?? []
      const original = originalSteps[moduleId] ?? []
      if (JSON.stringify(current) !== JSON.stringify(original)) {
        changedModules.add(moduleId)
      }
    }
  }
  // Check if disabled modules changed
  const disabledModulesChanged = (() => {
    if (disabledModules.size !== originalDisabledModules.size) return true
    for (const id of disabledModules) {
      if (!originalDisabledModules.has(id)) return true
    }
    return false
  })()

  const hasAnyChanges = changedModules.size > 0 || disabledModulesChanged

  // ── Toggle module enabled/disabled ────────────────────────
  const handleToggleEnabled = useCallback((moduleId: ModuleId) => {
    setDisabledModules((prev) => {
      const next = new Set(prev)
      if (next.has(moduleId)) {
        next.delete(moduleId)
      } else {
        next.add(moduleId)
      }
      return next
    })
    setSaveMessage(null)
  }, [])

  // ── Move step up or down ──────────────────────────────────
  const handleMoveStep = useCallback(
    (moduleId: ModuleId, fromIndex: number, direction: 'up' | 'down') => {
      setSteps((prev) => {
        if (!prev) return prev
        const moduleSteps = [...(prev[moduleId] ?? [])]
        const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
        if (toIndex < 0 || toIndex >= moduleSteps.length) return prev

        // Swap
        const temp = moduleSteps[fromIndex]
        moduleSteps[fromIndex] = moduleSteps[toIndex]
        moduleSteps[toIndex] = temp

        return { ...prev, [moduleId]: moduleSteps }
      })
      setSaveMessage(null)
    },
    [],
  )

  // ── Inline edit handler ───────────────────────────────────
  const handleUpdateStep = useCallback(
    (moduleId: ModuleId, stepIdx: number, field: 'label' | 'href', value: string) => {
      setSteps((prev) => {
        if (!prev) return prev
        const moduleSteps = [...(prev[moduleId] ?? [])]
        const step = { ...moduleSteps[stepIdx] }
        if (!step) return prev
        if (field === 'label') {
          step.label = value
        } else {
          step.href = value || undefined
        }
        moduleSteps[stepIdx] = step
        return { ...prev, [moduleId]: moduleSteps }
      })
      setSaveMessage(null)
    },
    [],
  )

  // ── Add step handler ──────────────────────────────────────
  const handleAddStep = useCallback(
    (moduleId: ModuleId) => {
      setSteps((prev) => {
        if (!prev) return prev
        const moduleSteps = [...(prev[moduleId] ?? [])]
        const timestamp = Date.now().toString(36)
        const newStep: ModuleGuideStep = {
          key: `${moduleId}_new_${timestamp}`,
          label: '',
        }
        moduleSteps.push(newStep)
        return { ...prev, [moduleId]: moduleSteps }
      })
      setSaveMessage(null)
    },
    [],
  )

  // ── Delete step handler ──────────────────────────────────
  const handleDeleteStep = useCallback(
    (moduleId: ModuleId, stepIdx: number) => {
      setSteps((prev) => {
        if (!prev) return prev
        const moduleSteps = [...(prev[moduleId] ?? [])]
        moduleSteps.splice(stepIdx, 1)
        return { ...prev, [moduleId]: moduleSteps }
      })
      setSaveMessage(null)
    },
    [],
  )

  // ── Save changes ──────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!steps) return
    setSaving(true)
    setSaveMessage(null)
    try {
      // Save steps and disabled modules in parallel
      const promises: Promise<Response>[] = []

      if (changedModules.size > 0) {
        promises.push(
          fetch('/api/module-guide/steps', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(steps),
          }),
        )
      }

      if (disabledModulesChanged) {
        promises.push(
          fetch('/api/module-guide/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ disabledModules: Array.from(disabledModules) }),
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
      setOriginalDisabledModules(new Set(disabledModules))
      setSaveMessage('Instellingen opgeslagen!')
    } catch (err) {
      setSaveMessage(`Fout: ${err instanceof Error ? err.message : 'Opslaan mislukt'}`)
    } finally {
      setSaving(false)
    }
  }, [steps, disabledModules, changedModules.size, disabledModulesChanged])

  const toggleModule = (id: ModuleId) => {
    setOpenModules((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // ── Loading state ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-3)]" />
        <span className="ml-2 text-sm text-[var(--ink-3)]">Module-guide stappen laden…</span>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────
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

  // ── Count totals ──────────────────────────────────────────
  const totalSteps = MODULE_GUIDE_DISPLAY_ORDER.reduce(
    (sum, id) => sum + (steps[id]?.length ?? 0),
    0,
  )
  const enabledCount = MODULE_GUIDE_DISPLAY_ORDER.filter((id) => !disabledModules.has(id)).length

  return (
    <div className="space-y-6">
      {/* Header + Save button */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--ink)]">Module Guide Stappen</h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Overzicht van alle onboarding-stappen per module ({totalSteps} stappen over {MODULE_GUIDE_DISPLAY_ORDER.length} modules, {enabledCount} actief).
            Klik op een label of href om te bewerken. Gebruik de toggles om modules in/uit te schakelen.
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
                saveMessage.startsWith('Fout') ? 'text-red-600' : 'text-emerald-600'
              }`}
            >
              {saveMessage}
            </span>
          )}
        </div>
      </div>

      {/* Module Sections */}
      <div className="space-y-3">
        {MODULE_GUIDE_DISPLAY_ORDER.map((moduleId) => (
          <ModuleSection
            key={moduleId}
            moduleId={moduleId}
            steps={steps[moduleId] ?? []}
            isOpen={openModules.has(moduleId)}
            onToggle={() => toggleModule(moduleId)}
            onMoveStep={handleMoveStep}
            onUpdateStep={handleUpdateStep}
            onAddStep={handleAddStep}
            onDeleteStep={handleDeleteStep}
            hasChanges={changedModules.has(moduleId)}
            enabled={!disabledModules.has(moduleId)}
            onToggleEnabled={() => handleToggleEnabled(moduleId)}
          />
        ))}
      </div>
    </div>
  )
}
