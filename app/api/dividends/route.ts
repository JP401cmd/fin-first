import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Check if a table exists by probing it.
 */
async function tableExists(supabase: Awaited<ReturnType<typeof createClient>>, table: string): Promise<boolean> {
  const { error } = await supabase.from(table).select('id').limit(0)
  return !error || !error.message.includes('Could not find')
}

interface DividendRecord {
  holding_id: string
  holding_name: string
  ticker: string | null
  date: string
  amount: number
  notes: string | null
}

interface HoldingDividendSummary {
  holding_id: string
  holding_name: string
  ticker: string | null
  current_price: number
  units: number
  total_dividend_income: number
  dividend_count: number
  last_dividend_date: string | null
  last_dividend_amount: number
  projected_annual_income: number
  dividend_yield: number // percentage
  holding_value: number
  dividends: DividendRecord[]
}

/**
 * GET /api/dividends
 *
 * Returns aggregate dividend data across all holdings:
 * - Per-holding dividend summaries with yield, history, projected annual income
 * - Aggregate totals: total dividend income, projected annual income
 * - Freedom-day equivalent of dividend income
 *
 * Query params:
 *   ?holding_id=<uuid>  — optional, filter to single holding
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const holdingIdFilter = request.nextUrl.searchParams.get('holding_id')

  try {
    const hasHoldingTxTable = await tableExists(supabase, 'holding_transactions')
    const hasHoldingsTable = await tableExists(supabase, 'holdings')

    // ── 1. Get all holdings for this user ──
    type HoldingRow = {
      id: string
      name: string
      ticker: string | null
      units: number
      avg_purchase_price: number
      current_price: number | null
      is_active: boolean
    }

    let holdings: HoldingRow[] = []

    if (hasHoldingsTable) {
      let query = supabase
        .from('holdings')
        .select('id, name, ticker, units, avg_purchase_price, current_price, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (holdingIdFilter) {
        query = query.eq('id', holdingIdFilter)
      }

      const { data, error } = await query
      if (!error && data) {
        holdings = data as HoldingRow[]
      }
    }

    // Fallback to assets table for investment-type assets
    if (holdings.length === 0 && !hasHoldingsTable) {
      let query = supabase
        .from('assets')
        .select('id, name, ticker_symbol, current_value, purchase_value, asset_type')
        .eq('user_id', user.id)
        .in('asset_type', ['investment', 'crypto', 'retirement'])

      if (holdingIdFilter) {
        query = query.eq('id', holdingIdFilter)
      }

      const { data: assets } = await query
      if (assets) {
        holdings = assets.map((a: Record<string, unknown>) => ({
          id: a.id as string,
          name: a.name as string,
          ticker: (a.ticker_symbol as string) || null,
          units: 1,
          avg_purchase_price: Number(a.purchase_value) || 0,
          current_price: Number(a.current_value) || 0,
          is_active: true,
        }))
      }
    }

    // ── 2. Get all dividend transactions ──
    type DividendTx = {
      id: string
      holding_id: string
      date: string
      amount: number
      notes: string | null
    }

    let allDividends: DividendTx[] = []

    if (hasHoldingTxTable) {
      let query = supabase
        .from('holding_transactions')
        .select('id, holding_id, date, total_amount, notes')
        .eq('user_id', user.id)
        .eq('type', 'dividend')
        .order('date', { ascending: false })

      if (holdingIdFilter) {
        query = query.eq('holding_id', holdingIdFilter)
      }

      const { data, error } = await query
      if (!error && data) {
        allDividends = data.map((d: Record<string, unknown>) => ({
          id: d.id as string,
          holding_id: d.holding_id as string,
          date: d.date as string,
          amount: Number(d.total_amount) || 0,
          notes: d.notes as string | null,
        }))
      }
    }

    // Fallback: valuations table
    if (allDividends.length === 0) {
      const holdingIds = holdingIdFilter ? [holdingIdFilter] : holdings.map(h => h.id)

      if (holdingIds.length > 0) {
        const { data: valRows } = await supabase
          .from('valuations')
          .select('id, entity_id, valuation_date, value, notes')
          .eq('user_id', user.id)
          .eq('entity_type', 'holding_tx_dividend')
          .in('entity_id', holdingIds)
          .order('valuation_date', { ascending: false })

        if (valRows) {
          allDividends = valRows.map((v: Record<string, unknown>) => {
            let notes: string | null = null
            try {
              const meta = JSON.parse(v.notes as string || '{}')
              notes = meta.notes ?? null
            } catch {
              notes = v.notes as string | null
            }
            return {
              id: v.id as string,
              holding_id: v.entity_id as string,
              date: v.valuation_date as string,
              amount: Number(v.value) || 0,
              notes,
            }
          })
        }
      }
    }

    // ── 3. Get user's daily expenses for freedom-time calculation ──
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
    const cutoffDate = twelveMonthsAgo.toISOString().split('T')[0]

    const { data: expenses } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .gte('date', cutoffDate)
      .lt('amount', 0) // Expenses are negative

    let dailyExpenses = 0
    if (expenses && expenses.length > 0) {
      const totalExpenses = expenses.reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0)
      dailyExpenses = totalExpenses / 365
    }

    // ── 4. Build per-holding summaries ──
    const holdingSummaries: HoldingDividendSummary[] = []

    for (const holding of holdings) {
      const holdingDividends = allDividends.filter(d => d.holding_id === holding.id)
      const totalDividendIncome = holdingDividends.reduce((sum, d) => sum + d.amount, 0)
      const dividendCount = holdingDividends.length
      const lastDividend = holdingDividends[0] // Already sorted newest first

      // Calculate projected annual income based on last 12 months of dividends
      const oneYearAgo = new Date()
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      const recentDividends = holdingDividends.filter(d => new Date(d.date) >= oneYearAgo)
      const recentTotal = recentDividends.reduce((sum, d) => sum + d.amount, 0)

      // If we have less than a year of data, annualize what we have
      let projectedAnnualIncome = 0
      if (recentDividends.length > 0) {
        const oldestRecent = recentDividends[recentDividends.length - 1]
        const daySpan = Math.max(1, Math.ceil(
          (Date.now() - new Date(oldestRecent.date).getTime()) / (1000 * 60 * 60 * 24)
        ))
        projectedAnnualIncome = daySpan >= 365
          ? recentTotal
          : (recentTotal / daySpan) * 365
      }

      // Dividend yield = (projected annual income / current holding value) * 100
      const currentPrice = Number(holding.current_price) || Number(holding.avg_purchase_price)
      const holdingValue = currentPrice * Math.max(0, holding.units)
      const dividendYield = holdingValue > 0
        ? (projectedAnnualIncome / holdingValue) * 100
        : 0

      holdingSummaries.push({
        holding_id: holding.id,
        holding_name: holding.name,
        ticker: holding.ticker,
        current_price: currentPrice,
        units: holding.units,
        total_dividend_income: parseFloat(totalDividendIncome.toFixed(2)),
        dividend_count: dividendCount,
        last_dividend_date: lastDividend?.date ?? null,
        last_dividend_amount: lastDividend?.amount ?? 0,
        projected_annual_income: parseFloat(projectedAnnualIncome.toFixed(2)),
        dividend_yield: parseFloat(dividendYield.toFixed(2)),
        holding_value: parseFloat(holdingValue.toFixed(2)),
        dividends: holdingDividends.map(d => ({
          holding_id: d.holding_id,
          holding_name: holding.name,
          ticker: holding.ticker,
          date: d.date,
          amount: d.amount,
          notes: d.notes,
        })),
      })
    }

    // ── 5. Compute aggregate totals ──
    const totalDividendIncome = holdingSummaries.reduce((sum, h) => sum + h.total_dividend_income, 0)
    const totalProjectedAnnualIncome = holdingSummaries.reduce((sum, h) => sum + h.projected_annual_income, 0)
    const totalPortfolioValue = holdingSummaries.reduce((sum, h) => sum + h.holding_value, 0)
    const weightedDividendYield = totalPortfolioValue > 0
      ? (totalProjectedAnnualIncome / totalPortfolioValue) * 100
      : 0

    // Monthly dividend income for FIRE calculations
    const monthlyDividendIncome = totalProjectedAnnualIncome / 12

    // Freedom days covered by dividend income per year
    const freedomDaysPerYear = dailyExpenses > 0
      ? totalProjectedAnnualIncome / dailyExpenses
      : 0

    return NextResponse.json({
      holdings: holdingSummaries.sort((a, b) => b.total_dividend_income - a.total_dividend_income),
      aggregate: {
        total_dividend_income: parseFloat(totalDividendIncome.toFixed(2)),
        total_projected_annual_income: parseFloat(totalProjectedAnnualIncome.toFixed(2)),
        monthly_dividend_income: parseFloat(monthlyDividendIncome.toFixed(2)),
        total_portfolio_value: parseFloat(totalPortfolioValue.toFixed(2)),
        weighted_dividend_yield: parseFloat(weightedDividendYield.toFixed(2)),
        freedom_days_per_year: parseFloat(freedomDaysPerYear.toFixed(1)),
        daily_expenses: parseFloat(dailyExpenses.toFixed(2)),
        total_dividend_count: allDividends.length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
