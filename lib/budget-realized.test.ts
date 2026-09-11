import { describe, it, expect } from 'vitest'
import {
  reduceRealizedByBudget,
  reduceWindowByMonth,
  reduceWindowIncome,
  transactionAnnualIncome,
  REALIZED_CHUNK_MONTHS,
  REALIZED_WINDOW_MONTHS,
  POSTGREST_MAX_ROWS,
  EMPTY_REALIZED_WINDOW,
} from './budget-realized'
import { HISTORY_WINDOW_MONTHS } from './constants'
import type { TxMonthAggregateRow } from './server-data/tx-aggregates'

/** Twaalf AFGESLOTEN maanden: de lopende maand (2026-08) staat er niet in. */
const MONTHS = [
  '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01',
  '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
]

function agg(p: Partial<TxMonthAggregateRow> & { month: string }): TxMonthAggregateRow {
  return {
    budget_id: 'b1',
    transaction_type: null,
    sum_positief: 0,
    sum_negatief: 0,
    count: 1,
    ...p,
  }
}

describe('reduceRealizedByBudget', () => {
  it('telt positieve en negatieve sommen apart op, per budget', () => {
    const out = reduceRealizedByBudget(
      [
        agg({ month: '2026-06', budget_id: 'b1', sum_negatief: -500 }),
        agg({ month: '2026-07', budget_id: 'b1', sum_negatief: -700 }),
        agg({ month: '2026-07', budget_id: 'b2', sum_positief: 4000 }),
      ],
      MONTHS,
    )
    expect(out.b1.outgoing).toBe(1200)
    expect(out.b1.incoming).toBe(0)
    expect(out.b2.incoming).toBe(4000)
  })

  it('TRANSFER-FILTER: interne overboekingen tellen niet mee', () => {
    // Zelfde regel als `realOnly` in de inkomsten-/uitgavensommen van de
    // loaders: een overboeking naar de eigen spaarrekening is geen uitgave.
    const out = reduceRealizedByBudget(
      [
        agg({ month: '2026-07', sum_negatief: -1000, transaction_type: 'transfer' }),
        agg({ month: '2026-07', sum_negatief: -400, transaction_type: 'joint_transfer' }),
        agg({ month: '2026-07', sum_negatief: -600, transaction_type: 'expense' }),
      ],
      MONTHS,
    )
    expect(out.b1.outgoing).toBe(600)
  })

  it('rijen zonder budget_id vallen weg — er is geen post om ze aan toe te rekenen', () => {
    const out = reduceRealizedByBudget(
      [agg({ month: '2026-07', budget_id: null, sum_negatief: -900 })],
      MONTHS,
    )
    expect(Object.keys(out)).toEqual([])
  })

  it('maanden buiten het venster worden genegeerd — óók de lopende maand', () => {
    const out = reduceRealizedByBudget(
      [
        agg({ month: '2024-01', sum_negatief: -5000 }),
        agg({ month: '2026-08', sum_negatief: -3000 }), // lopende maand
        agg({ month: '2026-07', sum_negatief: -100 }),
      ],
      MONTHS,
    )
    expect(out.b1.outgoing).toBe(100)
  })

  it('draagt GEEN spanwijdte meer per budget: de deler is per gebruiker (ADR 0138)', () => {
    const out = reduceRealizedByBudget([agg({ month: '2026-07', sum_negatief: -800 })], MONTHS)
    expect(out.b1).toEqual({ incoming: 0, outgoing: 800 })
  })

  it('nul-rijen maken geen post aan', () => {
    const out = reduceRealizedByBudget([agg({ month: '2025-08' })], MONTHS)
    expect(Object.keys(out)).toEqual([])
  })

  it('lege invoer → leeg resultaat', () => {
    expect(reduceRealizedByBudget([], MONTHS)).toEqual({})
  })
})

describe('reduceWindowIncome — de venster-inkomstensom in twee smaken', () => {
  it('real = transfer-gefilterd, all = inclusief transfers; rijen zonder budget tellen mee', () => {
    const out = reduceWindowIncome(
      [
        agg({ month: '2026-06', budget_id: 'salaris', sum_positief: 3000, transaction_type: 'income' }),
        agg({ month: '2026-07', budget_id: null, sum_positief: 500, transaction_type: null }),
        agg({ month: '2026-07', budget_id: 'eigen', sum_positief: 2000, transaction_type: 'transfer' }),
        agg({ month: '2026-07', budget_id: 'eigen', sum_positief: 100, transaction_type: 'joint_transfer' }),
        agg({ month: '2026-08', budget_id: 'salaris', sum_positief: 3000, transaction_type: 'income' }), // lopende maand
      ],
      MONTHS,
    )
    expect(out).toEqual({ real: 3500, all: 5600 })
  })

  it('negatieve sommen tellen nooit als inkomen', () => {
    expect(reduceWindowIncome([agg({ month: '2026-07', sum_negatief: -900 })], MONTHS)).toEqual({ real: 0, all: 0 })
  })
})

describe('reduceWindowByMonth — de kassabon-rijen uit hetzelfde venster (review golf 2, R1)', () => {
  it('per maand in/uit, transfer-gefilterd, ongeacht budget; lopende maand en transfers vallen weg', () => {
    const out = reduceWindowByMonth(
      [
        agg({ month: '2026-06', budget_id: 'salaris', sum_positief: 3000, transaction_type: 'income' }),
        agg({ month: '2026-06', budget_id: 'boodschappen', sum_negatief: -400, transaction_type: 'expense' }),
        agg({ month: '2026-07', budget_id: null, sum_positief: 500, sum_negatief: -50 }),
        agg({ month: '2026-07', budget_id: 'eigen', sum_positief: 2000, transaction_type: 'transfer' }),
        agg({ month: '2026-08', budget_id: 'salaris', sum_positief: 3000, transaction_type: 'income' }), // lopende maand
      ],
      MONTHS,
    )
    expect(out).toEqual({
      '2026-06': { income: 3000, expenses: 400 },
      '2026-07': { income: 500, expenses: 50 },
    })
  })

  it('INVARIANT: Σ byMonth.income == reduceWindowIncome(...).real', () => {
    const rows = [
      agg({ month: '2025-09', sum_positief: 1, transaction_type: 'income' }),
      agg({ month: '2026-03', sum_positief: 2, transaction_type: 'transfer' }),
      agg({ month: '2026-07', budget_id: null, sum_positief: 4 }),
    ]
    const som = Object.values(reduceWindowByMonth(rows, MONTHS)).reduce((s, m) => s + m.income, 0)
    expect(som).toBe(reduceWindowIncome(rows, MONTHS).real)
  })
})

describe('transactionAnnualIncome — dezelfde deler als de budgetposten', () => {
  const win = (real: number, all: number, historyMonths: number) => ({
    historyMonths,
    windowIncome: { real, all },
  })

  it('volle historie: de som is het jaarbedrag', () => {
    expect(transactionAnnualIncome(win(36000, 40000, 12))).toBe(36000)
  })

  it('korte historie: (som / historyMonths) × 12', () => {
    expect(transactionAnnualIncome(win(9000, 9000, 3))).toBe(36000)
  })

  it('includeTransfers kiest de transfer-inclusieve som (horizon-FIRE-som)', () => {
    expect(transactionAnnualIncome(win(36000, 40000, 12), { includeTransfers: true })).toBe(40000)
  })

  it('het lege venster → 0, nooit NaN', () => {
    expect(transactionAnnualIncome(EMPTY_REALIZED_WINDOW)).toBe(0)
    expect(transactionAnnualIncome(win(0, 0, 1))).toBe(0)
  })
})

describe('venster- en chunk-constanten', () => {
  it('het venster is 12 afgesloten maanden (alias van HISTORY_WINDOW_MONTHS) en valt op te delen in hele chunks', () => {
    expect(REALIZED_WINDOW_MONTHS).toBe(12)
    expect(REALIZED_WINDOW_MONTHS).toBe(HISTORY_WINDOW_MONTHS)
    expect(REALIZED_CHUNK_MONTHS).toBe(4)
    expect(REALIZED_WINDOW_MONTHS % REALIZED_CHUNK_MONTHS).toBe(0)
  })

  it('de kanarie staat op de PostgREST-cap', () => {
    expect(POSTGREST_MAX_ROWS).toBe(1000)
  })

  it('het lege venster draagt een eindige deler en een nul-inkomen', () => {
    expect(EMPTY_REALIZED_WINDOW.historyMonths).toBe(HISTORY_WINDOW_MONTHS)
    expect(EMPTY_REALIZED_WINDOW.windowIncome).toEqual({ real: 0, all: 0 })
    expect(EMPTY_REALIZED_WINDOW.byMonth).toEqual({})
  })
})
