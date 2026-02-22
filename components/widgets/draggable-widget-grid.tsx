'use client'

import { useState, useCallback, useRef } from 'react'
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
import { GripVertical } from 'lucide-react'
import { WidgetRenderer, type DashboardData } from './widget-renderer'
import { reassignOrders } from '@/lib/widget-order'
import type { WidgetPref } from '@/lib/widget-catalog'

// ── SortableWidgetItem ─────────────────────────────────────────

interface SortableWidgetItemProps {
  pref: WidgetPref
  data: DashboardData
  isEditMode: boolean
  isDragging: boolean
}

function SortableWidgetItem({ pref, data, isEditMode, isDragging }: SortableWidgetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSelfDragging,
  } = useSortable({ id: pref.id })

  const style = isSelfDragging
    ? { opacity: 0, transition: undefined }
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={pref.size === 'full' ? 'sm:col-span-2' : ''}
      data-testid={`widget-item-${pref.id}`}
    >
      <div className="relative">
        {/* Drag handle — only visible in edit mode */}
        {isEditMode && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Versleep ${pref.id} widget`}
            data-testid={`drag-handle-${pref.id}`}
            className="absolute top-2.5 right-2.5 z-10 flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-4)] shadow-[var(--s0)] transition-shadow hover:text-[var(--ink-3)] hover:shadow-[var(--s1)] cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <WidgetRenderer id={pref.id} size={pref.size} data={data} />
      </div>
    </div>
  )
}

// ── Drop placeholder (overlay ghost) ──────────────────────────

function GhostCard({ pref }: { pref: WidgetPref }) {
  return (
    <div
      className={`opacity-90 scale-[1.02] rotate-[0.8deg] shadow-[var(--s2)] cursor-grabbing ${
        pref.size === 'full' ? 'sm:col-span-2' : ''
      }`}
    >
      <div className="rounded-[var(--r-lg)] border border-[var(--border-md)] bg-[var(--paper)] min-h-[180px]" />
    </div>
  )
}

// ── DraggableWidgetGrid ────────────────────────────────────────

interface DraggableWidgetGridProps {
  initialPrefs: WidgetPref[]
  allPrefs: WidgetPref[]
  data: DashboardData
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function DraggableWidgetGrid({ initialPrefs, allPrefs, data }: DraggableWidgetGridProps) {
  const [activeWidgets, setActiveWidgets] = useState<WidgetPref[]>(initialPrefs)
  const [isEditMode, setIsEditMode] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

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

  const scheduleSave = useCallback((widgets: WidgetPref[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      performSave(widgets)
    }, 800)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const performSave = useCallback(async (widgets: WidgetPref[]) => {
    setSaveState('saving')
    setSaveError(null)

    // Merge updated active widgets with disabled widgets from allPrefs
    const activeIds = new Set(widgets.map(w => w.id))
    const disabledPrefs = allPrefs.filter(p => !activeIds.has(p.id))
    const merged = [...widgets, ...disabledPrefs]

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
    } catch {
      // Rollback to previous state
      setActiveWidgets(previousWidgets.current)
      setSaveState('error')
      setSaveError('Opslaan mislukt. Volgorde teruggezet.')
    }
  }, [allPrefs])

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
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    setSaveError(null)

    const activeIds = new Set(activeWidgets.map(w => w.id))
    const disabledPrefs = allPrefs.filter(p => !activeIds.has(p.id))
    const merged = [...activeWidgets, ...disabledPrefs]

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
    } catch {
      setActiveWidgets(previousWidgets.current)
      setSaveState('error')
      setSaveError('Opslaan mislukt. Volgorde teruggezet.')
    }
  }, [activeWidgets, allPrefs])

  const toggleEditMode = useCallback(() => {
    if (isEditMode) {
      handleGereed()
    } else {
      setIsEditMode(true)
      setSaveError(null)
      setSaveState('idle')
    }
  }, [isEditMode, handleGereed])

  const activePref = activeId ? activeWidgets.find(p => p.id === activeId) ?? null : null
  const ids = activeWidgets.map(p => p.id)

  return (
    <div>
      {/* Section header with edit mode toggle */}
      <div className="mb-4 flex items-center justify-between border-b border-[var(--border-ed)] pb-2">
        <h2 className="label-editorial text-[var(--ink-2)]">Mijn Dashboard</h2>
        <div className="flex items-center gap-2">
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
                    : 'Volgorde'}
            </span>
          </button>
        </div>
      </div>

      {/* Instruction banner / error banner */}
      {isEditMode && !saveError && (
        <div className="mb-3 rounded-[var(--r-sm)] border border-dashed border-kern-200 bg-kern-50/50 px-3 py-2 text-xs text-kern-700">
          <span className="hidden sm:inline">Sleep widgets om de volgorde te wijzigen. Klik <strong>Gereed</strong> als je klaar bent.</span>
          <span className="sm:hidden">Houd een widget ingedrukt om te verslepen.</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {activeWidgets.map(pref => (
              <SortableWidgetItem
                key={pref.id}
                pref={pref}
                data={data}
                isEditMode={isEditMode}
                isDragging={pref.id === activeId}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activePref ? <GhostCard pref={activePref} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
