import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Check if a table exists by probing it.
 */
async function tableExists(supabase: Awaited<ReturnType<typeof createClient>>, table: string): Promise<boolean> {
  const { error } = await supabase.from(table).select('id').limit(0)
  return !error || !error.message.includes('Could not find')
}

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
  type: 'buy' | 'sell' | 'dividend'
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
    const hasHoldingTxTable = await tableExists(supabase, 'holding_transactions')
    const hasHoldingsTable = await tableExists(supabase, 'holdings')

    // Get the holding details for unrealized P&L calculation
    let holdingUnits = 0
    let holdingAvgPrice = 0
    let holdingCurrentPrice = 0

    if (hasHoldingsTable) {
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
    }

    let rawTransactions: Array<{
      id: string
      holding_id: string
      user_id: string
      type: 'buy' | 'sell' | 'dividend'
      units: number
      price_per_unit: number
      total_amount: number
      date: string
      notes: string | null
      created_at: string
    }> = []

    let source = 'empty'

    if (hasHoldingTxTable) {
      const { data: txRows, error } = await supabase
        .from('holding_transactions')
        .select('*')
        .eq('holding_id', holdingId)
        .eq('user_id', user.id)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })

      if (!error && txRows) {
        rawTransactions = txRows as typeof rawTransactions
        source = 'holding_transactions_table'
      }
    }

    // Fallback to valuations table
    if (rawTransactions.length === 0) {
      const { data: valRows } = await supabase
        .from('valuations')
        .select('*')
        .eq('entity_id', holdingId)
        .eq('user_id', user.id)
        .in('entity_type', ['holding_tx_buy', 'holding_tx_sell', 'holding_tx_dividend'])
        .order('valuation_date', { ascending: true })

      if (valRows && valRows.length > 0) {
        rawTransactions = valRows.map((v: Record<string, unknown>) => {
          const txType = (v.entity_type as string).replace('holding_tx_', '') as 'buy' | 'sell' | 'dividend'
          let units = 1
          let pricePerUnit = Number(v.value) || 0
          let notes: string | null = null
          try {
            const meta = JSON.parse(v.notes as string || '{}')
            units = meta.units ?? 1
            pricePerUnit = meta.price_per_unit ?? pricePerUnit
            notes = meta.notes ?? null
          } catch {
            notes = v.notes as string || null
          }
          return {
            id: v.id as string,
            holding_id: v.entity_id as string,
            user_id: v.user_id as string,
            type: txType,
            units,
            price_per_unit: pricePerUnit,
            total_amount: Number(v.value) || 0,
            date: v.valuation_date as string,
            notes,
            created_at: v.created_at as string,
          }
        })
        source = 'valuations_fallback'
      }
    }

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

    if (!type || !units || !price_per_unit || !date) {
      return NextResponse.json({
        error: 'type, units, price_per_unit, and date are required',
      }, { status: 400 })
    }

    if (!['buy', 'sell', 'dividend'].includes(type)) {
      return NextResponse.json({ error: 'type must be buy, sell, or dividend' }, { status: 400 })
    }

    const numUnits = Number(units)
    const numPrice = Number(price_per_unit)
    const totalAmount = numUnits * numPrice

    const hasTable = await tableExists(supabase, 'holding_transactions')
    const hasHoldingsTable = await tableExists(supabase, 'holdings')

    let transaction = null
    let source = 'no_table'

    if (hasTable) {
      const { data, error } = await supabase
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

      transaction = data
      source = 'holding_transactions_table'
    } else {
      // Fallback: store in valuations table
      const entityType = `holding_tx_${type}`
      const metaNotes = JSON.stringify({
        units: numUnits,
        price_per_unit: numPrice,
        notes: notes || null,
      })

      const { data: valRow, error: valError } = await supabase
        .from('valuations')
        .insert({
          user_id: user.id,
          entity_type: entityType,
          entity_id: holdingId,
          valuation_date: date,
          value: totalAmount,
          notes: metaNotes,
        })
        .select()
        .single()

      if (valError) {
        return NextResponse.json({ error: valError.message }, { status: 500 })
      }

      transaction = {
        id: valRow.id,
        holding_id: holdingId,
        user_id: user.id,
        type,
        units: numUnits,
        price_per_unit: numPrice,
        total_amount: totalAmount,
        date,
        notes: notes || null,
        created_at: valRow.created_at,
      }
      source = 'valuations_fallback'
    }

    // Update the holding's units and avg_purchase_price
    if (hasHoldingsTable) {
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
