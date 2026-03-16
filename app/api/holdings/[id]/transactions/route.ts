import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { syncAssetValueFromHoldings } from '@/lib/holdings-sync'

/**
 * Compute running P&L for a list of transactions.
 *
 * For each transaction we track:
 *   - running_units: cumulative units held
 *   - running_cost_basis: total cost invested (buy adds, sell subtracts at avg cost)
 *   - running_avg_price: weighted average purchase price
 *   - realized_pnl: profit/loss locked in on this specific sell
 *   - cumulative_realized_pnl: total realized P&L across all sells up to this point
 *   - cumulative_dividends: total dividend income up to this point
 */
function computeRunningPnL(transactions: Array<{
  id: string
  type: 'buy' | 'sell' | 'dividend' | 'split'
  units: number
  price_per_unit: number
  total_amount: number
  date: string
  notes: string | null
  created_at: string
  holding_id: string
  user_id?: string
}>) {
  // Sort chronologically (ascending) for running calculations
  const sorted = [...transactions].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date)
    if (dateCompare !== 0) return dateCompare
    return (a.created_at || '').localeCompare(b.created_at || '')
  })

  let runningUnits = 0
  let runningCostBasis = 0
  let cumulativeRealizedPnL = 0
  let cumulativeDividends = 0

  return sorted.map((tx) => {
    const numUnits = Number(tx.units) || 0
    const pricePerUnit = Number(tx.price_per_unit) || 0
    const totalAmount = Number(tx.total_amount) || numUnits * pricePerUnit
    let realizedPnl = 0
    const runningAvgPrice = runningUnits > 0 ? runningCostBasis / runningUnits : 0

    if (tx.type === 'buy') {
      runningCostBasis += numUnits * pricePerUnit
      runningUnits += numUnits
    } else if (tx.type === 'sell') {
      // Realized P&L = (sell price - avg cost) * units sold
      realizedPnl = (pricePerUnit - runningAvgPrice) * numUnits
      cumulativeRealizedPnL += realizedPnl
      // Reduce cost basis proportionally (remove at avg cost)
      runningCostBasis -= runningAvgPrice * numUnits
      runningUnits = Math.max(0, runningUnits - numUnits)
      // Correct floating point: if units is 0, cost basis should be 0
      if (runningUnits <= 0) {
        runningCostBasis = 0
        runningUnits = 0
      }
    } else if (tx.type === 'split') {
      // Stock split: multiply units by multiplier, divide avg price
      // Total value stays the same, no P&L impact
      const multiplier = numUnits // units field stores the split multiplier
      if (multiplier > 0 && runningUnits > 0) {
        runningUnits *= multiplier
        // Cost basis stays the same (total investment unchanged)
        // Avg price adjusts automatically since costBasis / units
      }
    } else if (tx.type === 'dividend') {
      cumulativeDividends += totalAmount
    }

    const newRunningAvgPrice = runningUnits > 0 ? runningCostBasis / runningUnits : 0

    return {
      ...tx,
      running_units: parseFloat(runningUnits.toFixed(6)),
      running_cost_basis: parseFloat(runningCostBasis.toFixed(2)),
      running_avg_price: parseFloat(newRunningAvgPrice.toFixed(4)),
      realized_pnl: parseFloat(realizedPnl.toFixed(2)),
      cumulative_realized_pnl: parseFloat(cumulativeRealizedPnL.toFixed(2)),
      cumulative_dividends: parseFloat(cumulativeDividends.toFixed(2)),
    }
  })
}

/**
 * GET /api/holdings/[id]/transactions
 *
 * List all transactions for a specific holding, with running P&L calculations.
 *
 * Returns:
 *   - transactions: array with running P&L annotations
 *   - summary: { total_invested, total_sold, realized_pnl, dividend_income, unrealized_pnl, total_return }
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
    // Get the holding details for unrealized P&L calculation
    let holdingUnits = 0
    let holdingAvgPrice = 0
    let holdingCurrentPrice = 0

    const { data: holding } = await supabase
      .from('holdings')
      .select('units, avg_purchase_price, current_price')
      .eq('id', holdingId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (holding) {
      holdingUnits = Number(holding.units) || 0
      holdingAvgPrice = Number(holding.avg_purchase_price) || 0
      holdingCurrentPrice = Number(holding.current_price) || holdingAvgPrice
    }

    const { data: txRows, error } = await supabase
      .from('holding_transactions')
      .select('*')
      .eq('holding_id', holdingId)
      .eq('user_id', user.id)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })

    const rawTransactions: Array<{
      id: string
      holding_id: string
      user_id: string
      type: 'buy' | 'sell' | 'dividend' | 'split'
      units: number
      price_per_unit: number
      total_amount: number
      date: string
      notes: string | null
      created_at: string
    }> = (!error && txRows) ? txRows as typeof rawTransactions : []

    const source = rawTransactions.length > 0 ? 'holding_transactions_table' : 'empty'

    // Compute running P&L
    const transactions = computeRunningPnL(rawTransactions)

    // Compute summary
    const totalInvested = rawTransactions
      .filter(t => t.type === 'buy')
      .reduce((sum, t) => sum + (Number(t.units) * Number(t.price_per_unit)), 0)

    const totalSold = rawTransactions
      .filter(t => t.type === 'sell')
      .reduce((sum, t) => sum + (Number(t.units) * Number(t.price_per_unit)), 0)

    const dividendIncome = rawTransactions
      .filter(t => t.type === 'dividend')
      .reduce((sum, t) => sum + Number(t.total_amount), 0)

    // Get cumulative realized P&L from the last transaction
    const lastTx = transactions.length > 0 ? transactions[transactions.length - 1] : null
    const realizedPnl = lastTx ? lastTx.cumulative_realized_pnl : 0

    // Unrealized P&L = (current_price - avg_cost) * current_units
    const unrealizedPnl = holdingUnits > 0
      ? (holdingCurrentPrice - holdingAvgPrice) * holdingUnits
      : 0

    // Total return = realized + unrealized + dividends
    const totalReturn = realizedPnl + unrealizedPnl + dividendIncome

    return NextResponse.json({
      transactions: transactions.reverse(), // Newest first for display
      source,
      summary: {
        total_invested: parseFloat(totalInvested.toFixed(2)),
        total_sold: parseFloat(totalSold.toFixed(2)),
        realized_pnl: parseFloat(realizedPnl.toFixed(2)),
        unrealized_pnl: parseFloat(unrealizedPnl.toFixed(2)),
        dividend_income: parseFloat(dividendIncome.toFixed(2)),
        total_return: parseFloat(totalReturn.toFixed(2)),
        current_units: holdingUnits,
        current_avg_price: holdingAvgPrice,
        current_price: holdingCurrentPrice,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/holdings/[id]/transactions
 *
 * Record a buy/sell/dividend transaction for a holding.
 *
 * Body: { type: 'buy'|'sell'|'dividend', units, price_per_unit, date, notes? }
 *
 * Delegates to the existing /api/holding-transactions handler logic.
 */
export async function POST(
  request: NextRequest,
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
    const body = await request.json()
    const { type, units, price_per_unit, date, notes } = body

    if (!type || !units || !date) {
      return NextResponse.json({
        error: 'type, units, and date are required',
      }, { status: 400 })
    }

    if (type !== 'split' && !price_per_unit) {
      return NextResponse.json({
        error: 'price_per_unit is required for buy, sell, and dividend transactions',
      }, { status: 400 })
    }

    if (!['buy', 'sell', 'dividend', 'split'].includes(type)) {
      return NextResponse.json({ error: 'type must be buy, sell, dividend, or split' }, { status: 400 })
    }

    const numUnits = Number(units)
    const numPrice = type === 'split' ? 0 : Number(price_per_unit)
    const totalAmount = type === 'split' ? 0 : numUnits * numPrice

    // Insert into holding_transactions table
    const { data: transaction, error } = await supabase
      .from('holding_transactions')
      .insert({
        holding_id: holdingId,
        user_id: user.id,
        type,
        units: numUnits,
        price_per_unit: numPrice,
        total_amount: totalAmount,
        date,
        notes: notes || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const source = 'holding_transactions_table'

    // Update the holding's units and avg_purchase_price
    const { data: holding } = await supabase
      .from('holdings')
      .select('id, units, avg_purchase_price')
      .eq('id', holdingId)
      .eq('user_id', user.id)
      .single()

    if (holding) {
      const currentUnits = Number(holding.units)
      const currentAvg = Number(holding.avg_purchase_price)
      let newUnits = currentUnits
      let newAvg = currentAvg
      let realizedPnl = 0

      if (type === 'buy') {
        newUnits = currentUnits + numUnits
        newAvg = newUnits > 0
          ? (currentUnits * currentAvg + numUnits * numPrice) / newUnits
          : numPrice
      } else if (type === 'sell') {
        // Calculate realized P&L for this sell
        realizedPnl = (numPrice - currentAvg) * numUnits
        newUnits = Math.max(0, currentUnits - numUnits)
        // avg stays the same for sells
      } else if (type === 'split') {
        // Stock split: units × multiplier, avg ÷ multiplier
        // Total value stays the same
        const multiplier = numUnits
        if (multiplier > 0 && currentUnits > 0) {
          newUnits = currentUnits * multiplier
          newAvg = currentAvg / multiplier
        }
      }
      // dividend: no change to units

      const { error: updateErr } = await supabase
        .from('holdings')
        .update({
          units: newUnits,
          avg_purchase_price: parseFloat(newAvg.toFixed(4)),
          updated_at: new Date().toISOString(),
        })
        .eq('id', holdingId)
        .eq('user_id', user.id)

      if (updateErr) {
        return NextResponse.json({
          transaction,
          source,
          warning: `Transaction recorded but holding update failed: ${updateErr.message}`,
          holding_updated: false,
        }, { status: 201 })
      }

      return NextResponse.json({
        transaction,
        source,
        holding_updated: true,
        new_units: newUnits,
        new_avg_price: parseFloat(newAvg.toFixed(4)),
        realized_pnl: type === 'sell' ? parseFloat(realizedPnl.toFixed(2)) : undefined,
      }, { status: 201 })
    }

    return NextResponse.json({
      transaction,
      source,
      holding_updated: false,
    }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Replay all transactions for a holding chronologically and compute the final
 * units and avg_purchase_price. This is the single source of truth after any
 * transaction mutation (especially DELETE).
 *
 * Rules:
 *   - buy: weighted average price, units increase
 *   - sell: units decrease, avg stays the same
 *   - split: units × multiplier, avg ÷ multiplier (total value unchanged)
 *   - dividend: no effect on units/avg
 */
function replayTransactions(
  transactions: Array<{ type: string; units: number; price_per_unit: number; date: string; created_at: string }>
): { units: number; avgPurchasePrice: number } {
  const sorted = [...transactions].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date)
    if (dateCompare !== 0) return dateCompare
    return (a.created_at || '').localeCompare(b.created_at || '')
  })

  let units = 0
  let avgPrice = 0

  for (const tx of sorted) {
    const numUnits = Number(tx.units) || 0
    const numPrice = Number(tx.price_per_unit) || 0

    if (tx.type === 'buy') {
      const newUnits = units + numUnits
      avgPrice = newUnits > 0
        ? (units * avgPrice + numUnits * numPrice) / newUnits
        : numPrice
      units = newUnits
    } else if (tx.type === 'sell') {
      units = Math.max(0, units - numUnits)
      if (units <= 0) {
        units = 0
        avgPrice = 0
      }
    } else if (tx.type === 'split') {
      // Stock split: units × multiplier, avg ÷ multiplier
      const multiplier = numUnits
      if (multiplier > 0 && units > 0) {
        units *= multiplier
        avgPrice /= multiplier
      }
    }
  }

  return {
    units: parseFloat(units.toFixed(6)),
    avgPurchasePrice: parseFloat(avgPrice.toFixed(4)),
  }
}

/**
 * DELETE /api/holdings/[id]/transactions?tx_id=<uuid>
 *
 * Delete a holding transaction and replay remaining transactions to recalculate
 * the holding's units and avg_purchase_price.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { id: holdingId } = await params
  const { searchParams } = new URL(request.url)
  const txId = searchParams.get('tx_id')

  if (!txId) {
    return NextResponse.json({ error: 'tx_id is verplicht' }, { status: 400 })
  }

  if (!holdingId) {
    return NextResponse.json({ error: 'Holding ID is verplicht' }, { status: 400 })
  }

  try {
    // 1. Delete the transaction
    const { error } = await supabase
      .from('holding_transactions')
      .delete()
      .eq('id', txId)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 2. Replay remaining transactions to recalculate holding
    const { data: remaining } = await supabase
      .from('holding_transactions')
      .select('type, units, price_per_unit, date, created_at')
      .eq('holding_id', holdingId)
      .eq('user_id', user.id)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })

    const { units: newUnits, avgPurchasePrice: newAvg } = replayTransactions(remaining || [])

    // 3. Update the holding with recalculated values
    const { error: updateErr } = await supabase
      .from('holdings')
      .update({
        units: newUnits,
        avg_purchase_price: newAvg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', holdingId)
      .eq('user_id', user.id)

    // 4. Sync parent asset value
    const { data: holding } = await supabase
      .from('holdings')
      .select('asset_id')
      .eq('id', holdingId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (holding?.asset_id) {
      await syncAssetValueFromHoldings(supabase, holding.asset_id, user.id)
    }

    return NextResponse.json({
      success: true,
      holding_updated: !updateErr,
      new_units: newUnits,
      new_avg_price: newAvg,
      asset_synced: !!holding?.asset_id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
