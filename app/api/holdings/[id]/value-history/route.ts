import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/holdings/[id]/value-history
 *
 * Returns a time-series of the holding's value over time, computed from
 * transactions. Each data point represents a transaction event with the
 * running portfolio value at that point.
 *
 * Also includes the current value as the last data point.
 *
 * Returns:
 *   - history: array of { date, value, units, price, event }
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

    if (holdingError && holdingError.message.includes('Could not find')) {
      // holdings table doesn't exist — try assets fallback
      return buildFromAsset(supabase, holdingId, user.id)
    }

    if (!holding) {
      return NextResponse.json({ error: 'Holding niet gevonden' }, { status: 404 })
    }

    // Get all transactions for this holding
    const { data: transactions, error: txError } = await supabase
      .from('holding_transactions')
      .select('*')
      .eq('holding_id', holdingId)
      .eq('user_id', user.id)
      .order('date', { ascending: true })

    if (txError && txError.message.includes('Could not find')) {
      // Table doesn't exist — return single-point chart with current value
      return buildSinglePoint(holding)
    }

    const txList = transactions || []

    // Build value history from transactions
    const history: Array<{
      date: string
      value: number
      units: number
      price: number
      event: string
      cost_basis: number
    }> = []

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
      // Dividends don't change units or cost basis

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

    // Only add today's point if it's different from the last entry
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

    return NextResponse.json({
      holding_id: holdingId,
      holding_name: holding.name,
      ticker: holding.ticker,
      history,
      current_value: parseFloat(currentValue.toFixed(2)),
      current_units: currentUnits,
      current_price: currentPrice,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Er is een fout opgetreden' },
      { status: 500 }
    )
  }
}

/**
 * Fallback: build value history from a single asset record (no holdings table).
 */
async function buildFromAsset(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assetId: string,
  userId: string
) {
  const { data: asset, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', assetId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !asset) {
    return NextResponse.json({ error: 'Holding niet gevonden' }, { status: 404 })
  }

  const purchaseValue = Number(asset.purchase_value) || 0
  const currentValue = Number(asset.current_value) || purchaseValue
  const today = new Date().toISOString().split('T')[0]
  const history = []

  if (asset.purchase_date) {
    history.push({
      date: asset.purchase_date,
      value: purchaseValue,
      units: 1,
      price: purchaseValue,
      event: 'Aankoop',
      cost_basis: purchaseValue,
    })
  }

  history.push({
    date: today,
    value: currentValue,
    units: 1,
    price: currentValue,
    event: 'Huidig',
    cost_basis: purchaseValue,
  })

  return NextResponse.json({
    holding_id: assetId,
    holding_name: asset.name,
    ticker: asset.ticker_symbol || null,
    history,
    current_value: currentValue,
    current_units: 1,
    current_price: currentValue,
  })
}

/**
 * Build a minimal single-point response when no transaction table exists.
 */
function buildSinglePoint(holding: Record<string, unknown>) {
  const currentPrice = Number(holding.current_price) || Number(holding.avg_purchase_price) || 0
  const units = Number(holding.units) || 0
  const value = currentPrice * units
  const today = new Date().toISOString().split('T')[0]
  const history = []

  if (holding.purchase_date) {
    const purchasePrice = Number(holding.avg_purchase_price) || 0
    history.push({
      date: String(holding.purchase_date),
      value: purchasePrice * units,
      units,
      price: purchasePrice,
      event: 'Aankoop',
      cost_basis: purchasePrice * units,
    })
  }

  history.push({
    date: today,
    value: parseFloat(value.toFixed(2)),
    units,
    price: currentPrice,
    event: 'Huidig',
    cost_basis: parseFloat((units * (Number(holding.avg_purchase_price) || 0)).toFixed(2)),
  })

  return NextResponse.json({
    holding_id: String(holding.id),
    holding_name: String(holding.name),
    ticker: holding.ticker || null,
    history,
    current_value: parseFloat(value.toFixed(2)),
    current_units: units,
    current_price: currentPrice,
  })
}
