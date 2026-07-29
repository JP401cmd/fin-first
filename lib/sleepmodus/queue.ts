/**
 * Wachtrij-state-machine voor de Sleepmodus.
 *
 * Puur (geen React, geen DB): de overlay-component dispatcht acties en voert
 * zelf de Supabase-writes uit tussen `applying` en `APPLY_SUCCESS`/`APPLY_ERROR`
 * (write-then-animate — financiële writes zijn nooit optimistisch).
 *
 *   idle ─DRAG_START→ dragging ─DROP→ confirm (siblings) ─CONFIRM_SCOPE→ applying
 *                                └──→ applying (geen siblings, scope 'one')
 *   applying ─APPLY_SUCCESS→ celebrating ─ANIMATION_DONE→ idle | done
 *            └─APPLY_ERROR→ idle (wachtrij ongewijzigd)
 *   idle ─SKIP→ idle | done (huidige transactie uit de wachtrij, geen write)
 *   idle/dragging ─FINISH_EARLY→ done (tussentijds stoppen; tellers + resterende
 *                                       items behouden, geen write — alles is al
 *                                       per drop gepersisteerd)
 *   idle/dragging ─OPEN_CREATE→ creating ─CREATE_CANCEL→ idle
 *
 * `creating` is een parkeerstand: de wachtrij, de tellers en `items[0]` blijven
 * onaangeroerd terwijl de in-veld-kaart openstaat. Het aanmaken zélf heeft géén
 * eigen fase — die write leeft lokaal in de kaart (net als de andere writes doet
 * de state-machine hem niet). Slaagt het aanmaken, dan dispatcht de overlay
 * `CREATE_CANCEL` (terug naar idle) gevolgd door `DROP` op het verse budget, en
 * loopt de wachtende transactie het gewone drop-pad in.
 *
 * `creating` is bewust géén geldige bron voor SKIP/FINISH_EARLY/DROP/DRAG_CANCEL:
 * die guards checken expliciet op idle/dragging en sluiten de kaart-fase daarmee
 * vanzelf uit. De DRAG_CANCEL die volgt op een drop-op-de-+-knop is daardoor een
 * no-op — precies het gewenste gedrag, anders zou de kaart meteen weer sluiten.
 */

export type QueueTx = {
  id: string
  date: string
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  amount: number
  import_hash: string | null
  budget_id: string | null
  reference?: string | null
  transaction_type?: string | null
}

/** Waar de bol op losgelaten is. Skip heeft een eigen actie (geen write). */
export type DropTarget = {
  kind: 'budget'
  budgetId: string
  /** True voor de Eigen rekening-zone: zet ook transaction_type='transfer'. */
  isTransfer: boolean
}

export type AssignScope = 'rule' | 'these' | 'one'

export type SleepmodusPhase =
  | 'idle'
  | 'dragging'
  | 'confirm'
  | 'creating'
  | 'applying'
  | 'celebrating'
  | 'done'

export type PendingDrop = {
  target: DropTarget
  siblingIds: string[]
  /** null zolang de vraagkaart openstaat; gezet door CONFIRM_SCOPE of direct bij siblings-loze drop. */
  scope: AssignScope | null
}

export type SleepmodusState = {
  phase: SleepmodusPhase
  /** Resterende wachtrij; items[0] is de transactie in het midden. */
  items: QueueTx[]
  totalCount: number
  processedCount: number
  assignedCount: number
  ruleCount: number
  skippedCount: number
  bulkUpdated: number
  pendingDrop: PendingDrop | null
}

export type SleepmodusAction =
  | { type: 'DRAG_START' }
  | { type: 'DRAG_CANCEL' }
  | { type: 'DROP'; target: DropTarget; siblingIds: string[] }
  | { type: 'CONFIRM_SCOPE'; scope: AssignScope }
  | { type: 'CONFIRM_CANCEL' }
  | { type: 'OPEN_CREATE' }
  | { type: 'CREATE_CANCEL' }
  | { type: 'APPLY_SUCCESS'; assignedIds: string[]; ruleCreated: boolean; bulkUpdated: number }
  | { type: 'APPLY_ERROR' }
  | { type: 'ANIMATION_DONE' }
  | { type: 'SKIP' }
  | { type: 'FINISH_EARLY' }

export function initQueue(transactions: QueueTx[]): SleepmodusState {
  // Defensief: transfers en al-toegewezen rijen horen niet in de wachtrij,
  // ook al filteren de callers (AICategorizeSheet) dit normaliter al.
  const items = transactions.filter((t) => t.transaction_type !== 'transfer' && !t.budget_id)
  return {
    phase: items.length === 0 ? 'done' : 'idle',
    items,
    totalCount: items.length,
    processedCount: 0,
    assignedCount: 0,
    ruleCount: 0,
    skippedCount: 0,
    bulkUpdated: 0,
    pendingDrop: null,
  }
}

/** De transactie die nu in het midden staat. */
export function currentTx(state: SleepmodusState): QueueTx | null {
  return state.items[0] ?? null
}

/**
 * Vergelijkbare transacties in de resterende wachtrij — zelfde semantiek als
 * `detectSiblings` in de AICategorizeSheet: exacte counterparty-match
 * (case-insensitive) wanneer die er is, anders description-substring.
 */
export function findSiblings(items: QueueTx[], tx: QueueTx): string[] {
  const matchValue = (tx.counterparty_name || tx.description).toLowerCase()
  if (!matchValue) return []
  return items
    .filter((t) =>
      t.id !== tx.id &&
      (tx.counterparty_name
        ? t.counterparty_name?.toLowerCase() === matchValue
        : t.description?.toLowerCase().includes(matchValue)),
    )
    .map((t) => t.id)
}

export function sleepmodusReducer(state: SleepmodusState, action: SleepmodusAction): SleepmodusState {
  switch (action.type) {
    case 'DRAG_START':
      if (state.phase !== 'idle') return state
      return { ...state, phase: 'dragging' }

    case 'DRAG_CANCEL':
      if (state.phase !== 'dragging') return state
      return { ...state, phase: 'idle' }

    case 'DROP': {
      // Vanuit dragging (loslaten) of idle (tap-to-assign).
      if (state.phase !== 'dragging' && state.phase !== 'idle') return state
      const hasSiblings = action.siblingIds.length > 0
      return {
        ...state,
        phase: hasSiblings ? 'confirm' : 'applying',
        pendingDrop: {
          target: action.target,
          siblingIds: action.siblingIds,
          scope: hasSiblings ? null : 'one',
        },
      }
    }

    case 'CONFIRM_SCOPE':
      if (state.phase !== 'confirm' || !state.pendingDrop) return state
      return { ...state, phase: 'applying', pendingDrop: { ...state.pendingDrop, scope: action.scope } }

    case 'CONFIRM_CANCEL':
      if (state.phase !== 'confirm') return state
      return { ...state, phase: 'idle', pendingDrop: null }

    case 'OPEN_CREATE':
      // Alleen vanuit een rustige fase — nooit midden in een write, vraagkaart
      // of animatie. De wachtrij blijft staan: de wachtende transactie wordt na
      // het aanmaken alsnog op het verse budget gedropt.
      if (state.phase !== 'idle' && state.phase !== 'dragging') return state
      return { ...state, phase: 'creating', pendingDrop: null }

    case 'CREATE_CANCEL':
      if (state.phase !== 'creating') return state
      return { ...state, phase: 'idle' }

    case 'APPLY_SUCCESS': {
      if (state.phase !== 'applying') return state
      const assigned = new Set(action.assignedIds)
      const items = state.items.filter((t) => !assigned.has(t.id))
      return {
        ...state,
        phase: 'celebrating',
        items,
        processedCount: state.processedCount + action.assignedIds.length,
        assignedCount: state.assignedCount + action.assignedIds.length,
        ruleCount: state.ruleCount + (action.ruleCreated ? 1 : 0),
        bulkUpdated: state.bulkUpdated + action.bulkUpdated,
        pendingDrop: null,
      }
    }

    case 'APPLY_ERROR':
      if (state.phase !== 'applying') return state
      return { ...state, phase: 'idle', pendingDrop: null }

    case 'ANIMATION_DONE':
      if (state.phase !== 'celebrating') return state
      return { ...state, phase: state.items.length === 0 ? 'done' : 'idle' }

    case 'SKIP': {
      // Vanuit idle (tap op de Overslaan-pill) of dragging (drop op de zone).
      if (state.phase !== 'idle' && state.phase !== 'dragging') return state
      const [, ...rest] = state.items
      return {
        ...state,
        phase: rest.length === 0 ? 'done' : 'idle',
        items: rest,
        processedCount: state.processedCount + 1,
        skippedCount: state.skippedCount + 1,
      }
    }

    case 'FINISH_EARLY':
      // Tussentijds stoppen mét behoud van tellers én de resterende wachtrij,
      // zodat de samenvatting kan tonen hoeveel er nog open stond. Alleen
      // toegestaan uit een rustige fase — niet midden in een write/animatie/vraag.
      if (state.phase !== 'idle' && state.phase !== 'dragging') return state
      return { ...state, phase: 'done', pendingDrop: null }

    default:
      return state
  }
}
