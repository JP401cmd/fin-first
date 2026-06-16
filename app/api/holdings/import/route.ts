import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { syncAssetValueFromInvestmentHoldings } from '@/lib/holdings-sync'

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
  external_trade_id?: string | null
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
  external_trade_id?: string | null
}

// Import mode:
// - 'append'   (default): legacy behaviour — match across ALL of the user's
//   active holdings and ADD units to any match. Backward-compatible.
// - 'snapshot': the CSV is treated as the COMPLETE portfolio of a single asset.
//   Matches REPLACE units/prices (no accumulation), unmatched holdings of that
//   asset are soft-deactivated (sold), so re-uploading the same file is idempotent.
type ImportMode = 'snapshot' | 'append'

interface ImportRequestBody {
  holdings: ImportHolding[]
  transactions: ImportTransaction[]
  broker: string
  // Optional; defaults to 'append'. Snapshot mode requires targetAssetId.
  mode?: ImportMode
  // The asset a snapshot import reconciles against. Required for 'snapshot'.
  targetAssetId?: string
}

const VALID_BROKERS = ['degiro', 'saxo', 'ing_beleggen', 'trading212', 'etoro']
const VALID_TX_TYPES = ['buy', 'sell', 'dividend']
const VALID_MODES: ImportMode[] = ['snapshot', 'append']

// Simple RFC 4122 UUID shape check — targetAssetId must be a uuid.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
// POST /api/holdings/import — Bulk import investment_holdings + investment_transactions
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

    // --- Resolve import mode (default 'append' = backward-compatible) ---

    const mode: ImportMode = body.mode ?? 'append'
    if (!VALID_MODES.includes(mode)) {
      return NextResponse.json({
        error: `Mode moet een van de volgende zijn: ${VALID_MODES.join(', ')}`,
      }, { status: 400 })
    }

    // Snapshot mode reconciles a single asset's complete portfolio, so it MUST
    // be told which asset. Validate the shape and the ownership up front.
    let snapshotAssetId: string | null = null
    if (mode === 'snapshot') {
      if (!body.targetAssetId || typeof body.targetAssetId !== 'string') {
        return NextResponse.json({
          error: 'Snapshot-import vereist een doel-asset (targetAssetId)',
        }, { status: 400 })
      }
      if (!UUID_RE.test(body.targetAssetId)) {
        return NextResponse.json({
          error: 'targetAssetId moet een geldige uuid zijn',
        }, { status: 400 })
      }
      // Ownership check: the target asset must belong to the current user.
      const { data: targetAsset } = await supabase
        .from('assets')
        .select('id')
        .eq('id', body.targetAssetId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!targetAsset) {
        return NextResponse.json({
          error: 'Doel-asset niet gevonden',
        }, { status: 404 })
      }
      snapshotAssetId = targetAsset.id
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
      .in('asset_type', ['investment', 'savings'])
      .limit(1)
      .single()
    defaultAssetId = investmentAsset?.id || null

    // --- Fetch existing active investment_holdings for duplicate detection ---
    //
    // Append mode: match across ALL of the user's active holdings (legacy).
    // Snapshot mode: scope strictly to the target asset, so reconciliation only
    // ever touches that asset's holdings.

    let existingQuery = supabase
      .from('investment_holdings')
      .select('id, ticker, isin, units, avg_purchase_price, asset_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
    if (mode === 'snapshot' && snapshotAssetId) {
      existingQuery = existingQuery.eq('asset_id', snapshotAssetId)
    }
    const { data: existingHoldings } = await existingQuery

    type ExistingRow = {
      id: string
      ticker: string | null
      isin: string | null
      units: number
      avg_purchase_price: number | null
      asset_id: string | null
    }

    const existingByIsin = new Map<string, ExistingRow>()
    const existingByTicker = new Map<string, ExistingRow>()

    if (existingHoldings) {
      for (const h of existingHoldings as ExistingRow[]) {
        if (h.isin) existingByIsin.set(h.isin.toUpperCase(), h)
        if (h.ticker) existingByTicker.set(h.ticker.toUpperCase(), h)
      }
    }

    // --- Process holdings ---

    let holdingsCreated = 0
    let holdingsUpdated = 0
    let holdingsDeactivated = 0
    let transactionsCreated = 0
    // Maps import index → created/updated holding ID
    const holdingIdMap = new Map<number, string>()
    // Track which asset_ids need syncing afterwards
    const assetIdsToSync = new Set<string>()
    // Snapshot reconciliation: IDs of existing holdings that the CSV matched.
    // Anything in the target asset NOT in this set has been sold → deactivate.
    const matchedExistingIds = new Set<string>()

    for (let i = 0; i < body.holdings.length; i++) {
      const h = body.holdings[i]
      const isinNorm = h.isin?.toUpperCase() || null
      const tickerNorm = h.ticker?.toUpperCase() || null

      // Check for existing duplicate by ISIN first, then by ticker.
      const existing = (isinNorm && existingByIsin.get(isinNorm))
        || (tickerNorm && existingByTicker.get(tickerNorm))
        || null

      if (existing) {
        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        }

        if (mode === 'snapshot') {
          // Snapshot: the CSV is the source of truth — REPLACE the position
          // (no accumulation) so a re-upload is idempotent. Re-activate in case
          // the holding was previously deactivated by an earlier snapshot.
          updates.units = h.units
          updates.avg_purchase_price = Math.round(h.avg_purchase_price * 100) / 100
          updates.is_active = true
        } else {
          // Append (legacy): add units, recalculate weighted average price.
          const oldUnits = existing.units
          const oldAvg = existing.avg_purchase_price ?? 0
          const newUnits = oldUnits + h.units
          // Weighted average purchase price.
          const newAvg = newUnits > 0
            ? ((oldAvg * oldUnits) + (h.avg_purchase_price * h.units)) / newUnits
            : 0
          updates.units = newUnits
          updates.avg_purchase_price = Math.round(newAvg * 100) / 100
        }

        // Update current_price if the import provides one.
        if (h.current_price !== null && h.current_price !== undefined) {
          updates.current_price = h.current_price
          updates.last_price_update = new Date().toISOString()
        }

        const { error: updateError } = await supabase
          .from('investment_holdings')
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
        matchedExistingIds.add(existing.id)

        if (existing.asset_id) assetIdsToSync.add(existing.asset_id)
      } else {
        // Create new holding. asset_id is NOT NULL.
        // Snapshot: always pin to the target asset (never the default/bucket).
        // Append: keep legacy precedence with broker-named bucket fallback.
        let resolvedAssetId = mode === 'snapshot'
          ? snapshotAssetId
          : (h.asset_id || defaultAssetId)
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
          .from('investment_holdings')
          .insert({
            user_id: user.id,
            asset_id: resolvedAssetId,
            name: h.name.trim(),
            ticker: (h.ticker?.trim() || h.name.trim()),
            isin: h.isin || null,
            exchange: h.exchange || null,
            units: h.units,
            avg_purchase_price: h.avg_purchase_price,
            current_price: h.current_price ?? null,
            purchase_date: h.purchase_date || null,
            currency: 'EUR',
            external_source: body.broker,
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

        // Update lookup maps so subsequent imports in the same batch detect duplicates.
        const newRow: ExistingRow = {
          id: created.id,
          ticker: h.ticker || null,
          isin: h.isin || null,
          units: h.units,
          avg_purchase_price: h.avg_purchase_price,
          asset_id: created.asset_id,
        }
        if (isinNorm) existingByIsin.set(isinNorm, newRow)
        if (tickerNorm) existingByTicker.set(tickerNorm, newRow)
      }
    }

    // --- Snapshot reconciliation: soft-deactivate sold positions ---
    //
    // Any holding that lived in the target asset but did NOT appear in the CSV
    // has been sold. Zero it out and deactivate (kept for history, excluded from
    // the value rollup). Append mode never deactivates anything.
    if (mode === 'snapshot' && snapshotAssetId && existingHoldings) {
      const soldIds = (existingHoldings as ExistingRow[])
        .filter((row) => !matchedExistingIds.has(row.id))
        .map((row) => row.id)

      if (soldIds.length > 0) {
        const { error: deactivateError } = await supabase
          .from('investment_holdings')
          .update({ units: 0, is_active: false, updated_at: new Date().toISOString() })
          .in('id', soldIds)
          .eq('user_id', user.id)

        if (deactivateError) {
          return NextResponse.json({
            error: `Fout bij deactiveren verkochte holdings: ${deactivateError.message}`,
          }, { status: 500 })
        }
        holdingsDeactivated = soldIds.length
        assetIdsToSync.add(snapshotAssetId)
      }
    }

    // --- Process transactions ---

    if (body.transactions.length > 0) {
      const txRows = body.transactions
        .filter((tx) => {
          // date is NOT NULL in the schema — skip transactions without a date.
          return tx.date && tx.date.trim().length > 0
        })
        .map((tx) => {
          const holdingId = holdingIdMap.get(tx.holding_index)
          if (!holdingId) {
            throw new Error(`Geen holding gevonden voor holding_index ${tx.holding_index}`)
          }
          // External_trade_id is optional; when absent we leave it NULL so the
          // partial-unique index still allows multiple rows from the same broker
          // for the same security.
          const externalTradeId = tx.external_trade_id || null
          return {
            user_id: user.id,
            holding_id: holdingId,
            type: tx.type,
            units: tx.units,
            price_per_unit: tx.price_per_unit,
            total_amount: tx.total_amount,
            currency: 'EUR',
            date: tx.date as string,
            notes: tx.notes || null,
            external_source: body.broker,
            external_trade_id: externalTradeId,
          }
        })

      // Split rows: those with an external_trade_id go through upsert (idempotent
      // re-imports), the rest through plain insert (no dedup possible).
      const upsertRows = txRows.filter((r) => r.external_trade_id != null)
      // Snapshot mode must stay idempotent: a plain insert (no external_trade_id)
      // would duplicate the same mutation on every re-upload. So in snapshot we
      // only persist rows that CAN be deduped (have an external_trade_id) and
      // skip the plain-insert path entirely. Append keeps the legacy behaviour.
      const insertRows = mode === 'snapshot'
        ? []
        : txRows.filter((r) => r.external_trade_id == null)

      if (upsertRows.length > 0) {
        const { error: upsertErr } = await supabase
          .from('investment_transactions')
          .upsert(upsertRows, { onConflict: 'external_source,external_trade_id', ignoreDuplicates: true })
        if (upsertErr) {
          return NextResponse.json({
            error: `Fout bij upserten transacties: ${upsertErr.message}`,
          }, { status: 500 })
        }
      }
      if (insertRows.length > 0) {
        const { error: insertErr } = await supabase
          .from('investment_transactions')
          .insert(insertRows)
        if (insertErr) {
          return NextResponse.json({
            error: `Fout bij aanmaken transacties: ${insertErr.message}`,
          }, { status: 500 })
        }
      }

      // Count only rows we actually persisted (upserts + any plain inserts).
      transactionsCreated = upsertRows.length + insertRows.length
    }

    // --- Sync asset values for all affected assets ---

    for (const assetId of Array.from(assetIdsToSync)) {
      await syncAssetValueFromInvestmentHoldings(supabase, assetId, user.id)
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
        holdings_deactivated: holdingsDeactivated,
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
