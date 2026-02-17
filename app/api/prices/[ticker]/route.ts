import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { fetchPriceData, type PriceData } from '@/lib/price-feed'

/**
 * GET /api/prices/:ticker — Fetch current price for a ticker symbol.
 *
 * Returns real-time price data from Yahoo Finance including:
 * - Current market price
 * - Previous close price
 * - Daily change (amount and percentage)
 * - Currency and display name
 *
 * The response is cached server-side for 5 minutes to avoid excessive API calls.
 * Rate limited to 5 requests per second across all users.
 *
 * Examples:
 *   GET /api/prices/AAPL          — Apple Inc.
 *   GET /api/prices/VWRL.AS       — Vanguard FTSE All-World (Amsterdam)
 *   GET /api/prices/BTC-EUR       — Bitcoin in EUR
 *   GET /api/prices/ASML.AS       — ASML (Amsterdam)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { ticker } = await params

  if (!ticker || ticker.trim().length === 0) {
    return NextResponse.json({ error: 'Ticker is verplicht' }, { status: 400 })
  }

  // Validate ticker format (basic check: alphanumeric, dots, hyphens, carets)
  const tickerPattern = /^[A-Za-z0-9.\-^]{1,20}$/
  if (!tickerPattern.test(ticker.trim())) {
    return NextResponse.json({
      error: 'Ongeldig ticker formaat',
      hint: 'Gebruik standaard ticker symbolen, bijv. AAPL, VWRL.AS, BTC-EUR',
    }, { status: 400 })
  }

  try {
    const priceData: PriceData | null = await fetchPriceData(ticker.trim())

    if (!priceData) {
      return NextResponse.json({
        ticker: ticker.trim().toUpperCase(),
        available: false,
        message: 'Prijsdata niet beschikbaar voor dit ticker symbool',
        hint: 'Controleer het ticker symbool. Voor Europese beurzen voeg .AS (Amsterdam), .DE (Frankfurt), of .L (Londen) toe.',
      }, { status: 404 })
    }

    return NextResponse.json({
      ticker: ticker.trim().toUpperCase(),
      available: true,
      price: priceData.price,
      previousClose: priceData.previousClose,
      dailyChange: priceData.dailyChange,
      dailyChangePercent: priceData.dailyChangePercent,
      currency: priceData.currency,
      displayName: priceData.displayName,
      timestamp: priceData.timestamp,
      source: priceData.source,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
