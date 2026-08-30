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
import { pushOverlayHistory } from '@/lib/overlay-history'
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
import {
  buildCreateBudgetDiff,
  firstOfCurrentMonth,
  NEW_BUDGET_DETAIL_DEFAULTS,
} from '@/lib/budget-plan-diff'
import { getTypeColors } from '@/components/app/budget-shared'
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
import { NieuwBudgetKaart, type NieuwBudgetWaarden } from './nieuw-budget-kaart'

const MEER_SLOT = MAX_RING_BUDGETS - 1
const MEER_EXPANDED = '__meer__'

/** Client-veilige terugvaltekst wanneer het aanmaken strandt (ADR 0044-envelope). */
const FOUT_AANMAKEN = 'Aanmaken lukte niet. Probeer het opnieuw.'

/**
 * Bouwt de lokale `Budget`-rij voor een zojuist aangemaakt budget.
 *
 * Deze rij dient UITSLUITEND voor weergave en drop-targeting binnen déze
 * sleepsessie: de verse bol in de ring, de doelnaam in de vraagkaart en de
 * ownership-check bij de write. Elke echte write gaat via /api/budgets/plan →
 * de atomische `save_budget_plan`-RPC die de gebruiker server-side vaststelt;
 * hier ontstaat niets. Bij de eerstvolgende herlaad (onDone) komt de echte rij
 * gewoon via de `budgetGroups`-prop binnen en verdwijnt deze plaatsvervanger.
 *
 * De defaults spiegelen wat die RPC schrijft: detailvelden uit
 * NEW_BUDGET_DETAIL_DEFAULTS, en ownership/household uit de kolomdefaults
 * ('personal' / null — de INSERT in de RPC noemt die kolommen niet).
 */
function lokaalBudget(args: {
  id: string
  name: string
  parentId: string | null
  budgetType: Budget['budget_type']
  sortOrder: number
  monthlyAmount: number
}): Budget {
  return {
    id: args.id,
    // Placeholders: de overlay leest deze velden nergens. De echte waarden
    // staan server-side en komen mee bij de eerstvolgende herlaad-ronde.
    user_id: '',
    created_at: '',
    updated_at: '',
    parent_id: args.parentId,
    name: args.name,
    slug: null,
    icon: 'Circle', // gelijk aan de icon-default van buildCreateBudgetDiff
    description: null,
    default_limit: args.monthlyAmount,
    budget_type: args.budgetType,
    interval: 'monthly',
    rollover_type: 'reset',
    limit_type: NEW_BUDGET_DETAIL_DEFAULTS.limitType,
    alert_threshold: NEW_BUDGET_DETAIL_DEFAULTS.alertThreshold,
    max_single_transaction_amount: 0,
    // De kaart maakt alleen 'expense'-hoofdbudgetten (deelbudgetten erven het
    // parent-type), dus nooit een van de essentiële roottypes — net als de
    // is_essential-afleiding in buildCreateBudgetDiff hier op false uitkomt.
    is_essential: false,
    priority_score: NEW_BUDGET_DETAIL_DEFAULTS.priorityScore,
    is_inflation_indexed: NEW_BUDGET_DETAIL_DEFAULTS.isInflationIndexed,
    sort_order: args.sortOrder,
    ownership: 'personal',
    household_id: null,
    goal_type: NEW_BUDGET_DETAIL_DEFAULTS.goalType,
    goal_amount: NEW_BUDGET_DETAIL_DEFAULTS.goalAmount,
    goal_date: NEW_BUDGET_DETAIL_DEFAULTS.goalDate,
    goal_frequency: NEW_BUDGET_DETAIL_DEFAULTS.goalFrequency,
    is_favorite: false,
  }
}

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
  /**
   * Budgetten die eerder in dezelfde caller-sessie via de in-veld-kaart zijn
   * aangemaakt. De overlay unmount tussen twee wizard-groepen door, terwijl de
   * `budgetGroups`-prop pas na een herlaad ververst; zonder deze meegegeven
   * lijst zou een zojuist aangemaakt budget bij de volgende groep verdwijnen en
   * de gebruiker het nóg eens aanmaken. Alleen gelezen bij mount — de overlay
   * is de enige schrijver en meldt elke aanmaak via `onBudgetCreated`.
   */
  extraBudgets?: Budget[]
  /** Meldt een zojuist (server-side) aangemaakt budget aan de caller. */
  onBudgetCreated?: (budget: Budget) => void
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
  extraBudgets: sessionBudgets,
  onBudgetCreated,
}: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Terugknop verlaat de sleepmodus langs dezelfde weg als de X (onExit) in
  // plaats van de pagina te verlaten met de modus nog open — zelfde
  // overlay-history-mechaniek als BottomSheet (audit 30-08-2026). De overlay
  // is alleen gemount terwijl de modus actief is, dus de entry leeft precies
  // zo lang als de modus zelf.
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  useEffect(() => {
    return pushOverlayHistory(() => onExitRef.current())
  }, [])

  const [state, dispatch] = useReducer(sleepmodusReducer, transactions, initQueue)
  const [ctx, setCtx] = useState<AutoCatContext | null>(null)
  const [ctxSettled, setCtxSettled] = useState(false)
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null)
  /**
   * Budgetten die via de in-veld-kaart zijn aangemaakt. Ze staan al server-side,
   * maar de `budgetGroups`-prop ververst pas na een herlaad — tot die tijd
   * vullen we ze hier lokaal aan zodat de verse bol meteen in de ring staat en
   * als drop-doel werkt. Geseed uit de `extraBudgets`-prop zodat budgetten uit
   * een eerdere groep van dezelfde caller-sessie blijven bestaan; daarna is deze
   * state de enige schrijver (elke aanmaak gaat óók naar `onBudgetCreated`).
   */
  const [extraBudgets, setExtraBudgets] = useState<Budget[]>(() => sessionBudgets ?? [])
  const [shareSharedBudgetTx, setShareSharedBudgetTx] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pulseTarget, setPulseTarget] = useState<string | null>(null)
  const [flyDelta, setFlyDelta] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  /** Helptekst + accentkleur van het doel waar je tijdens het slepen overheen zweeft. */
  const [hoverHelp, setHoverHelp] = useState<{ name: string; description: string | null; color: string | null } | null>(null)
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
  /**
   * Heeft de gebruiker het aanmaken geannuleerd? De aanmaak-fetch leeft buiten
   * de state-machine (fase blijft `creating`) en loopt door als de kaart
   * tussentijds sluit. Zonder deze vlag zou de toewijzing ná zo'n annulering
   * alsnog geschreven worden: `CREATE_CANCEL` zet de fase op `idle` en een
   * `DROP` is daar geldig — en dat moet zo blijven voor tap-to-assign. Een
   * reducer-guard kan dit dus niet vangen; de intentie hoort hier.
   */
  const createAbortedRef = useRef(false)
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

  /**
   * De budgetboom zoals de sessie hem kent: de `budgetGroups`-prop plus wat er
   * tijdens deze sessie is bijgemaakt. Dit is vanaf hier de enige boom waarop
   * het component werkt — `budgetGroups` wordt nergens anders meer gelezen,
   * anders zou een vers budget uit de ring, de lookups of de usage-telling
   * vallen.
   */
  const effectiveGroups = useMemo(() => {
    if (extraBudgets.length === 0) return budgetGroups
    const groups = budgetGroups.map((g) => ({ parent: g.parent, children: [...g.children] }))
    const byParent = new Map(groups.map((g) => [g.parent.id, g]))
    // Ververst de prop tussentijds tóch (bv. omdat de caller herlaadde), dan
    // staat het verse budget er al in — sla het dan over i.p.v. te verdubbelen.
    const bekend = new Set(groups.flatMap((g) => [g.parent.id, ...g.children.map((c) => c.id)]))
    for (const b of extraBudgets) {
      if (bekend.has(b.id)) continue
      bekend.add(b.id)
      const target = b.parent_id ? byParent.get(b.parent_id) : null
      if (target) target.children.push(b)
      else if (!b.parent_id) {
        const g = { parent: b, children: [] as Budget[] }
        groups.push(g)
        byParent.set(b.id, g)
      }
    }
    return groups
  }, [budgetGroups, extraBudgets])

  // Callers (zoals budgets-client) geven soms alleen de parents door als
  // `budgets`, met de children genest in `budgetGroups`. Voeg samen zodat
  // lookups (naam, ownership, eigen-rekening, suggesties) ook leaves vinden.
  const allBudgets = useMemo(() => {
    const map = new Map<string, Budget>()
    for (const b of budgets) map.set(b.id, b)
    for (const g of effectiveGroups) {
      map.set(g.parent.id, g.parent)
      for (const c of g.children) map.set(c.id, c)
    }
    return [...map.values()]
  }, [budgets, effectiveGroups])

  const eigenRekeningBudgetId = useMemo(() => resolveEigenRekeningBudgetId(allBudgets), [allBudgets])
  const parents = useMemo(() => effectiveGroups.map((g) => g.parent), [effectiveGroups])
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Budget[]>()
    for (const g of effectiveGroups) map.set(g.parent.id, g.children)
    return map
  }, [effectiveGroups])
  const budgetById = useMemo(() => {
    const map = new Map<string, Budget>()
    for (const b of allBudgets) map.set(b.id, b)
    return map
  }, [allBudgets])

  // ── Context (regels/historie) éénmalig laden — bepaalt gloed + ringvolgorde ──
  // Once-guard: prop-identiteit kan per parent-render wisselen — en sinds de
  // in-veld-kaart groeit `allBudgets` óók tijdens de sessie — maar de
  // sessie-context moet stabiel blijven. De guard houdt het bij één load, zodat
  // `ctxSettled` niet terugklapt en het veld niet naar "voorbereiden…" springt.
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
    for (const g of effectiveGroups) {
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
  }, [ctx, effectiveGroups])

  // Pas berekenen als de context geladen (of mislukt) is. Daarna ligt de ring
  // vast voor de sessie op één uitzondering na: maakt de gebruiker via de
  // in-veld-kaart een hoofdbudget bij, dan groeit `parents` en herverdeelt de
  // ring éénmalig — anders zou de verse bol nergens staan om op te droppen.
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
    if (overId === 'zone:nieuw') {
      // Geen drop, maar een parkeerstand: de kaart opent en de wachtende
      // transactie blijft staan. Het cluster moet hier dicht — anders lekt een
      // openstaande parent door naar de `celebrationId` van de child-toewijzing
      // hieronder en pulst straks de verkeerde bol.
      setExpandedParentId(null)
      createAbortedRef.current = false
      dispatch({ type: 'OPEN_CREATE' })
      return false
    }
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

  /** Parent-keuze in de kaart: echte hoofdbudgetten, zonder het archive-budget
   *  (Eigen rekening) — daar hoort niets onder, en buildCreateBudgetDiff
   *  weigert dat type sowieso. */
  const nieuwBudgetParents = useMemo(
    () => parents.filter((p) => p.budget_type !== 'archive').map((p) => ({ id: p.id, name: p.name })),
    [parents],
  )

  /**
   * Maakt het budget écht aan (server-side via de plan-RPC) en wijst de
   * wachtende transactie er direct aan toe.
   *
   * Vaste volgorde: API-call → lokale rij toevoegen → kaart sluiten → droppen.
   * De rij moet er staan vóór de drop, want de vraagkaart en de write-stap
   * zoeken naam en ownership van het doel op in `budgetById`. Fouten worden
   * GEWORPEN in plaats van in `errorMsg` gezet: de kaart vangt ze en blijft
   * open mét de ingevulde waarden, zodat niemand alles opnieuw hoeft te typen.
   *
   * Annuleert de gebruiker terwijl de fetch nog loopt, dan stopt de keten na de
   * lokale rij: het budget bestáát server-side (dus tonen blijft juist), maar de
   * toewijzing die hij expliciet afbrak wordt niet geschreven.
   */
  const handleCreateBudget = useCallback(async (v: NieuwBudgetWaarden) => {
    const parent = v.parentId ? budgetById.get(v.parentId) ?? null : null
    // Een deelbudget erft het type van zijn hoofdbudget; een nieuw hoofdbudget
    // uit deze kaart is altijd een uitgavenbudget (de kaart vraagt geen type).
    const budgetType: Budget['budget_type'] = parent ? parent.budget_type : 'expense'
    // sort_order = max+1 binnen de juiste laag — zelfde regel als de planeditor.
    const siblings = v.parentId
      ? (childrenByParent.get(v.parentId) ?? [])
      : parents.filter((p) => p.budget_type === budgetType)
    const sortOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.sort_order ?? 0)) + 1 : 0

    const clientId = `tmp-${Date.now().toString(36)}`
    const diff = buildCreateBudgetDiff({
      clientId,
      name: v.name,
      parentId: v.parentId,
      budgetType,
      sortOrder,
      monthlyAmount: v.monthlyAmount,
      effectiveFrom: firstOfCurrentMonth(),
    })

    const res = await fetch('/api/budgets/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(diff),
    })
    // Platte foutvorm `{ error: string }` (ADR 0044); bij een lege of kapotte
    // body valt de tekst terug op de generieke melding.
    const data = (await res.json().catch(() => null)) as
      | { error?: unknown; id_map?: Record<string, string> }
      | null
    if (!res.ok) {
      throw new Error(data && typeof data.error === 'string' ? data.error : FOUT_AANMAKEN)
    }
    // Het echte UUID komt uit de id_map van de RPC — zonder dat kunnen we niets
    // toewijzen, dus dan is het aanmaken voor deze flow simpelweg mislukt.
    const newId = data?.id_map?.[clientId]
    if (typeof newId !== 'string' || !newId) throw new Error(FOUT_AANMAKEN)

    const nieuw = lokaalBudget({
      id: newId,
      name: v.name,
      parentId: v.parentId,
      budgetType,
      sortOrder,
      monthlyAmount: v.monthlyAmount,
    })
    setExtraBudgets((prev) => [...prev, nieuw])
    // Ook bij een annulering: het budget staat er echt, dus de caller moet 'm
    // meenemen naar de volgende groep.
    onBudgetCreated?.(nieuw)

    // Tussentijds geannuleerd (Annuleren of Escape terwijl de fetch liep): geen
    // toewijzing. De fase staat dan al op `idle` — de CREATE_CANCEL hieronder
    // zou een no-op zijn en de DROP juist wél doorgaan.
    if (createAbortedRef.current) return

    // CREATE_CANCEL zet de fase terug naar idle; de DROP hierna is daardoor
    // geldig. Beide updates batchen in dezelfde tick, dus de kaart en de
    // vraagkaart staan nooit tegelijk in beeld.
    dispatch({ type: 'CREATE_CANCEL' })
    // Bewust `dropOnBudget` en niet `resolveTarget`: de celebratie moet op een
    // bol landen die ook echt gerenderd is. Een vers HOOFDbudget heeft die
    // (eigen ringslot), een vers DEELbudget niet — de ring staat na OPEN_CREATE
    // in ruststand, dus pulsen op `child:<id>` zou nergens landen. Richt de puls
    // daarom op de parent-bol. Via `resolveTarget` kan dat niet: die leest
    // `expandedParentId` uit zijn eigen closure (hier altijd null) en komt
    // onvermijdelijk op `child:<id>` uit.
    dropOnBudget(v.parentId ? `parent:${v.parentId}` : `parent:${newId}`, newId, false)
  }, [budgetById, childrenByParent, dropOnBudget, onBudgetCreated, parents])

  // Naam + helptekst van een doel — voedt de helper boven de transactie zodat
  // je vóór het loslaten zeker weet op welk (deel)budget je terechtkomt.
  const describeTarget = useCallback((overId: string | null): { name: string; description: string | null; color: string | null } | null => {
    if (!overId) return null
    // Eigen-rekening = overboeking (archive-type) → de archive-accentkleur.
    if (overId === 'zone:eigen') return { name: 'Eigen rekening', description: 'Markeer als overboeking tussen je eigen rekeningen — telt niet mee in je budgetten.', color: getTypeColors('archive').hex }
    // Geen budget → neutrale fallback (kern) in de render.
    if (overId === 'zone:skip') return { name: 'Overslaan', description: 'Sla deze transactie nu over; hij komt later weer langs.', color: null }
    if (overId === 'zone:nieuw') return { name: 'Nieuw budget', description: 'Maak een budget en wijs deze transactie er direct aan toe.', color: null }
    if (overId === 'meer') return { name: 'Meer budgetten', description: 'Open de overige budgetten.', color: null }
    let id: string | null = null
    if (overId.startsWith('child:')) id = overId.slice('child:'.length)
    else if (overId.startsWith('parent:')) id = overId.slice('parent:'.length)
    else return null // __dim:* en onbekende doelen geven geen helper
    const budget = id ? budgetById.get(id) : null
    if (!budget) return null
    const hasChildren = (childrenByParent.get(budget.id)?.length ?? 0) >= 2
    return {
      name: budget.name,
      description: hasChildren ? 'Kies hieronder het juiste deelbudget.' : (budget.description || null),
      // Accentkleur volgt het budgettype: inkomen, sparen, vaste lasten enz.
      // hebben elk hun eigen kleur (getTypeColors).
      color: getTypeColors(budget.budget_type).hex,
    }
  }, [budgetById, childrenByParent])

  // Alleen openen — sluiten gebeurt geometrisch (direct) in de pointermove-
  // handler zodra de cursor buiten de deelbudget-ring komt.
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id != null ? String(event.over.id) : null
    setHoverHelp(describeTarget(overId))
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
  }, [childrenByParent, describeTarget])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setIsDragging(false)
    setHoverHelp(null)
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
      // Deze document-handler bedient ook de in-veld-kaart (net als ConfirmCard)
      // en doet stopPropagation — de kaart heeft dus géén eigen keydown nodig.
      // Escape blijft ook tijdens de aanmaak-fetch werken (de Annuleren-knop is
      // dan uit); de vlag zorgt dat er daarna niets meer wordt toegewezen.
      else if (state.phase === 'creating') {
        createAbortedRef.current = true
        dispatch({ type: 'CREATE_CANCEL' })
      }
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
  // Vraagkaart én in-veld-kaart nemen het midden over: de ring dimt eronder weg.
  const fieldDimmed = state.phase === 'confirm' || state.phase === 'creating'
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
            setHoverHelp(null)
            const activator = event.activatorEvent as Partial<PointerEvent> | null
            if (typeof activator?.clientX === 'number' && typeof activator?.clientY === 'number') {
              dragPosRef.current = { x: activator.clientX, y: activator.clientY }
            }
            dispatch({ type: 'DRAG_START' })
          }}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { setIsDragging(false); setHoverHelp(null); dispatch({ type: 'DRAG_CANCEL' }) }}
        >
          {/* ── Speelveld — begrensd zodat de ring op desktop compact om de bol blijft ── */}
          <div ref={fieldRef} className="relative mx-auto w-full max-w-2xl flex-1 overflow-hidden" style={{ minHeight: 0 }}>
            {/* Ring: rust = hoofdbudgetten; expanded = children of overflow nemen de slots over */}
            {/* Miniatuur-voorproefjes van de deelbudgetten bij elke hoofdbol.
                Ook bij één deelbudget: die parent opent geen cluster (een drop
                gaat er stilzwijgend doorheen), dus zonder dit voorproefje is een
                enkel deelbudget nergens te zien — precies wat er gebeurt als je
                hier een hoofdbudget én er één deelbudget onder aanmaakt. */}
            {!expandedParentId && ring.slotted.flatMap(({ budget, slot }) => {
              const children = childrenByParent.get(budget.id) ?? []
              if (children.length < 1) return []
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

            {/* Doel-helper in het midden van de cirkel (waar de transactie-bol staat —
                die is tijdens het slepen verborgen): alléén tekst in de kern-accentkleur,
                geen kaart/achtergrond. Zo weet je vóór het loslaten zeker op welk
                (deel)budget je terechtkomt. pointer-events-none zodat hij de
                drop-detectie niet in de weg zit. */}
            {isDragging && hoverHelp && (
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 z-[6] w-[min(80%,220px)] -translate-x-1/2 -translate-y-1/2 text-center text-kern-700"
                style={hoverHelp.color ? { color: hoverHelp.color } : undefined}
              >
                <p className="font-[var(--font-playfair)] text-base font-bold leading-tight">
                  {hoverHelp.name}
                </p>
                {hoverHelp.description && (
                  <p className="mt-1 font-serif text-[11px] italic leading-snug opacity-80">
                    {hoverHelp.description}
                  </p>
                )}
              </div>
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

            {/* In-veld-kaart: budget aanmaken, daarna gaat de wachtende
                transactie er meteen heen (zie handleCreateBudget) */}
            {state.phase === 'creating' && (
              <div className="absolute inset-0 z-[4] flex items-center justify-center px-4">
                <NieuwBudgetKaart
                  parents={nieuwBudgetParents}
                  txLabel={(tx.counterparty_name || tx.description).slice(0, 40)}
                  txAmount={tx.amount}
                  onCreate={handleCreateBudget}
                  onCancel={() => {
                    createAbortedRef.current = true
                    dispatch({ type: 'CREATE_CANCEL' })
                  }}
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
              onNieuwTap={state.phase === 'idle' ? () => resolveTarget('zone:nieuw') : undefined}
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
