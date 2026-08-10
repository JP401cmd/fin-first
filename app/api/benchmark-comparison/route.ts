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

/** Paginagrootte voor de koersrijen; gelijk aan PostgREST's `max_rows`. */
const PRICE_PAGE_SIZE = 1000
/** Runaway-grens (200k rijen), ruim boven elk realistisch account. */
const PRICE_MAX_PAGES = 200

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

    // Dagelijkse slotkoersen — de primaire koersbron. Zonder deze bleef de
    // waardering hangen op `valuations`, dat voor echte accounts leeg is; elke
    // maand kwam dan op "niet waarneembaar" en de eigen lijn verdween.
    //
    // GEPAGINEERD: een kale select kapt stil af op `max_rows` (1000). Na een
    // backfill (`range=max`) staan er duizenden rijen per ticker; met een
    // oplopende sortering krijg je dan de OUDSTE 1000 en waardeer je elke maand
    // op verouderde koersen die zich wél als waarneming presenteren.
    const priceObservations: Array<{ holding_id: string; date: string; close_price: number | string }> = []
    for (let page = 0; page < PRICE_MAX_PAGES; page++) {
      const from = page * PRICE_PAGE_SIZE
      const { data: pageRows } = await supabase
        .from('investment_holding_prices')
        .select('holding_id, date, close_price')
        .in('holding_id', holdingIds)
        .order('holding_id', { ascending: true })
        .order('date', { ascending: true })
        .range(from, from + PRICE_PAGE_SIZE - 1)
      const rows = pageRows ?? []
      priceObservations.push(...rows)
      if (rows.length < PRICE_PAGE_SIZE) break
    }

    // De actuele koers als observatie-van-vandaag. Zonder dit wint een oude
    // slotkoers het van `current_price`: `closeOnOrBefore` kent geen
    // houdbaarheidsgrens, dus één rij uit 2024 voor een gedelistte positie
    // waardeert élke latere maand — inclusief de lopende — en meldt dat als
    // waargenomen. Dezelfde behandeling die de waardecurve al kreeg, zodat de
    // twee grafieken op één scherm niet uiteenlopen voor "nu".
    for (const h of holdings) {
      if (Number(h.current_price) > 0) {
        priceObservations.push({
          holding_id: h.id,
          date: new Date().toISOString().slice(0, 10),
          close_price: Number(h.current_price),
        })
      }
    }

    // Build portfolio history
    const portfolioHistory = buildPortfolioHistory(
      holdings,
      valuations || [],
      transactions || [],
      new Date(),
      priceObservations || [],
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
