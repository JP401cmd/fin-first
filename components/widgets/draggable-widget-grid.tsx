'use client'

import { useState, useCallback, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Plus, Lock, Wand2 } from 'lucide-react'
import { WidgetRenderer, type DashboardData } from './widget-renderer'
import { reassignOrders } from '@/lib/widget-order'
import { AutoDashboardWizard } from './auto-dashboard-wizard'
import { useDisplaySize } from '@/lib/hooks/use-display-size'
import type { WidgetPref, WidgetSize, WidgetModule } from '@/lib/widget-catalog'
import { WIDGET_CATALOG, WIDGET_FEATURE_MAP, BUDGET_WIDGETS, getWidgetDef } from '@/lib/widget-catalog'
import { isFeatureAccessible, type FeatureAccessMap } from '@/lib/compute-feature-access'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { useDashboardType } from '@/components/app/dashboard-type-provider'
import { readBriefingContentPrefs, saveBriefingContentPrefs, type BriefingContentPrefs } from '@/lib/briefing/user-preferences'
import { createClient } from '@/lib/supabase/client'

/** Human-readable size label */
function sizeLabel(size: WidgetSize): string {
  switch (size) {
    case 'mini': return 'XS'
    case 'quarter': return '25%'
    case 'half': return '50%'
    case 'full': return '100%'
  }
}

// ── SortableWidgetItem ─────────────────────────────────────────

interface SortableWidgetItemProps {
  pref: WidgetPref
  data: DashboardData
  features: FeatureAccessMap
  isEditMode: boolean
  isDragging: boolean
  onResize?: (id: string, size: WidgetSize) => void
  onHide?: (id: string) => void
}

function SortableWidgetItem({ pref, data, features, isEditMode, isDragging, onResize, onHide }: SortableWidgetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSelfDragging,
  } = useSortable({ id: pref.id })

  const displaySize = useDisplaySize(pref.size)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Responsive span classes based on stored size
  // On mobile (<640px): quarter→mini(1col×1row), half→quarter(1col×2row), full→half(2col×2row)
  // On desktop (sm+): quarter(1col×1row), half(2col×1row), full(2col×2row)
  const spanClass =
    pref.size === 'full'    ? 'col-span-2 row-span-2'
    : pref.size === 'half'  ? 'row-span-2 sm:row-span-1 col-span-1 sm:col-span-2'
    : pref.size === 'quarter' ? 'row-span-1'
    : ''

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={spanClass}
      data-testid={`widget-item-${pref.id}`}
    >
      {/* Drop placeholder — visible where the widget was */}
      {isSelfDragging ? (
        <div className="h-full rounded-[var(--r-lg)] border-2 border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50" />
      ) : (
      <div className="relative">
        {/* Edit controls — only visible in edit mode */}
        {isEditMode && (
          <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1">
            {/* Hide button */}
            <button
              type="button"
              onClick={() => onHide?.(pref.id)}
              aria-label={`Verberg ${pref.id} widget`}
              title="Verbergen"
              className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-4)] shadow-[var(--s0)] transition-all hover:text-red-500 hover:border-red-200 hover:bg-red-50 active:scale-95 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {/* Size selector buttons — S/M/L only, mini is auto */}
            {(() => {
              const def = getWidgetDef(pref.id)
              const allowed = def?.sizes ?? (['quarter', 'half', 'full'] as WidgetSize[])
              const allSizes: { key: WidgetSize; label: string }[] = [
                { key: 'quarter' as WidgetSize, label: 'S' },
                { key: 'half' as WidgetSize, label: 'M' },
                { key: 'full' as WidgetSize, label: 'L' },
              ]
              const sizes = allSizes.filter(s => allowed.includes(s.key))
              if (sizes.length <= 1) return null
              return (
                <div
                  className="flex rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden"
                  data-testid={`resize-btn-${pref.id}`}
                >
                  {sizes.map(s => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => onResize?.(pref.id, s.key)}
                      aria-label={`${pref.id} widget ${sizeLabel(s.key)}`}
                      aria-pressed={pref.size === s.key}
                      title={sizeLabel(s.key)}
                      className={`flex items-center justify-center px-1.5 min-h-[44px] min-w-[32px] sm:min-h-0 sm:min-w-0 sm:h-9 sm:w-7 text-[10px] font-semibold transition-colors ${
                        pref.size === s.key
                          ? 'bg-[var(--ink)] text-white'
                          : 'text-[var(--ink-4)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)]'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )
            })()}
            {/* Drag handle */}
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Versleep ${pref.id} widget`}
              data-testid={`drag-handle-${pref.id}`}
              className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-4)] shadow-[var(--s0)] transition-shadow hover:text-[var(--ink-3)] hover:shadow-[var(--s1)] cursor-grab active:cursor-grabbing min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          </div>
        )}
        <WidgetRenderer id={pref.id} size={displaySize} data={data} features={features} />
      </div>
      )}
    </div>
  )
}

// ── Drag overlay (follows cursor) ─────────────────────────────

function DragPreview({ pref, data, features }: { pref: WidgetPref; data: DashboardData; features: FeatureAccessMap }) {
  return (
    <div
      className="opacity-90 scale-[1.02] rotate-[0.8deg] shadow-[var(--s3)] cursor-grabbing ring-2 ring-kern-300 rounded-[var(--r-lg)] overflow-hidden"
    >
      <WidgetRenderer id={pref.id} size={pref.size} data={data} features={features} />
    </div>
  )
}

// ── DraggableWidgetGrid ────────────────────────────────────────

interface DraggableWidgetGridProps {
  initialPrefs: WidgetPref[]
  allPrefs: WidgetPref[]
  data: DashboardData
  showDashboardTypeToggle?: boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** Check if a widget is accessible based on feature gating */
function isWidgetAccessible(widgetId: string, features: FeatureAccessMap): boolean {
  const featureId = WIDGET_FEATURE_MAP[widgetId]
  // Widgets not in WIDGET_FEATURE_MAP are always available
  if (!featureId) return true
  return isFeatureAccessible(features, featureId)
}

export function DraggableWidgetGrid({ initialPrefs, allPrefs, data, showDashboardTypeToggle }: DraggableWidgetGridProps) {
  const router = useRouter()
  const { features } = useFeatureAccess()

  // Filter out widgets that are not accessible based on feature-phase gating
  const accessibleInitialPrefs = initialPrefs.filter(p => isWidgetAccessible(p.id, features))

  const [activeWidgets, setActiveWidgets] = useState<WidgetPref[]>(accessibleInitialPrefs)
  const [isEditMode, setIsEditMode] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showAddPicker, setShowAddPicker] = useState(false)
  const [showAutoWizard, setShowAutoWizard] = useState(false)

  // Dashboard type toggle (only active when showDashboardTypeToggle is true)
  const { dashboardType, setDashboardType } = useDashboardType()
  const [briefingPrefs, setBriefingPrefs] = useState<BriefingContentPrefs>({ showNextSteps: true, showDiscover: true })

  useEffect(() => {
    if (showDashboardTypeToggle) setBriefingPrefs(readBriefingContentPrefs())
  }, [showDashboardTypeToggle])

  // Store previous state for rollback on error
  const previousWidgets = useRef<WidgetPref[]>(initialPrefs)
  // Debounce timer ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Short delay for touch devices (long press) + small distance for desktop
        delay: 0,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const performSave = useCallback(async (widgets: WidgetPref[]) => {
    setSaveState('saving')
    setSaveError(null)

    // Merge updated active widgets with disabled widgets from allPrefs
    const activeIds = new Set(widgets.map(w => w.id))
    const disabledPrefs = allPrefs
      .filter(p => !activeIds.has(p.id))
      .map(p => ({ ...p, enabled: false }))
    const merged = [...widgets.map(w => ({ ...w, enabled: true })), ...disabledPrefs]

    try {
      const res = await fetch('/api/widgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets: merged }),
      })
      if (!res.ok) throw new Error('Opslaan mislukt')
      previousWidgets.current = widgets
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1500)
      // Invalidate server component cache so changes are visible after navigation/refresh
      router.refresh()
    } catch {
      // Rollback to previous state
      setActiveWidgets(previousWidgets.current)
      setSaveState('error')
      setSaveError('Opslaan mislukt. Volgorde teruggezet.')
    }
  }, [allPrefs, router])

  const scheduleSave = useCallback((widgets: WidgetPref[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      performSave(widgets)
    }, 800)
  }, [performSave])

  const handleResize = useCallback((widgetId: string, size: WidgetSize) => {
    setActiveWidgets(prev => {
      const updated = prev.map(w =>
        w.id === widgetId ? { ...w, size } : w
      )
      scheduleSave(updated)
      return updated
    })
  }, [scheduleSave])

  const handleHide = useCallback((widgetId: string) => {
    setActiveWidgets(prev => {
      const updated = prev.filter(w => w.id !== widgetId)
      scheduleSave(updated)
      return updated
    })
  }, [scheduleSave])

  const handleAdd = useCallback((widgetId: string) => {
    setActiveWidgets(prev => {
      const maxOrder = prev.reduce((max, w) => Math.max(max, w.order), 0)
      const def = getWidgetDef(widgetId)
      const newWidget: WidgetPref = {
        id: widgetId,
        enabled: true,
        size: def?.defaultSize ?? 'quarter' as WidgetSize,
        order: maxOrder + 1,
      }
      const updated = [...prev, newWidget]
      scheduleSave(updated)
      return updated
    })
    setShowAddPicker(false)
  }, [scheduleSave])

  const handleAutoApply = useCallback(async (newPrefs: WidgetPref[]) => {
    const reordered = reassignOrders(newPrefs)
    setActiveWidgets(reordered)
    await performSave(reordered)
    setIsEditMode(false)
    setShowAddPicker(false)
    // Refresh server data so newly-favorited budgets appear in data.favoriteBudgets
    router.refresh()
  }, [performSave, router])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    setActiveWidgets(prev => {
      const oldIndex = prev.findIndex(p => p.id === active.id)
      const newIndex = prev.findIndex(p => p.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      const reordered = reassignOrders(arrayMove(prev, oldIndex, newIndex))
      scheduleSave(reordered)
      return reordered
    })
  }, [scheduleSave])

  const handleGereed = useCallback(async () => {
    setIsEditMode(false)
    setShowAddPicker(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    setSaveError(null)

    const activeIds = new Set(activeWidgets.map(w => w.id))
    const disabledPrefs = allPrefs
      .filter(p => !activeIds.has(p.id))
      .map(p => ({ ...p, enabled: false }))
    const merged = [...activeWidgets.map(w => ({ ...w, enabled: true })), ...disabledPrefs]

    try {
      const res = await fetch('/api/widgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets: merged }),
      })
      if (!res.ok) throw new Error('Opslaan mislukt')
      previousWidgets.current = activeWidgets
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1500)
      // Invalidate server component cache so changes are visible after navigation/refresh
      router.refresh()
    } catch {
      setActiveWidgets(previousWidgets.current)
      setSaveState('error')
      setSaveError('Opslaan mislukt. Volgorde teruggezet.')
    }
  }, [activeWidgets, allPrefs, router])

  const toggleEditMode = useCallback(async () => {
    if (isEditMode) {
      await handleGereed()
    } else {
      setIsEditMode(true)
      setSaveError(null)
      setSaveState('idle')
    }
  }, [isEditMode, handleGereed])

  const toggleBriefingPref = useCallback((key: keyof BriefingContentPrefs) => {
    setBriefingPrefs(prev => {
      const updated = { ...prev, [key]: !prev[key] }
      saveBriefingContentPrefs(updated)
      const sb = createClient()
      sb.auth.getUser().then(({ data: { user: u } }) => {
        if (!u) return
        sb.from('app_settings').upsert(
          { key: `briefing_preferences_${u.id}`, value: JSON.stringify(updated) },
          { onConflict: 'key' },
        )
      })
      return updated
    })
  }, [])

  const activePref = activeId ? activeWidgets.find(p => p.id === activeId) ?? null : null
  const ids = activeWidgets.map(p => p.id)

  const gridContent = (
    <div>
      {/* Section header with edit mode toggle */}
      <div className="mb-4 flex items-center justify-between border-b border-[var(--border-ed)] pb-2">
        <h2 className="label-editorial text-[var(--ink-2)]">Mijn Dashboard</h2>
        <div className="flex items-center gap-2">
          {/* Dashboard type pill toggle */}
          {showDashboardTypeToggle && (
            <div className="flex rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] p-0.5">
              <button
                type="button"
                onClick={() => setDashboardType('widgets')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  dashboardType === 'widgets'
                    ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                }`}
              >
                Widgets
              </button>
              <button
                type="button"
                onClick={() => setDashboardType('briefing')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  dashboardType === 'briefing'
                    ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                }`}
              >
                Briefing
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={toggleEditMode}
            aria-pressed={isEditMode}
            disabled={saveState === 'saving'}
            className={`flex items-center gap-1 rounded-[var(--r-sm)] border px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
              isEditMode
                ? 'border-kern-300 bg-kern-50 text-kern-700'
                : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            <GripVertical className="h-3.5 w-3.5" />
            <span>
              {saveState === 'saving' && isEditMode === false
                ? 'Opslaan…'
                : saveState === 'saved' && isEditMode === false
                  ? 'Opgeslagen'
                  : isEditMode
                    ? 'Gereed'
                    : 'Modify'}
            </span>
          </button>
        </div>
      </div>

      {/* Briefing content toggles — only visible when dashboard type is briefing */}
      {showDashboardTypeToggle && dashboardType === 'briefing' && (
        <div className="mb-3 flex items-center gap-4 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/30 px-3 py-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <button
              type="button"
              role="switch"
              aria-checked={briefingPrefs.showNextSteps}
              onClick={() => toggleBriefingPref('showNextSteps')}
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                briefingPrefs.showNextSteps ? 'bg-[var(--ink)]' : 'bg-[var(--border-md)]'
              }`}
            >
              <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                briefingPrefs.showNextSteps ? 'translate-x-3.5' : 'translate-x-0.5'
              }`} />
            </button>
            <span className="text-[var(--ink-2)]">Volgende stappen</span>
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <button
              type="button"
              role="switch"
              aria-checked={briefingPrefs.showDiscover}
              onClick={() => toggleBriefingPref('showDiscover')}
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                briefingPrefs.showDiscover ? 'bg-[var(--ink)]' : 'bg-[var(--border-md)]'
              }`}
            >
              <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                briefingPrefs.showDiscover ? 'translate-x-3.5' : 'translate-x-0.5'
              }`} />
            </button>
            <span className="text-[var(--ink-2)]">Ontdek-suggesties</span>
          </label>
        </div>
      )}

      {/* Widget content — hidden when briefing mode is active */}
      {!(showDashboardTypeToggle && dashboardType === 'briefing') && (<>
      {/* Instruction banner / error banner */}
      {isEditMode && !saveError && (
        <div className="mb-3 rounded-[var(--r-sm)] border border-dashed border-kern-200 bg-kern-50/50 px-3 py-2 text-xs text-kern-700">
          <span className="hidden sm:inline">Sleep widgets om de volgorde te wijzigen. Gebruik <span className="inline-flex rounded border border-kern-200 text-[9px] font-semibold px-0.5 mx-0.5 align-text-bottom">S M L</span> om de grootte te kiezen, <X className="inline h-3 w-3 mx-0.5" /> om te verbergen. Klik <strong>Gereed</strong> als je klaar bent.</span>
          <span className="sm:hidden">Houd een widget ingedrukt om te verslepen. Tik <span className="inline-flex rounded border border-kern-200 text-[9px] font-semibold px-0.5 mx-0.5 align-text-bottom">S M L</span> voor grootte, <X className="inline h-3 w-3 mx-0.5" /> om te verbergen.</span>
        </div>
      )}
      {saveError && (
        <div
          className="mb-3 rounded-[var(--r-sm)] border border-dashed border-red-200 bg-red-50/50 px-3 py-2 text-xs text-red-700"
          data-testid="save-error"
        >
          {saveError}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements: {
            onDragStart({ active }) {
              return `Widget ${active.id} opgepakt.`
            },
            onDragOver({ active, over }) {
              if (over) return `Widget ${active.id} wordt boven ${over.id} gehouden.`
              return `Widget ${active.id} wordt gesleept.`
            },
            onDragEnd({ active, over }) {
              if (over) return `Widget ${active.id} neergelegd op positie van ${over.id}.`
              return `Widget ${active.id} neergelegd.`
            },
            onDragCancel({ active }) {
              return `Slepen van ${active.id} geannuleerd.`
            },
          },
        }}
      >
        <SortableContext items={ids} strategy={rectSortingStrategy} disabled={!isEditMode}>
          <div className="grid grid-cols-2 lg:grid-cols-4 auto-rows-[64px] sm:auto-rows-[160px] gap-3 sm:gap-4">
            {activeWidgets.map(pref => (
              <SortableWidgetItem
                key={pref.id}
                pref={pref}
                data={data}
                features={features}
                isEditMode={isEditMode}
                isDragging={pref.id === activeId}
                onResize={handleResize}
                onHide={handleHide}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activePref ? <DragPreview pref={activePref} data={data} features={features} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Add widget picker + AI dashboard — only in edit mode */}
      {isEditMode && (
        <div className="mt-4 flex items-center gap-3">
          <WidgetAddPicker
            activeWidgets={activeWidgets}
            features={features}
            budgetingActive={data.budgetingActive}
            showPicker={showAddPicker}
            onToggle={() => setShowAddPicker(p => !p)}
            onAdd={handleAdd}
            onClose={() => setShowAddPicker(false)}
          />
          <button
            type="button"
            onClick={() => setShowAutoWizard(true)}
            className="flex items-center gap-1.5 rounded-[var(--r-sm)] border border-dashed border-horizon-300 px-3 py-2 text-xs text-horizon-600 hover:text-horizon-700 hover:border-horizon-400 hover:bg-horizon-50/50 transition-colors"
            data-testid="auto-dashboard-btn"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Automatisch samenstellen
          </button>
        </div>
      )}

      </>)}

      {/* Wizard rendered outside conditional/DndContext to avoid fixed-positioning issues from transforms */}
      <AutoDashboardWizard
        open={showAutoWizard}
        onClose={() => setShowAutoWizard(false)}
        onApply={handleAutoApply}
        features={features}
        allBudgets={data.allBudgets}
      />
    </div>
  )

  return gridContent
}

// ── Module labels & colors ────────────────────────────────────

const MODULE_ORDER: WidgetModule[] = ['kern', 'wil', 'horizon', 'cross']
const MODULE_LABELS: Record<WidgetModule, string> = {
  kern: 'De Kern',
  wil: 'De Wil',
  horizon: 'De Horizon',
  cross: 'Cross-Module',
}
const MODULE_DOT_COLORS: Record<WidgetModule, string> = {
  kern: 'bg-kern-400',
  wil: 'bg-wil-400',
  horizon: 'bg-horizon-400',
  cross: 'bg-[var(--ink-4)]',
}

// ── Widget Add Picker ─────────────────────────────────────────

interface WidgetAddPickerProps {
  activeWidgets: WidgetPref[]
  features: FeatureAccessMap
  budgetingActive: boolean
  showPicker: boolean
  onToggle: () => void
  onAdd: (id: string) => void
  onClose: () => void
}

function WidgetAddPicker({ activeWidgets, features, budgetingActive, showPicker, onToggle, onAdd, onClose }: WidgetAddPickerProps) {
  const availableWidgets = WIDGET_CATALOG.filter(
    w => !activeWidgets.some(a => a.id === w.id)
      && (budgetingActive || !BUDGET_WIDGETS.has(w.id))
  )

  const grouped = MODULE_ORDER
    .map(m => ({ module: m, widgets: availableWidgets.filter(w => w.module === m) }))
    .filter(g => g.widgets.length > 0)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 rounded-[var(--r-sm)] border border-dashed border-[var(--border-md)] px-3 py-2 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:border-[var(--ink-4)] transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Widget toevoegen
      </button>

      {showPicker && (
        <>
          {/* Backdrop to close picker on click outside */}
          <div className="fixed inset-0 z-10" onClick={onClose} />

          <div className="absolute left-0 bottom-full mb-2 w-72 max-h-80 overflow-y-auto rounded-[var(--r-lg)] border border-[var(--border-md)] bg-[var(--paper)] shadow-[var(--s2)] z-20">
            {grouped.length === 0 ? (
              <div className="px-3 py-4 text-xs text-[var(--ink-4)] text-center">
                Alle widgets zijn al actief
              </div>
            ) : (
              grouped.map(g => (
                <div key={g.module}>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--border-ed)]">
                    <span className={`h-1.5 w-1.5 rounded-full ${MODULE_DOT_COLORS[g.module]}`} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                      {MODULE_LABELS[g.module]}
                    </span>
                  </div>
                  {g.widgets.map(w => {
                    const accessible = isWidgetAccessible(w.id, features)
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => accessible && onAdd(w.id)}
                        disabled={!accessible}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--subtle)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-[var(--ink-2)] truncate">{w.name}</div>
                          <div className="text-[var(--ink-4)] truncate">{w.description}</div>
                        </div>
                        {!accessible && (
                          <div className="flex items-center gap-1 shrink-0 text-[var(--ink-4)]">
                            <Lock className="h-3 w-3" />
                            {w.requiredPhase && (
                              <span className="text-[10px]">{w.requiredPhase}</span>
                            )}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
