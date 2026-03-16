import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { syncAssetValueFromHoldings } from '@/lib/holdings-sync'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportHolding {
  name: string
  ticker: string | null
  isin: string | null
  units: number
  avg_purchase_price: number
  current_price: number | null
  purchase_date: string | null
  exchange: string | null
  asset_id: string | null
}

interface ImportTransaction {
  holding_index: number
  type: 'buy' | 'sell' | 'dividend'
  units: number
  price_per_unit: number
  total_amount: number
  date: string | null
  fees: number
  notes: string | null
}

interface ImportRequestBody {
  holdings: ImportHolding[]
  transactions: ImportTransaction[]
  broker: string
}

const VALID_BROKERS = ['degiro', 'saxo', 'ing_beleggen']
const VALID_TX_TYPES = ['buy', 'sell', 'dividend']

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateHolding(h: unknown, index: number): string | null {
  if (!h || typeof h !== 'object') {
    return `Holding ${index}: moet een object zijn`
  }
  const obj = h as Record<string, unknown>

  if (!obj.name || typeof obj.name !== 'string' || obj.name.trim().length === 0) {
    return `Holding ${index}: naam is verplicht`
  }
  if (typeof obj.units !== 'number' || isNaN(obj.units) || obj.units < 0) {
    return `Holding ${index}: units moet een positief getal zijn`
  }
  if (typeof obj.avg_purchase_price !== 'number' || isNaN(obj.avg_purchase_price) || obj.avg_purchase_price < 0) {
    return `Holding ${index}: avg_purchase_price moet een positief getal zijn`
  }
  if (obj.current_price !== null && obj.current_price !== undefined) {
    if (typeof obj.current_price !== 'number' || isNaN(obj.current_price) || obj.current_price < 0) {
      return `Holding ${index}: current_price moet een positief getal of null zijn`
    }
  }
  return null
}

function validateTransaction(tx: unknown, index: number, holdingsLength: number): string | null {
  if (!tx || typeof tx !== 'object') {
    return `Transactie ${index}: moet een object zijn`
  }
  const obj = tx as Record<string, unknown>

  if (typeof obj.holding_index !== 'number' || obj.holding_index < 0 || obj.holding_index >= holdingsLength) {
    return `Transactie ${index}: holding_index (${obj.holding_index}) valt buiten bereik (0-${holdingsLength - 1})`
  }
  if (!obj.type || !VALID_TX_TYPES.includes(obj.type as string)) {
    return `Transactie ${index}: type moet 'buy', 'sell' of 'dividend' zijn`
  }
  if (typeof obj.units !== 'number' || isNaN(obj.units) || obj.units < 0) {
    return `Transactie ${index}: units moet een positief getal zijn`
  }
  if (typeof obj.price_per_unit !== 'number' || isNaN(obj.price_per_unit) || obj.price_per_unit < 0) {
    return `Transactie ${index}: price_per_unit moet een positief getal zijn`
  }
  if (typeof obj.total_amount !== 'number' || isNaN(obj.total_amount)) {
    return `Transactie ${index}: total_amount moet een getal zijn`
  }
  if (typeof obj.fees !== 'number' || isNaN(obj.fees) || obj.fees < 0) {
    return `Transactie ${index}: fees moet een positief getal zijn`
  }
  return null
}

// ---------------------------------------------------------------------------
// POST /api/holdings/import — Bulk import holdings and transactions
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    let body: ImportRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Ongeldig JSON-formaat in request body' }, { status: 400 })
    }

    // --- Top-level validation ---

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body moet een JSON-object zijn' }, { status: 400 })
    }

    if (!Array.isArray(body.holdings) || body.holdings.length === 0) {
      return NextResponse.json({ error: 'Holdings array is verplicht en mag niet leeg zijn' }, { status: 400 })
    }

    if (!Array.isArray(body.transactions)) {
      return NextResponse.json({ error: 'Transactions moet een array zijn' }, { status: 400 })
    }

    if (!body.broker || !VALID_BROKERS.includes(body.broker)) {
      return NextResponse.json({
        error: `Broker moet een van de volgende zijn: ${VALID_BROKERS.join(', ')}`,
      }, { status: 400 })
    }

    // --- Validate individual holdings ---

    for (let i = 0; i < body.holdings.length; i++) {
      const err = validateHolding(body.holdings[i], i)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    }

    // --- Validate individual transactions ---

    for (let i = 0; i < body.transactions.length; i++) {
      const err = validateTransaction(body.transactions[i], i, body.holdings.length)
      if (err) return NextResponse.json({ error: err }, { status: 400 })
    }

    // --- Resolve a default asset_id for linking holdings ---

    let defaultAssetId: string | null = null
    const { data: investmentAsset } = await supabase
      .from('assets')
      .select('id')
      .eq('user_id', user.id)
      .in('asset_type', ['investment', 'crypto', 'savings'])
      .limit(1)
      .single()
    defaultAssetId = investmentAsset?.id || null

    // --- Fetch existing active holdings for duplicate detection ---

    const { data: existingHoldings } = await supabase
      .from('holdings')
      .select('id, ticker, isin, units, avg_purchase_price, asset_id')
      .eq('user_id', user.id)
      .eq('is_active', true)

    const existingByIsin = new Map<string, (typeof existingHoldings extends (infer T)[] | null ? T : never)>()
    const existingByTicker = new Map<string, (typeof existingHoldings extends (infer T)[] | null ? T : never)>()

    if (existingHoldings) {
      for (const h of existingHoldings) {
        if (h.isin) existingByIsin.set(h.isin.toUpperCase(), h)
        if (h.ticker) existingByTicker.set(h.ticker.toUpperCase(), h)
      }
    }

    // --- Process holdings ---

    let holdingsCreated = 0
    let holdingsUpdated = 0
    let transactionsCreated = 0
    // Maps import index → created/updated holding ID
    const holdingIdMap = new Map<number, string>()
    // Track which asset_ids need syncing afterwards
    const assetIdsToSync = new Set<string>()

    for (let i = 0; i < body.holdings.length; i++) {
      const h = body.holdings[i]
      const isinNorm = h.isin?.toUpperCase() || null
      const tickerNorm = h.ticker?.toUpperCase() || null

      // Check for existing duplicate by ISIN first, then by ticker
      const existing = (isinNorm && existingByIsin.get(isinNorm))
        || (tickerNorm && existingByTicker.get(tickerNorm))
        || null

      if (existing) {
        // Merge into existing holding: add units, recalculate weighted average price
        const oldUnits = existing.units
        const oldAvg = existing.avg_purchase_price
        const newUnits = oldUnits + h.units
        // Weighted average purchase price
        const newAvg = newUnits > 0
          ? ((oldAvg * oldUnits) + (h.avg_purchase_price * h.units)) / newUnits
          : 0

        const updates: Record<string, unknown> = {
          units: newUnits,
          avg_purchase_price: Math.round(newAvg * 100) / 100,
          updated_at: new Date().toISOString(),
        }
        // Update current_price if the import provides one
        if (h.current_price !== null && h.current_price !== undefined) {
          updates.current_price = h.current_price
          updates.last_price_update = new Date().toISOString()
        }

        const { error: updateError } = await supabase
          .from('holdings')
          .update(updates)
          .eq('id', existing.id)
          .eq('user_id', user.id)

        if (updateError) {
          return NextResponse.json({
            error: `Fout bij bijwerken holding "${h.name}": ${updateError.message}`,
          }, { status: 500 })
        }

        holdingIdMap.set(i, existing.id)
        holdingsUpdated++

        if (existing.asset_id) assetIdsToSync.add(existing.asset_id)
      } else {
        // Create new holding
        const assetId = h.asset_id || defaultAssetId

        // asset_id is NOT NULL in the schema — we must have one.
        // If no default exists, create a generic investment asset first.
        let resolvedAssetId = h.asset_id || defaultAssetId
        if (!resolvedAssetId) {
          const { data: newAsset } = await supabase
            .from('assets')
            .insert({
              user_id: user.id,
              name: `${body.broker.toUpperCase()} Beleggingen`,
              asset_type: 'investment',
              current_value: 0,
              purchase_value: 0,
              expected_return: 7,
              monthly_contribution: 0,
              institution: body.broker,
            })
            .select('id')
            .single()
          if (newAsset) {
            defaultAssetId = newAsset.id
            resolvedAssetId = newAsset.id
          }
        }

        const { data: created, error: insertError } = await supabase
          .from('holdings')
          .insert({
            user_id: user.id,
            asset_id: resolvedAssetId,
            name: h.name.trim(),
            ticker: h.ticker || null,
            isin: h.isin || null,
            units: h.units,
            avg_purchase_price: h.avg_purchase_price,
            current_price: h.current_price ?? null,
            purchase_date: h.purchase_date || null,
            is_active: true,
          })
          .select('id, asset_id')
          .single()

        if (insertError || !created) {
          return NextResponse.json({
            error: `Fout bij aanmaken holding "${h.name}": ${insertError?.message || 'Onbekende fout'}`,
          }, { status: 500 })
        }

        holdingIdMap.set(i, created.id)
        holdingsCreated++

        if (created.asset_id) assetIdsToSync.add(created.asset_id)

        // Add to lookup maps so subsequent imports in the same batch detect duplicates
        if (isinNorm) {
          existingByIsin.set(isinNorm, {
            id: created.id,
            ticker: h.ticker || null,
            isin: h.isin || null,
            units: h.units,
            avg_purchase_price: h.avg_purchase_price,
            asset_id: created.asset_id,
          })
        }
        if (tickerNorm) {
          existingByTicker.set(tickerNorm, {
            id: created.id,
            ticker: h.ticker || null,
            isin: h.isin || null,
            units: h.units,
            avg_purchase_price: h.avg_purchase_price,
            asset_id: created.asset_id,
          })
        }
      }
    }

    // --- Process transactions ---

    if (body.transactions.length > 0) {
      const txRows = body.transactions
        .filter((tx) => {
          // date is NOT NULL in schema — skip transactions without a date
          return tx.date && tx.date.trim().length > 0
        })
        .map((tx) => {
          const holdingId = holdingIdMap.get(tx.holding_index)
          if (!holdingId) {
            throw new Error(`Geen holding gevonden voor holding_index ${tx.holding_index}`)
          }
          return {
            user_id: user.id,
            holding_id: holdingId,
            type: tx.type,
            units: tx.units,
            price_per_unit: tx.price_per_unit,
            total_amount: tx.total_amount,
            date: tx.date,
            notes: tx.notes || null,
          }
        })

      const { error: txError } = await supabase
        .from('holding_transactions')
        .insert(txRows)

      if (txError) {
        return NextResponse.json({
          error: `Fout bij aanmaken transacties: ${txError.message}`,
        }, { status: 500 })
      }

      transactionsCreated = txRows.length
    }

    // --- Sync asset values for all affected assets ---

    for (const assetId of Array.from(assetIdsToSync)) {
      await syncAssetValueFromHoldings(supabase, assetId, user.id)
    }

    // --- Calculate total imported value ---

    const totalValue = body.holdings.reduce((sum, h) => {
      const price = h.current_price ?? h.avg_purchase_price
      return sum + (price * h.units)
    }, 0)

    return NextResponse.json({
      success: true,
      summary: {
        holdings_created: holdingsCreated,
        holdings_updated: holdingsUpdated,
        transactions_created: transactionsCreated,
        total_value: Math.round(totalValue * 100) / 100,
        broker: body.broker,
      },
    }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout bij importeren'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
