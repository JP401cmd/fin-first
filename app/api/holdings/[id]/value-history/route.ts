import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { backfillHoldingPrices } from '@/lib/historical-prices'

/**
 * GET /api/holdings/[id]/value-history
 *
 * Returns a time-series of the holding's value over time.
 *
 * Primary: uses the holding_prices table for a realistic daily curve.
 * Fallback: if no holding_prices exist, builds from transaction events
 * (the original behaviour with straight-line interpolation).
 *
 * When the holding has a ticker but no stored prices, automatically
 * triggers a backfill from Yahoo Finance (fire-and-forget).
 *
 * Returns:
 *   - history: array of { date, value, units, price, event, cost_basis }
 *   - source: 'holding_prices' | 'transactions'
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { id: holdingId } = await params

  if (!holdingId) {
    return NextResponse.json({ error: 'Holding ID is verplicht' }, { status: 400 })
  }

  try {
    // Get holding details
    const { data: holding, error: holdingError } = await supabase
      .from('holdings')
      .select('*')
      .eq('id', holdingId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (holdingError) {
      return NextResponse.json({ error: holdingError.message }, { status: 500 })
    }

    if (!holding) {
      return NextResponse.json({ error: 'Holding niet gevonden' }, { status: 404 })
    }

    // --- Try holding_prices table first ---
    const priceHistory = await buildPriceBasedHistory(supabase, holding, user.id)

    if (priceHistory && priceHistory.length >= 2) {
      const currentPrice = Number(holding.current_price) || Number(holding.avg_purchase_price) || 0
      const currentUnits = Number(holding.units) || 0

      return NextResponse.json({
        holding_id: holdingId,
        holding_name: holding.name,
        ticker: holding.ticker,
        history: priceHistory,
        current_value: parseFloat((currentPrice * currentUnits).toFixed(2)),
        current_units: currentUnits,
        current_price: currentPrice,
        source: 'holding_prices',
      })
    }

    // --- Fallback: transaction-based history ---
    const txHistory = await buildTransactionBasedHistory(supabase, holding, user.id)

    // If the holding has a ticker but no price history, trigger a backfill
    // (fire-and-forget — don't block the response)
    if (holding.ticker && (!priceHistory || priceHistory.length === 0)) {
      backfillHoldingPrices(supabase, holdingId, holding.ticker, user.id, '1y').catch(() => {
        // Silently fail — backfill is best-effort
      })
    }

    const currentPrice = Number(holding.current_price) || Number(holding.avg_purchase_price) || 0
    const currentUnits = Number(holding.units) || 0

    return NextResponse.json({
      holding_id: holdingId,
      holding_name: holding.name,
      ticker: holding.ticker,
      history: txHistory,
      current_value: parseFloat((currentPrice * currentUnits).toFixed(2)),
      current_units: currentUnits,
      current_price: currentPrice,
      source: 'transactions',
    })
  } catch {
    return NextResponse.json(
      { error: 'Er is een fout opgetreden' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// Price-based history (from holding_prices table)
// ---------------------------------------------------------------------------

type HistoryPoint = {
  date: string
  value: number
  units: number
  price: number
  event: string
  cost_basis: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildPriceBasedHistory(supabase: any, holding: any, userId: string): Promise<HistoryPoint[] | null> {
  try {
    // Check if holding_prices table exists and has data for this holding
    const { data: prices, error } = await supabase
      .from('holding_prices')
      .select('date, close_price')
      .eq('holding_id', holding.id)
      .order('date', { ascending: true })

    if (error || !prices || prices.length === 0) {
      return null
    }

    // Get transactions to compute units at each date
    const { data: transactions } = await supabase
      .from('holding_transactions')
      .select('date, type, units, price_per_unit')
      .eq('holding_id', holding.id)
      .eq('user_id', userId)
      .order('date', { ascending: true })

    const txList = (transactions || []) as Array<{
      date: string
      type: string
      units: number
      price_per_unit: number
    }>

    // Build a date → cumulative units + cost basis map from transactions
    // This lets us know how many units were held on any given date
    const txEvents: Array<{ date: string; unitsAfter: number; costBasisAfter: number }> = []
    let runningUnits = 0
    let runningCostBasis = 0

    // If no transactions but holding has data, assume all units from purchase
    if (txList.length === 0) {
      const units = Number(holding.units) || 0
      const avgPrice = Number(holding.avg_purchase_price) || 0
      txEvents.push({
        date: holding.purchase_date || prices[0].date,
        unitsAfter: units,
        costBasisAfter: units * avgPrice,
      })
      runningUnits = units
      runningCostBasis = units * avgPrice
    } else {
      for (const tx of txList) {
        const numUnits = Number(tx.units) || 0
        const pricePerUnit = Number(tx.price_per_unit) || 0

        if (tx.type === 'buy') {
          runningCostBasis += numUnits * pricePerUnit
          runningUnits += numUnits
        } else if (tx.type === 'sell') {
          const avgCost = runningUnits > 0 ? runningCostBasis / runningUnits : 0
          runningCostBasis -= avgCost * numUnits
          runningUnits = Math.max(0, runningUnits - numUnits)
          if (runningUnits <= 0) {
            runningCostBasis = 0
            runningUnits = 0
          }
        }

        txEvents.push({
          date: tx.date,
          unitsAfter: runningUnits,
          costBasisAfter: runningCostBasis,
        })
      }
    }

    // Helper: find units held on a given date
    function getUnitsAndCostOnDate(date: string): { units: number; costBasis: number } {
      // Find the last transaction on or before this date
      let units = 0
      let costBasis = 0
      for (const ev of txEvents) {
        if (ev.date <= date) {
          units = ev.unitsAfter
          costBasis = ev.costBasisAfter
        } else {
          break
        }
      }
      return { units, costBasis }
    }

    // Sample prices to avoid too many data points (max ~120 for a year)
    const maxPoints = 120
    const step = Math.max(1, Math.floor(prices.length / maxPoints))

    const history: HistoryPoint[] = []
    for (let i = 0; i < prices.length; i += step) {
      const p = prices[i]
      const closePrice = Number(p.close_price)
      const { units, costBasis } = getUnitsAndCostOnDate(p.date)

      if (units <= 0) continue

      history.push({
        date: p.date,
        value: parseFloat((units * closePrice).toFixed(2)),
        units: parseFloat(units.toFixed(6)),
        price: closePrice,
        event: 'Koers',
        cost_basis: parseFloat(costBasis.toFixed(2)),
      })
    }

    // Always include the last price point
    const lastPrice = prices[prices.length - 1]
    const lastInHistory = history[history.length - 1]
    if (lastPrice && (!lastInHistory || lastInHistory.date !== lastPrice.date)) {
      const closePrice = Number(lastPrice.close_price)
      const { units, costBasis } = getUnitsAndCostOnDate(lastPrice.date)
      if (units > 0) {
        history.push({
          date: lastPrice.date,
          value: parseFloat((units * closePrice).toFixed(2)),
          units: parseFloat(units.toFixed(6)),
          price: closePrice,
          event: 'Koers',
          cost_basis: parseFloat(costBasis.toFixed(2)),
        })
      }
    }

    // Add today's current price as the final point
    const currentPrice = Number(holding.current_price) || Number(holding.avg_purchase_price) || 0
    const currentUnits = Number(holding.units) || 0
    const today = new Date().toISOString().split('T')[0]

    if (currentUnits > 0 && (!lastInHistory || lastInHistory.date !== today)) {
      history.push({
        date: today,
        value: parseFloat((currentUnits * currentPrice).toFixed(2)),
        units: currentUnits,
        price: currentPrice,
        event: 'Huidig',
        cost_basis: parseFloat((currentUnits * (Number(holding.avg_purchase_price) || 0)).toFixed(2)),
      })
    }

    return history.length >= 2 ? history : null
  } catch {
    // Table might not exist yet — gracefully fall back
    return null
  }
}

// ---------------------------------------------------------------------------
// Transaction-based history (original fallback)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildTransactionBasedHistory(supabase: any, holding: any, userId: string): Promise<HistoryPoint[]> {
  const { data: transactions } = await supabase
    .from('holding_transactions')
    .select('*')
    .eq('holding_id', holding.id)
    .eq('user_id', userId)
    .order('date', { ascending: true })

  const txList = transactions || []

  const history: HistoryPoint[] = []
  let runningUnits = 0
  let runningCostBasis = 0

  // If there's a purchase date and no transactions, start from purchase
  if (txList.length === 0 && holding.purchase_date) {
    const purchasePrice = Number(holding.avg_purchase_price) || 0
    const units = Number(holding.units) || 0
    history.push({
      date: holding.purchase_date,
      value: purchasePrice * units,
      units,
      price: purchasePrice,
      event: 'Aankoop',
      cost_basis: purchasePrice * units,
    })
  }

  // Process each transaction chronologically
  for (const tx of txList) {
    const numUnits = Number(tx.units) || 0
    const pricePerUnit = Number(tx.price_per_unit) || 0

    if (tx.type === 'buy') {
      runningCostBasis += numUnits * pricePerUnit
      runningUnits += numUnits
    } else if (tx.type === 'sell') {
      const avgCost = runningUnits > 0 ? runningCostBasis / runningUnits : 0
      runningCostBasis -= avgCost * numUnits
      runningUnits = Math.max(0, runningUnits - numUnits)
      if (runningUnits <= 0) {
        runningCostBasis = 0
        runningUnits = 0
      }
    }

    const eventLabel = tx.type === 'buy' ? 'Koop' : tx.type === 'sell' ? 'Verkoop' : 'Dividend'
    const valueAtEvent = runningUnits * pricePerUnit

    history.push({
      date: tx.date,
      value: parseFloat(valueAtEvent.toFixed(2)),
      units: parseFloat(runningUnits.toFixed(6)),
      price: pricePerUnit,
      event: eventLabel,
      cost_basis: parseFloat(runningCostBasis.toFixed(2)),
    })
  }

  // Add current value as final data point (today)
  const currentPrice = Number(holding.current_price) || Number(holding.avg_purchase_price) || 0
  const currentUnits = Number(holding.units) || 0
  const currentValue = currentPrice * currentUnits
  const today = new Date().toISOString().split('T')[0]

  const lastEntry = history[history.length - 1]
  if (!lastEntry || lastEntry.date !== today) {
    history.push({
      date: today,
      value: parseFloat(currentValue.toFixed(2)),
      units: currentUnits,
      price: currentPrice,
      event: 'Huidig',
      cost_basis: parseFloat((currentUnits * (Number(holding.avg_purchase_price) || 0)).toFixed(2)),
    })
  }

  return history
}
