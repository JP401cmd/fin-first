'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
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
import { DEFAULT_MODULE_GUIDE_STEPS } from '@/lib/briefing/module-guide-steps'
import { MODULE_CATALOG } from '@/lib/module-registry'
import { MODULE_GUIDE_DISPLAY_ORDER, type ModuleGuideStep } from '@/lib/briefing/module-guide-steps'
import type { ModuleId } from '@/lib/module-registry'
import { StandardStepsTab } from './_components/standard-steps-tab'
import { GoalStepsTab } from './_components/goal-steps-tab'
import { HelpContentPane, HelpStatusBadge } from '@/components/beheer/help-content-pane'
import type { HelpEntry } from '@/lib/briefing/guide-help'

// ── Tab-state ──────────────────────────────────────────────
type TabId = 'algemeen' | 'doelen' | 'module'

const TAB_LABELS: Record<TabId, string> = {
  algemeen: 'Algemene stappen',
  doelen: 'Doelen',
  module: 'Module-stappen (legacy)',
}

const TAB_DESCRIPTIONS: Record<TabId, string> = {
  algemeen: 'De algemene onboarding-stappen die voor iedere gebruiker gelden — verschijnen op /will als de "Algemene stappen"-kaart.',
  doelen: 'Per doel een eigen stappenplan — verschijnt op /will als kaart "Stappen voor: …" zodra de gebruiker dat doel kiest.',
  module: 'Module-georiënteerde stappen (legacy briefing-cards). De module-indeling is grotendeels losgelaten.',
}

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

// ── Module-tab (legacy — bestaande flow ingepakt) ───────────
function ModuleStepsTab() {
  const [steps, setSteps] = useState<StepsData | null>(null)
  const [originalSteps, setOriginalSteps] = useState<StepsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [openModules, setOpenModules] = useState<Set<ModuleId>>(new Set())
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [disabledModules, setDisabledModules] = useState<Set<ModuleId>>(new Set())
  const [originalDisabledModules, setOriginalDisabledModules] = useState<Set<ModuleId>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const [stepsRes, settingsRes] = await Promise.all([
          fetch('/api/module-guide/steps'),
          fetch('/api/module-guide/settings'),
        ])

        if (!stepsRes.ok) throw new Error(`HTTP ${stepsRes.status}: ${stepsRes.statusText}`)
        const data = await stepsRes.json()
        setSteps(data)
        setOriginalSteps(JSON.parse(JSON.stringify(data)))

        if (settingsRes.ok) {
          const settingsData = await settingsRes.json()
          const disabled = new Set<ModuleId>(settingsData.disabledModules ?? [])
          setDisabledModules(disabled)
          setOriginalDisabledModules(new Set(disabled))
        }

        setOpenModules(new Set(MODULE_GUIDE_DISPLAY_ORDER))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Onbekende fout')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

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

  const disabledModulesChanged = (() => {
    if (disabledModules.size !== originalDisabledModules.size) return true
    for (const id of disabledModules) {
      if (!originalDisabledModules.has(id)) return true
    }
    return false
  })()

  const hasAnyChanges = changedModules.size > 0 || disabledModulesChanged

  const handleToggleEnabled = useCallback((moduleId: ModuleId) => {
    setDisabledModules((prev) => {
      const next = new Set(prev)
      if (next.has(moduleId)) next.delete(moduleId)
      else next.add(moduleId)
      return next
    })
    setSaveMessage(null)
  }, [])

  const handleMoveStep = useCallback(
    (moduleId: ModuleId, fromIndex: number, direction: 'up' | 'down') => {
      setSteps((prev) => {
        if (!prev) return prev
        const moduleSteps = [...(prev[moduleId] ?? [])]
        const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
        if (toIndex < 0 || toIndex >= moduleSteps.length) return prev
        const temp = moduleSteps[fromIndex]
        moduleSteps[fromIndex] = moduleSteps[toIndex]
        moduleSteps[toIndex] = temp
        return { ...prev, [moduleId]: moduleSteps }
      })
      setSaveMessage(null)
    },
    [],
  )

  const handleUpdateStep = useCallback(
    (moduleId: ModuleId, stepIdx: number, field: 'label' | 'href', value: string) => {
      setSteps((prev) => {
        if (!prev) return prev
        const moduleSteps = [...(prev[moduleId] ?? [])]
        const step = { ...moduleSteps[stepIdx] }
        if (!step) return prev
        if (field === 'label') step.label = value
        else step.href = value || undefined
        moduleSteps[stepIdx] = step
        return { ...prev, [moduleId]: moduleSteps }
      })
      setSaveMessage(null)
    },
    [],
  )

  const handleAddStep = useCallback((moduleId: ModuleId) => {
    setSteps((prev) => {
      if (!prev) return prev
      const moduleSteps = [...(prev[moduleId] ?? [])]
      const timestamp = Date.now().toString(36)
      moduleSteps.push({ key: `${moduleId}_new_${timestamp}`, label: '' })
      return { ...prev, [moduleId]: moduleSteps }
    })
    setSaveMessage(null)
  }, [])

  const handleDeleteStep = useCallback((moduleId: ModuleId, stepIdx: number) => {
    setSteps((prev) => {
      if (!prev) return prev
      const moduleSteps = [...(prev[moduleId] ?? [])]
      moduleSteps.splice(stepIdx, 1)
      return { ...prev, [moduleId]: moduleSteps }
    })
    setSaveMessage(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!steps) return
    setSaving(true)
    setSaveMessage(null)
    try {
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

  const handleReset = useCallback(async () => {
    setResetting(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/module-guide/steps', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const defaults = JSON.parse(JSON.stringify(DEFAULT_MODULE_GUIDE_STEPS))
      setSteps(defaults)
      setOriginalSteps(JSON.parse(JSON.stringify(defaults)))
      setDisabledModules(new Set())
      setOriginalDisabledModules(new Set())
      await fetch('/api/module-guide/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabledModules: [] }),
      })
      setSaveMessage('Alle stappen teruggezet naar standaardwaarden.')
      setShowResetConfirm(false)
    } catch (err) {
      setSaveMessage(`Fout: ${err instanceof Error ? err.message : 'Reset mislukt'}`)
    } finally {
      setResetting(false)
    }
  }, [])

  const toggleModule = (id: ModuleId) => {
    setOpenModules((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-3)]" />
        <span className="ml-2 text-sm text-[var(--ink-3)]">Module-guide stappen laden…</span>
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

  const totalSteps = MODULE_GUIDE_DISPLAY_ORDER.reduce(
    (sum, id) => sum + (steps[id]?.length ?? 0),
    0,
  )
  const enabledCount = MODULE_GUIDE_DISPLAY_ORDER.filter((id) => !disabledModules.has(id)).length

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-[var(--ink-3)]">
          {totalSteps} stappen over {MODULE_GUIDE_DISPLAY_ORDER.length} modules, {enabledCount} actief.
          Toggles schakelen modules in/uit. Module-georiënteerde stappen worden alleen op de oude briefing-cards getoond.
        </p>
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
            Alle aangepaste stappen, volgorde en module-instellingen worden teruggezet. Dit kan niet ongedaan worden gemaakt.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting}
              className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-red-600 bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
            >
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
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

// ── TabBar ──────────────────────────────────────────────────
function TabBar({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  return (
    <div className="border-b border-[var(--border-ed)]">
      <nav className="flex gap-1" role="tablist" aria-label="Beheer-tabs">
        {(['algemeen', 'doelen', 'module'] as const).map((tab) => {
          const isActive = active === tab
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tab-panel-${tab}`}
              type="button"
              onClick={() => onChange(tab)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 ${
                isActive
                  ? 'border-[var(--ink)] text-[var(--ink)]'
                  : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────
function BeheerModuleGuideContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const initialTab: TabId =
    tabParam === 'doelen' || tabParam === 'module' || tabParam === 'algemeen'
      ? tabParam
      : 'algemeen'
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  // ── Guide-help blob (cache) + open-state voor de editor-pane ─────
  // Eén GET op mount levert alle help-content. Status-badges leiden hieruit
  // hun badge-state af; updates komen terug via `onSaved`-callback van de
  // pane en mergen we lokaal.
  const [helpBlob, setHelpBlob] = useState<Record<string, HelpEntry>>({})
  const [helpLoading, setHelpLoading] = useState(true)
  const [editingHelpKey, setEditingHelpKey] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/guide-help')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = (await res.json()) as Record<string, HelpEntry>
        if (!cancelled) setHelpBlob(blob)
      } catch {
        // Niet kritiek — badges tonen dan "geen uitleg" voor alles.
      } finally {
        if (!cancelled) setHelpLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleTabChange = useCallback(
    (tab: TabId) => {
      setActiveTab(tab)
      // URL deeplink-bar maken zonder een nieuwe history-entry voor elke tab-wissel.
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', tab)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const renderHelpBadge = useCallback(
    (helpKey: string) => (
      <HelpStatusBadge
        entry={helpBlob[helpKey]}
        onClick={() => {
          setEditingHelpKey(helpKey)
          setEditingLabel(undefined)
        }}
      />
    ),
    [helpBlob],
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--ink)]">Stappen-beheer</h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Beheer de stappen die op /will als post-onboarding kaarten verschijnen
          (algemene + doel-stappen) en de legacy module-stappen.
        </p>
      </div>

      <TabBar active={activeTab} onChange={handleTabChange} />

      <p className="text-xs italic text-[var(--ink-3)]">{TAB_DESCRIPTIONS[activeTab]}</p>

      <div role="tabpanel" id={`tab-panel-${activeTab}`}>
        {activeTab === 'algemeen' && (
          <StandardStepsTab
            renderTrailing={helpLoading ? undefined : renderHelpBadge}
          />
        )}
        {activeTab === 'doelen' && (
          <GoalStepsTab
            renderTrailing={helpLoading ? undefined : renderHelpBadge}
          />
        )}
        {activeTab === 'module' && <ModuleStepsTab />}
      </div>

      {editingHelpKey && (
        <HelpContentPane
          open={true}
          onClose={() => {
            setEditingHelpKey(null)
            setEditingLabel(undefined)
          }}
          helpKey={editingHelpKey}
          stepLabel={editingLabel}
          onSaved={(entry) => {
            setHelpBlob((prev) => ({ ...prev, [editingHelpKey]: entry }))
          }}
        />
      )}
    </div>
  )
}

export default function BeheerModuleGuidePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-3)]" />
          <span className="ml-2 text-sm text-[var(--ink-3)]">Beheer laden…</span>
        </div>
      }
    >
      <BeheerModuleGuideContent />
    </Suspense>
  )
}
