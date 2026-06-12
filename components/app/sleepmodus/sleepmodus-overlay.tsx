'use client'

/**
 * Sleepmodus — fullscreen drag-&-drop-toewijzing van transacties aan budgetten.
 *
 * Eén transactie staat als bol in het midden; hoofdbudgetten staan als bollen
 * op vaste ringposities rondom (lib/sleepmodus/ring.ts). Nader je een
 * hoofdbudget met ≥2 deelbudgetten, dan nemen de children de ring over.
 * Vergelijkbare transacties hangen als zwerm achter de bol en vliegen na een
 * bevestigde bulk-toewijzing zichtbaar het doel in.
 *
 * Writes zijn nooit optimistisch (write-then-animate): drop → `applying` →
 * Supabase-write via lib/category-rules.ts → pas daarna de vlieg/puls-animatie.
 *
 * Let op (datamodel): een hoofdbudget mét children is géén geldig toewijsdoel —
 * budgets-client telt bij zo'n parent alleen de children (regel ~1494), dus een
 * direct-op-parent toegewezen transactie zou onzichtbaar zijn in de totalen.
 * Daarom: drop op zo'n parent laat de ring gesplitst staan; een parent met
 * precies één child wijst direct dat child toe; alleen child-loze parents zijn
 * zelf een doel.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragOverEvent,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import { getEventCoordinates } from '@dnd-kit/utilities'
import { Loader2, Save, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { loadAutoCatContext } from '@/lib/auto-categorize-context'
import { buildAssignmentPlan, applyAssignmentPlan } from '@/lib/category-rules'
import { suggestTarget } from '@/lib/sleepmodus/suggest'
import { assignRingSlots, childClusterFor, childPreviewFor, isInsideCluster, MAX_RING_BUDGETS, RING_SLOTS } from '@/lib/sleepmodus/ring'
import {
  initQueue,
  sleepmodusReducer,
  findSiblings,
  currentTx,
  type QueueTx,
  type AssignScope,
} from '@/lib/sleepmodus/queue'
import { resolveEigenRekeningBudgetId, type Budget } from '@/lib/budget-data'
import type { AutoCatContext } from '@/lib/auto-categorize'
import { useFocusTrap } from '@/lib/hooks/use-focus-trap'
import { useScrollLock } from '@/lib/hooks/use-scroll-lock'
import {
  CentraleBolVisual,
  BudgetBol,
  MeerBol,
  MiniSatelliet,
  ZwermTail,
  ZwermTrail,
  DropZones,
  ConfirmCard,
  SamenvattingScherm,
  TransactieDetailsKaart,
  type BolState,
} from './sleepmodus-bollen'

const MEER_SLOT = MAX_RING_BUDGETS - 1
const MEER_EXPANDED = '__meer__'

export type SleepmodusApplyRequest = {
  tx: QueueTx
  siblingIds: string[]
  budgetId: string
  scope: AssignScope
  isTransfer: boolean
  makeShared: boolean
}

export type SleepmodusApplyResult = {
  ruleCreated: boolean
  bulkUpdated: number
}

type Props = {
  transactions: QueueTx[]
  budgets: Budget[]
  budgetGroups: { parent: Budget; children: Budget[] }[]
  hasHousehold: boolean
  monthLabel?: string
  /** Terug naar het keuzescherm (niets toegewezen). */
  onExit: () => void
  /** Klaar of tussentijds gestopt mét toewijzingen — caller herlaadt data. */
  onDone: () => void
  /**
   * Vervangt het standaard Supabase-pad. Voor contexten waar de transacties
   * (nog) niet in de DB staan, zoals de import-flow: de caller werkt zijn
   * eigen rijen bij en regelt zelf eventuele regel-aanmaak bij scope 'rule'.
   */
  applyAssignment?: (req: SleepmodusApplyRequest) => Promise<SleepmodusApplyResult>
  /** CTA-label op het samenvattingsscherm. Default: "Terug naar budgetten". */
  doneLabel?: string
}

/** pointerWithin met rectIntersection-fallback (kleine doelen, snelle bewegingen). */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args)
  return within.length > 0 ? within : rectIntersection(args)
}

/**
 * Het handje "grijpt" de bol horizontaal in het midden en verticaal vlak
 * onder de transactienaam, waar je hem ook oppakt. Zonder deze modifier hangt
 * de bol op de grijp-offset en staat de cursor naast de bol bij het droppen.
 */
// Cursor dít aantal px boven het bol-centrum = direct onder de titelregel.
const GRIP_BOVEN_CENTRUM_PX = 10

const snapGripToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) return transform
  const coords = getEventCoordinates(activatorEvent)
  if (!coords) return transform
  return {
    ...transform,
    x: transform.x + coords.x - draggingNodeRect.left - draggingNodeRect.width / 2,
    y: transform.y + coords.y - draggingNodeRect.top - draggingNodeRect.height / 2 + GRIP_BOVEN_CENTRUM_PX,
  }
}

function DraggableCentraleBol({ tx, siblingCount, entering, onTap }: {
  tx: QueueTx
  siblingCount: number
  entering: boolean
  /** Tik (zonder slepen) → transactiedetails tonen. */
  onTap: () => void
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: 'tx' })
  // Na een echte drag vuurt de browser alsnog een click op hetzelfde element —
  // die onderdrukken we kort zodat loslaten geen details-kaart opent.
  const draggedRecently = useRef(false)
  useEffect(() => {
    if (!isDragging) return
    draggedRecently.current = true
    return () => {
      setTimeout(() => { draggedRecently.current = false }, 150)
    }
  }, [isDragging])

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => { if (!draggedRecently.current) onTap() }}
      className={`absolute left-1/2 top-1/2 z-[3] cursor-grab active:cursor-grabbing ${entering ? 'animate-sleep-bol-enter' : ''}`}
      style={{
        transform: 'translate(-50%, -50%)',
        touchAction: 'none',
        visibility: isDragging ? 'hidden' : undefined,
      }}
      aria-label={`Sleep de transactie ${tx.counterparty_name || tx.description} naar een budget, of tik voor details`}
    >
      <CentraleBolVisual tx={tx} siblingCount={siblingCount} />
    </div>
  )
}

export function SleepmodusOverlay({
  transactions,
  budgets,
  budgetGroups,
  hasHousehold,
  monthLabel,
  onExit,
  onDone,
  applyAssignment,
  doneLabel,
}: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [state, dispatch] = useReducer(sleepmodusReducer, transactions, initQueue)
  const [ctx, setCtx] = useState<AutoCatContext | null>(null)
  const [ctxSettled, setCtxSettled] = useState(false)
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null)
  const [shareSharedBudgetTx, setShareSharedBudgetTx] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pulseTarget, setPulseTarget] = useState<string | null>(null)
  const [flyDelta, setFlyDelta] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  /** Cursorpositie tijdens een drag (viewport-coördinaten) voor de zwerm-staart. */
  const dragPosRef = useRef<{ x: number; y: number } | null>(null)
  /** Ringslot van het geopende cluster — voor de directe geometrische sluiting. */
  const expandedSlotRef = useRef<number | null>(null)
  const applyRunning = useRef(false)
  /** Snapshot van de laatste drop voor de celebratie (queue is dan al geleegd). */
  const lastDropRef = useRef<{ droppableId: string; scope: AssignScope; siblingTxs: QueueTx[] } | null>(null)

  useScrollLock(true)
  useFocusTrap({ active: true, containerRef, initialFocusRef: closeRef })

  // ── Afgeleiden ──────────────────────────────────────────────────────────────
  const tx = currentTx(state)
  const siblingIds = useMemo(() => (tx ? findSiblings(state.items, tx) : []), [state.items, tx])
  const siblingTxs = useMemo(
    () => state.items.filter((t) => siblingIds.includes(t.id)),
    [state.items, siblingIds],
  )

  // Callers (zoals budgets-client) geven soms alleen de parents door als
  // `budgets`, met de children genest in `budgetGroups`. Voeg samen zodat
  // lookups (naam, ownership, eigen-rekening, suggesties) ook leaves vinden.
  const allBudgets = useMemo(() => {
    const map = new Map<string, Budget>()
    for (const b of budgets) map.set(b.id, b)
    for (const g of budgetGroups) {
      map.set(g.parent.id, g.parent)
      for (const c of g.children) map.set(c.id, c)
    }
    return [...map.values()]
  }, [budgets, budgetGroups])

  const eigenRekeningBudgetId = useMemo(() => resolveEigenRekeningBudgetId(allBudgets), [allBudgets])
  const parents = useMemo(() => budgetGroups.map((g) => g.parent), [budgetGroups])
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Budget[]>()
    for (const g of budgetGroups) map.set(g.parent.id, g.children)
    return map
  }, [budgetGroups])
  const budgetById = useMemo(() => {
    const map = new Map<string, Budget>()
    for (const b of allBudgets) map.set(b.id, b)
    return map
  }, [allBudgets])

  // ── Context (regels/historie) éénmalig laden — bepaalt gloed + ringvolgorde ──
  // Once-guard: prop-identiteit kan per parent-render wisselen, maar de
  // sessie-context (en daarmee de ringvolgorde) moet stabiel blijven.
  // Geen cancelled-vlag: StrictMode draait effects dubbel en zou de enige
  // echte load wegcancellen terwijl de guard de herkansing blokkeert.
  const ctxRequested = useRef(false)
  useEffect(() => {
    if (ctxRequested.current) return
    ctxRequested.current = true
    loadAutoCatContext(createClient(), allBudgets)
      .then(setCtx)
      .catch(() => { /* zonder context: geen gloed, ring op sort_order */ })
      .finally(() => setCtxSettled(true))
  }, [allBudgets])

  // Gebruiksfrequentie per parent (regels + historie) voor de ringslot-volgorde.
  const usage = useMemo(() => {
    const map = new Map<string, number>()
    if (!ctx) return map
    const toParent = new Map<string, string>()
    for (const g of budgetGroups) {
      toParent.set(g.parent.id, g.parent.id)
      for (const c of g.children) toParent.set(c.id, g.parent.id)
    }
    const bump = (budgetId: string, weight: number) => {
      const parentId = toParent.get(budgetId)
      if (parentId) map.set(parentId, (map.get(parentId) ?? 0) + weight)
    }
    for (const corr of ctx.corrections) if (corr.budget_id) bump(corr.budget_id, 1)
    for (const freq of ctx.freqMap.values()) bump(freq.budget_id, freq.count)
    return map
  }, [ctx, budgetGroups])

  // Vast voor de sessie: pas berekenen als de context geladen (of mislukt) is.
  const ring = useMemo(
    () => (ctxSettled ? assignRingSlots(parents, usage) : null),
    [ctxSettled, parents, usage],
  )

  const suggestion = useMemo(() => {
    if (!tx || !ctx) return null
    return suggestTarget(
      {
        id: tx.id,
        description: tx.description,
        counterparty_name: tx.counterparty_name,
        counterparty_iban: tx.counterparty_iban,
        amount: tx.amount,
      },
      ctx,
    )
  }, [tx, ctx])

  const anySharedBudget = useMemo(() => budgets.some((b) => b.ownership === 'shared'), [budgets])

  // ── Drop-afhandeling ────────────────────────────────────────────────────────
  const dropOnBudget = useCallback((celebrationId: string, budgetId: string, isTransfer: boolean) => {
    if (!tx) return
    setErrorMsg(null)
    lastDropRef.current = { droppableId: celebrationId, scope: 'one', siblingTxs }
    dispatch({ type: 'DROP', target: { kind: 'budget', budgetId, isTransfer }, siblingIds })
  }, [tx, siblingIds, siblingTxs])

  /** Gedeeld doel-pad voor loslaten én tap-to-assign. Retourneert true bij een echte drop. */
  const resolveTarget = useCallback((overId: string): boolean => {
    if (overId === 'zone:skip') {
      dispatch({ type: 'SKIP' })
      setExpandedParentId(null)
      return false
    }
    if (overId === 'zone:eigen') {
      if (eigenRekeningBudgetId) dropOnBudget(overId, eigenRekeningBudgetId, true)
      setExpandedParentId(null)
      return true
    }
    if (overId.startsWith('child:')) {
      // De ring herstelt direct na de drop — de celebratie (puls + zwerm-vlucht)
      // landt daarom op de parent-bol, die dan weer zichtbaar is.
      const celebrationId = expandedParentId && expandedParentId !== MEER_EXPANDED
        ? `parent:${expandedParentId}`
        : overId
      dropOnBudget(celebrationId, overId.slice('child:'.length), false)
      setExpandedParentId(null)
      return true
    }
    if (overId.startsWith('parent:')) {
      const parentId = overId.slice('parent:'.length)
      const children = childrenByParent.get(parentId) ?? []
      if (children.length === 0) {
        dropOnBudget(overId, parentId, false)
        setExpandedParentId(null)
        return true
      }
      if (children.length === 1) {
        dropOnBudget(overId, children[0].id, false)
        setExpandedParentId(null)
        return true
      }
      // ≥2 children: parent is geen geldig doel — ring blijft gesplitst staan
      // zodat de gebruiker direct naar een deelbudget kan slepen of tikken.
      setExpandedParentId(parentId)
      return false
    }
    return false
  }, [childrenByParent, dropOnBudget, eigenRekeningBudgetId, expandedParentId])

  // Alleen openen — sluiten gebeurt geometrisch (direct) in de pointermove-
  // handler zodra de cursor buiten de deelbudget-ring komt.
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id != null ? String(event.over.id) : null
    if (overId === 'meer') {
      setExpandedParentId(MEER_EXPANDED)
      return
    }
    if (overId?.startsWith('parent:')) {
      const parentId = overId.slice('parent:'.length)
      if ((childrenByParent.get(parentId)?.length ?? 0) >= 2) {
        setExpandedParentId(parentId)
      }
    }
  }, [childrenByParent])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setIsDragging(false)
    const overId = event.over?.id != null ? String(event.over.id) : null
    if (!overId || overId === 'meer') {
      dispatch({ type: 'DRAG_CANCEL' })
      if (!overId) setExpandedParentId(null)
      return
    }
    const dropped = resolveTarget(overId)
    if (!dropped && overId !== 'zone:skip') {
      // Parent met ≥2 children (ring blijft open), gedimde bol of onbekend doel:
      // geen toewijzing — bol veert terug.
      dispatch({ type: 'DRAG_CANCEL' })
    }
  }, [resolveTarget])

  // ── Write-then-animate ──────────────────────────────────────────────────────
  useEffect(() => {
    if (state.phase !== 'applying' || !state.pendingDrop?.scope || !tx || applyRunning.current) return
    applyRunning.current = true
    const { target, siblingIds: pendingSiblings, scope } = state.pendingDrop
    const targetBudget = budgetById.get(target.budgetId)
    const makeShared = hasHousehold && shareSharedBudgetTx && targetBudget?.ownership === 'shared'

    /** Standaardpad: transacties staan in de DB — plan bouwen + uitvoeren. */
    const applyViaSupabase = async (): Promise<SleepmodusApplyResult> => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Je bent niet (meer) ingelogd.')
      const plan = buildAssignmentPlan({
        tx: {
          id: tx.id,
          counterparty_name: tx.counterparty_name,
          counterparty_iban: tx.counterparty_iban,
          description: tx.description,
        },
        siblingIds: pendingSiblings,
        budgetId: target.budgetId,
        scope,
        isTransfer: target.isTransfer,
        makeShared,
        userId: user.id,
      })
      // Cast: de supabase-js generics laten zich niet structureel unificeren
      // met het smalle SupabaseLike-type (TS2589); runtime-shape is identiek.
      return applyAssignmentPlan(supabase as unknown as Parameters<typeof applyAssignmentPlan>[0], plan)
    }

    const run = async () => {
      try {
        const result = applyAssignment
          ? await applyAssignment({
              tx,
              siblingIds: pendingSiblings,
              budgetId: target.budgetId,
              scope,
              isTransfer: target.isTransfer,
              makeShared,
            })
          : await applyViaSupabase()
        if (lastDropRef.current) lastDropRef.current.scope = scope
        dispatch({
          type: 'APPLY_SUCCESS',
          assignedIds: scope === 'one' ? [tx.id] : [tx.id, ...pendingSiblings],
          ruleCreated: result.ruleCreated,
          bulkUpdated: result.bulkUpdated,
        })
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Opslaan lukte niet. Probeer het opnieuw.')
        dispatch({ type: 'APPLY_ERROR' })
      } finally {
        applyRunning.current = false
      }
    }
    void run()
  }, [state.phase, state.pendingDrop, tx, budgetById, hasHousehold, shareSharedBudgetTx, applyAssignment])

  // ── Celebratie: ✓-puls + zwerm vliegt het doel in ───────────────────────────
  useEffect(() => {
    if (state.phase !== 'celebrating') return
    const reduced = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const last = lastDropRef.current
    let duration = 0

    if (!reduced && last) {
      setPulseTarget(last.droppableId)
      duration = 600
      if (last.scope !== 'one' && last.siblingTxs.length > 0) {
        const field = fieldRef.current
        const targetEl = field?.querySelector(`[data-slot-target="${CSS.escape(last.droppableId)}"]`)
        if (field && targetEl) {
          const fieldRect = field.getBoundingClientRect()
          const targetRect = targetEl.getBoundingClientRect()
          setFlyDelta({
            x: targetRect.left + targetRect.width / 2 - (fieldRect.left + fieldRect.width / 2),
            y: targetRect.top + targetRect.height / 2 - (fieldRect.top + fieldRect.height / 2),
          })
          duration = 420 + Math.min(last.siblingTxs.length, 12) * 120
        }
      }
    }

    const timer = setTimeout(() => {
      setPulseTarget(null)
      setFlyDelta(null)
      lastDropRef.current = null
      dispatch({ type: 'ANIMATION_DONE' })
    }, duration)
    return () => clearTimeout(timer)
  }, [state.phase])

  // Grijpend handje tijdens de hele drag — de kloon zelf heeft pointer-events
  // none, dus de cursor moet globaal gezet worden (zie globals.css).
  useEffect(() => {
    if (!isDragging) return
    document.body.classList.add('sleepmodus-dragging')
    return () => document.body.classList.remove('sleepmodus-dragging')
  }, [isDragging])

  // ── Cursor volgen tijdens de drag ───────────────────────────────────────────
  // Voedt de vertraagde zwerm-staart én sluit het geopende cluster dírect
  // (zonder timer) zodra de cursor buiten de deelbudget-ring komt.
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: PointerEvent) => {
      dragPosRef.current = { x: e.clientX, y: e.clientY }
      const slot = expandedSlotRef.current
      const field = fieldRef.current
      if (slot === null || !field) return
      const rect = field.getBoundingClientRect()
      const point = {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      }
      if (!isInsideCluster(point, slot)) setExpandedParentId(null)
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      dragPosRef.current = null
    }
  }, [isDragging])

  // Details sluiten zodra een nieuwe transactie het midden in draait.
  useEffect(() => { setShowDetails(false) }, [tx?.id])

  // ── Sluiten / Escape ────────────────────────────────────────────────────────
  // Tussentijds stoppen mét toewijzingen én nog openstaande items: toon de
  // samenvatting (FINISH_EARLY) i.p.v. direct sluiten, zodat de ✕ niet als
  // "annuleren" voelt en dezelfde geruststellende afsluiting geeft als de
  // expliciete "Opslaan en stoppen"-knop. Op het done-scherm (geen items
  // meer) sluit de ✕ gewoon af. Zonder toewijzingen: terug naar het keuzescherm.
  const exitSavesProgress = state.assignedCount > 0
    && (state.phase === 'idle' || state.phase === 'dragging')
    && state.items.length > 0
  const handleExit = useCallback(() => {
    if (state.assignedCount > 0) {
      if (exitSavesProgress) dispatch({ type: 'FINISH_EARLY' })
      else onDone()
    } else {
      onExit()
    }
  }, [state.assignedCount, exitSavesProgress, onDone, onExit])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (state.phase === 'confirm') dispatch({ type: 'CONFIRM_CANCEL' })
      else if (state.phase === 'idle' || state.phase === 'done' || state.phase === 'dragging') handleExit()
      // applying/celebrating: negeren — write loopt nog
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [state.phase, handleExit])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  if (!mounted) return null

  // ── Ringweergave (rust / expanded) ──────────────────────────────────────────
  const expandedChildren = expandedParentId && expandedParentId !== MEER_EXPANDED
    ? childrenByParent.get(expandedParentId) ?? []
    : []
  const expandedParentSlot = ring?.slotted.find((s) => s.budget.id === expandedParentId)?.slot ?? null
  const meerExpanded = expandedParentId === MEER_EXPANDED
  const fieldDimmed = state.phase === 'confirm'
  // Ref-spiegel voor de geometrische sluiting in de pointermove-handler.
  expandedSlotRef.current = expandedParentId ? (meerExpanded ? MEER_SLOT : expandedParentSlot) : null

  const bolStateFor = (parentId: string): BolState => {
    if (expandedParentId) {
      if (parentId === expandedParentId) return 'armed'
      return 'dim'
    }
    if (suggestion?.kind === 'budget' && suggestion.parentId === parentId) return 'hot'
    return 'normal'
  }

  const overlay = (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Sleepmodus — transacties toewijzen"
      className="fixed inset-0 z-[80] flex flex-col bg-[var(--bg)]"
    >
      {/* ── Header: kicker + ✕ + progress ── */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-ed)] px-4 py-2.5">
        <p className="flex items-center gap-2.5 font-[var(--font-dm-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
          <span className="inline-block h-px w-7 bg-kern-600" aria-hidden="true" />
          Sleepmodus{monthLabel ? <span className="text-[var(--ink-4)]"> · {monthLabel}</span> : null}
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={handleExit}
          aria-label={exitSavesProgress ? 'Voortgang opslaan en sluiten' : 'Sleepmodus sluiten'}
          className="flex h-11 w-11 items-center justify-center text-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-0.5 bg-[var(--subtle)]" aria-hidden="true">
        <div
          className="h-0.5 bg-kern-600"
          style={{
            width: `${state.totalCount > 0 ? (state.processedCount / state.totalCount) * 100 : 0}%`,
            transition: 'width 0.4s ease-out',
          }}
        />
      </div>

      {errorMsg && (
        <div role="alert" className="mx-4 mt-3 border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] text-orange-700">
          {errorMsg}
        </div>
      )}

      {state.phase === 'done' ? (
        <SamenvattingScherm
          assigned={state.assignedCount}
          rules={state.ruleCount}
          bulkUpdated={state.bulkUpdated}
          skipped={state.skippedCount}
          remaining={state.items.length}
          onClose={onDone}
          closeLabel={doneLabel}
        />
      ) : !ring || !tx ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-kern-500" />
          <p className="font-serif text-sm italic text-[var(--ink-3)]">Sleepmodus voorbereiden…</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={(event) => {
            setIsDragging(true)
            setShowDetails(false)
            const activator = event.activatorEvent as Partial<PointerEvent> | null
            if (typeof activator?.clientX === 'number' && typeof activator?.clientY === 'number') {
              dragPosRef.current = { x: activator.clientX, y: activator.clientY }
            }
            dispatch({ type: 'DRAG_START' })
          }}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { setIsDragging(false); dispatch({ type: 'DRAG_CANCEL' }) }}
        >
          {/* ── Speelveld — begrensd zodat de ring op desktop compact om de bol blijft ── */}
          <div ref={fieldRef} className="relative mx-auto w-full max-w-2xl flex-1 overflow-hidden" style={{ minHeight: 0 }}>
            {/* Ring: rust = hoofdbudgetten; expanded = children of overflow nemen de slots over */}
            {/* Miniatuur-voorproefjes van de deelbudgetten bij elke hoofdbol */}
            {!expandedParentId && ring.slotted.flatMap(({ budget, slot }) => {
              const children = childrenByParent.get(budget.id) ?? []
              if (children.length < 2) return []
              const preview = childPreviewFor(slot, children.length)
              return children.map((child, i) => (
                <MiniSatelliet key={`mini:${child.id}`} budget={child} pos={preview[i]} dimmed={fieldDimmed} />
              ))
            })}
            {!expandedParentId && ring.slotted.map(({ budget, slot }) => (
              <BudgetBol
                key={budget.id}
                droppableId={`parent:${budget.id}`}
                budget={budget}
                pos={RING_SLOTS[slot]}
                state={fieldDimmed ? 'dim' : bolStateFor(budget.id)}
                pulse={pulseTarget === `parent:${budget.id}`}
                onTap={state.phase === 'idle' ? () => resolveTarget(`parent:${budget.id}`) : undefined}
                label={(childrenByParent.get(budget.id)?.length ?? 0) >= 2
                  ? `Open deelbudgetten van ${budget.name}`
                  : `Wijs toe aan ${budget.name}`}
              />
            ))}
            {!expandedParentId && ring.overflow.length > 0 && (
              <MeerBol
                pos={RING_SLOTS[MEER_SLOT]}
                count={ring.overflow.length}
                expanded={false}
                onTap={() => setExpandedParentId(MEER_EXPANDED)}
              />
            )}

            {/* Expanded: deelbudgetten clusteren als waaier om de hoofdbol */}
            {expandedParentId && !meerExpanded && expandedParentSlot !== null && (
              <>
                {ring.slotted.map(({ budget, slot }) => (
                  budget.id === expandedParentId ? (
                    <BudgetBol
                      key={budget.id}
                      droppableId={`parent:${budget.id}`}
                      budget={budget}
                      pos={RING_SLOTS[slot]}
                      state="armed"
                      onTap={state.phase === 'idle' ? () => setExpandedParentId(null) : undefined}
                      label={`Sluit deelbudgetten van ${budget.name}`}
                    />
                  ) : (
                    <BudgetBol key={budget.id} droppableId={`__dim:${budget.id}`} budget={budget} pos={RING_SLOTS[slot]} state="dim" label={budget.name} />
                  )
                ))}
                {(() => {
                  const cluster = childClusterFor(expandedParentSlot, expandedChildren.length)
                  return expandedChildren.map((child, i) => (
                    <BudgetBol
                      key={child.id}
                      droppableId={`child:${child.id}`}
                      budget={child}
                      pos={cluster[i]}
                      state={suggestion?.kind === 'budget' && suggestion.budgetId === child.id ? 'hot' : 'normal'}
                      isChild
                      stagger={i * 30}
                      pulse={pulseTarget === `child:${child.id}`}
                      onTap={state.phase === 'idle' ? () => resolveTarget(`child:${child.id}`) : undefined}
                      label={`Wijs toe aan ${child.name}`}
                    />
                  ))
                })()}
              </>
            )}

            {/* Expanded: overige hoofdbudgetten clusteren om de Meer-bol */}
            {meerExpanded && (
              <>
                {(() => {
                  const cluster = childClusterFor(MEER_SLOT, ring.overflow.length)
                  return ring.overflow.map((budget, i) => (
                    <BudgetBol
                      key={budget.id}
                      droppableId={`parent:${budget.id}`}
                      budget={budget}
                      pos={cluster[i]}
                      state="normal"
                      isChild
                      stagger={i * 30}
                      pulse={pulseTarget === `parent:${budget.id}`}
                      onTap={state.phase === 'idle' ? () => resolveTarget(`parent:${budget.id}`) : undefined}
                      label={(childrenByParent.get(budget.id)?.length ?? 0) >= 2
                        ? `Open deelbudgetten van ${budget.name}`
                        : `Wijs toe aan ${budget.name}`}
                    />
                  ))
                })()}
                <MeerBol
                  pos={RING_SLOTS[MEER_SLOT]}
                  count={ring.overflow.length}
                  expanded
                  onTap={() => setExpandedParentId(null)}
                />
              </>
            )}

            {/* Zwerm: statische staart (rust), vertraagde sleep-staart (drag)
                of vlucht naar het doel (celebratie) */}
            {state.phase === 'celebrating' && flyDelta && lastDropRef.current ? (
              <ZwermTail siblings={lastDropRef.current.siblingTxs} mode="fly" flyDelta={flyDelta} />
            ) : isDragging && !reducedMotion ? (
              <ZwermTrail siblings={siblingTxs} fieldRef={fieldRef} posRef={dragPosRef} />
            ) : state.phase !== 'celebrating' && !isDragging ? (
              <ZwermTail siblings={siblingTxs} mode="tail" />
            ) : null}

            {/* Centrale bol — verborgen tijdens confirm (vraagkaart neemt het midden) */}
            {(state.phase === 'idle' || state.phase === 'dragging') && (
              <DraggableCentraleBol
                key={tx.id}
                tx={tx}
                siblingCount={siblingTxs.length}
                entering
                onTap={() => setShowDetails((v) => !v)}
              />
            )}

            {/* Transactiedetails — tik op de bol om te openen/sluiten */}
            {showDetails && state.phase === 'idle' && (
              <div className="absolute inset-x-0 bottom-2 z-[5] flex justify-center px-4">
                <TransactieDetailsKaart tx={tx} onClose={() => setShowDetails(false)} />
              </div>
            )}

            {/* Pending-indicator op het midden tijdens de write */}
            {state.phase === 'applying' && (
              <div className="absolute left-1/2 top-1/2 z-[3] -translate-x-1/2 -translate-y-1/2">
                <Loader2 className="h-6 w-6 animate-spin text-kern-500" aria-label="Opslaan" />
              </div>
            )}

            {/* Vraagkaart bij vergelijkbare transacties */}
            {state.phase === 'confirm' && state.pendingDrop && (
              <div className="absolute inset-0 z-[4] flex items-center justify-center px-4">
                <ConfirmCard
                  matchLabel={(tx.counterparty_name || tx.description).slice(0, 40)}
                  siblingCount={state.pendingDrop.siblingIds.length}
                  targetName={
                    state.pendingDrop.target.isTransfer
                      ? 'Eigen rekening'
                      : budgetById.get(state.pendingDrop.target.budgetId)?.name ?? 'dit budget'
                  }
                  onScope={(scope: AssignScope) => dispatch({ type: 'CONFIRM_SCOPE', scope })}
                  onCancel={() => dispatch({ type: 'CONFIRM_CANCEL' })}
                />
              </div>
            )}
          </div>

          {/* ── Dropzones in de duim-zone ── */}
          <div className="mx-auto w-full max-w-2xl shrink-0 pb-[max(env(safe-area-inset-bottom),12px)] pt-2">
            <DropZones
              eigenRekeningActief={!!eigenRekeningBudgetId}
              eigenGloeit={suggestion?.kind === 'transfer'}
              dimmed={fieldDimmed || !!expandedParentId}
              onEigenTap={state.phase === 'idle' ? () => resolveTarget('zone:eigen') : undefined}
              onSkipTap={state.phase === 'idle' ? () => resolveTarget('zone:skip') : undefined}
            />
            {hasHousehold && anySharedBudget && (
              <label className="mx-4 mt-2 flex items-center gap-2 text-[10px] text-[var(--ink-3)]">
                <input
                  type="checkbox"
                  checked={shareSharedBudgetTx}
                  onChange={(e) => setShareSharedBudgetTx(e.target.checked)}
                  className="h-3.5 w-3.5 shrink-0 accent-kern-600"
                />
                <span>Transacties op gezamenlijke budgetten ook gezamenlijk maken</span>
              </label>
            )}
            <div className="mt-2 flex items-center justify-center gap-3">
              <p className="font-[var(--font-dm-mono)] text-[9px] uppercase tracking-[0.1em] text-[var(--ink-4)]">
                Nog <span className="tabular-nums">{state.items.length}</span> van <span className="tabular-nums">{state.totalCount}</span>
              </p>
              {state.phase === 'idle' && state.assignedCount > 0 && state.items.length > 0 && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'FINISH_EARLY' })}
                  className="inline-flex min-h-[44px] items-center gap-1.5 border border-[var(--border-ed)] px-3 py-2 font-[var(--font-dm-mono)] text-[9px] uppercase tracking-[0.1em] text-[var(--ink-2)] transition-colors duration-150 hover:border-kern-600 hover:text-kern-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kern-600 focus-visible:ring-offset-1"
                >
                  <Save className="h-3 w-3" aria-hidden="true" />
                  Opslaan en stoppen
                </button>
              )}
            </div>
          </div>

          {/* Sleep-kloon */}
          {/* Sleep-kloon — gecentreerd onder de cursor; de zwerm volgt apart
              als vertraagde staart (ZwermTrail) */}
          <DragOverlay dropAnimation={null} modifiers={[snapGripToCursor]}>
            {state.phase === 'dragging' && tx ? (
              <div data-sleep-clone className="scale-[0.94] cursor-grabbing opacity-95">
                <CentraleBolVisual tx={tx} siblingCount={siblingTxs.length} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )

  return createPortal(overlay, document.body)
}
