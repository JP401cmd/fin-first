'use client'

import { useState, useCallback, useRef, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
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
import { GripVertical, X, Plus, Lock, Wand2, ChevronRight, ChevronDown, Layers, CalendarClock, PieChart, Wallet, Flame, LayoutDashboard, Compass, Trash2 } from 'lucide-react'
import { WidgetRenderer, type DashboardData } from './widget-renderer'
import { CategoryAppNavBar } from './category-app-nav-bar'
import {
  readCategoryNavBarVisible,
  saveCategoryNavBarVisible,
} from '@/lib/dashboard-prefs'
import type { CategoryAppLink } from '@/lib/category-app-nav'
import { reassignOrders } from '@/lib/widget-order'
// AutoDashboardWizard ships in its own chunk and only loads when the user
// opens it (showAutoWizard becomes true). Cuts ~8-15KB from the initial
// dashboard JS bundle.
const AutoDashboardWizard = dynamic(
  () => import('./auto-dashboard-wizard').then(m => ({ default: m.AutoDashboardWizard })),
  { ssr: false },
)
import { useDisplaySize } from '@/lib/hooks/use-display-size'
import type { WidgetPref, WidgetSize, WidgetModule } from '@/lib/widget-catalog'
import { WIDGET_CATALOG, WIDGET_FEATURE_MAP, BUDGET_WIDGETS, getWidgetDef } from '@/lib/widget-catalog'
import { WIDGET_PRESETS, type WidgetPreset } from '@/lib/widget-presets'
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
              className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-4)] shadow-[var(--s0)] transition-all hover:text-negative hover:border-negative/40 hover:bg-negative/10 active:scale-95 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
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
  /**
   * Klikbare deeplinks naar de app-tabs binnen actieve categorieën — bron
   * voor de balk bovenaan het dashboard. Lege array of undefined → de balk
   * wordt nooit getoond, ook niet als de gebruiker hem aan heeft staan.
   */
  categoryAppLinks?: CategoryAppLink[]
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** Check if a widget is accessible based on feature gating */
function isWidgetAccessible(widgetId: string, features: FeatureAccessMap): boolean {
  const featureId = WIDGET_FEATURE_MAP[widgetId]
  // Widgets not in WIDGET_FEATURE_MAP are always available
  if (!featureId) return true
  return isFeatureAccessible(features, featureId)
}

/** Check if a widget should be visible: accessible + budget/holding data present */
function isWidgetVisible(pref: WidgetPref, features: FeatureAccessMap, data: DashboardData): boolean {
  if (!isWidgetAccessible(pref.id, features)) return false
  // Budget widgets: hidden when budgeting is off
  if (!data.budgetingActive && (BUDGET_WIDGETS.has(pref.id) || pref.id.startsWith('budget_fav:'))) return false
  // Stale holding favorites: holding no longer exists
  if (pref.id.startsWith('holding_fav:')) {
    const holdingId = pref.id.slice('holding_fav:'.length)
    if (!data.favoriteHoldings.find(h => h.id === holdingId)) return false
  }
  // Stale budget favorites: budget no longer exists
  if (pref.id.startsWith('budget_fav:')) {
    const budgetId = pref.id.slice('budget_fav:'.length)
    if (!data.favoriteBudgets.find(b => b.id === budgetId)) return false
  }
  return true
}

export function DraggableWidgetGrid({ initialPrefs, allPrefs, data, showDashboardTypeToggle, categoryAppLinks }: DraggableWidgetGridProps) {
  const router = useRouter()
  const { features } = useFeatureAccess()

  // Filter out inaccessible, budget-gated, and stale-favorite widgets
  const accessibleInitialPrefs = initialPrefs.filter(p => isWidgetVisible(p, features, data))

  const [activeWidgets, setActiveWidgets] = useState<WidgetPref[]>(accessibleInitialPrefs)
  const [isEditMode, setIsEditMode] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showAddPicker, setShowAddPicker] = useState(false)
  const [showAutoWizard, setShowAutoWizard] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<WidgetPreset | null>(null)
  // Bulk-actie wacht op bevestiging — `null` = geen dialoog open.
  const [bulkAction, setBulkAction] = useState<{ type: 'fill'; size: WidgetSize } | { type: 'clear' } | null>(null)
  // Dashboard state from shared context (type + collapsed)
  const { dashboardType, setDashboardType, isCollapsed, setIsCollapsed: setCollapsedCtx } = useDashboardType()

  // ── API-loaded presets (fallback to hardcoded) ──────────────
  const [apiPresets, setApiPresets] = useState<WidgetPreset[]>(WIDGET_PRESETS)
  useEffect(() => {
    let cancelled = false
    fetch('/api/widget-presets')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data?.presets && Array.isArray(data.presets) && data.presets.length > 0) {
          setApiPresets(data.presets)
        }
      })
      .catch(() => { /* fallback to hardcoded WIDGET_PRESETS */ })
    return () => { cancelled = true }
  }, [])

  // Briefing content preferences
  const [briefingPrefs, setBriefingPrefs] = useState<BriefingContentPrefs>({ showNextSteps: true, showDiscover: true })

  useEffect(() => {
    if (showDashboardTypeToggle) setBriefingPrefs(readBriefingContentPrefs())
  }, [showDashboardTypeToggle])

  // Categorie-balk toggle — pure UI-pref (localStorage). Default `true`,
  // maar pas zichtbaar zodra de hydratatie heeft uitgelezen zodat we geen
  // flash krijgen op clients waar de gebruiker hem heeft uitgezet. Voor
  // gebruikers zonder actieve apps is `categoryAppLinks` leeg en valt de
  // balk sowieso weg.
  const [categoryNavVisible, setCategoryNavVisible] = useState<boolean>(true)
  useEffect(() => {
    setCategoryNavVisible(readCategoryNavBarVisible())
  }, [])
  const toggleCategoryNavVisible = useCallback(() => {
    setCategoryNavVisible(prev => {
      const next = !prev
      saveCategoryNavBarVisible(next)
      return next
    })
  }, [])

  // Store previous state for rollback on error
  const previousWidgets = useRef<WidgetPref[]>(initialPrefs)
  // Debounce timer ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track pending debounced save for flush on unload/unmount
  const pendingWidgets = useRef<WidgetPref[] | null>(null)
  const [pendingSave, setPendingSave] = useState(false)

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
      setPendingSave(false)
      setTimeout(() => setSaveState('idle'), 1500)
      // Invalidate server component cache so changes are visible after navigation/refresh
      router.refresh()
    } catch {
      // Rollback to previous state
      setActiveWidgets(previousWidgets.current)
      setSaveState('error')
      setPendingSave(false)
      setSaveError('Opslaan mislukt. Volgorde teruggezet.')
    }
  }, [allPrefs, router])

  const scheduleSave = useCallback((widgets: WidgetPref[]) => {
    pendingWidgets.current = widgets
    setPendingSave(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      pendingWidgets.current = null
      performSave(widgets)
    }, 800)
  }, [performSave])

  // Flush pending debounced save on page unload or component unmount
  useEffect(() => {
    const flush = () => {
      if (pendingWidgets.current && saveTimer.current) {
        clearTimeout(saveTimer.current)
        const widgets = pendingWidgets.current
        pendingWidgets.current = null
        const activeIds = new Set(widgets.map(w => w.id))
        const disabledPrefs = allPrefs
          .filter(p => !activeIds.has(p.id))
          .map(p => ({ ...p, enabled: false }))
        const merged = [...widgets.map(w => ({ ...w, enabled: true })), ...disabledPrefs]
        navigator.sendBeacon('/api/widgets', new Blob(
          [JSON.stringify({ widgets: merged })],
          { type: 'application/json' }
        ))
      }
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [allPrefs])

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
    const reordered = reassignOrders(newPrefs.filter(p => isWidgetVisible(p, features, data)))
    setActiveWidgets(reordered)
    await performSave(reordered)
    setIsEditMode(false)
    setShowAddPicker(false)
    // Refresh server data so newly-favorited budgets appear in data.favoriteBudgets
    router.refresh()
  }, [performSave, router, features, data])

  const handlePresetApply = useCallback(async (preset: WidgetPreset) => {
    if (!preset.widgets || preset.widgets.length === 0) return
    const reordered = reassignOrders(
      preset.widgets.map(w => ({ ...w, enabled: true })).filter(p => isWidgetVisible(p, features, data))
    )
    setActiveWidgets(reordered)
    setSelectedPreset(null)
    // Immediate save (not debounced) — same pattern as handleAutoApply
    if (saveTimer.current) clearTimeout(saveTimer.current)
    pendingWidgets.current = null
    await performSave(reordered)
    setIsEditMode(false)
    setShowAddPicker(false)
    router.refresh()
  }, [performSave, router, features, data])

  // Bulk: vul dashboard met alle toegankelijke widgets op de gekozen grootte.
  // Vervangt de huidige indeling (na bevestiging via dialoog). Behoudt
  // dynamische favorieten (budget_fav:*, holding_fav:*) en hergroottet ze
  // mee zodat de gehele dashboard-lay-out consistent is.
  const handleFillAll = useCallback(async (size: WidgetSize) => {
    const fillable = WIDGET_CATALOG.filter(w => {
      if (!isWidgetAccessible(w.id, features)) return false
      if (BUDGET_WIDGETS.has(w.id) && !data.budgetingActive) return false
      return true
    })
    const newPrefs: WidgetPref[] = fillable.map((w, i) => ({
      id: w.id,
      enabled: true,
      size: w.sizes.includes(size) ? size : w.defaultSize,
      order: i,
    }))
    for (const w of activeWidgets) {
      if (w.id.startsWith('budget_fav:') || w.id.startsWith('holding_fav:')) {
        newPrefs.push({ ...w, size, order: newPrefs.length })
      }
    }
    setActiveWidgets(newPrefs)
    setBulkAction(null)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    pendingWidgets.current = null
    await performSave(newPrefs)
    router.refresh()
  }, [features, data.budgetingActive, activeWidgets, performSave, router])

  // Bulk: verberg alle widgets — dashboard wordt leeg, gebruiker kan opnieuw
  // beginnen via "Widget toevoegen", "Automatisch samenstellen" of presets.
  const handleClearAll = useCallback(async () => {
    setActiveWidgets([])
    setBulkAction(null)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    pendingWidgets.current = null
    await performSave([])
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
    pendingWidgets.current = null
    setPendingSave(false)
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

  const toggleCollapsed = useCallback(() => {
    setCollapsedCtx(!isCollapsed)
  }, [isCollapsed, setCollapsedCtx])

  const activePref = activeId ? activeWidgets.find(p => p.id === activeId) ?? null : null
  const ids = activeWidgets.map(p => p.id)

  // De balk verschijnt onder de "Mijn Dashboard"-titel zodra:
  //   • er data is (`categoryAppLinks` met >0 entries),
  //   • de gebruiker hem aan heeft staan,
  //   • het Will-dashboard de Widgets-modus toont (op andere hosts zonder
  //     de dashboard-type-toggle valt deze conditie weg en wordt de balk
  //     direct gerendeerd zodra de data beschikbaar is).
  // De `!isCollapsed`-check zit in de wrapper (regel ~613), waardoor de
  // balk vanzelf weg valt wanneer de gebruiker het dashboard inklapt.
  const showCategoryNavBar =
    !!categoryAppLinks &&
    categoryAppLinks.length > 0 &&
    categoryNavVisible &&
    (!showDashboardTypeToggle || dashboardType === 'widgets')

  const gridContent = (
    <div>
      {/* Section header with edit mode toggle */}
      <div className={`flex items-center justify-between border-b border-[var(--border-ed)] pb-2 ${isCollapsed ? 'mb-0' : 'mb-4'}`}>
        <button type="button" onClick={toggleCollapsed} className="flex items-center gap-1.5">
          <ChevronDown className={`h-3.5 w-3.5 text-[var(--ink-3)] transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
          <h2 className="label-editorial text-[var(--ink-2)]">Mijn Dashboard</h2>
        </button>
        {!isCollapsed && <div className="flex items-center gap-2">
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
                  : pendingSave && !isEditMode
                    ? 'Opslaan…'
                    : isEditMode
                      ? 'Gereed'
                      : 'Modify'}
            </span>
          </button>
        </div>}
      </div>

      {!isCollapsed && (<>
      {/* Categorie-app-balk — direct onder de titel zodat de Kern-apps van
          de gebruiker (Bezittingen + Schulden) als snelkoppelingen zichtbaar
          zijn vóór de widget-grid. Conditioneel via `categoryNavVisible`
          (modify-toggle) en `dashboardType === 'widgets'`. */}
      {showCategoryNavBar && (
        <CategoryAppNavBar links={categoryAppLinks!} />
      )}

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

      {activeWidgets.length === 0 && !isEditMode ? (
        <div className="py-12 flex flex-col items-center text-center">
          <div className="mb-4 rounded-2xl bg-[var(--subtle)] p-4">
            <LayoutDashboard className="h-7 w-7 text-[var(--ink-4)]" />
          </div>
          <h3 className="text-sm font-semibold text-[var(--ink-2)] mb-1">Je dashboard is leeg</h3>
          <p className="text-xs text-[var(--ink-3)] max-w-[280px] mb-8 leading-relaxed">
            Stel je persoonlijke dashboard samen — handmatig, met een preset, of laat het automatisch opbouwen.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mb-8">
            <button
              type="button"
              onClick={() => { setIsEditMode(true); setShowAddPicker(true) }}
              className="flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--border-md)] px-4 py-2.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Handmatig selecteren
            </button>
            <button
              type="button"
              onClick={() => setShowAutoWizard(true)}
              className="flex items-center gap-2 rounded-[var(--r-sm)] border border-dashed border-horizon-300 px-4 py-2.5 text-xs font-medium text-horizon-600 hover:bg-horizon-50/50 transition-colors"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Automatisch samenstellen
            </button>
          </div>
          <div className="w-full max-w-md">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)] mb-3">Of kies een preset</p>
            <div className="grid grid-cols-2 gap-2">
              {apiPresets.map(preset => {
                const PresetIcon = preset.id === 'pensioenplanner' ? CalendarClock
                  : preset.id === 'vermogensverdeler' ? PieChart
                  : preset.id === 'budgetteerder' ? Wallet
                  : Flame
                const colors = preset.module === 'horizon' ? 'border-l-horizon-500 hover:bg-horizon-50/30'
                  : preset.module === 'kern' ? 'border-l-kern-500 hover:bg-kern-50/30'
                  : 'border-l-wil-500 hover:bg-wil-50/30'
                const iconColor = preset.module === 'horizon' ? 'text-horizon-500'
                  : preset.module === 'kern' ? 'text-kern-500'
                  : 'text-wil-500'
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPreset(preset)}
                    className={`text-left p-3 rounded-[var(--r-sm)] border border-[var(--border-ed)] border-l-3 ${colors} transition-colors cursor-pointer`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <PresetIcon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
                      <span className="text-xs font-semibold text-[var(--ink)]">{preset.name}</span>
                    </div>
                    <p className="text-[11px] text-[var(--ink-3)] line-clamp-2">{preset.description}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : (<>

      {/* Instruction banner / error banner */}
      {isEditMode && !saveError && (
        <div className="mb-3 rounded-[var(--r-sm)] border border-dashed border-kern-200 bg-kern-50/50 px-3 py-2 text-xs text-kern-700">
          <span className="hidden sm:inline">Sleep widgets om de volgorde te wijzigen. Gebruik <span className="inline-flex rounded border border-kern-200 text-[9px] font-semibold px-0.5 mx-0.5 align-text-bottom">S M L</span> om de grootte te kiezen, <X className="inline h-3 w-3 mx-0.5" /> om te verbergen. Klik <strong>Gereed</strong> als je klaar bent.</span>
          <span className="sm:hidden">Houd een widget ingedrukt om te verslepen. Tik <span className="inline-flex rounded border border-kern-200 text-[9px] font-semibold px-0.5 mx-0.5 align-text-bottom">S M L</span> voor grootte, <X className="inline h-3 w-3 mx-0.5" /> om te verbergen.</span>
        </div>
      )}

      {/* Categorie-balk toggle — alleen zichtbaar in modify-mode wanneer er
          actieve apps zijn. Patroon volgt de briefing-pref-toggle hierboven
          zodat de modify-mode één visuele taal houdt. */}
      {isEditMode && categoryAppLinks && categoryAppLinks.length > 0 && (
        <div
          className="mb-3 flex items-center justify-between gap-3 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/30 px-3 py-2"
          data-testid="category-nav-toggle-row"
        >
          <label className="flex min-w-0 items-center gap-2 text-xs cursor-pointer">
            <Compass className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" />
            <span className="min-w-0">
              <span className="block font-medium text-[var(--ink-2)]">Categorie-balk</span>
              <span className="block text-[10px] text-[var(--ink-4)]">Snelkoppeling naar je apps in de Kern.</span>
            </span>
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={categoryNavVisible}
            aria-label="Categorie-balk weergeven"
            onClick={toggleCategoryNavVisible}
            data-testid="category-nav-toggle"
            className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
              categoryNavVisible ? 'bg-[var(--ink)]' : 'bg-[var(--border-md)]'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                categoryNavVisible ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      )}
      {saveError && (
        <div
          className="mb-3 rounded-[var(--r-sm)] border border-dashed border-negative/40 bg-negative/12 px-3 py-2 text-xs text-negative"
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
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <WidgetAddPicker
            activeWidgets={activeWidgets}
            features={features}
            budgetingActive={data.budgetingActive}
            showPicker={showAddPicker}
            onToggle={() => setShowAddPicker(p => !p)}
            onAdd={handleAdd}
            onClose={() => setShowAddPicker(false)}
            onPresetSelect={setSelectedPreset}
            presets={apiPresets}
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

          {/* Visuele scheider — alleen op desktop, mobile wrapt naar nieuwe rij */}
          <div className="hidden sm:block h-6 w-px bg-[var(--border-ed)]" aria-hidden="true" />

          {/* Bulk-vullen: alle accessible widgets aan op gekozen grootte.
              Group-styling spiegelt de per-widget S/M/L resize-knoppen voor
              herkenbaarheid; "Vul alles"-prefix maakt de bulk-bedoeling helder. */}
          <div
            className="flex items-stretch rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden"
            data-testid="fill-all-group"
          >
            <span className="flex items-center px-2.5 text-[10px] font-mono uppercase tracking-[0.08em] text-[var(--ink-3)] border-r border-[var(--border-ed)]">
              Vul alles
            </span>
            {(['quarter', 'half', 'full'] as WidgetSize[]).map(size => (
              <button
                key={size}
                type="button"
                onClick={() => setBulkAction({ type: 'fill', size })}
                aria-label={`Vul dashboard met alle widgets op grootte ${sizeLabel(size)}`}
                title={`Alle widgets aan op ${sizeLabel(size)}`}
                className="px-3 text-[11px] font-semibold text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors min-h-[44px] sm:min-h-0 sm:py-1.5"
                data-testid={`fill-all-${size}-btn`}
              >
                {size === 'quarter' ? 'S' : size === 'half' ? 'M' : 'L'}
              </button>
            ))}
          </div>

          {/* Volledig leegmaken — destructief tint, disabled bij leeg dashboard */}
          <button
            type="button"
            onClick={() => setBulkAction({ type: 'clear' })}
            disabled={activeWidgets.length === 0}
            aria-label="Maak dashboard volledig leeg"
            className="flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-ed)] px-3 py-2 text-xs text-[var(--ink-3)] hover:text-negative hover:border-negative/40 hover:bg-negative/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[var(--ink-3)] disabled:hover:border-[var(--border-ed)] disabled:hover:bg-transparent transition-colors"
            data-testid="clear-all-btn"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Leegmaken
          </button>
        </div>
      )}

      </>)}
      </>)}
      </>)}

      {/* Wizard rendered outside conditional/DndContext to avoid fixed-positioning issues from transforms.
          Mounted only when the user opens it so the dynamic import chunk
          isn't fetched until first interaction. */}
      {showAutoWizard && (
        <AutoDashboardWizard
          open={showAutoWizard}
          onClose={() => setShowAutoWizard(false)}
          onApply={handleAutoApply}
          features={features}
          allBudgets={data.allBudgets}
        />
      )}

      {/* ── Preset confirmation dialog ───────────────────────── */}
      {selectedPreset && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSelectedPreset(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-xl border border-[var(--border-md)] bg-[var(--paper)] shadow-[var(--s3)] p-5">
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                Preset toepassen
              </h3>
              <p className="mt-2 text-xs text-[var(--ink-3)] leading-relaxed">
                Dit vervangt je huidige dashboard met het <span className="font-semibold text-[var(--ink-2)]">{selectedPreset.name}</span>-preset. Je huidige widgetindeling gaat verloren. Doorgaan?
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPreset(null)}
                  className="rounded-[var(--r-sm)] px-3 py-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  onClick={() => { if (selectedPreset) handlePresetApply(selectedPreset) }}
                  className="rounded-[var(--r-sm)] bg-[var(--ink)] text-[var(--paper)] px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  Toepassen
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Bulk-actie bevestigingsdialoog — vul alles op X / volledig leegmaken */}
      {bulkAction && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setBulkAction(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-xl border border-[var(--border-md)] bg-[var(--paper)] shadow-[var(--s3)] p-5">
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                {bulkAction.type === 'clear'
                  ? 'Dashboard leegmaken?'
                  : `Alle widgets aan op ${sizeLabel(bulkAction.size)}?`}
              </h3>
              <p className="mt-2 text-xs text-[var(--ink-3)] leading-relaxed">
                {bulkAction.type === 'clear' ? (
                  <>Alle widgets worden verborgen. Je dashboard wordt leeg en je kunt opnieuw beginnen via <span className="font-semibold text-[var(--ink-2)]">Widget toevoegen</span>, <span className="font-semibold text-[var(--ink-2)]">Automatisch samenstellen</span> of een preset.</>
                ) : (
                  <>Alle beschikbare widgets worden zichtbaar gemaakt op grootte <span className="font-semibold text-[var(--ink-2)]">{sizeLabel(bulkAction.size)}</span>. Je huidige indeling gaat verloren.</>
                )}
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBulkAction(null)}
                  className="rounded-[var(--r-sm)] px-3 py-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (bulkAction.type === 'clear') handleClearAll()
                    else handleFillAll(bulkAction.size)
                  }}
                  className={`rounded-[var(--r-sm)] px-3 py-1.5 text-xs font-medium transition-opacity ${
                    bulkAction.type === 'clear'
                      ? 'bg-negative text-white hover:opacity-90'
                      : 'bg-[var(--ink)] text-[var(--paper)] hover:opacity-90'
                  }`}
                  data-testid="bulk-action-confirm"
                >
                  {bulkAction.type === 'clear' ? 'Leegmaken' : 'Toepassen'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
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
  onPresetSelect: (preset: WidgetPreset) => void
  presets: WidgetPreset[]
}

function WidgetAddPicker({ activeWidgets, features, budgetingActive, showPicker, onToggle, onAdd, onClose, onPresetSelect, presets }: WidgetAddPickerProps) {
  const [openModules, setOpenModules] = useState<Set<WidgetModule>>(new Set())

  const availableWidgets = WIDGET_CATALOG.filter(
    w => !activeWidgets.some(a => a.id === w.id)
      && (budgetingActive || !BUDGET_WIDGETS.has(w.id))
  )

  const grouped = MODULE_ORDER
    .map(m => ({ module: m, widgets: availableWidgets.filter(w => w.module === m) }))
    .filter(g => g.widgets.length > 0)

  const toggleModule = (mod: WidgetModule) => {
    setOpenModules(prev => {
      const next = new Set(prev)
      if (next.has(mod)) next.delete(mod)
      else next.add(mod)
      return next
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 rounded-[var(--r-sm)] border border-dashed border-[var(--border-md)] px-3 py-2 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:border-[var(--ink-4)] transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Widget toevoegen
      </button>

      {showPicker && createPortal(
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
          {/* Centered modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md max-h-[80vh] flex flex-col rounded-xl border border-[var(--border-md)] bg-[var(--paper)] shadow-[var(--s3)]">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-ed)]">
                <h3 className="text-sm font-semibold text-[var(--ink)]">Widget toevoegen</h3>
                <button type="button" onClick={onClose} className="text-[var(--ink-4)] hover:text-[var(--ink-2)] transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="overflow-y-auto flex-1">
                {grouped.length === 0 ? (
                  <div className="px-4 py-8 text-xs text-[var(--ink-4)] text-center">
                    Alle widgets zijn al actief
                  </div>
                ) : (
                  grouped.map(g => {
                    const isOpen = openModules.has(g.module)
                    return (
                      <div key={g.module}>
                        <button
                          type="button"
                          onClick={() => toggleModule(g.module)}
                          aria-expanded={isOpen}
                          className="w-full flex items-center gap-1.5 px-4 py-2 border-b border-[var(--border-ed)] hover:bg-[var(--subtle)] transition-colors cursor-pointer"
                        >
                          <ChevronRight
                            className={`h-3 w-3 text-[var(--ink-4)] transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                          />
                          <span className={`h-1.5 w-1.5 rounded-full ${MODULE_DOT_COLORS[g.module]}`} />
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                            {MODULE_LABELS[g.module]}
                          </span>
                          <span className="text-[10px] text-[var(--ink-4)] ml-auto">
                            ({g.widgets.length})
                          </span>
                        </button>
                        <div
                          className="overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out"
                          style={{
                            maxHeight: isOpen ? `${g.widgets.length * 52}px` : '0px',
                            opacity: isOpen ? 1 : 0,
                          }}
                        >
                          {g.widgets.map(w => {
                            const accessible = isWidgetAccessible(w.id, features)
                            return (
                              <button
                                key={w.id}
                                type="button"
                                onClick={() => accessible && onAdd(w.id)}
                                disabled={!accessible}
                                className="w-full text-left px-4 py-2 text-xs hover:bg-[var(--subtle)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between gap-2 transition-colors"
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
                      </div>
                    )
                  })
                )}

                {/* ── Persona presets section ──────────────────── */}
                <div className="border-t border-[var(--border-md)] bg-[var(--subtle)]/40">
                  <div className="flex items-center gap-1.5 px-4 py-2">
                    <Layers className="h-3 w-3 text-[var(--ink-3)]" />
                    <span className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
                      Persona presets
                    </span>
                  </div>
                  {presets.map(preset => {
                    const isHorizon = preset.module === 'horizon'
                    const isKern = preset.module === 'kern'
                    const borderColor = isHorizon ? 'border-horizon-500' : isKern ? 'border-kern-500' : 'border-wil-500'
                    const hoverBg = isHorizon ? 'hover:bg-horizon-50/50' : isKern ? 'hover:bg-kern-50/50' : 'hover:bg-wil-50/50'
                    const iconColor = isHorizon ? 'text-horizon-500' : isKern ? 'text-kern-500' : 'text-wil-500'
                    const PresetIcon = preset.id === 'pensioenplanner' ? CalendarClock
                      : preset.id === 'vermogensverdeler' ? PieChart
                      : preset.id === 'budgetteerder' ? Wallet
                      : Flame
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => { onPresetSelect(preset); onClose() }}
                        className={`w-full text-left px-4 py-2.5 text-xs flex items-center gap-2.5 transition-colors cursor-pointer border-l-3 ${borderColor} ${hoverBg}`}
                      >
                        <PresetIcon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--ink)] truncate">{preset.name}</div>
                          <div className="text-[11px] text-[var(--ink-3)] truncate">{preset.description}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}


