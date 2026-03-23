'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { WIDGET_CATALOG, type WidgetModule, type WidgetSize, getWidgetDef } from '@/lib/widget-catalog'
import type { WidgetPreset } from '@/lib/widget-presets'
import { Pencil } from 'lucide-react'

const MODULE_COLORS: Record<WidgetModule, { border: string; bg: string; text: string }> = {
  kern:    { border: 'border-amber-300', bg: 'bg-amber-50', text: 'text-amber-700' },
  wil:     { border: 'border-teal-300',  bg: 'bg-teal-50',  text: 'text-teal-700' },
  horizon: { border: 'border-purple-300', bg: 'bg-purple-50', text: 'text-purple-700' },
  cross:   { border: 'border-neutral-300', bg: 'bg-neutral-50', text: 'text-neutral-600' },
}

const SIZE_LABELS: Record<string, string> = {
  mini: 'S',
  quarter: 'M',
  half: 'L',
  full: 'XL',
}

// Build a lookup for widget names
const widgetNames = new Map(WIDGET_CATALOG.map(w => [w.id, w.name]))

// ── Inline Editable Text ────────────────────────────────────────
function InlineEditableText({
  value,
  onSave,
  as = 'input',
  className,
  editClassName,
}: {
  value: string
  onSave: (newValue: string) => void
  as?: 'input' | 'textarea'
  className?: string
  editClassName?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commit = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) {
      onSave(trimmed)
    } else {
      setDraft(value)
    }
    setEditing(false)
  }, [draft, value, onSave])

  const cancel = useCallback(() => {
    setDraft(value)
    setEditing(false)
  }, [value])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && as === 'input') {
        e.preventDefault()
        commit()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    },
    [commit, cancel, as]
  )

  if (editing) {
    const shared = {
      ref: inputRef as never,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: handleKeyDown,
      className: `w-full rounded-md border border-[var(--border-md)] bg-[var(--paper)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-[var(--ink-4)]/30 ${editClassName ?? ''}`,
    }

    if (as === 'textarea') {
      return <textarea {...shared} rows={2} />
    }
    return <input type="text" {...shared} />
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') setEditing(true)
      }}
      className={`group/edit inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1 -mx-1 transition-colors hover:bg-[var(--subtle)] ${className ?? ''}`}
    >
      <span className="min-w-0">{value}</span>
      <Pencil className="h-3 w-3 shrink-0 text-[var(--ink-4)] opacity-0 transition-opacity group-hover/edit:opacity-100" />
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────
export default function WidgetPresetsPage() {
  const [presets, setPresets] = useState<WidgetPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Fetch presets from API
  useEffect(() => {
    fetch('/api/widget-presets')
      .then((r) => r.json())
      .then((data) => setPresets(data.presets ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Save all presets to API
  const savePresets = useCallback(
    async (updated: WidgetPreset[]) => {
      setSaving(true)
      try {
        const res = await fetch('/api/widget-presets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ presets: updated }),
        })
        if (!res.ok) {
          console.error('Failed to save presets:', await res.text())
        }
      } catch (err) {
        console.error('Failed to save presets:', err)
      } finally {
        setSaving(false)
      }
    },
    []
  )

  const updatePresetField = useCallback(
    (presetId: string, field: 'name' | 'description', newValue: string) => {
      setPresets((prev) => {
        const updated = prev.map((p) =>
          p.id === presetId ? { ...p, [field]: newValue } : p
        )
        savePresets(updated)
        return updated
      })
    },
    [savePresets]
  )

  const updateWidgetSize = useCallback(
    (presetId: string, widgetId: string, newSize: WidgetSize) => {
      setPresets((prev) => {
        const updated = prev.map((p) => {
          if (p.id !== presetId) return p
          return {
            ...p,
            widgets: p.widgets.map((w) =>
              w.id === widgetId ? { ...w, size: newSize } : w
            ),
          }
        })
        savePresets(updated)
        return updated
      })
    },
    [savePresets]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-[var(--ink-3)]">Presets laden…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Widget Presets</h2>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              Persona-presets voor het dashboard. Klik op een naam of beschrijving om te bewerken.
            </p>
          </div>
          {saving && (
            <span className="text-xs text-[var(--ink-4)]">Opslaan…</span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {presets.map((preset) => {
          const colors = MODULE_COLORS[preset.module]
          return (
            <div
              key={preset.id}
              className={`rounded-xl border ${colors.border} bg-[var(--paper)] p-5`}
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}>
                  <span className={`text-sm font-bold ${colors.text}`}>
                    {preset.icon.charAt(0)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <InlineEditableText
                      value={preset.name}
                      onSave={(v) => updatePresetField(preset.id, 'name', v)}
                      className="font-semibold text-[var(--ink)]"
                      editClassName="font-semibold"
                    />
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>
                      {preset.module}
                    </span>
                  </div>
                  <div className="mt-0.5">
                    <InlineEditableText
                      value={preset.description}
                      onSave={(v) => updatePresetField(preset.id, 'description', v)}
                      as="textarea"
                      className="text-sm text-[var(--ink-3)]"
                      editClassName="text-[var(--ink-2)]"
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--ink-4)]">
                    Icon: {preset.icon} &middot; ID: {preset.id}
                  </p>
                </div>
              </div>

              {/* Widgets */}
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">
                  Widgets ({preset.widgets.length})
                </p>
                {preset.widgets.length === 0 ? (
                  <p className="text-sm italic text-[var(--ink-4)]">
                    Nog geen widgets geconfigureerd &mdash; wordt in volgende features ingevuld.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {preset.widgets
                      .filter(w => w.enabled)
                      .sort((a, b) => a.order - b.order)
                      .map((w) => {
                        const def = getWidgetDef(w.id)
                        const allowed = def?.sizes ?? (['quarter', 'half', 'full'] as WidgetSize[])
                        const sizeOptions: { key: WidgetSize; label: string }[] = [
                          { key: 'quarter', label: 'S' },
                          { key: 'half', label: 'M' },
                          { key: 'full', label: 'L' },
                        ]
                        return (
                          <div
                            key={w.id}
                            className="flex items-center gap-2 rounded-md border border-[var(--border-ed)] bg-[var(--subtle)] px-2.5 py-1.5 text-xs text-[var(--ink-2)]"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {widgetNames.get(w.id) ?? w.id}
                            </span>
                            <div className="flex shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)]">
                              {sizeOptions.map((s) => {
                                const isActive = w.size === s.key
                                const isAllowed = allowed.includes(s.key)
                                return (
                                  <button
                                    key={s.key}
                                    type="button"
                                    disabled={!isAllowed}
                                    onClick={() => {
                                      if (isAllowed && !isActive) {
                                        updateWidgetSize(preset.id, w.id, s.key)
                                      }
                                    }}
                                    aria-label={`${widgetNames.get(w.id) ?? w.id} formaat ${s.label}`}
                                    aria-pressed={isActive}
                                    title={`${s.label} (${s.key})`}
                                    className={`flex h-7 w-7 items-center justify-center text-[10px] font-semibold transition-colors ${
                                      isActive
                                        ? 'bg-[var(--ink)] text-white'
                                        : isAllowed
                                          ? 'text-[var(--ink-4)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)]'
                                          : 'text-[var(--ink-4)]/30 cursor-not-allowed opacity-30'
                                    }`}
                                  >
                                    {s.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
