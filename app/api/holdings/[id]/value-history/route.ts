import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { backfillHoldingPrices } from '@/lib/historical-prices'
import { resolveHolding, type HoldingTables } from '@/lib/holdings-table-resolver'

/**
 * GET /api/holdings/[id]/value-history
 *
 * Returns a time-series of the holding's value over time.
 *
 * Polymorf na de tabel-split (migratie 20260502000003): kijkt parallel in
 * `investment_holdings`/`crypto_holdings` voor de holding, en queryt
 * vervolgens de bijbehorende `*_holding_prices` + `*_transactions` tabel.
 *
 * Primary: gebruikt `*_holding_prices` voor een realistische dagelijkse curve.
 * Fallback: bouwt uit transactions met rechte interpolatie.
 *
 * Bij investment-holdings met ticker maar zonder opgeslagen prijzen wordt
 * een Yahoo-Finance backfill gestart (fire-and-forget). Crypto-holdings
 * krijgen die backfill (nog) niet — die data komt via de exchange-sync.
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
    const resolved = await resolveHolding(supabase, holdingId, user.id)
    if (!resolved) {
      return NextResponse.json({ error: 'Holding niet gevonden' }, { status: 404 })
    }

    const holding = resolved.holding
    const tables = resolved.tables

    // --- Try price-based history first ---
    const priceHistory = await buildPriceBasedHistory(supabase, holding, tables, user.id)

    if (priceHistory && priceHistory.length >= 2) {
      const currentPrice = Number(holding.current_price) || Number(holding.avg_purchase_price) || 0
      const currentUnits = Number(holding.units) || 0

      return NextResponse.json({
        holding_id: holdingId,
        holding_name: holding.name,
        ticker: (holding.ticker as string | undefined) ?? (holding.symbol as string | undefined) ?? null,
        history: priceHistory,
        // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
        current_value: parseFloat((currentPrice * currentUnits).toFixed(2)),
        current_units: currentUnits,
        current_price: currentPrice,
        source: tables.prices,
      })
    }

    // --- Fallback: transaction-based history ---
    const txHistory = await buildTransactionBasedHistory(supabase, holding, tables, user.id)

    // Backfill alleen voor investment-holdings — crypto-prijzen komen via
    // exchange-sync / coingecko-pad dat (nog) niet via deze backfill loopt.
    const ticker = holding.ticker as string | null | undefined
    if (resolved.bucket === 'investment' && ticker && (!priceHistory || priceHistory.length === 0)) {
      backfillHoldingPrices(supabase, holdingId, ticker, user.id, '1y').catch(() => {
        // Silently fail — backfill is best-effort
      })
    }

    const currentPrice = Number(holding.current_price) || Number(holding.avg_purchase_price) || 0
    const currentUnits = Number(holding.units) || 0

    return NextResponse.json({
      holding_id: holdingId,
      holding_name: holding.name,
      ticker: ticker ?? (holding.symbol as string | undefined) ?? null,
      history: txHistory,
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      current_value: parseFloat((currentPrice * currentUnits).toFixed(2)),
      current_units: currentUnits,
      current_price: currentPrice,
      source: tables.transactions,
    })
  } catch {
    return NextResponse.json(
      { error: 'Er is een fout opgetreden' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// Price-based history
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
async function buildPriceBasedHistory(supabase: any, holding: any, tables: HoldingTables, userId: string): Promise<HistoryPoint[] | null> {
  try {
    const { data: prices, error } = await supabase
      .from(tables.prices)
      .select('date, close_price')
      .eq('holding_id', holding.id)
      .order('date', { ascending: true })

    if (error || !prices || prices.length === 0) {
      return null
    }

    const { data: transactions } = await supabase
      .from(tables.transactions)
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

    const txEvents: Array<{ date: string; unitsAfter: number; costBasisAfter: number }> = []
    let runningUnits = 0
    let runningCostBasis = 0

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

    function getUnitsAndCostOnDate(date: string): { units: number; costBasis: number } {
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
        // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
        value: parseFloat((units * closePrice).toFixed(2)),
        // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
        units: parseFloat(units.toFixed(6)),
        price: closePrice,
        event: 'Koers',
        // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
        cost_basis: parseFloat(costBasis.toFixed(2)),
      })
    }

    const lastPrice = prices[prices.length - 1]
    const lastInHistory = history[history.length - 1]
    if (lastPrice && (!lastInHistory || lastInHistory.date !== lastPrice.date)) {
      const closePrice = Number(lastPrice.close_price)
      const { units, costBasis } = getUnitsAndCostOnDate(lastPrice.date)
      if (units > 0) {
        history.push({
          date: lastPrice.date,
          // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
          value: parseFloat((units * closePrice).toFixed(2)),
          // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
          units: parseFloat(units.toFixed(6)),
          price: closePrice,
          event: 'Koers',
          // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
          cost_basis: parseFloat(costBasis.toFixed(2)),
        })
      }
    }

    const currentPrice = Number(holding.current_price) || Number(holding.avg_purchase_price) || 0
    const currentUnits = Number(holding.units) || 0
    const today = new Date().toISOString().split('T')[0]

    if (currentUnits > 0 && (!lastInHistory || lastInHistory.date !== today)) {
      history.push({
        date: today,
        // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
        value: parseFloat((currentUnits * currentPrice).toFixed(2)),
        units: currentUnits,
        price: currentPrice,
        event: 'Huidig',
        // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
        cost_basis: parseFloat((currentUnits * (Number(holding.avg_purchase_price) || 0)).toFixed(2)),
      })
    }

    return history.length >= 2 ? history : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Transaction-based fallback
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildTransactionBasedHistory(supabase: any, holding: any, tables: HoldingTables, userId: string): Promise<HistoryPoint[]> {
  const { data: transactions } = await supabase
    .from(tables.transactions)
    .select('*')
    .eq('holding_id', holding.id)
    .eq('user_id', userId)
    .order('date', { ascending: true })

  const txList = transactions || []

  const history: HistoryPoint[] = []
  let runningUnits = 0
  let runningCostBasis = 0

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

    const eventLabel = tx.type === 'buy'
      ? 'Koop'
      : tx.type === 'sell'
        ? 'Verkoop'
        : tx.type === 'dividend' || tx.type === 'reward'
          ? 'Dividend'
          : tx.type
    const valueAtEvent = runningUnits * pricePerUnit

    history.push({
      date: tx.date,
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      value: parseFloat(valueAtEvent.toFixed(2)),
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      units: parseFloat(runningUnits.toFixed(6)),
      price: pricePerUnit,
      event: eventLabel,
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      cost_basis: parseFloat(runningCostBasis.toFixed(2)),
    })
  }

  const currentPrice = Number(holding.current_price) || Number(holding.avg_purchase_price) || 0
  const currentUnits = Number(holding.units) || 0
  const currentValue = currentPrice * currentUnits
  const today = new Date().toISOString().split('T')[0]

  const lastEntry = history[history.length - 1]
  if (!lastEntry || lastEntry.date !== today) {
    history.push({
      date: today,
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      value: parseFloat(currentValue.toFixed(2)),
      units: currentUnits,
      price: currentPrice,
      event: 'Huidig',
      // eslint-disable-next-line no-restricted-syntax -- parseFloat(toFixed): zie [Arch F4] centrale afrondingshelpers
      cost_basis: parseFloat((currentUnits * (Number(holding.avg_purchase_price) || 0)).toFixed(2)),
    })
  }

  return history
}
