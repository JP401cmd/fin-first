import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  buildPortfolioHistory,
  compareToBenchmarks,
  TIME_PERIODS,
} from '@/lib/benchmark-comparison'

/**
 * GET /api/benchmark-comparison
 *
 * Returns benchmark comparison data for the user's portfolio.
 * Query params:
 *   ?period=1m|3m|6m|1y|ytd|all (default: 1y)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('period') || '1y'
  const period = TIME_PERIODS.find(p => p.id === periodId) || TIME_PERIODS[3] // default 1y

  try {
    // Fetch holdings
    const { data: holdings, error: holdingsError } = await supabase
      .from('holdings')
      .select('id, units, avg_purchase_price, current_price, purchase_date, created_at')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (holdingsError) {
      // Holdings table may not exist
      return NextResponse.json({
        comparison: null,
        message: 'Geen holdings gevonden',
      })
    }

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        comparison: null,
        message: 'Geen holdings gevonden',
      })
    }

    // Fetch valuations for holdings
    const holdingIds = holdings.map(h => h.id)
    const { data: valuations } = await supabase
      .from('valuations')
      .select('entity_id, entity_type, value, valuation_date')
      .in('entity_id', holdingIds)
      .eq('entity_type', 'holding')
      .order('valuation_date', { ascending: true })

    // Fetch transactions for holdings
    const { data: transactions } = await supabase
      .from('holding_transactions')
      .select('holding_id, type, units, price_per_unit, date')
      .in('holding_id', holdingIds)
      .order('date', { ascending: true })

    // Build portfolio history
    const portfolioHistory = buildPortfolioHistory(
      holdings,
      valuations || [],
      transactions || [],
    )

    if (portfolioHistory.length < 2) {
      return NextResponse.json({
        comparison: null,
        message: 'Onvoldoende historische data voor vergelijking',
      })
    }

    // Compare to benchmarks
    const comparison = compareToBenchmarks(portfolioHistory, period)

    return NextResponse.json({
      comparison,
      portfolio_months: portfolioHistory.length,
      holdings_count: holdings.length,
    })
  } catch (error) {
    console.error('Benchmark comparison error:', error)
    return NextResponse.json(
      { error: 'Kon benchmarkvergelijking niet berekenen' },
      { status: 500 },
    )
  }
}
