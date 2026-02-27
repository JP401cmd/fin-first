'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Lock, GripVertical } from 'lucide-react'
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
import {
  WIDGET_CATALOG,
  DEFAULT_WIDGET_PREFS,
  mergeWidgetPrefs,
  type WidgetDef,
  type WidgetPref,
  type WidgetModule,
  type WidgetSize,
} from '@/lib/widget-catalog'
import { reassignOrders } from '@/lib/widget-order'
import { computeSovereigntyLevel } from '@/lib/feature-phases'
import { NL_SWR } from '@/lib/horizon-data'

// Map widget sovereignty gates to feature ids
const GATED_WIDGET_FEATURE: Record<string, string> = {
  assets:      'widget_assets',
  belasting_box3: 'widget_belasting',
  holdings:    'widget_holdings',
  monte_carlo: 'widget_monte_carlo',
}
void GATED_WIDGET_FEATURE // suppress unused warning

const MODULE_GROUPS: { module: WidgetModule; label: string; accentClass: string }[] = [
  { module: 'kern',    label: 'De Kern',       accentClass: 'border-kern-400 text-kern-600' },
  { module: 'wil',     label: 'De Wil',        accentClass: 'border-wil-400 text-wil-600' },
  { module: 'horizon', label: 'De Horizon',    accentClass: 'border-horizon-400 text-horizon-600' },
  { module: 'cross',   label: 'Cross-Module',  accentClass: 'border-[var(--border-md)] text-[var(--ink-3)]' },
]

const MODULE_DOT: Record<WidgetModule, string> = {
  kern:    'bg-kern-500',
  wil:     'bg-wil-500',
  horizon: 'bg-horizon-500',
  cross:   'bg-[var(--border-md)]',
}

// ── Sortable widget row ────────────────────────────────────────

interface SortableWidgetRowProps {
  def: WidgetDef
  pref: WidgetPref | undefined
  locked: boolean
  module: WidgetModule
  onToggle: (id: string) => void
  onSizeChange: (id: string, size: WidgetSize) => void
}

function SortableWidgetRow({ def, pref, locked, module, onToggle, onSizeChange }: SortableWidgetRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: def.id, disabled: locked })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const enabled = pref?.enabled ?? false
  const size = pref?.size ?? def.defaultSize
  const allowedSizes = def.sizes

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-4 px-4 sm:px-6 py-3 ${locked ? 'opacity-60' : ''}`}
    >
      {/* Drag handle */}
      {!locked && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Versleep ${def.name}`}
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)] text-[var(--ink-4)] hover:text-[var(--ink-3)] cursor-grab active:cursor-grabbing transition-colors"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {locked && (
        <div className="shrink-0 flex h-7 w-7 items-center justify-center">
          <div className="h-4 w-4" />
        </div>
      )}

      {/* Left: dot + name + description */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`h-2 w-2 shrink-0 rounded-full ${MODULE_DOT[module]} ${locked ? 'opacity-40' : ''}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--ink-2)]">{def.name}</p>
          <p className="text-xs text-[var(--ink-3)]">{def.description}</p>
        </div>
      </div>

      {/* Right: controls */}
      {locked ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-[var(--ink-4)]" />
          <span className="rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
            {def.requiredPhase}
          </span>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-3">
          {/* Size dropdown */}
          {allowedSizes.length > 1 && (
            <select
              value={size}
              onChange={e => onSizeChange(def.id, e.target.value as WidgetSize)}
              disabled={!enabled}
              className="rounded border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-1 text-xs text-[var(--ink-2)] disabled:opacity-50"
            >
              {allowedSizes.map(s => (
                <option key={s} value={s}>{s === 'half' ? 'Half' : 'Volledig'}</option>
              ))}
            </select>
          )}

          {/* Toggle */}
          <button
            type="button"
            onClick={() => onToggle(def.id)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              enabled ? 'bg-zinc-900' : 'bg-zinc-300'
            }`}
            aria-label={`${enabled ? 'Verberg' : 'Toon'} ${def.name}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────

export default function WidgetsPage() {
  const supabase = createClient()
  const [prefs, setPrefs] = useState<WidgetPref[]>(DEFAULT_WIDGET_PREFS.widgets)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [sovereigntyLevel, setSovereigntyLevel] = useState<number>(-2)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [profileResult, assetsResult, debtsResult, txResult] = await Promise.all([
        supabase.from('profiles').select('widget_prefs, date_of_birth').eq('id', user.id).single(),
        supabase.from('assets').select('current_value').eq('is_active', true),
        supabase.from('debts').select('current_balance, debt_type').eq('is_active', true),
        supabase.from('transactions').select('amount')
          .gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
          .lt('date', new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().split('T')[0]),
      ])

      const totalAssets = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.current_value), 0)
      const totalDebts = (debtsResult.data ?? []).reduce((s, d) => s + Number(d.current_balance), 0)
      const netWorth = totalAssets - totalDebts
      let monthlyExpenses = 0
      for (const tx of txResult.data ?? []) {
        const amt = Number(tx.amount)
        if (amt < 0) monthlyExpenses += Math.abs(amt)
      }
      const hasConsumerDebt = (debtsResult.data ?? []).some(d => {
        const dt = (d as { debt_type?: string }).debt_type
        return dt === 'credit_card' || dt === 'personal_loan' || dt === 'consumer'
      })
      const yearlyExpenses = monthlyExpenses * 12
      const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / NL_SWR : 0
      const freedomPct = fireTarget > 0 ? Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0) : 0
      const level = computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPct, hasConsumerDebt)
      setSovereigntyLevel(level)

      const saved = profileResult.data?.widget_prefs as { widgets: WidgetPref[] } | null
      const merged = mergeWidgetPrefs(saved)
      setPrefs(merged.widgets)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isWidgetLocked = useCallback((def: WidgetDef): boolean => {
    return sovereigntyLevel < def.minLevel
  }, [sovereigntyLevel])

  const toggleEnabled = useCallback((id: string) => {
    setPrefs(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p))
  }, [])

  const changeSize = useCallback((id: string, size: WidgetSize) => {
    setPrefs(prev => prev.map(p => p.id === id ? { ...p, size } : p))
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent, moduleWidgetIds: string[]) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setPrefs(prev => {
      // Get current order of widgets in this module group
      const modulePrefs = moduleWidgetIds
        .map(id => prev.find(p => p.id === id))
        .filter((p): p is WidgetPref => p !== undefined)

      const oldIdx = modulePrefs.findIndex(p => p.id === active.id)
      const newIdx = modulePrefs.findIndex(p => p.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return prev

      const reorderedModule = arrayMove(modulePrefs, oldIdx, newIdx)

      // Rebuild: replace module widgets in the overall prefs with reordered ones
      // and reassign orders for module group
      const reorderedWithOrders = reassignOrders(reorderedModule)
      const moduleIdSet = new Set(moduleWidgetIds)

      // Keep non-module prefs, replace module prefs with reordered
      const otherPrefs = prev.filter(p => !moduleIdSet.has(p.id))
      return [...otherPrefs, ...reorderedWithOrders]
    })
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/widgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets: prefs }),
      })
      if (!res.ok) throw new Error('Save failed')
      setMessage({ type: 'success', text: 'Opgeslagen!' })
      setTimeout(() => setMessage(null), 3000)
    } catch {
      setMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setSaving(false)
  }, [prefs])

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-5 sm:mb-8">
        <h1 className="text-3xl font-bold text-[var(--ink)]">Dashboard Widgets</h1>
        <p className="mt-2 text-[var(--ink-3)]">
          Kies welke widgets op jouw dashboard verschijnen en in welk formaat. Sleep rijen om de volgorde aan te passen.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-zinc-900" />
        </div>
      ) : (
        <div className="space-y-6">
          {MODULE_GROUPS.map(({ module, label, accentClass }) => {
            const widgets = WIDGET_CATALOG.filter(w => w.module === module)
            if (widgets.length === 0) return null

            // Sort by current order within this module
            const widgetIds = widgets.map(w => w.id)
            const sortedWidgets = [...widgets].sort((a, b) => {
              const pa = prefs.find(p => p.id === a.id)
              const pb = prefs.find(p => p.id === b.id)
              return (pa?.order ?? 999) - (pb?.order ?? 999)
            })

            return (
              <section key={module} className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
                {/* Section header */}
                <div className={`flex items-center gap-2 border-l-[3px] px-4 sm:px-6 py-3 bg-[var(--subtle)]/50 ${accentClass}`}>
                  <div className={`h-2 w-2 rounded-full ${MODULE_DOT[module]}`} />
                  <h2 className="label-editorial">{label.toUpperCase()}</h2>
                </div>

                {/* Sortable widget rows */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={e => handleDragEnd(e, widgetIds)}
                >
                  <SortableContext items={widgetIds} strategy={verticalListSortingStrategy}>
                    <div className="divide-y divide-[var(--border-ed)]">
                      {sortedWidgets.map(def => {
                        const pref = prefs.find(p => p.id === def.id)
                        const locked = isWidgetLocked(def)
                        return (
                          <SortableWidgetRow
                            key={def.id}
                            def={def}
                            pref={pref}
                            locked={locked}
                            module={module}
                            onToggle={toggleEnabled}
                            onSizeChange={changeSize}
                          />
                        )
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </section>
            )
          })}

          {/* Save button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
            {message && (
              <span className={`text-sm ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                {message.text}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
