'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { X, Plus, Lock, Wand2, ChevronRight, Layers, CalendarClock, PieChart, Wallet, Flame, LayoutDashboard, Compass, Trash2, Check } from 'lucide-react'
import type { DashboardData } from './widget-renderer'
import { Button } from '@/components/editorial/button'
import { StaticWidgetItem, sizeLabel } from './widget-grid-helpers'
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
// De sleep-machinerie (@dnd-kit, ~18kB gz) laadt pas in EDIT-modus via een
// eigen chunk. In kijk-modus rendert de statische `StaticWidgetItem`-grid —
// @dnd-kit blijft zo volledig buiten de first-load JS van /overzicht (bundle
// ronde 2).
const WidgetDndGrid = dynamic(
  () => import('./widget-dnd-grid').then(m => ({ default: m.WidgetDndGrid })),
  { ssr: false },
)
import type { WidgetPref, WidgetSize, WidgetModule } from '@/lib/widget-catalog'
import { WIDGET_CATALOG, WIDGET_FEATURE_MAP, BUDGET_WIDGETS, getWidgetDef, getWidgetSizes } from '@/lib/widget-catalog'
import { WIDGET_PRESETS, type WidgetPreset } from '@/lib/widget-presets'
import { isFeatureAccessible, type FeatureAccessMap } from '@/lib/compute-feature-access'
import { useFeatureAccess } from '@/components/app/feature-access-provider'

/**
 * Verplaats een element binnen een array (immutabel) — lokale replica van
 * @dnd-kit's `arrayMove` zodat de parent zelf géén @dnd-kit importeert. De
 * sleep-chunk (`widget-dnd-grid.tsx`) meldt de `over`-wissel terug; deze helper
 * doet de daadwerkelijke herschikking op de door de parent beheerde volgorde.
 */
function moveInArray<T>(array: T[], from: number, to: number): T[] {
  const next = array.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
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

/** Catalogus-id's voor een snelle geldigheidscheck (stale/verwijderde prefs). */
const KNOWN_WIDGET_IDS = new Set(WIDGET_CATALOG.map(w => w.id))

/** Dynamische (niet-catalogus) widget-id's: favorieten en grenzenpotten. */
function isDynamicWidgetId(id: string): boolean {
  return (
    id.startsWith('budget_fav:') ||
    id.startsWith('holding_fav:') ||
    id.startsWith('spend_limit:')
  )
}

/**
 * Hoe een save-actie omgaat met prefs die NIET in de meegestuurde lijst zitten.
 *
 * - `'partial'` — resize/reorder/hide/add: de lijst is een bewerking van de
 *   huidige indeling, geen nieuwe indeling. Alleen wat de gebruiker zelf
 *   deactiveerde gaat op `enabled:false`; al het andere blijft ongemoeid.
 * - `'replace'` — leegmaken / vul-dashboard / preset / auto-samenstellen: de
 *   gebruiker vervangt (na bevestiging of wizard) de héle indeling, dus alles
 *   wat er niet in zit gaat bewust uit.
 */
type SaveMode = 'partial' | 'replace'

/**
 * Bouwt de volledige `widget_prefs`-set die naar `/api/widgets` gaat. De route
 * VERVANGT de hele kolom, dus deze merge is de enige bescherming van prefs die
 * niet in de lokale grid-state zitten.
 *
 * Kern-invariant (Notion 2026-08-09-testbug-03b440 "Grenzenpot"): afwezig in
 * `widgets` betekent NIET "uitgezet". De lokale `activeWidgets`-state is een
 * gefilterde momentopname — `isWidgetVisible` haalt er tijdelijk onzichtbare
 * prefs uit (budgetteren uit, feature uitgezet) en de lazy `useState`-seed mist
 * prefs die de server ná mount injecteert (net aangemaakte grenzenpot of
 * favoriet). Zulke prefs gaan hier ONGEWIJZIGD mee terug; alleen id's in
 * `deactivatedIds` — wat de gebruiker in deze sessie daadwerkelijk uitzette —
 * worden op `enabled:false` gezet. Zonder dat onderscheid wiste elke losse
 * resize stilzwijgend een pot-widget die niet meer terug te halen is (de picker
 * toont `spend_limit:*` bewust niet, ADR 0092 besluit 1).
 */
function mergeWidgetPrefsForSave(
  widgets: WidgetPref[],
  allPrefs: WidgetPref[],
  deactivatedIds: ReadonlySet<string>,
): WidgetPref[] {
  const activeIds = new Set(widgets.map(w => w.id))
  const untouched = allPrefs
    .filter(p => !activeIds.has(p.id))
    .map(p => (deactivatedIds.has(p.id) ? { ...p, enabled: false } : p))
  return [...widgets.map(w => ({ ...w, enabled: true })), ...untouched]
}

/** Check if a widget should be visible: accessible + budget/holding data present */
function isWidgetVisible(pref: WidgetPref, features: FeatureAccessMap, data: DashboardData): boolean {
  // Onbekende/verwijderde widget-id in opgeslagen prefs (bv. na het schrappen
  // van een widget): negeer 'm netjes i.p.v. een lege grid-tegel te tonen.
  // Dynamische favorieten (budget_fav:*/holding_fav:*) en grenzenpotten
  // (spend_limit:*) staan niet in de catalogus.
  if (
    !KNOWN_WIDGET_IDS.has(pref.id) &&
    !pref.id.startsWith('budget_fav:') &&
    !pref.id.startsWith('holding_fav:') &&
    !pref.id.startsWith('spend_limit:')
  ) {
    return false
  }
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
  // Stale grenzenpotten: pot gearchiveerd/verdwenen. BEWUST GEEN budgetingActive-
  // gate hierboven: een tegenpartij-pot werkt volledig zonder budgetten (AC-B2-09).
  // De bundel draagt óók gepauzeerde potten, zodat pauzeren de widget niet wist.
  if (pref.id.startsWith('spend_limit:')) {
    const limitId = pref.id.slice('spend_limit:'.length)
    if (!data.spendLimitWidgets?.find(s => s.id === limitId)) return false
  }
  return true
}

export function DraggableWidgetGrid({ initialPrefs, allPrefs, data, categoryAppLinks, suppressIntroSheet, hideRemoveButton, editMode: controlledEditMode, onEditModeChange }: DraggableWidgetGridProps) {
  const router = useRouter()
  const { features } = useFeatureAccess()

  // Filter out inaccessible, budget-gated, and stale-favorite widgets.
  // Lazy init: dit seedt enkel de useState en wordt na de eerste render toch
  // genegeerd — zo draait de filter niet meer bij elke re-render.
  const [activeWidgets, setActiveWidgets] = useState<WidgetPref[]>(
    () => initialPrefs.filter(p => isWidgetVisible(p, features, data)),
  )
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

  // Store previous state for rollback on error
  const previousWidgets = useRef<WidgetPref[]>(initialPrefs)
  // Snapshot van de volgorde bij drag-start — voor rollback bij annuleren.
  const dragStartOrder = useRef<WidgetPref[] | null>(null)
  // Debounce timer ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track pending debounced save for flush on unload/unmount
  const pendingWidgets = useRef<WidgetPref[] | null>(null)
  // Id's die de gebruiker in DEZE sessie zelf uitzette (kruisje of een bewuste
  // vervang-actie). Alleen deze mogen als `enabled:false` worden weggeschreven —
  // zie mergeWidgetPrefsForSave. Blijft bewust een ref: het is geen render-input,
  // en hij moet ook gelden voor saves die vóór de eerstvolgende router.refresh()
  // vertrekken (`allPrefs` draagt de false dan nog niet).
  const deactivatedIds = useRef<Set<string>>(new Set())

  const performSave = useCallback(async (widgets: WidgetPref[], mode: SaveMode) => {
    setSaveError(null)

    if (mode === 'replace') {
      // Bewuste vervanging van de hele indeling: alles wat er niet in zit is
      // vanaf nu uitgezet.
      const activeIds = new Set(widgets.map(w => w.id))
      for (const p of allPrefs) {
        if (!activeIds.has(p.id)) deactivatedIds.current.add(p.id)
      }
    }
    const merged = mergeWidgetPrefsForSave(widgets, allPrefs, deactivatedIds.current)

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
      // Debounced saves komen altijd uit resize/reorder/hide/add — bewerkingen
      // van de huidige indeling, nooit een vervanging.
      performSave(widgets, 'partial')
    }, 800)
  }, [performSave])

  // Flush pending debounced save on page unload or component unmount
  useEffect(() => {
    const flush = () => {
      if (pendingWidgets.current && saveTimer.current) {
        clearTimeout(saveTimer.current)
        const widgets = pendingWidgets.current
        pendingWidgets.current = null
        // Zelfde merge-regels als performSave (gedeelde helper — de twee paden
        // mogen niet uit elkaar lopen). Een geflushte debounce is per definitie
        // 'partial'.
        const merged = mergeWidgetPrefsForSave(widgets, allPrefs, deactivatedIds.current)
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

  // Reverse-sync: het verwijderen van een favoriet-widget (budget_fav:*/holding_fav:*)
  // moet óók de favorietstatus van de onderliggende entiteit wissen, zodat
  // favoriet- en widgetweergave altijd gelijk blijven. Zonder dit bleef een holding/
  // budget "favoriet" (gevuld hart) terwijl de widget al weg was — juist de drift die
  // de bug beschrijft. Fire-and-forget via de API (mutatie = API-route, datapad-conventie);
  // router.refresh trekt de server-bundel opnieuw zodat de favoriet niet heringespoten wordt.
  const syncFavoriteRemoval = useCallback((widgetId: string) => {
    if (widgetId.startsWith('holding_fav:')) {
      const holdingId = widgetId.slice('holding_fav:'.length)
      fetch(`/api/holdings/${holdingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: false }),
      })
        .then(() => router.refresh())
        .catch(() => { /* niet-fataal: widget is lokaal al verborgen */ })
    } else if (widgetId.startsWith('budget_fav:')) {
      const budgetId = widgetId.slice('budget_fav:'.length)
      // De favorites-route zet de volledige set (true voor genoemde ids, false voor
      // de rest). Stuur de resterende favorieten mee zodat alleen déze afvalt.
      const remaining = data.favoriteBudgets.filter(b => b.id !== budgetId).map(b => b.id)
      fetch('/api/budgets/favorites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favoriteIds: remaining }),
      })
        .then(() => router.refresh())
        .catch(() => { /* niet-fataal */ })
    }
  }, [data.favoriteBudgets, router])

  const handleHide = useCallback((widgetId: string) => {
    // BEWUST GEEN reverse-sync voor `spend_limit:*`. Het equivalent van "favoriet
    // uitzetten" zou daar het ARCHIVEREN van de pot zijn — een destructieve actie
    // op een gedragsnorm mét historie, uitgelokt door een kruisje op een tegel.
    // Verbergen persisteert hier uitsluitend `enabled:false`; archiveren blijft in
    // de sectie achter de bevestigings-overlay (FR-B2-05).
    if (widgetId.startsWith('holding_fav:') || widgetId.startsWith('budget_fav:')) {
      syncFavoriteRemoval(widgetId)
    }
    // Dit is de ENIGE plek waar een losse widget bewust uit gaat. Zonder deze
    // registratie zou de save 'm ongemoeid laten (afwezig ≠ uitgezet).
    deactivatedIds.current.add(widgetId)
    setActiveWidgets(prev => {
      const updated = prev.filter(w => w.id !== widgetId)
      scheduleSave(updated)
      return updated
    })
  }, [scheduleSave, syncFavoriteRemoval])

  const handleAdd = useCallback((widgetId: string) => {
    // Weer toevoegen heft een eerdere hide in deze sessie op.
    deactivatedIds.current.delete(widgetId)
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
    await performSave(reordered, 'replace')
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
    await performSave(reordered, 'replace')
    setIsEditMode(false)
    setShowAddPicker(false)
    router.refresh()
  }, [performSave, router, features, data])

  // Bulk: vul dashboard met alle toegankelijke widgets op de gekozen grootte.
  // Vervangt de huidige indeling (na bevestiging via dialoog). Behoudt
  // dynamische favorieten (budget_fav:*, holding_fav:*) én grenzenpotten
  // (spend_limit:*) en hergroottet ze mee zodat de gehele dashboard-lay-out
  // consistent is.
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
    // Grenzenpotten en favorieten horen hier net zo goed bij als de catalogus-
    // widgets: zonder deze tak wist "vul dashboard" ze stil (ze staan niet in
    // WIDGET_CATALOG, dus de fill-lijst hierboven bevat ze niet).
    //
    // Bron is `allPrefs` (de server-lijst), NIET alleen de lokale state: een pot
    // die de server net injecteerde zit nog niet in `activeWidgets` en zou
    // anders alsnog gewist worden — dezelfde stille-verlies-route als in
    // mergeWidgetPrefsForSave. De lokale variant wint wel als hij er is, want
    // die kan nog niet-opgeslagen bewerkingen dragen.
    const dynamicPrefs = new Map<string, WidgetPref>()
    for (const p of allPrefs) {
      if (!p.enabled || !isDynamicWidgetId(p.id)) continue
      if (!isWidgetVisible(p, features, data)) continue
      dynamicPrefs.set(p.id, p)
    }
    for (const w of activeWidgets) {
      if (isDynamicWidgetId(w.id)) dynamicPrefs.set(w.id, w)
    }
    for (const w of dynamicPrefs.values()) {
      // Clamp naar de toegestane maten van deze tegel — voorkomt dat een
      // niet-ondersteunde fill-size (bv. mini) in de fallback-render valt.
      const favSizes = getWidgetSizes(w.id)
      const clamped = favSizes.includes(size) ? size : 'quarter'
      newPrefs.push({ ...w, size: clamped, order: newPrefs.length })
    }
    setActiveWidgets(newPrefs)
    setBulkAction(null)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    pendingWidgets.current = null
    await performSave(newPrefs, 'replace')
    router.refresh()
  }, [features, data, allPrefs, activeWidgets, performSave, router])

  // Bulk: verberg alle widgets — dashboard wordt leeg, gebruiker kan opnieuw
  // beginnen via "Widget toevoegen", "Automatisch samenstellen" of presets.
  const handleClearAll = useCallback(async () => {
    setActiveWidgets([])
    setBulkAction(null)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    pendingWidgets.current = null
    await performSave([], 'replace')
    router.refresh()
  }, [performSave, router])

  // ── Sleep-lifecycle (aangeroepen vanuit de edit-only WidgetDndGrid-chunk) ──
  // De @dnd-kit-wiring + `activeId` + de DragOverlay wonen in de dynamische
  // `widget-dnd-grid.tsx`-chunk; die meldt de lifecycle terug via primitieve
  // callbacks. De volgorde (`activeWidgets`), de rollback-snapshot en de save-
  // flow blijven hier — het gedrag is 1:1 gelijk aan de vorige inline-versie.

  // Snapshot van de begin-volgorde bij drag-start (voor rollback bij annuleren).
  const dragStartSnapshot = useCallback(() => {
    dragStartOrder.current = activeWidgets
  }, [activeWidgets])

  // Live herschikken tijdens het slepen: verplaats de actieve widget in de array
  // zodra de cursor boven een ander item hangt. Het grid herstroomt native (geen
  // transforms), zodat de dashed placeholder op de nieuwe plek een drop-indicator
  // op exact het widget-formaat vormt — ook voor hoge (row-span) widgets. Nog
  // NIET opslaan; dat gebeurt één keer bij drag-end.
  const reorderOver = useCallback((activeId: string, overId: string | null) => {
    if (!overId || activeId === overId) return
    setActiveWidgets(prev => {
      const oldIndex = prev.findIndex(p => p.id === activeId)
      const newIndex = prev.findIndex(p => p.id === overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev
      return moveInArray(prev, oldIndex, newIndex)
    })
  }, [])

  const dragEndCommit = useCallback(() => {
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
  const dragCancel = useCallback(() => {
    const startOrder = dragStartOrder.current
    dragStartOrder.current = null
    if (startOrder) setActiveWidgets(startOrder)
  }, [])

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

      {/* Grid met heterogene spans (S 1×1, M 2×1, L 2×2, Double 4×2).
          KIJK-modus: een statische, @dnd-kit-vrije grid (StaticWidgetItem) —
          zo blijft de ~18kB sleep-code buiten de first-load JS van /overzicht.
          EDIT-modus: WidgetDndGrid laadt de sleep-machinerie uit een aparte
          chunk (dynamic, ssr:false) en herbergt DndContext + de live reorder-
          on-over + de DragOverlay-portal. De volgorde/save-flow blijft hier.
          De kolomsprong (2→4) loopt synchroon met de rijhoogte-sprong
          (64→160px) bij sm; liep hij pas bij lg, dan werd de rail op sm hoger
          dan op lg (zie widgetSpanClass() in widget-grid-helpers.tsx). */}
      {isEditMode ? (
        <WidgetDndGrid
          widgets={activeWidgets}
          data={data}
          features={features}
          hideRemoveButton={hideRemoveButton}
          onResize={handleResize}
          onHide={handleHide}
          onReorderOver={reorderOver}
          onDragStartSnapshot={dragStartSnapshot}
          onDragEndCommit={dragEndCommit}
          onDragCancel={dragCancel}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 auto-rows-[64px] sm:auto-rows-[160px] gap-3 sm:gap-4">
          {activeWidgets.map(pref => (
            <StaticWidgetItem key={pref.id} pref={pref} data={data} features={features} />
          ))}
        </div>
      )}

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

      {/* Afrond-toolbar onder de widgets — spiegelt de bovenste Gereed-toggle
          (hero-rail) zodat je na het scrollen door de widgets niet terug naar
          boven hoeft om het bewerken af te sluiten. Wijzigingen worden al
          automatisch bewaard; "Gereed" sluit de bewerkmodus — identiek aan de
          knop bovenaan (roept dezelfde `setIsEditMode(false)`-flow aan). */}
      {isEditMode && (
        <div className="mt-4 flex justify-end border-t border-[var(--border-ed)] pt-4">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsEditMode(false)}
            data-testid="edit-done-bottom"
          >
            <Check className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Gereed
          </Button>
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
          <div className="fixed inset-0 z-[70] bg-[var(--scrim)]" onClick={() => setSelectedPreset(null)} />
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
          <div className="fixed inset-0 z-[70] bg-[var(--scrim)]" onClick={() => setBulkAction(null)} />
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
          <div className="fixed inset-0 z-[70] bg-[var(--scrim)]" onClick={onClose} />
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


