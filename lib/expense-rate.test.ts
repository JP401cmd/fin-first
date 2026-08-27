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
  /**
   * Minimale Supabase-mock op de RPC-rand. Sinds bevinding L10 loopt de
   * server-variant NIET meer over `.from('transactions')` maar over het
   * maandaggregaat `tx_month_aggregate` — een rauwe rij-fetch werd door PostgREST
   * stil op max_rows = 1000 afgekapt en loog het dagtarief omhoog.
   *
   * `from()` gooit hier expres: dat is de grendel die een terugval naar de rauwe
   * rij-route zichtbaar maakt in plaats van 'm stilzwijgend te laten slagen.
   */
  function makeSupabase(rows: Array<Record<string, unknown>>) {
    const calls: Record<string, unknown> = {}
    const client = {
      rpc: (fn: string, params: Record<string, unknown>) => {
        calls.fn = fn
        calls.params = params
        return Promise.resolve({ data: rows, error: null })
      },
      from: () => {
        throw new Error('rauwe transactie-fetch: de afkap-bug (L10) is terug')
      },
      __calls: calls,
    }
    return client as unknown as Parameters<typeof getRecentDailyExpenseRate>[0] & {
      __calls: Record<string, unknown>
    }
  }

  /** Aggregaat-rij zoals `tx_month_aggregate` 'm teruggeeft. */
  function aggRow(month: string, negatief: number, type: string | null = null) {
    return {
      month,
      budget_id: null,
      transaction_type: type,
      sum_positief: 0,
      sum_negatief: negatief,
      count: 1,
    }
  }

  it('haalt het 12-mnd venster uit het maandaggregaat en delegeert naar de pure helper', async () => {
    const supabase = makeSupabase([aggRow('2026-05', -300), aggRow('2026-06', -300)])
    const r = await getRecentDailyExpenseRate(supabase, REF)
    // mei + juni t.o.v. juni = 2 mnd; 600/2 = 300.
    expect(r.source).toBe('transactions')
    expect(r.dataMonths).toBe(2)
    expect(r.monthlyExpenses).toBe(300)

    const calls = (supabase as unknown as { __calls: Record<string, unknown> }).__calls
    expect(calls.fn).toBe('tx_month_aggregate')
    const params = calls.params as Record<string, unknown>
    // Venster: 11 maanden terug t/m het EINDE van de referentiemaand (`to` exclusief).
    expect(params.p_from).toBe('2025-07-01')
    expect(params.p_to).toBe('2026-07-01')
    // RLS-breed (eigen + gedeeld huishouden), zoals de rauwe fetch ook was.
    expect(params.p_own_only).toBe(false)
    // Geen service-role-scope op dit sessie-pad.
    expect(params.p_user_id).toBeUndefined()
  })

  it('telt (joint_)transfers mee — dezelfde grondslag als de rauwe amount<0-fetch', async () => {
    // realOnly:false is de expliciete keuze: filteren zou een ANDERE grondslag
    // zijn dan `DashboardData.dailyExpenseRate` en de drift terugbrengen.
    const supabase = makeSupabase([
      aggRow('2026-06', -300, 'expense'),
      aggRow('2026-06', -300, 'transfer'),
    ])
    const r = await getRecentDailyExpenseRate(supabase, REF)
    expect(r.monthlyExpenses).toBe(600)
  })

  it('negeert groepen zonder negatieve som (spiegelt de vroegere amount<0-filter)', async () => {
    const supabase = makeSupabase([
      { month: '2026-06', budget_id: null, transaction_type: null, sum_positief: 4000, sum_negatief: 0, count: 1 },
    ])
    const r = await getRecentDailyExpenseRate(supabase, REF)
    expect(r).toEqual({ dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none' })
  })

  it('geeft source "none" bij een lege dataset', async () => {
    const supabase = makeSupabase([])
    const r = await getRecentDailyExpenseRate(supabase, REF)
    expect(r).toEqual({ dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none' })
  })

  it('gebruikt de gedeelde getTxAgg12m-entry voor een peildatum in de huidige maand', async () => {
    // Zelfde venster als dashboard/cashflow/core → één RPC per request i.p.v. vier.
    const now = new Date()
    const supabase = makeSupabase([])
    await getRecentDailyExpenseRate(supabase, now)
    const params = (supabase as unknown as { __calls: Record<string, unknown> })
      .__calls.params as Record<string, unknown>
    expect(params.p_to).toBe(
      `${new Date(now.getFullYear(), now.getMonth() + 1, 1).getFullYear()}-${String(
        new Date(now.getFullYear(), now.getMonth() + 1, 1).getMonth() + 1,
      ).padStart(2, '0')}-01`,
    )
  })
})
