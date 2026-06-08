import { describe, it, expect } from 'vitest'
import {
  resolvePeriodWindow,
  summarizeFlow,
  topCounterparties,
  largestTransactions,
  newCounterparties,
  spendByWeekday,
  periodTrend,
  counterpartyKey,
  resolveHeatmapWindow,
  spendByDay,
  buildHeatmapWeeks,
  type AnalysisTransaction,
} from './transaction-insights'

// ── Fixtures ───────────────────────────────────────────────────────────────

let _id = 0
function tx(partial: Partial<AnalysisTransaction>): AnalysisTransaction {
  _id += 1
  return {
    id: partial.id ?? `tx-${_id}`,
    date: partial.date ?? '2026-06-10',
    amount: partial.amount ?? -10,
    description: partial.description ?? 'Test',
    counterparty_name: partial.counterparty_name ?? null,
    counterparty_iban: partial.counterparty_iban ?? null,
    budget_id: partial.budget_id ?? null,
    category: partial.category ?? null,
    account_id: partial.account_id ?? null,
    account_name: partial.account_name ?? null,
    is_income: partial.is_income ?? false,
    transaction_type: partial.transaction_type ?? null,
    running_balance: partial.running_balance ?? null,
    creditor_id: partial.creditor_id ?? null,
    fx_amount: partial.fx_amount ?? null,
    fx_currency: partial.fx_currency ?? null,
    fx_rate: partial.fx_rate ?? null,
  }
}

// Fixed "now": maandag 15 juni 2026 (lokale tijd).
const NOW = new Date(2026, 5, 15)

// ── resolvePeriodWindow ──────────────────────────────────────────────────────

describe('resolvePeriodWindow', () => {
  it('30 dagen (offset 0): venster van vandaag terug, label "Afgelopen 30 dagen"', () => {
    const w = resolvePeriodWindow('30d', 0, NOW)
    expect(w.until).toBe('2026-06-15')
    expect(w.since).toBe('2026-05-17') // 30 dagen inclusief
    expect(w.prevUntil).toBe('2026-05-16')
    expect(w.prevSince).toBe('2026-04-17')
    expect(w.label).toBe('Afgelopen 30 dagen')
  })

  it('maand (offset 0): hele kalendermaand juni + vorige maand als prev', () => {
    const w = resolvePeriodWindow('month', 0, NOW)
    expect(w.since).toBe('2026-06-01')
    expect(w.until).toBe('2026-06-30')
    expect(w.label).toBe('juni 2026')
    expect(w.prevSince).toBe('2026-05-01')
    expect(w.prevUntil).toBe('2026-05-31')
  })

  it('maand (offset -1): vorige kalendermaand mei', () => {
    const w = resolvePeriodWindow('month', -1, NOW)
    expect(w.since).toBe('2026-05-01')
    expect(w.until).toBe('2026-05-31')
    expect(w.label).toBe('mei 2026')
  })

  it('maand-offset normaliseert over jaargrens (januari -1 → december vorig jaar)', () => {
    const w = resolvePeriodWindow('month', -1, new Date(2026, 0, 10))
    expect(w.since).toBe('2025-12-01')
    expect(w.until).toBe('2025-12-31')
    expect(w.label).toBe('december 2025')
  })

  it('kwartaal (offset 0): Q2 2026 + Q1 als prev', () => {
    const w = resolvePeriodWindow('quarter', 0, NOW)
    expect(w.since).toBe('2026-04-01')
    expect(w.until).toBe('2026-06-30')
    expect(w.label).toBe('Q2 2026')
    expect(w.prevSince).toBe('2026-01-01')
    expect(w.prevUntil).toBe('2026-03-31')
  })

  it('kwartaal (offset -2): Q4 vorig jaar', () => {
    const w = resolvePeriodWindow('quarter', -2, NOW)
    expect(w.since).toBe('2025-10-01')
    expect(w.until).toBe('2025-12-31')
    expect(w.label).toBe('Q4 2025')
  })

  it('jaar (offset 0): heel 2026 + 2025 als prev', () => {
    const w = resolvePeriodWindow('year', 0, NOW)
    expect(w.since).toBe('2026-01-01')
    expect(w.until).toBe('2026-12-31')
    expect(w.label).toBe('2026')
    expect(w.prevSince).toBe('2025-01-01')
    expect(w.prevUntil).toBe('2025-12-31')
  })
})

// ── summarizeFlow ────────────────────────────────────────────────────────────

describe('summarizeFlow', () => {
  it('sommeert inkomsten/uitgaven en sluit transfers uit', () => {
    const txns = [
      tx({ amount: 2800 }),                                  // inkomst
      tx({ amount: -750 }),                                  // uitgave
      tx({ amount: -250 }),                                  // uitgave
      tx({ amount: -500, transaction_type: 'transfer' }),    // overboeking → genegeerd
      tx({ amount: 500, transaction_type: 'transfer' }),     // overboeking → genegeerd
    ]
    const s = summarizeFlow(txns)
    expect(s.income).toBe(2800)
    expect(s.expense).toBe(1000)
    expect(s.net).toBe(1800)
    expect(s.count).toBe(3) // transfers tellen niet mee
    expect(s.savingsRate).toBe(64) // round(1800/2800*100)
  })

  it('spaarquote = 0 bij geen inkomen', () => {
    const s = summarizeFlow([tx({ amount: -100 })])
    expect(s.income).toBe(0)
    expect(s.savingsRate).toBe(0)
  })

  it('leeg → alle nullen', () => {
    expect(summarizeFlow([])).toEqual({ income: 0, expense: 0, net: 0, savingsRate: 0, count: 0 })
  })
})

// ── counterpartyKey ──────────────────────────────────────────────────────────

describe('counterpartyKey', () => {
  it('normaliseert naam case-insensitive', () => {
    expect(counterpartyKey('Albert Heijn', null)).toBe(counterpartyKey('ALBERT HEIJN', null))
  })
  it('valt terug op IBAN als naam ontbreekt', () => {
    expect(counterpartyKey(null, 'NL20 INGB 0001 2345 67')).toBe('NL20INGB0001234567')
  })
  it('onbekend bij geen naam en geen iban', () => {
    expect(counterpartyKey(null, null)).toBe('__unknown__')
  })
})

// ── topCounterparties ────────────────────────────────────────────────────────

describe('topCounterparties (uitgaven)', () => {
  const txns = [
    tx({ amount: -67.43, counterparty_name: 'Albert Heijn' }),
    tx({ amount: -82.15, counterparty_name: 'albert heijn' }), // zelfde tegenpartij, andere case
    tx({ amount: -200, counterparty_name: 'Vattenfall', counterparty_iban: 'NL20INGB0001234567' }),
    tx({ amount: 2800, counterparty_name: 'Werkgever BV' }),    // inkomst → genegeerd
    tx({ amount: -999, counterparty_name: 'Spaarrekening', transaction_type: 'transfer' }), // transfer → genegeerd
  ]

  it('groepeert per tegenpartij en sorteert op bedrag', () => {
    const top = topCounterparties(txns, { direction: 'expense', sortBy: 'total', limit: 5 })
    expect(top).toHaveLength(2)
    expect(top[0].name).toBe('Vattenfall')
    expect(top[0].total).toBeCloseTo(200, 2)
    expect(top[0].count).toBe(1)
    expect(top[1].name.toLowerCase()).toBe('albert heijn')
    expect(top[1].total).toBeCloseTo(149.58, 2)
    expect(top[1].count).toBe(2)
  })

  it('sorteert op aantal wanneer gevraagd', () => {
    const top = topCounterparties(txns, { direction: 'expense', sortBy: 'count', limit: 5 })
    expect(top[0].name.toLowerCase()).toBe('albert heijn')
    expect(top[0].count).toBe(2)
  })

  it('respecteert limit', () => {
    const top = topCounterparties(txns, { direction: 'expense', sortBy: 'total', limit: 1 })
    expect(top).toHaveLength(1)
    expect(top[0].name).toBe('Vattenfall')
  })
})

// ── largestTransactions ──────────────────────────────────────────────────────

describe('largestTransactions (uitgaven)', () => {
  it('geeft de grootste enkele uitgaven, transfers/inkomsten uitgesloten', () => {
    const a = tx({ id: 'a', amount: -750 })
    const b = tx({ id: 'b', amount: -200 })
    const c = tx({ id: 'c', amount: -67.43 })
    const inc = tx({ id: 'inc', amount: 2800 })
    const trf = tx({ id: 'trf', amount: -9999, transaction_type: 'transfer' })
    const out = largestTransactions([c, inc, a, trf, b], { direction: 'expense', limit: 2 })
    expect(out.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

// ── newCounterparties ────────────────────────────────────────────────────────

describe('newCounterparties', () => {
  it('geeft tegenpartijen die niet in de prior-set zaten', () => {
    const prior = new Set([
      counterpartyKey('Albert Heijn', null),
      counterpartyKey('Vattenfall', 'NL20INGB0001234567'),
    ])
    const period = [
      tx({ amount: -67, counterparty_name: 'Albert Heijn' }),       // bekend
      tx({ amount: -200, counterparty_name: 'Vattenfall', counterparty_iban: 'NL20INGB0001234567' }), // bekend
      tx({ amount: -50, counterparty_name: 'Nieuwe Winkel' }),      // nieuw
      tx({ amount: -25, counterparty_name: 'nieuwe winkel' }),      // zelfde nieuwe, dedupe
    ]
    const fresh = newCounterparties(period, prior)
    expect(fresh.map((c) => c.name)).toEqual(['Nieuwe Winkel'])
    expect(fresh[0].total).toBeCloseTo(75, 2)
  })
})

// ── spendByWeekday ───────────────────────────────────────────────────────────

describe('spendByWeekday (maandag-eerst)', () => {
  it('bucketet uitgaven per weekdag en sluit transfers uit', () => {
    const wd = spendByWeekday([
      tx({ amount: -100, date: '2026-06-15' }),                         // maandag → index 0
      tx({ amount: -40, date: '2026-06-13' }),                          // zaterdag → index 5
      tx({ amount: -500, date: '2026-06-15', transaction_type: 'transfer' }), // transfer → genegeerd
      tx({ amount: 2800, date: '2026-06-15' }),                         // inkomst → genegeerd
    ])
    expect(wd).toHaveLength(7)
    expect(wd[0]).toBe(100)
    expect(wd[5]).toBe(40)
    expect(wd.reduce((s, v) => s + v, 0)).toBe(140)
  })
})

// ── periodTrend ──────────────────────────────────────────────────────────────

describe('periodTrend', () => {
  it('berekent % verschil t.o.v. vorige periode', () => {
    const cur = summarizeFlow([tx({ amount: 1000 }), tx({ amount: -560 })])
    const prev = summarizeFlow([tx({ amount: 1000 }), tx({ amount: -500 })])
    const t = periodTrend(cur, prev)
    expect(t.expensePct).toBe(12)
    expect(t.incomePct).toBe(0)
  })

  it('null wanneer vorige periode 0 was', () => {
    const cur = summarizeFlow([tx({ amount: -100 })])
    const prev = summarizeFlow([])
    const t = periodTrend(cur, prev)
    expect(t.expensePct).toBeNull()
    expect(t.incomePct).toBeNull()
  })
})

// ── resolveHeatmapWindow ─────────────────────────────────────────────────────

describe('resolveHeatmapWindow (12 maanden t/m vorige maand)', () => {
  it('juni 2026 → jun 2025 t/m mei 2026', () => {
    const w = resolveHeatmapWindow(NOW)
    expect(w.start).toBe('2025-06-01')
    expect(w.end).toBe('2026-05-31')
  })
  it('januari 2026 → heel 2025', () => {
    const w = resolveHeatmapWindow(new Date(2026, 0, 10))
    expect(w.start).toBe('2025-01-01')
    expect(w.end).toBe('2025-12-31')
  })
})

// ── spendByDay ───────────────────────────────────────────────────────────────

describe('spendByDay', () => {
  it('sommeert uitgaven per dag, sluit inkomsten en transfers uit', () => {
    const m = spendByDay([
      tx({ amount: -100, date: '2026-05-10' }),
      tx({ amount: -50, date: '2026-05-10' }),
      tx({ amount: 200, date: '2026-05-10' }), // inkomst → genegeerd
      tx({ amount: -30, date: '2026-05-11', transaction_type: 'transfer' }), // transfer → genegeerd
    ])
    expect(m.get('2026-05-10')).toBe(150)
    expect(m.has('2026-05-11')).toBe(false)
  })
})

// ── buildHeatmapWeeks ────────────────────────────────────────────────────────

describe('buildHeatmapWeeks', () => {
  it('bouwt week-kolommen (ma-eerst) met bedragen en maand-labels', () => {
    const daily = new Map<string, number>([['2026-05-05', 40]])
    const { weeks, monthLabels } = buildHeatmapWeeks('2026-05-04', '2026-05-17', daily)
    expect(weeks).toHaveLength(2) // ma 4 mei … zo 17 mei = 2 volle weken
    expect(weeks[0]).toHaveLength(7)
    expect(weeks[0][0].date).toBe('2026-05-04') // maandag
    expect(weeks[0][0].amount).toBe(0)
    expect(weeks[0][1].date).toBe('2026-05-05') // dinsdag
    expect(weeks[0][1].amount).toBe(40)
    expect(weeks[1][6].date).toBe('2026-05-17') // zondag
    expect(monthLabels).toEqual([{ col: 0, label: 'mei' }])
  })

  it('vult dagen vóór de start als inactieve (null) cellen', () => {
    // start = dinsdag → de maandag-cel vóór de start is inactief.
    const { weeks } = buildHeatmapWeeks('2026-05-05', '2026-05-17', new Map())
    expect(weeks[0][0].date).toBeNull()
    expect(weeks[0][1].date).toBe('2026-05-05')
  })

  it('labelt elke nieuwe maand bij een maandgrens', () => {
    const { monthLabels } = buildHeatmapWeeks('2026-04-27', '2026-05-10', new Map())
    // kolom 0 begint in april, kolom 1 (week van 4 mei) start in mei.
    expect(monthLabels[0]).toEqual({ col: 0, label: 'apr' })
    expect(monthLabels.some((l) => l.label === 'mei')).toBe(true)
  })
})
