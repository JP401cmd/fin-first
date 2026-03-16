import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { syncAssetValueFromHoldings } from '@/lib/holdings-sync'

/**
 * Check if the holding_transactions table exists.
 */
async function holdingTransactionsTableExists(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { error } = await supabase.from('holding_transactions').select('id').limit(0)
  return !error || !error.message.includes('Could not find')
}

/**
 * Check if the holdings table exists.
 */
async function holdingsTableExists(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { error } = await supabase.from('holdings').select('id').limit(0)
  return !error || !error.message.includes('Could not find')
}

/**
 * GET /api/holding-transactions?holding_id=<uuid>
 *
 * List transactions for a specific holding.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const holdingId = searchParams.get('holding_id')

  if (!holdingId) {
    return NextResponse.json({ error: 'holding_id is verplicht' }, { status: 400 })
  }

  try {
    const hasTable = await holdingTransactionsTableExists(supabase)

    if (hasTable) {
      const { data: transactions, error } = await supabase
        .from('holding_transactions')
        .select('*')
        .eq('holding_id', holdingId)
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) {
        return NextResponse.json({ transactions: [], source: 'empty', error: error.message })
      }

      return NextResponse.json({
        transactions: transactions || [],
        source: 'holding_transactions_table',
      })
    }

    // Fallback: use valuations table to store holding transactions
    // entity_type pattern: 'holding_tx_buy', 'holding_tx_sell', 'holding_tx_dividend'
    const { data: valRows, error: valError } = await supabase
      .from('valuations')
      .select('*')
      .eq('entity_id', holdingId)
      .eq('user_id', user.id)
      .in('entity_type', ['holding_tx_buy', 'holding_tx_sell', 'holding_tx_dividend'])
      .order('valuation_date', { ascending: false })

    if (valError) {
      return NextResponse.json({ transactions: [], source: 'valuations_fallback', error: valError.message })
    }

    // Map valuations to holding transaction shape
    const transactions = (valRows || []).map((v: Record<string, unknown>) => {
      const txType = (v.entity_type as string).replace('holding_tx_', '') as 'buy' | 'sell' | 'dividend'
      // Parse notes JSON for units and price_per_unit
      let units = 1
      let pricePerUnit = Number(v.value) || 0
      let notes: string | null = null
      try {
        const meta = JSON.parse(v.notes as string || '{}')
        units = meta.units ?? 1
        pricePerUnit = meta.price_per_unit ?? pricePerUnit
        notes = meta.notes ?? null
      } catch {
        // notes is plain text
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

    return NextResponse.json({
      transactions,
      source: 'valuations_fallback',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/holding-transactions
 *
 * Record a buy/sell/dividend transaction for a holding.
 *
 * Body: { holding_id, type: 'buy'|'sell'|'dividend', units, price_per_unit, date, notes? }
 *
 * After recording, updates the holding's units and avg_purchase_price.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { holding_id, type, units, price_per_unit, date, notes } = body

    if (!holding_id || !type || !units || !price_per_unit || !date) {
      return NextResponse.json({
        error: 'holding_id, type, units, price_per_unit, and date are required',
      }, { status: 400 })
    }

    if (!['buy', 'sell', 'dividend'].includes(type)) {
      return NextResponse.json({ error: 'type must be buy, sell, or dividend' }, { status: 400 })
    }

    const numUnits = Number(units)
    const numPrice = Number(price_per_unit)
    const totalAmount = numUnits * numPrice

    const hasTable = await holdingTransactionsTableExists(supabase)
    const hasHoldingsTable = await holdingsTableExists(supabase)

    let transaction = null
    let source = 'no_table'

    if (hasTable) {
      // Insert into holding_transactions table
      const { data, error } = await supabase
        .from('holding_transactions')
        .insert({
          holding_id,
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
      // Fallback: store in valuations table with entity_type='holding_tx_{type}'
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
          entity_id: holding_id,
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
        holding_id,
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

    // Update the holding's units (and optionally avg_purchase_price)
    if (hasHoldingsTable) {
      // Get current holding data (including asset_id for sync)
      const { data: holding } = await supabase
        .from('holdings')
        .select('id, units, avg_purchase_price, asset_id')
        .eq('id', holding_id)
        .eq('user_id', user.id)
        .single()

      if (holding) {
        const currentUnits = Number(holding.units)
        const currentAvg = Number(holding.avg_purchase_price)
        let newUnits = currentUnits
        let newAvg = currentAvg

        if (type === 'buy') {
          // Weighted average price: (currentUnits * currentAvg + newUnits * newPrice) / totalUnits
          newUnits = currentUnits + numUnits
          newAvg = newUnits > 0
            ? (currentUnits * currentAvg + numUnits * numPrice) / newUnits
            : numPrice
        } else if (type === 'sell') {
          newUnits = Math.max(0, currentUnits - numUnits)
          // avg_purchase_price stays the same for sells
        }
        // dividend doesn't change units

        const { error: updateErr } = await supabase
          .from('holdings')
          .update({
            units: newUnits,
            avg_purchase_price: parseFloat(newAvg.toFixed(4)),
            updated_at: new Date().toISOString(),
          })
          .eq('id', holding_id)
          .eq('user_id', user.id)

        if (updateErr) {
          return NextResponse.json({
            transaction,
            source,
            warning: `Transaction recorded but holding update failed: ${updateErr.message}`,
            holding_updated: false,
          }, { status: 201 })
        }

        // Sync parent asset's current_value from all holdings
        // Portfolio tracker is source of truth when holdings exist
        if (holding.asset_id && (type === 'buy' || type === 'sell')) {
          await syncAssetValueFromHoldings(supabase, holding.asset_id, user.id)
        }

        return NextResponse.json({
          transaction,
          source,
          holding_updated: true,
          new_units: newUnits,
          new_avg_price: parseFloat(newAvg.toFixed(4)),
          asset_synced: !!holding.asset_id && (type === 'buy' || type === 'sell'),
        }, { status: 201 })
      }
    } else {
      // Fallback: update the asset in the assets table
      const { data: asset } = await supabase
        .from('assets')
        .select('id, current_value, purchase_value')
        .eq('id', holding_id)
        .eq('user_id', user.id)
        .single()

      if (asset) {
        const currentValue = Number(asset.current_value)
        const purchaseValue = Number(asset.purchase_value)

        let newPurchaseValue = purchaseValue
        let newCurrentValue = currentValue

        if (type === 'buy') {
          newPurchaseValue = purchaseValue + totalAmount
          newCurrentValue = currentValue + totalAmount
        } else if (type === 'sell') {
          newPurchaseValue = Math.max(0, purchaseValue - totalAmount)
          newCurrentValue = Math.max(0, currentValue - totalAmount)
        }

        await supabase
          .from('assets')
          .update({
            purchase_value: newPurchaseValue,
            current_value: newCurrentValue,
            updated_at: new Date().toISOString(),
          })
          .eq('id', holding_id)
          .eq('user_id', user.id)

        return NextResponse.json({
          transaction,
          source: source + '_assets_updated',
          holding_updated: true,
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

/**
 * Replay all transactions for a holding chronologically and compute the final
 * units and avg_purchase_price. This is the single source of truth after any
 * transaction mutation (especially DELETE).
 *
 * Rules:
 *   - buy: weighted average price, units increase
 *   - sell: units decrease, avg stays the same
 *   - dividend: no effect on units/avg
 */
function replayTransactions(
  transactions: Array<{ type: string; units: number; price_per_unit: number; date: string; created_at: string }>
): { units: number; avgPurchasePrice: number } {
  // Sort chronologically (ascending by date, then created_at)
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
      // avg_purchase_price stays the same for sells
      if (units <= 0) {
        units = 0
        avgPrice = 0
      }
    }
    // dividend: no effect on units/avg_purchase_price
  }

  return {
    units: parseFloat(units.toFixed(6)),
    avgPurchasePrice: parseFloat(avgPrice.toFixed(4)),
  }
}

/**
 * DELETE /api/holding-transactions?id=<uuid>
 *
 * Delete a holding transaction and replay remaining transactions to recalculate
 * the holding's units and avg_purchase_price.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID is verplicht' }, { status: 400 })
  }

  try {
    const hasTable = await holdingTransactionsTableExists(supabase)
    const hasHoldingsTable = await holdingsTableExists(supabase)

    let holdingId: string | null = null

    if (hasTable) {
      // 1. Get the transaction before deleting (to know the holding_id)
      const { data: txToDelete } = await supabase
        .from('holding_transactions')
        .select('holding_id')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()

      holdingId = txToDelete?.holding_id || null

      // 2. Delete the transaction
      const { error } = await supabase
        .from('holding_transactions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // 3. Replay remaining transactions to recalculate holding
      if (holdingId && hasHoldingsTable) {
        const { data: remaining } = await supabase
          .from('holding_transactions')
          .select('type, units, price_per_unit, date, created_at')
          .eq('holding_id', holdingId)
          .eq('user_id', user.id)
          .order('date', { ascending: true })
          .order('created_at', { ascending: true })

        const { units: newUnits, avgPurchasePrice: newAvg } = replayTransactions(remaining || [])

        // 4. Update the holding with recalculated values
        const { error: updateErr } = await supabase
          .from('holdings')
          .update({
            units: newUnits,
            avg_purchase_price: newAvg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', holdingId)
          .eq('user_id', user.id)

        // 5. Sync parent asset value
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
      }
    } else {
      // Fallback: get holding_id from valuations before deleting
      const { data: valToDelete } = await supabase
        .from('valuations')
        .select('entity_id')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()

      holdingId = valToDelete?.entity_id || null

      // Delete from valuations table
      const { error } = await supabase
        .from('valuations')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Replay from remaining valuations
      if (holdingId && hasHoldingsTable) {
        const { data: valRows } = await supabase
          .from('valuations')
          .select('*')
          .eq('entity_id', holdingId)
          .eq('user_id', user.id)
          .in('entity_type', ['holding_tx_buy', 'holding_tx_sell', 'holding_tx_dividend'])
          .order('valuation_date', { ascending: true })

        // Map valuations to transaction shape for replay
        const remaining = (valRows || []).map((v: Record<string, unknown>) => {
          const txType = (v.entity_type as string).replace('holding_tx_', '')
          let units = 1
          let pricePerUnit = Number(v.value) || 0
          try {
            const meta = JSON.parse(v.notes as string || '{}')
            units = meta.units ?? 1
            pricePerUnit = meta.price_per_unit ?? pricePerUnit
          } catch {
            // plain text notes
          }
          return {
            type: txType,
            units,
            price_per_unit: pricePerUnit,
            date: v.valuation_date as string,
            created_at: v.created_at as string,
          }
        })

        const { units: newUnits, avgPurchasePrice: newAvg } = replayTransactions(remaining)

        await supabase
          .from('holdings')
          .update({
            units: newUnits,
            avg_purchase_price: newAvg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', holdingId)
          .eq('user_id', user.id)

        // Sync parent asset
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
          holding_updated: true,
          new_units: newUnits,
          new_avg_price: newAvg,
          asset_synced: !!holding?.asset_id,
        })
      }
    }

    return NextResponse.json({ success: true, holding_updated: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
