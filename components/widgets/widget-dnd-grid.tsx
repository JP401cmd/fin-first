'use client'

/**
 * WidgetDndGrid — de EDIT-modus render van de widget-grid, geïsoleerd in een
 * eigen chunk.
 *
 * Bundle ronde 2: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
 * (~18kB gz) werden statisch geïmporteerd door `draggable-widget-grid.tsx` en
 * dus door /overzicht meegeladen — óók in kijk-modus, waar niemand sleept. Alle
 * @dnd-kit-code + de sleepbare item-render (`useSortable`) + de DragOverlay-
 * portal wonen nu hier. De parent laadt deze module via `next/dynamic({ssr:
 * false})` pas zodra de gebruiker op "Bewerken" klikt.
 *
 * Sleep-pariteit met de vorige inline-implementatie is 1:1 behouden:
 *   - live reorder-on-over (parent bezit `activeWidgets`; deze grid meldt de
 *     `over`-wissel terug via `onReorderOver`, de parent doet de arrayMove),
 *   - de `createPortal`-DragOverlay met de `contain:layout`-fix,
 *   - gescheiden Mouse/Touch/Keyboard-sensors,
 *   - no-transform-strategie + MeasuringStrategy.Always voor de heterogene grid.
 * De commit/rollback/save-flow blijft volledig bij de parent.
 */

import { memo, useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
  type SortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { WidgetRenderer, type DashboardData } from './widget-renderer'
import { sizeLabel, widgetSpanClass } from './widget-grid-helpers'
import type { WidgetPref, WidgetSize } from '@/lib/widget-catalog'
import { getWidgetSizes, downsizeForMobile } from '@/lib/widget-catalog'
import { useDisplaySize, useIsMobile } from '@/lib/hooks/use-display-size'
import type { FeatureAccessMap } from '@/lib/compute-feature-access'

// Bewust GEEN transform-strategie. rectSortingStrategy (en de list-strategieën)
// berekenen per item een transform alsof de lijst lineair herschikt — maar een
// CSS-grid met heterogene spans (quarter 1×1, half 2×1, full 2×2, Double 4×2)
// herpakt anders, waardoor items over elkaar schuiven en de "dropplek" niet
// klopt. In plaats daarvan herschikken we de array live in `onDragOver` en laat
// de browser het grid natuurlijk herstromen (geen transforms). De actieve widget
// staat als dashed placeholder op zijn nieuwe plek → een drop-indicator op exact
// het formaat van de widget. Zie het commentaar bij DndContext.
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

// memo(): resize/hide/drag van één widget muteert alleen dat item in de
// pref-array (moveInArray/map behouden de overige object-identiteiten) en de
// handlers zijn useCallback in de parent — dus de props van niet-geraakte items
// blijven referentie-gelijk en die items slaan hun re-render over.
const SortableWidgetItem = memo(function SortableWidgetItem({ pref, data, features, isEditMode, onResize, onHide, hideHideButton }: SortableWidgetItemProps) {
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

  const spanClass = widgetSpanClass(pref.size)

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
              const allowed = getWidgetSizes(pref.id)
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
})

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

// ── WidgetDndGrid ──────────────────────────────────────────────

interface WidgetDndGridProps {
  widgets: WidgetPref[]
  data: DashboardData
  features: FeatureAccessMap
  hideRemoveButton?: boolean
  onResize: (id: string, size: WidgetSize) => void
  onHide: (id: string) => void
  /** Live reorder tijdens het slepen (parent bezit `activeWidgets`). */
  onReorderOver: (activeId: string, overId: string | null) => void
  /** Snapshot van de begin-volgorde bij drag-start (parent, voor rollback). */
  onDragStartSnapshot: () => void
  /** Drag klaar → parent hernummert orders + slaat op als er iets wijzigde. */
  onDragEndCommit: () => void
  /** Slepen geannuleerd (Esc / drop buiten) → parent herstelt de snapshot. */
  onDragCancel: () => void
}

export function WidgetDndGrid({
  widgets,
  data,
  features,
  hideRemoveButton,
  onResize,
  onHide,
  onReorderOver,
  onDragStartSnapshot,
  onDragEndCommit,
  onDragCancel,
}: WidgetDndGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const isMobile = useIsMobile()

  // Client-mount-vlag: de DragOverlay wordt via createPortal naar document.body
  // gehangen. Portalen mag pas ná mount omdat document.body tijdens SSR niet
  // bestaat (deze module laadt sowieso ssr:false, maar de guard blijft correct).
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

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

  const handleDragStart = (event: DragStartEvent) => {
    onDragStartSnapshot()
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    onReorderOver(active.id as string, over ? (over.id as string) : null)
  }

  const handleDragEnd = () => {
    setActiveId(null)
    onDragEndCommit()
  }

  const handleDragCancel = () => {
    setActiveId(null)
    onDragCancel()
  }

  const activePref = activeId ? widgets.find(p => p.id === activeId) ?? null : null
  // Effectieve grootte van de sleep-preview: op mobiel gedownsized, zodat de
  // DragOverlay 1:1 op de (gedownsizede) cel in het grid past.
  const activeDisplaySize: WidgetSize | null = activePref
    ? (isMobile ? downsizeForMobile(activePref.size) : activePref.size)
    : null
  const ids = useMemo(() => widgets.map(p => p.id), [widgets])

  return (
    <>
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
        <SortableContext items={ids} strategy={noTransformStrategy}>
          {/* Zelfde kolom-/rijsprong als de kijk-grid (draggable-widget-grid):
              beide bij sm, anders staat edit-modus anders ingedeeld dan kijk-modus. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 auto-rows-[64px] sm:auto-rows-[160px] gap-3 sm:gap-4">
            {widgets.map(pref => (
              <SortableWidgetItem
                key={pref.id}
                pref={pref}
                data={data}
                features={features}
                isEditMode={true}
                isDragging={pref.id === activeId}
                onResize={onResize}
                onHide={onHide}
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
            cursor zweeft. document.body valt buiten de contained container, dus
            daar lost `fixed` weer op tegen de viewport en volgt de preview de
            cursor 1:1 — ook voor hoge (row-span) widgets en diep op een lange
            pagina. Portalen pas ná mount (SSR heeft geen document.body). */}
        {mounted && createPortal(
          <DragOverlay>
            {activePref && activeDisplaySize ? (
              <DragPreview pref={activePref} size={activeDisplaySize} data={data} features={features} />
            ) : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </>
  )
}
