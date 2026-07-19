import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { aggregateDividends } from './aggregate'

/**
 * Parity-regressie voor de extractie van de dividend-aggregatie uit
 * `app/api/dividends/route.ts` naar `lib/dividends/aggregate.ts` (taak 1.5b,
 * deel B). De gedeelde functie MOET dezelfde cijfers opleveren die de route gaf —
 * zowel de route als de horizon-loader consumeren 'm nu (consume-don't-recompute).
 */

type TableResult = { data: unknown[] | null; error: { message: string } | null }

/**
 * Chainable Supabase-stub: `.from(table)` levert een keten die alle gebruikte
 * query-methoden (`select/eq/in/order/limit/gte/lt`) negeert en bij `await` de
 * per-tabel geseede `{ data, error }` teruggeeft. Filters zijn bewust genegeerd —
 * de test borgt de aggregatie-wiskunde, niet RLS/PostgREST-filtering.
 */
function makeSupabaseMock(
  tables: Record<string, TableResult>,
  user: { id: string } | null = { id: 'user-1' },
): SupabaseClient {
  const builder = (table: string) => {
    const result: TableResult = tables[table] ?? { data: [], error: null }
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      gte: () => chain,
      lt: () => chain,
      then: (resolve: (v: TableResult) => void) => resolve(result),
    }
    return chain
  }
  return {
    from: (table: string) => builder(table),
    auth: { getUser: async () => ({ data: { user }, error: null }) },
  } as unknown as SupabaseClient
}

/** Fixture: één holding met één dividend + een vast uitgaven-totaal.
 *  Bewust gekozen zodat de projectie-wiskunde ronde getallen oplevert:
 *   - dividend op 2026-05-07, nu = 2026-07-19 → daySpan = 73 dagen (< 365)
 *   - projected = (100 / 73) * 365 = 500 (geannualiseerd)
 *   - holdingValue = 100 (koers) × 10 (units) = 1000 → yield 50%
 *   - dagelijkse uitgaven = 18.250 / 365 = 50 → 500 / 50 = 10 vrijheidsdagen
 */
function fullFixture(): Record<string, TableResult> {
  return {
    // tableExists-probes → bestaan (error null) zodat de investment_*-paden lopen.
    holdings: { data: [], error: null },
    holding_transactions: { data: [], error: null },
    investment_holdings: {
      data: [
        {
          id: 'h1',
          name: 'VWRL',
          ticker: 'VWRL',
          units: 10,
          avg_purchase_price: 80,
          current_price: 100,
          is_active: true,
        },
      ],
      error: null,
    },
    investment_transactions: {
      data: [
        { id: 'd1', holding_id: 'h1', date: '2026-05-07', total_amount: 100, notes: null },
      ],
      error: null,
    },
    transactions: { data: [{ amount: -18250 }], error: null },
  }
}

const FIXED_NOW = new Date('2026-07-19T00:00:00.000Z')

describe('aggregateDividends — parity met de oude route-logica', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('berekent het aggregaat identiek (expliciete userId — route-pad)', async () => {
    const supabase = makeSupabaseMock(fullFixture())

    const result = await aggregateDividends(supabase, { userId: 'user-1' })

    expect(result.aggregate).toEqual({
      total_dividend_income: 100,
      total_projected_annual_income: 500,
      monthly_dividend_income: 41.67,
      total_portfolio_value: 1000,
      weighted_dividend_yield: 50,
      freedom_days_per_year: 10,
      daily_expenses: 50,
      total_dividend_count: 1,
    })

    expect(result.holdings).toHaveLength(1)
    const h = result.holdings[0]
    expect(h.holding_id).toBe('h1')
    expect(h.total_dividend_income).toBe(100)
    expect(h.projected_annual_income).toBe(500)
    expect(h.holding_value).toBe(1000)
    expect(h.dividend_yield).toBe(50)
    expect(h.dividend_count).toBe(1)
    expect(h.last_dividend_date).toBe('2026-05-07')
    expect(h.last_dividend_amount).toBe(100)
  })

  it('leidt de gebruiker zelf uit de sessie af (optionele userId-parameter, geen callsite momenteel)', async () => {
    const supabase = makeSupabaseMock(fullFixture())

    // Zelfde uitkomst als met expliciete userId — de optionele parameter is puur
    // een gemak voor toekomstige callers die de gebruiker nog niet hebben opgezocht;
    // op dit moment geeft alleen de route hem expliciet mee.
    const result = await aggregateDividends(supabase)

    expect(result.aggregate.monthly_dividend_income).toBe(41.67)
    expect(result.aggregate.total_projected_annual_income).toBe(500)
  })

  it('geeft een nul-aggregaat zonder holdings/dividenden', async () => {
    const supabase = makeSupabaseMock({
      holdings: { data: [], error: null },
      holding_transactions: { data: [], error: null },
      investment_holdings: { data: [], error: null },
      investment_transactions: { data: [], error: null },
      transactions: { data: [], error: null },
    })

    const result = await aggregateDividends(supabase, { userId: 'user-1' })

    expect(result.holdings).toHaveLength(0)
    expect(result.aggregate).toEqual({
      total_dividend_income: 0,
      total_projected_annual_income: 0,
      monthly_dividend_income: 0,
      total_portfolio_value: 0,
      weighted_dividend_yield: 0,
      freedom_days_per_year: 0,
      daily_expenses: 0,
      total_dividend_count: 0,
    })
  })

  it('geeft een leeg resultaat wanneer er geen ingelogde gebruiker is', async () => {
    const supabase = makeSupabaseMock(fullFixture(), null)

    const result = await aggregateDividends(supabase)

    expect(result.holdings).toHaveLength(0)
    expect(result.aggregate.total_dividend_count).toBe(0)
    expect(result.aggregate.monthly_dividend_income).toBe(0)
  })
})
