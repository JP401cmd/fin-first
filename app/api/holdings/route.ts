import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { syncAssetValueFromHoldings } from '@/lib/holdings-sync'

/**
 * Check if the holdings table exists by trying a lightweight query.
 * Returns true if the dedicated holdings table is available, false otherwise.
 */
async function holdingsTableExists(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { error } = await supabase.from('holdings').select('id').limit(0)
  return !error || !error.message.includes('Could not find')
}

/**
 * GET /api/holdings — List user's investment holdings.
 *
 * Primary: reads from the dedicated `holdings` table.
 * Fallback: if the holdings table doesn't exist yet, reads investment-type
 * assets from the `assets` table and maps them to a holdings-compatible shape.
 *
 * Query params:
 *   ?asset_id=<uuid> — filter holdings for a specific asset
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const assetIdFilter = searchParams.get('asset_id')

  try {
    const hasTable = await holdingsTableExists(supabase)

    if (hasTable) {
      let query = supabase
        .from('holdings')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (assetIdFilter) {
        query = query.eq('asset_id', assetIdFilter)
      }

      const { data: holdings, error } = await query

      if (error) {
        return NextResponse.json({
          holdings: [],
          total_value: 0,
          total_cost: 0,
          source: 'empty',
          message: 'Kon holdings niet laden',
        })
      }

      const totalValue = holdings.reduce((sum, h) => {
        const price = h.current_price ?? h.avg_purchase_price
        return sum + (price * h.units)
      }, 0)

      const totalCost = holdings.reduce((sum, h) => {
        return sum + (h.avg_purchase_price * h.units)
      }, 0)

      return NextResponse.json({
        holdings,
        total_value: totalValue,
        total_cost: totalCost,
        source: 'holdings_table',
      })
    }

    // Fallback: use assets table, filtering for investment-like types
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (assetsError) {
      return NextResponse.json({
        holdings: [],
        total_value: 0,
        total_cost: 0,
        source: 'empty',
        message: 'Kon holdings niet laden',
      })
    }

    // Map assets to holdings-compatible shape
    const holdings = (assets || []).map((a) => ({
      id: a.id,
      user_id: a.user_id,
      asset_id: a.id,
      ticker: a.ticker_symbol || null,
      isin: null,
      name: a.name,
      units: 1,
      avg_purchase_price: Number(a.purchase_value) || 0,
      current_price: Number(a.current_value) || 0,
      last_price_update: a.updated_at || null,
      purchase_date: a.purchase_date || null,
      notes: a.notes || null,
      is_active: true,
      created_at: a.created_at,
      updated_at: a.updated_at || a.created_at,
      // Extra fields from assets for display
      asset_type: a.asset_type,
      institution: a.institution,
      expected_return: a.expected_return,
      monthly_contribution: a.monthly_contribution,
    }))

    const totalValue = holdings.reduce((sum, h) => sum + (h.current_price || 0), 0)
    const totalCost = holdings.reduce((sum, h) => sum + (h.avg_purchase_price || 0), 0)

    return NextResponse.json({
      holdings,
      total_value: totalValue,
      total_cost: totalCost,
      source: 'assets_fallback',
    })
  } catch {
    return NextResponse.json({
      holdings: [],
      total_value: 0,
      total_cost: 0,
      source: 'empty',
    })
  }
}

/**
 * POST /api/holdings — Create a new holding.
 *
 * Primary: inserts into the dedicated `holdings` table.
 * Fallback: if the holdings table doesn't exist, creates an asset in the `assets` table.
 *
 * Expected body: { name, ticker?, isin?, units?, avg_purchase_price?, current_price?, purchase_date?, notes?, asset_type? }
 */
// In-memory idempotency cache: maps idempotency key → { response, timestamp }
// Keys expire after 5 minutes to prevent unbounded memory growth.
const idempotencyCache = new Map<string, { response: { body: Record<string, unknown>; status: number }; timestamp: number }>()
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000 // 5 minutes

function cleanExpiredIdempotencyKeys() {
  const now = Date.now()
  for (const [key, entry] of idempotencyCache.entries()) {
    if (now - entry.timestamp > IDEMPOTENCY_TTL_MS) {
      idempotencyCache.delete(key)
    }
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Idempotency key check: if the same key is submitted twice,
  // return the cached response instead of creating a duplicate holding
  const idempotencyKey = request.headers.get('X-Idempotency-Key')
  if (idempotencyKey) {
    const cacheKey = `${user.id}:${idempotencyKey}`
    cleanExpiredIdempotencyKeys()
    const cached = idempotencyCache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached.response.body, { status: cached.response.status })
    }
  }

  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Ongeldig JSON-formaat in request body' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body moet een JSON-object zijn' }, { status: 400 })
    }

    const { name, ticker, isin, units, avg_purchase_price, current_price, purchase_date, notes, asset_type } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Naam is verplicht en moet een niet-lege string zijn' }, { status: 400 })
    }

    // Validate numeric fields when provided
    if (units !== undefined && units !== null) {
      const n = Number(units)
      if (isNaN(n) || n < 0) {
        return NextResponse.json({ error: 'Units moet een positief getal zijn' }, { status: 400 })
      }
    }

    if (avg_purchase_price !== undefined && avg_purchase_price !== null) {
      const n = Number(avg_purchase_price)
      if (isNaN(n) || n < 0) {
        return NextResponse.json({ error: 'Gemiddelde aankoopprijs moet een positief getal zijn' }, { status: 400 })
      }
    }

    if (current_price !== undefined && current_price !== null) {
      const n = Number(current_price)
      if (isNaN(n) || n < 0) {
        return NextResponse.json({ error: 'Huidige prijs moet een positief getal zijn' }, { status: 400 })
      }
    }

    // Validate optional string fields
    if (ticker !== undefined && ticker !== null && typeof ticker !== 'string') {
      return NextResponse.json({ error: 'Ticker moet een string zijn' }, { status: 400 })
    }

    if (isin !== undefined && isin !== null && typeof isin !== 'string') {
      return NextResponse.json({ error: 'ISIN moet een string zijn' }, { status: 400 })
    }

    if (asset_type !== undefined && asset_type !== null && typeof asset_type !== 'string') {
      return NextResponse.json({ error: 'Asset type moet een string zijn' }, { status: 400 })
    }

    // Check if user wants to force-create despite duplicate warning
    const forceDuplicate = body.force_duplicate === true

    const hasTable = await holdingsTableExists(supabase)

    if (hasTable) {
      // Get a default asset_id (first investment asset, or null)
      let assetId = body.asset_id || null
      if (!assetId) {
        const { data: investmentAsset } = await supabase
          .from('assets')
          .select('id')
          .eq('user_id', user.id)
          .in('asset_type', ['investment', 'crypto', 'savings'])
          .limit(1)
          .single()
        assetId = investmentAsset?.id || null
      }

      // Check for duplicate ticker within the same asset (if ticker is provided)
      if (ticker && typeof ticker === 'string' && ticker.trim().length > 0 && !forceDuplicate) {
        const tickerNorm = ticker.trim().toUpperCase()

        // Build query: same user, same ticker, active holdings
        let dupeQuery = supabase
          .from('holdings')
          .select('id, name, ticker, asset_id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .ilike('ticker', tickerNorm)

        // If we have an asset_id, also check within the same asset
        if (assetId) {
          dupeQuery = dupeQuery.eq('asset_id', assetId)
        }

        const { data: duplicates } = await dupeQuery

        if (duplicates && duplicates.length > 0) {
          return NextResponse.json({
            warning: true,
            message: `Er bestaat al een actieve holding met ticker "${tickerNorm}"${assetId ? ' voor dit vermogensobject' : ''}. Wil je toch doorgaan?`,
            existing_holdings: duplicates.map((d) => ({
              id: d.id,
              name: d.name,
              ticker: d.ticker,
            })),
          }, { status: 409 })
        }
      }

      const { data: holding, error } = await supabase
        .from('holdings')
        .insert({
          user_id: user.id,
          asset_id: assetId,
          name,
          ticker: ticker || null,
          isin: isin || null,
          units: Number(units) || 1,
          avg_purchase_price: Number(avg_purchase_price) || 0,
          current_price: current_price != null ? Number(current_price) : null,
          purchase_date: purchase_date || null,
          notes: notes || null,
          is_active: true,
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Sync parent asset's current_value from all holdings
      if (holding && holding.asset_id) {
        await syncAssetValueFromHoldings(supabase, holding.asset_id, user.id)
      }

      const responseBody = { holding, source: 'holdings_table' }
      // Cache the successful response for idempotency
      if (idempotencyKey) {
        const cacheKey = `${user.id}:${idempotencyKey}`
        idempotencyCache.set(cacheKey, { response: { body: responseBody, status: 201 }, timestamp: Date.now() })
      }
      return NextResponse.json(responseBody, { status: 201 })
    }

    // Fallback: create an asset in the assets table
    // Check for duplicate ticker in assets fallback (if ticker is provided)
    if (ticker && typeof ticker === 'string' && ticker.trim().length > 0 && !forceDuplicate) {
      const tickerNorm = ticker.trim().toUpperCase()
      const { data: dupeAssets } = await supabase
        .from('assets')
        .select('id, name, ticker_symbol')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .ilike('ticker_symbol', tickerNorm)

      if (dupeAssets && dupeAssets.length > 0) {
        return NextResponse.json({
          warning: true,
          message: `Er bestaat al een actieve holding met ticker "${tickerNorm}". Wil je toch doorgaan?`,
          existing_holdings: dupeAssets.map((a) => ({
            id: a.id,
            name: a.name,
            ticker: a.ticker_symbol,
          })),
        }, { status: 409 })
      }
    }

    const assetTypeToUse = asset_type || 'investment'
    const currentVal = Number(current_price) || Number(avg_purchase_price) || 0
    const purchaseVal = Number(avg_purchase_price) || currentVal

    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .insert({
        user_id: user.id,
        name,
        asset_type: assetTypeToUse,
        current_value: currentVal * (Number(units) || 1),
        purchase_value: purchaseVal * (Number(units) || 1),
        purchase_date: purchase_date || null,
        expected_return: 7,
        monthly_contribution: 0,
        institution: null,
        notes: notes || null,
        ticker_symbol: ticker || isin || null,
      })
      .select()
      .single()

    if (assetError) {
      return NextResponse.json({ error: assetError.message }, { status: 500 })
    }

    // Map asset back to holding shape
    const holding = {
      id: asset.id,
      user_id: asset.user_id,
      asset_id: asset.id,
      ticker: asset.ticker_symbol || null,
      isin: null,
      name: asset.name,
      units: Number(units) || 1,
      avg_purchase_price: purchaseVal,
      current_price: currentVal,
      purchase_date: asset.purchase_date,
      notes: asset.notes,
      is_active: true,
      created_at: asset.created_at,
      updated_at: asset.created_at,
    }

    const responseBody = { holding, source: 'assets_fallback' }
    // Cache the successful response for idempotency
    if (idempotencyKey) {
      const cacheKey = `${user.id}:${idempotencyKey}`
      idempotencyCache.set(cacheKey, { response: { body: responseBody, status: 201 }, timestamp: Date.now() })
    }
    return NextResponse.json(responseBody, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/holdings — Update a holding (e.g. current price).
 *
 * Expected body: { id, current_price?, units?, avg_purchase_price?, name?, ticker?, notes?, expected_updated_at? }
 * When current_price changes and the holding has a linked asset_id, the asset's current_value
 * is recalculated as (current_price * units) to keep asset and holding in sync.
 *
 * Optimistic concurrency control:
 * If `expected_updated_at` is provided, the server checks if the row's updated_at matches.
 * If another edit happened since the client loaded the data, a 409 Conflict is returned
 * with the current server state so the client can resolve the conflict.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Ongeldig JSON-formaat in request body' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body moet een JSON-object zijn' }, { status: 400 })
    }

    const { id } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'ID is verplicht en moet een string zijn' }, { status: 400 })
    }

    // Validate numeric fields when provided
    if (body.current_price !== undefined && body.current_price !== null && isNaN(Number(body.current_price))) {
      return NextResponse.json({ error: 'Huidige prijs moet een getal zijn' }, { status: 400 })
    }
    if (body.units !== undefined && body.units !== null && isNaN(Number(body.units))) {
      return NextResponse.json({ error: 'Units moet een getal zijn' }, { status: 400 })
    }

    const hasTable = await holdingsTableExists(supabase)

    if (hasTable) {
      // --- Optimistic concurrency check ---
      // If the client sent expected_updated_at, verify the row hasn't changed since
      const expectedUpdatedAt = body.expected_updated_at as string | undefined
      if (expectedUpdatedAt) {
        const { data: currentRow, error: fetchError } = await supabase
          .from('holdings')
          .select('updated_at, name, units, avg_purchase_price, current_price, ticker, notes')
          .eq('id', id)
          .eq('user_id', user.id)
          .single()

        if (fetchError) {
          return NextResponse.json({ error: fetchError.message }, { status: 500 })
        }

        if (currentRow) {
          // Compare timestamps — normalize both to millisecond precision
          const serverTime = new Date(currentRow.updated_at).getTime()
          const clientTime = new Date(expectedUpdatedAt).getTime()

          if (serverTime !== clientTime) {
            return NextResponse.json({
              error: 'conflict',
              message: 'Deze holding is ondertussen door een andere sessie gewijzigd. Herlaad de gegevens en probeer opnieuw.',
              conflict: true,
              server_state: currentRow,
              server_updated_at: currentRow.updated_at,
              client_updated_at: expectedUpdatedAt,
            }, { status: 409 })
          }
        }
      }

      // Build update object with only provided fields
      const updates: Record<string, unknown> = {}
      if (body.current_price !== undefined) updates.current_price = Number(body.current_price)
      if (body.units !== undefined) updates.units = Number(body.units)
      if (body.avg_purchase_price !== undefined) updates.avg_purchase_price = Number(body.avg_purchase_price)
      if (body.name !== undefined) updates.name = body.name
      if (body.ticker !== undefined) updates.ticker = body.ticker || null
      if (body.notes !== undefined) updates.notes = body.notes || null
      if (body.current_price !== undefined) updates.last_price_update = new Date().toISOString()
      // Always bump updated_at on write so future conflict checks work
      updates.updated_at = new Date().toISOString()

      const { data: holding, error } = await supabase
        .from('holdings')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Sync linked asset's current_value from all holdings (aggregate)
      if (holding && holding.asset_id && (body.current_price !== undefined || body.units !== undefined)) {
        await syncAssetValueFromHoldings(supabase, holding.asset_id, user.id)
      }

      return NextResponse.json({ holding, source: 'holdings_table' })
    }

    // Fallback: update asset in the assets table
    // (Assets fallback does not have optimistic locking — last write wins)
    const updates: Record<string, unknown> = {}
    if (body.current_price !== undefined) {
      const units = body.units || 1
      updates.current_value = Number(body.current_price) * Number(units)
    }
    if (body.name !== undefined) updates.name = body.name
    if (body.notes !== undefined) updates.notes = body.notes || null
    if (body.ticker !== undefined) updates.ticker_symbol = body.ticker || null

    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (assetError) {
      return NextResponse.json({ error: assetError.message }, { status: 500 })
    }

    // Map asset back to holding shape
    const holding = {
      id: asset.id,
      user_id: asset.user_id,
      asset_id: asset.id,
      ticker: asset.ticker_symbol || null,
      isin: null,
      name: asset.name,
      units: body.units || 1,
      avg_purchase_price: Number(asset.purchase_value) || 0,
      current_price: Number(asset.current_value) / (body.units || 1),
      purchase_date: asset.purchase_date,
      notes: asset.notes,
      is_active: true,
      created_at: asset.created_at,
      updated_at: asset.updated_at || asset.created_at,
    }

    return NextResponse.json({ holding, source: 'assets_fallback' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/holdings — Delete a holding by id.
 *
 * Query param: ?id=<uuid>
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
    const hasTable = await holdingsTableExists(supabase)

    if (hasTable) {
      // Fetch asset_id before deleting so we can sync the parent asset afterwards
      const { data: holdingToDelete } = await supabase
        .from('holdings')
        .select('asset_id')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      const { error } = await supabase
        .from('holdings')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Sync parent asset's current_value after deletion
      if (holdingToDelete?.asset_id) {
        await syncAssetValueFromHoldings(supabase, holdingToDelete.asset_id, user.id)
      }
    } else {
      // Fallback: delete from assets table
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
