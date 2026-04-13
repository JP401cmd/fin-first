'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  AlertCircle,
  Save,
  ArrowUp,
  ArrowDown,
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

// ── Collapsible Module Section ──────────────────────────────
function ModuleSection({
  moduleId,
  steps,
  isOpen,
  onToggle,
  onMoveStep,
  hasChanges,
}: {
  moduleId: ModuleId
  steps: ModuleGuideStep[]
  isOpen: boolean
  onToggle: () => void
  onMoveStep: (moduleId: ModuleId, fromIndex: number, direction: 'up' | 'down') => void
  hasChanges: boolean
}) {
  const label = MODULE_LABELS[moduleId] ?? moduleId

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
          <span className="text-sm font-semibold text-[var(--ink)]">{label}</span>
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
                  <th className="py-2">Href</th>
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
                    <td className="py-2.5 pr-4 text-sm text-[var(--ink)]">
                      {step.label}
                    </td>
                    <td className="py-2.5 text-sm">
                      {step.href ? (
                        <span className="inline-flex items-center gap-1 text-[var(--ink-2)]">
                          <ExternalLink className="h-3 w-3" />
                          <code className="text-xs">{step.href}</code>
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--ink-4)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/module-guide/steps')
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }
        const data = await res.json()
        setSteps(data)
        setOriginalSteps(JSON.parse(JSON.stringify(data)))
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
  const hasAnyChanges = changedModules.size > 0

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

  // ── Save changes ──────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!steps) return
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/module-guide/steps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(steps),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      setOriginalSteps(JSON.parse(JSON.stringify(steps)))
      setSaveMessage('Volgorde opgeslagen!')
    } catch (err) {
      setSaveMessage(`Fout: ${err instanceof Error ? err.message : 'Opslaan mislukt'}`)
    } finally {
      setSaving(false)
    }
  }, [steps])

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

  return (
    <div className="space-y-6">
      {/* Header + Save button */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--ink)]">Module Guide Stappen</h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Overzicht van alle onboarding-stappen per module ({totalSteps} stappen over {MODULE_GUIDE_DISPLAY_ORDER.length} modules).
            Gebruik de pijlen om stappen te herordenen.
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
            hasChanges={changedModules.has(moduleId)}
          />
        ))}
      </div>
    </div>
  )
}
