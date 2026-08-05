'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { WIDGET_CATALOG, type WidgetModule, type WidgetSize, getWidgetDef } from '@/lib/widget-catalog'
import { isKnownPresetWidgetId, type WidgetPreset } from '@/lib/widget-presets'
import type { WidgetPref } from '@/lib/widget-catalog'
import { Pencil, GripVertical, X, Plus, ChevronDown, AlertTriangle } from 'lucide-react'

const MODULE_COLORS: Record<WidgetModule, { border: string; bg: string; text: string }> = {
  kern:    { border: 'border-amber-300', bg: 'bg-amber-50', text: 'text-amber-700' },
  wil:     { border: 'border-teal-300',  bg: 'bg-teal-50',  text: 'text-teal-700' },
  horizon: { border: 'border-purple-300', bg: 'bg-purple-50', text: 'text-purple-700' },
  cross:   { border: 'border-neutral-300', bg: 'bg-neutral-50', text: 'text-neutral-600' },
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

// ── Sortable Widget Item ────────────────────────────────────────
function SortableWidgetItem({
  widget,
  presetId,
  onSizeChange,
  onRemove,
}: {
  widget: WidgetPref
  presetId: string
  onSizeChange: (presetId: string, widgetId: string, size: WidgetSize) => void
  onRemove: (presetId: string, widgetId: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const def = getWidgetDef(widget.id)
  // Wees-id: staat niet in WIDGET_CATALOG én is geen dynamische favoriet.
  // De GET-route filtert deze normaal al weg; dit is het vangnet zodat een
  // onbekende widget nooit meer als kale id zonder uitleg blijft staan.
  const isUnknown = !isKnownPresetWidgetId(widget.id)
  const allowed = def?.sizes ?? (['quarter', 'half', 'full'] as WidgetSize[])
  const sizeOptions: { key: WidgetSize; label: string }[] = [
    { key: 'quarter', label: 'S' },
    { key: 'half', label: 'M' },
    { key: 'full', label: 'L' },
  ]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border bg-[var(--subtle)] px-2.5 py-1.5 text-xs text-[var(--ink-2)] transition-all ${
        isDragging
          ? 'opacity-50 border-[var(--ink-3)] shadow-[var(--s1)] z-10'
          : 'border-[var(--border-ed)]'
      }`}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Versleep ${widgetNames.get(widget.id) ?? widget.id}`}
        className="flex shrink-0 items-center justify-center rounded p-0.5 text-[var(--ink-4)] transition-colors hover:text-[var(--ink-3)] cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Widget name — bij een onbekend id de id tonen mét waarschuwing,
          zodat de beheerder ziet dat deze regel niet op het dashboard rendert */}
      <span className="min-w-0 flex-1 truncate">
        {isUnknown ? (
          <span className="inline-flex items-center gap-1 text-negative">
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate font-mono">{widget.id}</span>
            <span className="shrink-0 font-sans">— onbekende widget, wordt niet getoond</span>
          </span>
        ) : (
          widgetNames.get(widget.id) ?? widget.id
        )}
      </span>

      {/* Order badge */}
      <span className="shrink-0 font-mono text-[10px] text-[var(--ink-4)]">
        #{widget.order}
      </span>

      {/* Size selector */}
      <div className="flex shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)]">
        {sizeOptions.map((s) => {
          const isActive = widget.size === s.key
          const isAllowed = allowed.includes(s.key)
          return (
            <button
              key={s.key}
              type="button"
              disabled={!isAllowed}
              onClick={() => {
                if (isAllowed && !isActive) {
                  onSizeChange(presetId, widget.id, s.key)
                }
              }}
              aria-label={`${widgetNames.get(widget.id) ?? widget.id} formaat ${s.label}`}
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

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(presetId, widget.id)}
        aria-label={`Verwijder ${widgetNames.get(widget.id) ?? widget.id}`}
        className="flex shrink-0 items-center justify-center rounded p-0.5 text-[var(--ink-4)] transition-colors hover:text-red-500 hover:bg-red-50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────
export default function WidgetPresetsPage() {
  const [presets, setPresets] = useState<WidgetPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

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

  const handleDragEnd = useCallback(
    (presetId: string, event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      setPresets((prev) => {
        const updated = prev.map((p) => {
          if (p.id !== presetId) return p

          const enabledWidgets = p.widgets
            .filter(w => w.enabled)
            .sort((a, b) => a.order - b.order)

          const oldIndex = enabledWidgets.findIndex(w => w.id === active.id)
          const newIndex = enabledWidgets.findIndex(w => w.id === over.id)
          if (oldIndex === -1 || newIndex === -1) return p

          const reordered = arrayMove(enabledWidgets, oldIndex, newIndex)

          // Reassign order values 1, 2, 3, ...
          const reorderedWithOrder = reordered.map((w, i) => ({
            ...w,
            order: i + 1,
          }))

          // Merge back with any disabled widgets
          const disabledWidgets = p.widgets.filter(w => !w.enabled)
          return {
            ...p,
            widgets: [...reorderedWithOrder, ...disabledWidgets],
          }
        })

        savePresets(updated)
        return updated
      })
    },
    [savePresets]
  )

  const addWidget = useCallback(
    (presetId: string, widgetId: string) => {
      setPresets((prev) => {
        const updated = prev.map((p) => {
          if (p.id !== presetId) return p
          // Don't add duplicates
          if (p.widgets.some(w => w.id === widgetId)) return p
          const maxOrder = p.widgets.reduce((max, w) => Math.max(max, w.order), 0)
          return {
            ...p,
            widgets: [
              ...p.widgets,
              { id: widgetId, size: 'quarter' as WidgetSize, order: maxOrder + 1, enabled: true },
            ],
          }
        })
        savePresets(updated)
        return updated
      })
    },
    [savePresets]
  )

  const removeWidget = useCallback(
    (presetId: string, widgetId: string) => {
      setPresets((prev) => {
        const updated = prev.map((p) => {
          if (p.id !== presetId) return p
          const filtered = p.widgets.filter(w => w.id !== widgetId)
          // Recompute orders
          const reordered = filtered
            .sort((a, b) => a.order - b.order)
            .map((w, i) => ({ ...w, order: i + 1 }))
          return { ...p, widgets: reordered }
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
              Versleep widgets om de volgorde aan te passen.
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
          const sortedWidgets = preset.widgets
            .filter(w => w.enabled)
            .sort((a, b) => a.order - b.order)
          const widgetIds = sortedWidgets.map(w => w.id)

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
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => handleDragEnd(preset.id, event)}
                  >
                    <SortableContext
                      items={widgetIds}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1.5">
                        {sortedWidgets.map((w) => (
                          <SortableWidgetItem
                            key={w.id}
                            widget={w}
                            presetId={preset.id}
                            onSizeChange={updateWidgetSize}
                            onRemove={removeWidget}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}

                {/* Widget toevoegen dropdown */}
                <WidgetAddDropdown
                  presetId={preset.id}
                  existingWidgetIds={preset.widgets.map(w => w.id)}
                  onAdd={addWidget}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Widget Add Dropdown ──────────────────────────────────────────
function WidgetAddDropdown({
  presetId,
  existingWidgetIds,
  onAdd,
}: {
  presetId: string
  existingWidgetIds: string[]
  onAdd: (presetId: string, widgetId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const existingSet = new Set(existingWidgetIds)
  const available = WIDGET_CATALOG.filter(w => !existingSet.has(w.id))

  // Group by module
  const grouped = available.reduce<Record<string, typeof available>>((acc, w) => {
    const mod = w.module
    if (!acc[mod]) acc[mod] = []
    acc[mod].push(w)
    return acc
  }, {})

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={containerRef} className="relative mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md border border-dashed border-[var(--border-md)] px-3 py-1.5 text-xs text-[var(--ink-3)] transition-colors hover:border-[var(--ink-4)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)]"
      >
        <Plus className="h-3 w-3" />
        Widget toevoegen
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && available.length > 0 && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-[var(--border-md)] bg-[var(--paper)] shadow-lg">
          {Object.entries(grouped).map(([mod, widgets]) => {
            const colors = MODULE_COLORS[mod as WidgetModule] ?? MODULE_COLORS.cross
            return (
              <div key={mod}>
                <div className={`sticky top-0 z-10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${colors.bg} ${colors.text}`}>
                  {mod}
                </div>
                {widgets.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      onAdd(presetId, w.id)
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--subtle)]"
                  >
                    <Plus className="h-3 w-3 shrink-0 text-[var(--ink-4)]" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-[var(--ink-2)]">{w.name}</span>
                      <span className="ml-1 text-[var(--ink-4)]">— {w.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {open && available.length === 0 && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 shadow-lg">
          <p className="text-xs text-[var(--ink-4)] italic">Alle widgets zijn al toegevoegd.</p>
        </div>
      )}
    </div>
  )
}
