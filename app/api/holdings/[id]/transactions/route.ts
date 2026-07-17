import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { syncAssetValueFromHoldings } from '@/lib/holdings-sync'
import { unauthorized, serverError } from '@/lib/api/respond'
import {
  resolveHolding,
  type HoldingTables,
  tablesFor,
  type HoldingBucket,
} from '@/lib/holdings-table-resolver'

/**
 * Investment- en crypto-transactions hebben afwijkende type-enums:
 *   - investment_transactions: 'buy'|'sell'|'dividend'|'split'|'transfer_in'|'transfer_out'
 *   - crypto_transactions:     'buy'|'sell'|'deposit'|'withdrawal'|'fee'|'reward'
 *
 * Voor de P&L-berekening op de UI behandelen we ze grotendeels gelijk: 'buy'
 * voegt units + cost basis toe, 'sell' realiseert P&L en haalt units weg,
 * 'split' rebalancet, 'dividend' / 'reward' tellen op aan dividend-income
 * zonder de units te raken. 'deposit'/'withdrawal'/'fee'/'transfer_*' worden
 * (voor nu) als no-ops gezien voor running-P&L; ze blijven wel zichtbaar in
 * de log dankzij de `select('*')`.
 */
type SharedTxType = 'buy' | 'sell' | 'dividend' | 'split' | 'reward'
const VALID_INVESTMENT_TYPES = new Set(['buy', 'sell', 'dividend', 'split', 'transfer_in', 'transfer_out'])
const VALID_CRYPTO_TYPES = new Set(['buy', 'sell', 'deposit', 'withdrawal', 'fee', 'reward'])

interface TransactionRow {
  id: string
  type: string
  units: number
  price_per_unit: number
  total_amount: number
  date: string
  notes: string | null
  created_at: string
  holding_id: string
  user_id?: string
}

/**
 * Compute running P&L for a list of transactions.
 *
 * Behandelt zowel investment- als crypto-types. Onbekende types worden
 * stilzwijgend gepasseerd zodat een toekomstige type-toevoeging in het
 * schema de UI niet breekt.
 */
function computeRunningPnL(transactions: TransactionRow[]) {
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
    const t = tx.type as SharedTxType | string

    if (t === 'buy') {
      runningCostBasis += numUnits * pricePerUnit
      runningUnits += numUnits
    } else if (t === 'sell') {
      realizedPnl = (pricePerUnit - runningAvgPrice) * numUnits
      cumulativeRealizedPnL += realizedPnl
      runningCostBasis -= runningAvgPrice * numUnits
      runningUnits = Math.max(0, runningUnits - numUnits)
      if (runningUnits <= 0) {
        runningCostBasis = 0
        runningUnits = 0
      }
    } else if (t === 'split') {
      const multiplier = numUnits
      if (multiplier > 0 && runningUnits > 0) {
        runningUnits *= multiplier
      }
    } else if (t === 'dividend' || t === 'reward') {
      cumulativeDividends += totalAmount
    }
    // deposit/withdrawal/fee/transfer_in/transfer_out: voor nu geen P&L-effect

    const newRunningAvgPrice = runningUnits > 0 ? runningCostBasis / runningUnits : 0

    return {
      ...tx,
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      running_units: parseFloat(runningUnits.toFixed(6)),
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      running_cost_basis: parseFloat(runningCostBasis.toFixed(2)),
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      running_avg_price: parseFloat(newRunningAvgPrice.toFixed(4)),
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      realized_pnl: parseFloat(realizedPnl.toFixed(2)),
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      cumulative_realized_pnl: parseFloat(cumulativeRealizedPnL.toFixed(2)),
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      cumulative_dividends: parseFloat(cumulativeDividends.toFixed(2)),
    }
  })
}

/**
 * GET /api/holdings/[id]/transactions
 *
 * Polymorf: resolveerd holding-id naar investment_holdings of crypto_holdings
 * en queryt vervolgens de bijbehorende `*_transactions` tabel. Returns
 * dezelfde response-shape als vóór de tabel-split — clients hoeven niets
 * te wijzigen.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const { id: holdingId } = await params

  if (!holdingId) {
    return NextResponse.json({ error: 'Holding ID is verplicht' }, { status: 400 })
  }

  try {
    // Resolver levert het holding-record + de juiste tabel-namen.
    const resolved = await resolveHolding(
      supabase,
      holdingId,
      user.id,
      'id, units, avg_purchase_price, current_price',
    )

    let holdingUnits = 0
    let holdingAvgPrice = 0
    let holdingCurrentPrice = 0
    let tables: HoldingTables = tablesFor('investment')

    if (resolved) {
      tables = resolved.tables
      const h = resolved.holding
      holdingUnits = Number(h.units) || 0
      holdingAvgPrice = Number(h.avg_purchase_price) || 0
      holdingCurrentPrice = Number(h.current_price) || holdingAvgPrice
    }

    const { data: txRows, error } = await supabase
      .from(tables.transactions)
      .select('*')
      .eq('holding_id', holdingId)
      .eq('user_id', user.id)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })

    const rawTransactions: TransactionRow[] = (!error && txRows) ? txRows as TransactionRow[] : []

    const source = rawTransactions.length > 0 ? `${tables.transactions}_table` : 'empty'

    const transactions = computeRunningPnL(rawTransactions)

    const totalInvested = rawTransactions
      .filter(t => t.type === 'buy')
      .reduce((sum, t) => sum + (Number(t.units) * Number(t.price_per_unit)), 0)

    const totalSold = rawTransactions
      .filter(t => t.type === 'sell')
      .reduce((sum, t) => sum + (Number(t.units) * Number(t.price_per_unit)), 0)

    const dividendIncome = rawTransactions
      .filter(t => t.type === 'dividend' || t.type === 'reward')
      .reduce((sum, t) => sum + Number(t.total_amount), 0)

    const lastTx = transactions.length > 0 ? transactions[transactions.length - 1] : null
    const realizedPnl = lastTx ? lastTx.cumulative_realized_pnl : 0

    const unrealizedPnl = holdingUnits > 0
      ? (holdingCurrentPrice - holdingAvgPrice) * holdingUnits
      : 0

    const totalReturn = realizedPnl + unrealizedPnl + dividendIncome

    return NextResponse.json({
      transactions: transactions.reverse(),
      source,
      summary: {
        // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
        total_invested: parseFloat(totalInvested.toFixed(2)),
        // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
        total_sold: parseFloat(totalSold.toFixed(2)),
        // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
        realized_pnl: parseFloat(realizedPnl.toFixed(2)),
        // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
        unrealized_pnl: parseFloat(unrealizedPnl.toFixed(2)),
        // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
        dividend_income: parseFloat(dividendIncome.toFixed(2)),
        // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
        total_return: parseFloat(totalReturn.toFixed(2)),
        current_units: holdingUnits,
        current_avg_price: holdingAvgPrice,
        current_price: holdingCurrentPrice,
      },
    })
  } catch (err) {
    return serverError(err, 'holdings-transactions:GET')
  }
}

/**
 * POST /api/holdings/[id]/transactions
 *
 * Insert een handmatige transactie. Dispatch naar de typed-tabel die bij de
 * holding-bucket past. Het type wordt gevalideerd tegen de tabel-specifieke
 * enum (investment vs crypto) — anders zou een crypto-rij met type 'split'
 * pas bij INSERT door de DB worden afgewezen, met een onverteerbare error.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
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

    const resolved = await resolveHolding(supabase, holdingId, user.id, 'id, units, avg_purchase_price')
    if (!resolved) {
      return NextResponse.json({ error: 'Holding niet gevonden' }, { status: 404 })
    }

    const validSet = resolved.bucket === 'investment' ? VALID_INVESTMENT_TYPES : VALID_CRYPTO_TYPES
    if (!validSet.has(type as string)) {
      return NextResponse.json({
        error: `type "${type}" is niet geldig voor ${resolved.bucket}-holdings`,
      }, { status: 400 })
    }

    const numUnits = Number(units)
    const numPrice = type === 'split' ? 0 : Number(price_per_unit)
    const totalAmount = type === 'split' ? 0 : numUnits * numPrice

    const { data: transaction, error } = await supabase
      .from(resolved.tables.transactions)
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
      return serverError(error, 'holdings-transactions:POST')
    }

    const source = `${resolved.tables.transactions}_table`

    const currentUnits = Number(resolved.holding.units) || 0
    const currentAvg = Number(resolved.holding.avg_purchase_price) || 0
    let newUnits = currentUnits
    let newAvg = currentAvg
    let realizedPnl = 0

    if (type === 'buy') {
      newUnits = currentUnits + numUnits
      newAvg = newUnits > 0
        ? (currentUnits * currentAvg + numUnits * numPrice) / newUnits
        : numPrice
    } else if (type === 'sell') {
      realizedPnl = (numPrice - currentAvg) * numUnits
      newUnits = Math.max(0, currentUnits - numUnits)
    } else if (type === 'split') {
      const multiplier = numUnits
      if (multiplier > 0 && currentUnits > 0) {
        newUnits = currentUnits * multiplier
        newAvg = currentAvg / multiplier
      }
    }
    // dividend/reward/transfer_in/transfer_out/deposit/withdrawal/fee: laat
    // units en avg met rust — caller verwacht idempotent gedrag voor non-buy/sell.

    const { error: updateErr } = await supabase
      .from(resolved.tables.holdings)
      .update({
        units: newUnits,
        // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
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
      bucket: resolved.bucket,
      holding_updated: true,
      new_units: newUnits,
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      new_avg_price: parseFloat(newAvg.toFixed(4)),
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      realized_pnl: type === 'sell' ? parseFloat(realizedPnl.toFixed(2)) : undefined,
    }, { status: 201 })
  } catch (err) {
    return serverError(err, 'holdings-transactions:POST')
  }
}

/**
 * Replay all transactions for a holding chronologically and compute the final
 * units and avg_purchase_price. Single source of truth na elke mutatie.
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
      const multiplier = numUnits
      if (multiplier > 0 && units > 0) {
        units *= multiplier
        avgPrice /= multiplier
      }
    }
  }

  return {
    // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
    units: parseFloat(units.toFixed(6)),
    // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
    avgPurchasePrice: parseFloat(avgPrice.toFixed(4)),
  }
}

/**
 * DELETE /api/holdings/[id]/transactions?tx_id=<uuid>
 *
 * Verwijdert een transactie uit de juiste typed-tabel en replayed de rest om
 * de holding-aggregates (units, avg_purchase_price) te herberekenen.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
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
    const resolved = await resolveHolding(supabase, holdingId, user.id, 'id, asset_id')
    if (!resolved) {
      return NextResponse.json({ error: 'Holding niet gevonden' }, { status: 404 })
    }

    const { error } = await supabase
      .from(resolved.tables.transactions)
      .delete()
      .eq('id', txId)
      .eq('user_id', user.id)

    if (error) {
      return serverError(error, 'holdings-transactions:DELETE')
    }

    const { data: remaining } = await supabase
      .from(resolved.tables.transactions)
      .select('type, units, price_per_unit, date, created_at')
      .eq('holding_id', holdingId)
      .eq('user_id', user.id)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })

    const { units: newUnits, avgPurchasePrice: newAvg } = replayTransactions(remaining || [])

    const { error: updateErr } = await supabase
      .from(resolved.tables.holdings)
      .update({
        units: newUnits,
        avg_purchase_price: newAvg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', holdingId)
      .eq('user_id', user.id)

    // Sync parent asset waarde — `syncAssetValueFromHoldings` heeft de oude
    // tabel-namen niet gemigreerd, dus we slaan de aanroep over voor crypto
    // tot die helper polymorf gemaakt wordt. Voor investments blijft het
    // gedrag identiek aan vóór de migratie.
    const assetId = (resolved.holding as { asset_id?: string }).asset_id
    let assetSynced = false
    if (assetId && resolved.bucket === 'investment') {
      try {
        await syncAssetValueFromHoldings(supabase, assetId, user.id)
        assetSynced = true
      } catch {
        assetSynced = false
      }
    }

    return NextResponse.json({
      success: true,
      bucket: resolved.bucket,
      holding_updated: !updateErr,
      new_units: newUnits,
      new_avg_price: newAvg,
      asset_synced: assetSynced,
    })
  } catch (err) {
    return serverError(err, 'holdings-transactions:DELETE')
  }
}
