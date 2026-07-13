import { describe, it, expect } from 'vitest'
import {
  recentDailyExpenseRateFromRows,
  getRecentDailyExpenseRate,
} from './expense-rate'
import { dailyExpenseRate } from './format'
import { EXPENSE_RATE_ROLLING_MONTHS } from './constants'

// Vast referentiepunt zodat dataMonths deterministisch is.
const REF = new Date('2026-06-15T12:00:00Z')

describe('recentDailyExpenseRateFromRows', () => {
  it('geeft nul + source "none" bij geen rijen en geen schatting', () => {
    const r = recentDailyExpenseRateFromRows([], REF)
    expect(r).toEqual({ dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none' })
  })

  it('valt terug op de maand-schatting wanneer er geen transacties zijn', () => {
    const r = recentDailyExpenseRateFromRows([], REF, 3000)
    expect(r.source).toBe('estimate')
    expect(r.monthlyExpenses).toBe(3000)
    expect(r.dataMonths).toBe(0)
    // Canonieke conversie ×12/365, NIET /30.
    expect(r.dailyRate).toBeCloseTo((3000 * 12) / 365, 6)
    expect(r.dailyRate).toBe(dailyExpenseRate(3000))
  })

  it('negeert de schatting zodra er transacties zijn', () => {
    const rows = [{ amount: -100, date: '2026-06-10' }]
    const r = recentDailyExpenseRateFromRows(rows, REF, 9999)
    expect(r.source).toBe('transactions')
    // 1 maand data → maanduitgaven = totaal (niet de schatting van 9999).
    expect(r.dataMonths).toBe(1)
    expect(r.monthlyExpenses).toBe(100)
  })

  it('middelt over het aantal maanden met data (rolling gemiddelde)', () => {
    const rows = [
      { amount: -100, date: '2026-04-10' },
      { amount: -200, date: '2026-05-10' },
      { amount: -300, date: '2026-06-10' },
    ]
    const r = recentDailyExpenseRateFromRows(rows, REF)
    // apr..jun t.o.v. juni = 3 maanden; totaal 600 / 3 = 200 per maand.
    expect(r.dataMonths).toBe(3)
    expect(r.monthlyExpenses).toBe(200)
    expect(r.dailyRate).toBeCloseTo((200 * 12) / 365, 6)
    // Bundel-invariant (KRUIS-17): dailyRate en monthlyExpenses komen uit één
    // berekening, dus dailyRate === dailyExpenseRate(monthlyExpenses). Widgets
    // consumeren DashboardData.dailyExpenseRate, de briefing consumeert
    // DashboardData.recentMonthlyExpenses — beide tracen naar dit ene punt.
    expect(r.dailyRate).toBe(dailyExpenseRate(r.monthlyExpenses))
  })

  it('klemt dataMonths op EXPENSE_RATE_ROLLING_MONTHS ook bij oudere earliest', () => {
    const rows = [
      { amount: -12000, date: '2024-01-01' }, // ~30 mnd terug
      { amount: -12000, date: '2026-06-01' },
    ]
    const r = recentDailyExpenseRateFromRows(rows, REF)
    expect(r.dataMonths).toBe(EXPENSE_RATE_ROLLING_MONTHS)
    // 24000 / 12 = 2000 per maand.
    expect(r.monthlyExpenses).toBe(2000)
  })

  it('rekent op de absolute waarde en accepteert string-bedragen', () => {
    const rows = [
      { amount: '-50.5', date: '2026-06-01' },
      { amount: -49.5, date: '2026-06-02' },
    ]
    const r = recentDailyExpenseRateFromRows(rows, REF)
    expect(r.dataMonths).toBe(1)
    expect(r.monthlyExpenses).toBe(100)
  })

  it('minstens 1 maand data, ook bij één transactie op de referentiemaand', () => {
    const r = recentDailyExpenseRateFromRows([{ amount: -365, date: '2026-06-15' }], REF)
    expect(r.dataMonths).toBe(1)
    expect(r.monthlyExpenses).toBe(365)
    expect(r.dailyRate).toBeCloseTo((365 * 12) / 365, 6) // = 12
  })
})

describe('getRecentDailyExpenseRate (server-variant)', () => {
  // Minimale chainable Supabase-mock: legt de query-argumenten vast en levert data.
  function makeSupabase(rows: Array<{ amount: number | string; date: string }>) {
    const calls: Record<string, unknown> = {}
    const builder = {
      select: (...a: unknown[]) => ((calls.select = a), builder),
      lt: (...a: unknown[]) => ((calls.lt = a), builder),
      gte: (...a: unknown[]) => ((calls.gte = a), builder),
      lte: (...a: unknown[]) => ((calls.lte = a), builder),
      then: (resolve: (v: { data: typeof rows }) => unknown) => resolve({ data: rows }),
    }
    const client = {
      from: (table: string) => ((calls.from = table), builder),
      __calls: calls,
    }
    return client as unknown as Parameters<typeof getRecentDailyExpenseRate>[0] & {
      __calls: Record<string, unknown>
    }
  }

  it('queryt het 12-mnd venster met amount<0 en delegeert naar de pure helper', async () => {
    const rows = [
      { amount: -300, date: '2026-05-10' },
      { amount: -300, date: '2026-06-10' },
    ]
    const supabase = makeSupabase(rows)
    const r = await getRecentDailyExpenseRate(supabase, REF)
    // apr..jun? nee: mei+juni t.o.v. juni = 2 mnd; 600/2 = 300.
    expect(r.source).toBe('transactions')
    expect(r.dataMonths).toBe(2)
    expect(r.monthlyExpenses).toBe(300)
    // Query-vorm: negatieve bedragen, bovengrens = referentiedatum (YYYY-MM-DD).
    const calls = (supabase as unknown as { __calls: Record<string, unknown> }).__calls
    expect(calls.from).toBe('transactions')
    expect(calls.lt).toEqual(['amount', 0])
    expect((calls.lte as unknown[])[1]).toBe('2026-06-15')
  })

  it('geeft source "none" bij een lege dataset', async () => {
    const supabase = makeSupabase([])
    const r = await getRecentDailyExpenseRate(supabase, REF)
    expect(r).toEqual({ dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none' })
  })
})
