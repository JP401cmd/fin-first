import { describe, it, expect } from 'vitest'
import {
  initQueue,
  sleepmodusReducer,
  findSiblings,
  currentTx,
  type QueueTx,
  type SleepmodusState,
} from './queue'

function tx(id: string, overrides: Partial<QueueTx> = {}): QueueTx {
  return {
    id,
    date: '2026-03-04',
    description: `Betaling ${id}`,
    counterparty_name: null,
    counterparty_iban: null,
    amount: -10,
    import_hash: null,
    budget_id: null,
    ...overrides,
  }
}

const budgetTarget = { kind: 'budget', budgetId: 'b1', isTransfer: false } as const

function dropped(state: SleepmodusState, siblingIds: string[] = []): SleepmodusState {
  return sleepmodusReducer(state, { type: 'DROP', target: budgetTarget, siblingIds })
}

describe('initQueue', () => {
  it('start in idle met alle niet-transfer transacties', () => {
    const state = initQueue([tx('a'), tx('b', { transaction_type: 'transfer' }), tx('c')])
    expect(state.phase).toBe('idle')
    expect(state.items.map((t) => t.id)).toEqual(['a', 'c'])
    expect(state.totalCount).toBe(2)
    expect(state.processedCount).toBe(0)
  })

  it('lege lijst → direct done', () => {
    expect(initQueue([]).phase).toBe('done')
  })
})

describe('findSiblings', () => {
  it('matcht op exacte counterparty_name (case-insensitive), exclusief de transactie zelf', () => {
    const items = [
      tx('a', { counterparty_name: 'Albert Heijn' }),
      tx('b', { counterparty_name: 'albert heijn' }),
      tx('c', { counterparty_name: 'Jumbo' }),
    ]
    expect(findSiblings(items, items[0])).toEqual(['b'])
  })

  it('valt terug op description-substring wanneer counterparty ontbreekt', () => {
    const items = [
      tx('a', { description: 'Spotify AB' }),
      tx('b', { description: 'SPOTIFY AB maandabonnement' }),
      tx('c', { description: 'Netflix' }),
    ]
    expect(findSiblings(items, items[0])).toEqual(['b'])
  })
})

describe('sleepmodusReducer', () => {
  const base = initQueue([
    tx('a', { counterparty_name: 'AH' }),
    tx('b', { counterparty_name: 'AH' }),
    tx('c', { counterparty_name: 'Jumbo' }),
  ])

  it('DRAG_START → dragging, DRAG_CANCEL → idle', () => {
    const dragging = sleepmodusReducer(base, { type: 'DRAG_START' })
    expect(dragging.phase).toBe('dragging')
    expect(sleepmodusReducer(dragging, { type: 'DRAG_CANCEL' }).phase).toBe('idle')
  })

  it('DROP zonder siblings → applying met scope "one"', () => {
    const state = dropped(base)
    expect(state.phase).toBe('applying')
    expect(state.pendingDrop).toEqual({ target: budgetTarget, siblingIds: [], scope: 'one' })
  })

  it('DROP met siblings → confirm; CONFIRM_SCOPE → applying; CONFIRM_CANCEL → idle', () => {
    const confirm = dropped(base, ['b'])
    expect(confirm.phase).toBe('confirm')
    expect(confirm.pendingDrop?.scope).toBeNull()

    const applying = sleepmodusReducer(confirm, { type: 'CONFIRM_SCOPE', scope: 'rule' })
    expect(applying.phase).toBe('applying')
    expect(applying.pendingDrop?.scope).toBe('rule')

    const cancelled = sleepmodusReducer(confirm, { type: 'CONFIRM_CANCEL' })
    expect(cancelled.phase).toBe('idle')
    expect(cancelled.pendingDrop).toBeNull()
    expect(cancelled.items).toHaveLength(3)
  })

  it('APPLY_SUCCESS verwijdert toegewezen ids, telt, en gaat naar celebrating', () => {
    const applying = sleepmodusReducer(dropped(base, ['b']), { type: 'CONFIRM_SCOPE', scope: 'rule' })
    const next = sleepmodusReducer(applying, {
      type: 'APPLY_SUCCESS',
      assignedIds: ['a', 'b'],
      ruleCreated: true,
      bulkUpdated: 3,
    })
    expect(next.phase).toBe('celebrating')
    expect(next.items.map((t) => t.id)).toEqual(['c'])
    expect(next.processedCount).toBe(2)
    expect(next.assignedCount).toBe(2)
    expect(next.ruleCount).toBe(1)
    expect(next.bulkUpdated).toBe(3)
    expect(next.pendingDrop).toBeNull()
  })

  it('ANIMATION_DONE → idle met volgende transactie, of done bij lege wachtrij', () => {
    const celebrating = sleepmodusReducer(dropped(base), {
      type: 'APPLY_SUCCESS', assignedIds: ['a'], ruleCreated: false, bulkUpdated: 0,
    })
    expect(sleepmodusReducer(celebrating, { type: 'ANIMATION_DONE' }).phase).toBe('idle')

    let state: SleepmodusState = initQueue([tx('solo')])
    state = sleepmodusReducer(dropped(state), { type: 'APPLY_SUCCESS', assignedIds: ['solo'], ruleCreated: false, bulkUpdated: 0 })
    expect(sleepmodusReducer(state, { type: 'ANIMATION_DONE' }).phase).toBe('done')
  })

  it('APPLY_ERROR laat de wachtrij intact en keert terug naar idle', () => {
    const applying = dropped(base)
    const next = sleepmodusReducer(applying, { type: 'APPLY_ERROR' })
    expect(next.phase).toBe('idle')
    expect(next.items).toHaveLength(3)
    expect(next.pendingDrop).toBeNull()
    expect(next.processedCount).toBe(0)
  })

  it('SKIP verwijdert de huidige transactie zonder toewijzing (monotone voortgang)', () => {
    const next = sleepmodusReducer(base, { type: 'SKIP' })
    expect(next.phase).toBe('idle')
    expect(next.items.map((t) => t.id)).toEqual(['b', 'c'])
    expect(next.skippedCount).toBe(1)
    expect(next.processedCount).toBe(1)

    let state: SleepmodusState = initQueue([tx('solo')])
    state = sleepmodusReducer(state, { type: 'SKIP' })
    expect(state.phase).toBe('done')
  })

  it('SKIP werkt ook vanuit dragging (drop op de Overslaan-zone)', () => {
    const dragging = sleepmodusReducer(base, { type: 'DRAG_START' })
    const next = sleepmodusReducer(dragging, { type: 'SKIP' })
    expect(next.phase).toBe('idle')
    expect(next.skippedCount).toBe(1)
  })

  it('FINISH_EARLY → done met behoud van tellers en resterende wachtrij', () => {
    // Eén toewijzing afronden, dan tussentijds stoppen met nog items open.
    const applying = sleepmodusReducer(dropped(base), {
      type: 'APPLY_SUCCESS', assignedIds: ['a'], ruleCreated: false, bulkUpdated: 0,
    })
    const idle = sleepmodusReducer(applying, { type: 'ANIMATION_DONE' })
    expect(idle.phase).toBe('idle')
    expect(idle.assignedCount).toBe(1)
    expect(idle.items).toHaveLength(2)

    const finished = sleepmodusReducer(idle, { type: 'FINISH_EARLY' })
    expect(finished.phase).toBe('done')
    expect(finished.assignedCount).toBe(1)
    expect(finished.items.map((t) => t.id)).toEqual(['b', 'c'])
    expect(finished.processedCount).toBe(1)
    expect(finished.pendingDrop).toBeNull()
  })

  it('FINISH_EARLY werkt ook vanuit dragging', () => {
    const dragging = sleepmodusReducer(base, { type: 'DRAG_START' })
    expect(sleepmodusReducer(dragging, { type: 'FINISH_EARLY' }).phase).toBe('done')
  })

  it('FINISH_EARLY wordt genegeerd midden in een write of vraagkaart', () => {
    const applying = dropped(base)
    expect(applying.phase).toBe('applying')
    expect(sleepmodusReducer(applying, { type: 'FINISH_EARLY' })).toBe(applying)

    const confirm = dropped(base, ['b'])
    expect(confirm.phase).toBe('confirm')
    expect(sleepmodusReducer(confirm, { type: 'FINISH_EARLY' })).toBe(confirm)
  })

  it('currentTx geeft de voorste transactie of null', () => {
    expect(currentTx(base)?.id).toBe('a')
    expect(currentTx(initQueue([]))).toBeNull()
  })
})

describe('sleepmodusReducer — in-veld budget aanmaken', () => {
  const base = initQueue([
    tx('a', { counterparty_name: 'AH' }),
    tx('b', { counterparty_name: 'AH' }),
    tx('c', { counterparty_name: 'Jumbo' }),
  ])

  it('OPEN_CREATE → creating vanuit idle én dragging, met wachtrij en tellers intact', () => {
    for (const start of [base, sleepmodusReducer(base, { type: 'DRAG_START' })]) {
      const creating = sleepmodusReducer(start, { type: 'OPEN_CREATE' })
      expect(creating.phase).toBe('creating')
      expect(creating.items.map((t) => t.id)).toEqual(['a', 'b', 'c'])
      expect(currentTx(creating)?.id).toBe('a')
      expect(creating.processedCount).toBe(0)
      expect(creating.assignedCount).toBe(0)
      expect(creating.skippedCount).toBe(0)
      expect(creating.pendingDrop).toBeNull()
    }
  })

  it('OPEN_CREATE wordt genegeerd vanuit confirm, applying, celebrating en done', () => {
    const confirm = dropped(base, ['b'])
    const applying = dropped(base)
    const celebrating = sleepmodusReducer(applying, {
      type: 'APPLY_SUCCESS', assignedIds: ['a'], ruleCreated: false, bulkUpdated: 0,
    })
    const done = sleepmodusReducer(base, { type: 'FINISH_EARLY' })

    expect(confirm.phase).toBe('confirm')
    expect(applying.phase).toBe('applying')
    expect(celebrating.phase).toBe('celebrating')
    expect(done.phase).toBe('done')

    for (const state of [confirm, applying, celebrating, done]) {
      expect(sleepmodusReducer(state, { type: 'OPEN_CREATE' })).toBe(state)
    }
  })

  it('de DRAG_CANCEL na een drop op de +-knop is een no-op (kaart blijft open)', () => {
    // Naad: de pointer-up op de +-zone dispatcht OPEN_CREATE, waarna de
    // sleep-afhandeling nog een DRAG_CANCEL nastuurt. Die mag de net geopende
    // kaart niet wegklikken.
    const dragging = sleepmodusReducer(base, { type: 'DRAG_START' })
    const creating = sleepmodusReducer(dragging, { type: 'OPEN_CREATE' })
    expect(sleepmodusReducer(creating, { type: 'DRAG_CANCEL' })).toBe(creating)
    expect(creating.phase).toBe('creating')
  })

  it('CREATE_CANCEL → idle met de wachtrij intact; vanuit idle een no-op', () => {
    const creating = sleepmodusReducer(base, { type: 'OPEN_CREATE' })
    const cancelled = sleepmodusReducer(creating, { type: 'CREATE_CANCEL' })
    expect(cancelled.phase).toBe('idle')
    expect(cancelled.items.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(cancelled.processedCount).toBe(0)
    expect(cancelled.pendingDrop).toBeNull()

    expect(sleepmodusReducer(base, { type: 'CREATE_CANCEL' })).toBe(base)
  })

  it('SKIP en FINISH_EARLY worden genegeerd zolang de aanmaakkaart openstaat', () => {
    const creating = sleepmodusReducer(base, { type: 'OPEN_CREATE' })
    expect(sleepmodusReducer(creating, { type: 'SKIP' })).toBe(creating)
    expect(sleepmodusReducer(creating, { type: 'FINISH_EARLY' })).toBe(creating)
  })
})
