import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { serverError, unauthorized } from '@/lib/api/respond'
import {
  buildPortfolioHistory,
  compareToBenchmarks,
  fetchAllRealBenchmarkData,
  resolvePeriodStart,
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

  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('period') || '1y'
  const period = TIME_PERIODS.find(p => p.id === periodId) || TIME_PERIODS[3] // default 1y

  try {
    // Fetch holdings — investment-tracker (migratie 20260502000003 splitste tabel)
    const { data: holdings, error: holdingsError } = await supabase
      .from('investment_holdings')
      .select('id, units, avg_purchase_price, current_price, purchase_date, created_at')
      .eq('user_id', claims.sub)
      .eq('is_active', true)

    // Een echte DB-/RLS-fout is géén "geen holdings": die stil als lege staat
    // presenteren verbergt een storing achter een plausibel scherm.
    if (holdingsError) {
      return serverError(holdingsError, 'benchmark-comparison:GET holdings')
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
      .from('investment_transactions')
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

    // Het benchmarkvenster volgt de PERIODEKEUZE, niet de volledige historie.
    // Dezelfde `resolvePeriodStart` gebruikt `compareToBenchmarks` om te
    // knippen — één bron, dus fetch en vergelijking kunnen niet uiteenlopen.
    const now = new Date()
    const benchStartDate = resolvePeriodStart(period, portfolioHistory[0].date, now)

    // Fetch real benchmark data from Yahoo Finance (with automatic fallback)
    const realBenchmarkData = await fetchAllRealBenchmarkData(benchStartDate, now)

    // Compare to benchmarks (uses real data when available, synthetic as fallback)
    const comparison = compareToBenchmarks(portfolioHistory, period, realBenchmarkData, now)

    // Count how many benchmarks use real vs synthetic data
    const realCount = comparison?.benchmarks.filter(b => b.dataSource === 'yahoo_finance').length ?? 0
    const syntheticCount = comparison?.benchmarks.filter(b => b.dataSource === 'synthetic').length ?? 0

    return NextResponse.json({
      comparison,
      portfolio_months: portfolioHistory.length,
      holdings_count: holdings.length,
      benchmark_data_source: {
        real: realCount,
        synthetic: syntheticCount,
        disclaimer: syntheticCount > 0
          ? 'Sommige benchmarkdata is geschat op basis van historisch gemiddeld rendement. Echte marktdata was niet beschikbaar.'
          : undefined,
      },
    })
  } catch (error) {
    return serverError(error, 'benchmark-comparison:GET')
  }
}
