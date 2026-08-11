import { describe, it, expect } from 'vitest'
import {
  reduceRealizedByBudget,
  REALIZED_CHUNK_MONTHS,
  REALIZED_WINDOW_MONTHS,
  POSTGREST_MAX_ROWS,
} from './budget-realized'
import type { TxMonthAggregateRow } from './server-data/tx-aggregates'

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

  it('maanden buiten het venster worden genegeerd', () => {
    const out = reduceRealizedByBudget(
      [agg({ month: '2024-01', sum_negatief: -5000 }), agg({ month: '2026-07', sum_negatief: -100 })],
      MONTHS,
    )
    expect(out.b1.outgoing).toBe(100)
    expect(out.b1.coveredMonths).toBe(1)
  })

  it('coveredMonths is de SPANWIJDTE vanaf de eerste boeking, niet het aantal boekingsmaanden', () => {
    // Kwartaalpost: vier boekingen, maar de spanwijdte is het hele venster.
    const out = reduceRealizedByBudget(
      [
        agg({ month: '2025-08', sum_negatief: -300 }),
        agg({ month: '2025-11', sum_negatief: -300 }),
        agg({ month: '2026-02', sum_negatief: -300 }),
        agg({ month: '2026-05', sum_negatief: -300 }),
      ],
      MONTHS,
    )
    expect(out.b1.coveredMonths).toBe(12)
    expect(out.b1.outgoing).toBe(1200)
  })

  it('een budget dat pas 3 maanden loopt krijgt spanwijdte 3', () => {
    const out = reduceRealizedByBudget(
      [
        agg({ month: '2026-05', sum_negatief: -300 }),
        agg({ month: '2026-06', sum_negatief: -300 }),
        agg({ month: '2026-07', sum_negatief: -300 }),
      ],
      MONTHS,
    )
    expect(out.b1.coveredMonths).toBe(3)
  })

  it('nul-rijen maken geen post aan (geen spanwijdte uit een lege groep)', () => {
    const out = reduceRealizedByBudget([agg({ month: '2025-08' })], MONTHS)
    expect(Object.keys(out)).toEqual([])
  })

  it('lege invoer → leeg resultaat', () => {
    expect(reduceRealizedByBudget([], MONTHS)).toEqual({})
  })
})

describe('de spanwijdte is GEEN deler — het bewijs met een echte maandreeks', () => {
  it('een jaarpost in de LAATSTE maand van het venster levert spanwijdte 1', () => {
    // Dit is de invoer die `computeBudgetBasis` vroeger ×12 deed. De reducer mag
    // 'm gewoon zo rapporteren; de bescherming zit in de deler (de leeftijd van
    // het budget, zie resolveDenominatorMonths in lib/budget-basis.ts). Deze test
    // legt de invoer vast zodat het bewijs niet meer op een handmatige fixture
    // rust — precies de dekking die de eindreview miste.
    const out = reduceRealizedByBudget([agg({ month: '2026-07', sum_negatief: -800 })], MONTHS)
    expect(out.b1.coveredMonths).toBe(1)
    expect(out.b1.outgoing).toBe(800)
  })

  it('dezelfde jaarpost een maand eerder levert spanwijdte 2', () => {
    // De spanwijdte GOLFT met het venster mee; een deler die daarop ankert zou
    // het jaarbedrag maandelijks laten springen (×12, ×6, ×4, …).
    const out = reduceRealizedByBudget([agg({ month: '2026-06', sum_negatief: -800 })], MONTHS)
    expect(out.b1.coveredMonths).toBe(2)
  })
})

describe('venster- en chunk-constanten', () => {
  it('het venster is 12 maanden en valt op te delen in hele chunks', () => {
    expect(REALIZED_WINDOW_MONTHS).toBe(12)
    expect(REALIZED_CHUNK_MONTHS).toBe(4)
    expect(REALIZED_WINDOW_MONTHS % REALIZED_CHUNK_MONTHS).toBe(0)
  })

  it('de kanarie staat op de PostgREST-cap', () => {
    expect(POSTGREST_MAX_ROWS).toBe(1000)
  })
})
