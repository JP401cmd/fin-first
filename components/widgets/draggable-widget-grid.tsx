'use client'

import { useState, useCallback, useRef, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  DndContext,
  closestCenter,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
  type SortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Plus, Lock, Wand2, ChevronRight, Layers, CalendarClock, PieChart, Wallet, Flame, LayoutDashboard, Compass, Trash2 } from 'lucide-react'
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
import { useDisplaySize, useIsMobile } from '@/lib/hooks/use-display-size'
import type { WidgetPref, WidgetSize, WidgetModule } from '@/lib/widget-catalog'
import { WIDGET_CATALOG, WIDGET_FEATURE_MAP, BUDGET_WIDGETS, getWidgetDef, downsizeForMobile } from '@/lib/widget-catalog'
import { WIDGET_PRESETS, type WidgetPreset } from '@/lib/widget-presets'
import { isFeatureAccessible, type FeatureAccessMap } from '@/lib/compute-feature-access'
import { useFeatureAccess } from '@/components/app/feature-access-provider'

/** Human-readable size label */
function sizeLabel(size: WidgetSize): string {
  switch (size) {
    case 'mini': return 'XS'
    case 'quarter': return '25%'
    case 'half': return '50%'
    case 'full': return '100%'
    case 'xl': return 'Double'
  }
}

// Bewust GEEN transform-strategie. rectSortingStrategy (en de list-strategieën)
// berekenen per item een transform alsof de lijst lineair herschikt — maar een
// CSS-grid met heterogene spans (quarter 1×1, half 2×1, full 2×2, Double 4×2)
// herpakt anders, waardoor items over elkaar schuiven en de "dropplek" niet
// klopt. In plaats daarvan herschikken we de array live in `onDragOver` en laat
// de browser het grid natuurlijk herstromen (geen transforms). De actieve widget
// staat als dashed placeholder op zijn nieuwe plek → een drop-indicator op exact
// het formaat van de widget. Zie handleDragOver + het commentaar bij DndContext.
const noTransformStrategy: SortingStrategy = () => null

// ── SortableWidgetItem ─────────────────────────────────────────

interface SortableWidgetItemProps {
  pref: WidgetPref
  data: DashboardData
  features: FeatureAccessMap
  isEditMode: boolean
  isDragging: boolean
  onResize?: (id: string, size: WidgetSize) => void
  onHide?: (id: string) => void
  /** Verberg de "Verbergen"-X-knop op deze widget in edit-mode. Bedoeld
   *  voor host-context (hero-rail) waar de user widgets via de
   *  add-picker beheert i.p.v. per stuk. */
  hideHideButton?: boolean
}

function SortableWidgetItem({ pref, data, features, isEditMode, isDragging, onResize, onHide, hideHideButton }: SortableWidgetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSelfDragging,
  } = useSortable({ id: pref.id })

  const displaySize = useDisplaySize(pref.size)
  // Double (xl) is niet selecteerbaar op mobiel: niet elke widget heeft een
  // xl-variant en op mobiel rendert een xl-widget toch als L (full).
  const isMobile = useIsMobile()

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Responsive span classes based on stored size
  // On mobile (<640px): quarter→mini(1col×1row), half→quarter(1col×2row), full→half(2col×2row), xl→full(2col×2row)
  // On desktop (sm+): quarter(1col×1row), half(2col×1row), full(2col×2row), xl(4col×2row op lg)
  const spanClass =
    pref.size === 'xl'      ? 'col-span-2 lg:col-span-4 row-span-2'
    : pref.size === 'full'    ? 'col-span-2 row-span-2'
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
            {/* Hide button — verborgen in host-context (hideHideButton).
                Host beheert widgets via add-picker zelf. */}
            {!hideHideButton && (
              <button
                type="button"
                onClick={() => onHide?.(pref.id)}
                aria-label={`Verberg ${pref.id} widget`}
                title="Verbergen"
                className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-4)] shadow-[var(--s0)] transition-all hover:text-negative hover:border-negative/40 hover:bg-negative/10 active:scale-95 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Size selector buttons — S/M/L (+ Double bij xl-support), mini is auto.
                Double verschijnt alleen op desktop én alleen voor widgets met
                'xl' in hun catalog-sizes (opt-in bouwblok). */}
            {(() => {
              const def = getWidgetDef(pref.id)
              const allowed = def?.sizes ?? (['quarter', 'half', 'full'] as WidgetSize[])
              const allSizes: { key: WidgetSize; label: string }[] = [
                { key: 'quarter' as WidgetSize, label: 'S' },
                { key: 'half' as WidgetSize, label: 'M' },
                { key: 'full' as WidgetSize, label: 'L' },
                { key: 'xl' as WidgetSize, label: 'Double' },
              ]
              const sizes = allSizes.filter(s =>
                allowed.includes(s.key) && !(s.key === 'xl' && isMobile)
              )
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
                      className={`flex items-center justify-center px-1.5 min-h-[44px] min-w-[32px] sm:min-h-0 sm:min-w-7 sm:h-9 text-[10px] font-semibold transition-colors ${
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

// De zwevende sleep-representatie. dnd-kit geeft de DragOverlay-wrapper exact
// de afmetingen van de opgepakte cel; wij renderen de widget op de EFFECTIEVE
// weergavegrootte (`size` = displaySize, dus mobiel gedownsized) zodat de
// preview 1:1 op de bron past en onder het handje/de cursor blijft. Bewust géén
// scale/rotate: die verschuiven de zichtbare box t.o.v. de cursor.
function DragPreview({ pref, size, data, features }: { pref: WidgetPref; size: WidgetSize; data: DashboardData; features: FeatureAccessMap }) {
  return (
    <div
      className="h-full w-full opacity-95 shadow-[var(--s3)] cursor-grabbing ring-2 ring-kern-300 rounded-[var(--r-lg)] overflow-hidden"
    >
      <WidgetRenderer id={pref.id} size={size} data={data} features={features} />
    </div>
  )
}

// ── DraggableWidgetGrid ────────────────────────────────────────

interface DraggableWidgetGridProps {
  initialPrefs: WidgetPref[]
  allPrefs: WidgetPref[]
  data: DashboardData
  /**
   * Klikbare deeplinks naar de app-tabs binnen actieve categorieën — bron
   * voor de balk bovenaan het dashboard. Lege array of undefined → de balk
   * wordt nooit getoond, ook niet als de gebruiker hem aan heeft staan.
   */
  categoryAppLinks?: CategoryAppLink[]
  /**
   * Onderdruk de empty-state intro-sheet (handmatig / automatisch / presets)
   * wanneer er geen actieve widgets zijn. In plaats daarvan toont het grid
   * een compacte "+ Widget toevoegen"-CTA. Bedoeld voor host-context
   * (zoals /overzicht hero-rail) waar de intro-sheet visueel te zwaar is.
   */
  suppressIntroSheet?: boolean
  /**
   * Verberg de X-verwijder-knop per widget in edit-mode. Default `false` —
   * widgets blijven altijd verwijderbaar. Alleen op true zetten wanneer
   * de host een alternatieve verwijder-flow exposeert (geen huidige
   * gebruik; deze prop bestaat voor toekomstige uitbreidingen).
   */
  hideRemoveButton?: boolean
  /**
   * Controlled edit-mode voor host-componenten die hun eigen Bewerken-knop
   * exposen (zoals /overzicht hero-toggle). Bij aanwezigheid van beide
   * props neemt de host de edit-state over; bij undefined valt het grid
   * terug op zijn eigen interne state.
   */
  editMode?: boolean
  onEditModeChange?: (next: boolean) => void
}

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

export function DraggableWidgetGrid({ initialPrefs, allPrefs, data, categoryAppLinks, suppressIntroSheet, hideRemoveButton, editMode: controlledEditMode, onEditModeChange }: DraggableWidgetGridProps) {
  const router = useRouter()
  const { features } = useFeatureAccess()

  // Filter out inaccessible, budget-gated, and stale-favorite widgets
  const accessibleInitialPrefs = initialPrefs.filter(p => isWidgetVisible(p, features, data))

  const [activeWidgets, setActiveWidgets] = useState<WidgetPref[]>(accessibleInitialPrefs)
  const [internalEditMode, setInternalEditMode] = useState(false)
  // Controlled edit-mode: host (zoals /overzicht hero) levert eigen state.
  // Wanneer beide controlled-props aanwezig → gebruik die. Anders → intern.
  const isControlledEditMode =
    controlledEditMode !== undefined && onEditModeChange !== undefined
  const isEditMode = isControlledEditMode ? controlledEditMode : internalEditMode
  const setIsEditMode = (next: boolean | ((prev: boolean) => boolean)) => {
    const resolved =
      typeof next === 'function' ? (next as (prev: boolean) => boolean)(isEditMode) : next
    if (isControlledEditMode) {
      onEditModeChange?.(resolved)
    } else {
      setInternalEditMode(resolved)
    }
  }
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showAddPicker, setShowAddPicker] = useState(false)
  const [showAutoWizard, setShowAutoWizard] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<WidgetPreset | null>(null)
  // Bulk-actie wacht op bevestiging — `null` = geen dialoog open.
  const [bulkAction, setBulkAction] = useState<{ type: 'fill'; size: WidgetSize } | { type: 'clear' } | null>(null)

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

  // Mobiel? Bepaalt de effectieve weergavegrootte van de zwevende sleep-preview
  // (die moet matchen met de gedownsizede cel in het grid).
  const isMobile = useIsMobile()

  // Client-mount-vlag: de DragOverlay wordt via createPortal naar document.body
  // gehangen (zie DragOverlay hieronder). Portalen mag pas ná mount omdat
  // document.body tijdens SSR niet bestaat.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Store previous state for rollback on error
  const previousWidgets = useRef<WidgetPref[]>(initialPrefs)
  // Snapshot van de volgorde bij drag-start — voor rollback bij annuleren.
  const dragStartOrder = useRef<WidgetPref[] | null>(null)
  // Debounce timer ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track pending debounced save for flush on unload/unmount
  const pendingWidgets = useRef<WidgetPref[] | null>(null)

  // Gescheiden sensors i.p.v. één PointerSensor: muis start pas na een kleine
  // afstand (voorkomt accidentele drags bij klikken op de handle), touch pas
  // na een korte long-press (voorkomt conflict met scrollen op mobiel).
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const performSave = useCallback(async (widgets: WidgetPref[]) => {
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
      // Invalidate server component cache so changes are visible after navigation/refresh
      router.refresh()
    } catch {
      // Rollback to previous state
      setActiveWidgets(previousWidgets.current)
      setSaveError('Opslaan mislukt. Volgorde teruggezet.')
    }
  }, [allPrefs, router])

  const scheduleSave = useCallback((widgets: WidgetPref[]) => {
    pendingWidgets.current = widgets
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
    dragStartOrder.current = activeWidgets
    setActiveId(event.active.id as string)
  }, [activeWidgets])

  // Live herschikken tijdens het slepen: verplaats de actieve widget in de array
  // zodra de cursor boven een ander item hangt. Het grid herstroomt native (geen
  // transforms), zodat de dashed placeholder op de nieuwe plek een drop-indicator
  // op exact het widget-formaat vormt — ook voor hoge (row-span) widgets. Nog
  // NIET opslaan; dat gebeurt één keer bij drag-end.
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setActiveWidgets(prev => {
      const oldIndex = prev.findIndex(p => p.id === active.id)
      const newIndex = prev.findIndex(p => p.id === over.id)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }, [])

  const handleDragEnd = useCallback(() => {
    setActiveId(null)
    const startOrder = dragStartOrder.current
    dragStartOrder.current = null
    // De array is al live herschikt via onDragOver. Hier alleen de orders
    // hernummeren en éénmalig opslaan — en alleen als de volgorde echt wijzigde.
    setActiveWidgets(prev => {
      const changed =
        !startOrder ||
        startOrder.length !== prev.length ||
        prev.some((p, i) => startOrder[i]?.id !== p.id)
      if (!changed) return prev
      const reordered = reassignOrders(prev)
      scheduleSave(reordered)
      return reordered
    })
  }, [scheduleSave])

  // Slepen geannuleerd (Esc / drop buiten) → herstel de begin-volgorde.
  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    const startOrder = dragStartOrder.current
    dragStartOrder.current = null
    if (startOrder) setActiveWidgets(startOrder)
  }, [])

  const activePref = activeId ? activeWidgets.find(p => p.id === activeId) ?? null : null
  // Effectieve grootte van de sleep-preview: op mobiel gedownsized, zodat de
  // DragOverlay 1:1 op de (gedownsizede) cel in het grid past.
  const activeDisplaySize: WidgetSize | null = activePref
    ? (isMobile ? downsizeForMobile(activePref.size) : activePref.size)
    : null
  const ids = activeWidgets.map(p => p.id)

  // De balk verschijnt bovenaan het grid zodra:
  //   • er data is (`categoryAppLinks` met >0 entries),
  //   • de gebruiker hem aan heeft staan.
  const showCategoryNavBar =
    !!categoryAppLinks &&
    categoryAppLinks.length > 0 &&
    categoryNavVisible

  const gridContent = (
    <div>
      {/* Categorie-app-balk — direct onder de titel zodat de Kern-apps van
          de gebruiker (Bezittingen + Schulden) als snelkoppelingen zichtbaar
          zijn vóór de widget-grid. Conditioneel via `categoryNavVisible`
          (modify-toggle). */}
      {showCategoryNavBar && (
        <CategoryAppNavBar links={categoryAppLinks!} />
      )}

      {activeWidgets.length === 0 && !isEditMode && suppressIntroSheet ? (
        // Host-suppressed intro: compacte CTA i.p.v. "Handmatig / Automatisch /
        // Presets"-introscherm met wizards. Bedoeld voor /overzicht hero waar
        // de host zelf een Bewerken-toggle exposeert.
        <div className="py-6 flex flex-col items-center text-center">
          <button
            type="button"
            onClick={() => { setIsEditMode(true); setShowAddPicker(true) }}
            className="flex items-center gap-2 rounded-[var(--r-sm)] border border-dashed border-[var(--border-md)] px-4 py-2.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Widget toevoegen
          </button>
        </div>
      ) : activeWidgets.length === 0 && !isEditMode ? (
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

      {/* Heterogene spans (S 1×1, M 2×1, L 2×2, Double 4×2) → we herschikken de
          array live in onDragOver en laten het grid native herstromen (geen
          sorteer-transforms; zie noTransformStrategy op SortableContext).
          closestCenter kiest het item waarvan het midden het dichtst bij de
          cursor ligt — passend bij het reorder-on-over-patroon. MeasuringStrategy
          .Always hermeet de droppables na elke herstroming zodat de volgende
          `over`-inschatting klopt. */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
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
        <SortableContext items={ids} strategy={noTransformStrategy} disabled={!isEditMode}>
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
                hideHideButton={hideRemoveButton}
              />
            ))}
          </div>
        </SortableContext>

        {/* ── Sleep-preview MOET naar document.body geportald worden ──────────
            De app-shell-scrollcontainer is `position: fixed; inset:0;
            overflow-y-auto` mét `contain: layout`. `contain: layout` maakt dat
            element tot containing-block voor `position: fixed`-nakomelingen —
            dnd-kit's <DragOverlay> is zo'n fixed-element. Zonder portal wordt de
            overlay dus t.o.v. de GESCROLLDE container geplaatst i.p.v. de
            viewport, waardoor de preview exact `scrollTop` pixels boven de
            cursor zweeft (empirisch: overlay op y=-422 bij scrollTop 914 → 913px
            te hoog). Dat is de "blijft niet onder het handje"-bug. document.body
            valt buiten de contained container, dus daar lost `fixed` weer op
            tegen de viewport en volgt de preview de cursor 1:1 — ook voor hoge
            (row-span) widgets en diep op een lange pagina. Portalen pas ná mount
            (SSR heeft geen document.body). */}
        {mounted && createPortal(
          <DragOverlay>
            {activePref && activeDisplaySize ? (
              <DragPreview pref={activePref} size={activeDisplaySize} data={data} features={features} />
            ) : null}
          </DragOverlay>,
          document.body,
        )}
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
      {/* Portal naar document.body (zoals WidgetAddPicker): een transform-ancestor
          (mobiele stack-shell / MobilePreviewFrame) maakt `fixed` anders relatief
          aan die ancestor, waardoor de dialoog bovenaan de lange pagina plakt
          i.p.v. gecentreerd in de viewport. z-[70] = boven de zwevende nav-pill
          conform de modal-conventie. */}
      {selectedPreset && createPortal(
        <>
          <div className="fixed inset-0 z-[70] bg-black/30" onClick={() => setSelectedPreset(null)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
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
        </>,
        document.body,
      )}

      {/* Bulk-actie bevestigingsdialoog — vul alles op X / volledig leegmaken.
          Zelfde portal-reden als hierboven. */}
      {bulkAction && createPortal(
        <>
          <div className="fixed inset-0 z-[70] bg-black/30" onClick={() => setBulkAction(null)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
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
        </>,
        document.body,
      )}
    </div>
  )

  return gridContent
}

// ── Module labels & colors ────────────────────────────────────

const MODULE_ORDER: WidgetModule[] = ['kern', 'wil', 'horizon', 'cross']
const MODULE_LABELS: Record<WidgetModule, string> = {
  kern: 'Overzicht',
  wil: 'Tips & acties',
  horizon: 'Toekomst',
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
          <div className="fixed inset-0 z-[70] bg-black/30" onClick={onClose} />
          {/* Centered modal */}
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
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


