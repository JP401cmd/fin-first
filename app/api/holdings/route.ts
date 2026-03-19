import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { syncAssetValueFromHoldings } from '@/lib/holdings-sync'
import { getEURRateSync } from '@/lib/forex'

/**
 * GET /api/holdings — List user's investment holdings.
 *
 * Reads from the dedicated `holdings` table.
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
      const currency = (h.currency as string) || 'EUR'
      const eurRate = getEURRateSync(currency)
      return sum + (price * h.units * eurRate)
    }, 0)

    const totalCost = holdings.reduce((sum, h) => {
      const currency = (h.currency as string) || 'EUR'
      const eurRate = getEURRateSync(currency)
      return sum + (h.avg_purchase_price * h.units * eurRate)
    }, 0)

    return NextResponse.json({
      holdings,
      total_value: totalValue,
      total_cost: totalCost,
      source: 'holdings_table',
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
 * Inserts into the dedicated `holdings` table.
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

    const { name, ticker, isin, units, avg_purchase_price, current_price, purchase_date, notes, asset_type, currency, ter, ter_source } = body

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

    // Validate TER field when provided
    if (ter !== undefined && ter !== null) {
      const n = Number(ter)
      if (isNaN(n) || n < 0 || n > 0.10) {
        return NextResponse.json({ error: 'TER moet een getal zijn tussen 0 en 0.10 (0% - 10%)' }, { status: 400 })
      }
    }

    // Validate ter_source field when provided
    if (ter_source !== undefined && ter_source !== null) {
      if (typeof ter_source !== 'string' || !['manual', 'lookup'].includes(ter_source)) {
        return NextResponse.json({ error: 'TER bron moet "manual" of "lookup" zijn' }, { status: 400 })
      }
    }

    // Check if user wants to force-create despite duplicate warning
    const forceDuplicate = body.force_duplicate === true

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

    const baseRow = {
      user_id: user.id,
      asset_id: assetId,
      name,
      ticker: ticker || null,
      isin: isin || null,
      units: Number(units) || 1,
      avg_purchase_price: Number(avg_purchase_price) || 0,
      current_price: current_price != null ? Number(current_price) : null,
      currency: typeof currency === 'string' && currency.trim().length > 0 ? currency.trim().toUpperCase() : 'EUR',
      purchase_date: purchase_date || null,
      notes: notes || null,
      is_active: true,
    }

    const terFields = {
      ...(ter != null ? { ter: Number(ter), ter_source: (ter_source as string) || 'manual' } : {}),
      ...(ter_source != null && ter == null ? { ter_source: ter_source as string } : {}),
    }

    // Try insert with TER fields first; retry without if column doesn't exist yet
    let { data: holding, error } = await supabase
      .from('holdings')
      .insert({ ...baseRow, ...terFields })
      .select()
      .single()

    if (error && error.message?.includes("'ter'")) {
      // TER column not yet in schema — retry without TER fields
      ;({ data: holding, error } = await supabase
        .from('holdings')
        .insert(baseRow)
        .select()
        .single())
    }

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
    if (body.ter !== undefined && body.ter !== null) {
      const n = Number(body.ter)
      if (isNaN(n) || n < 0 || n > 0.10) {
        return NextResponse.json({ error: 'TER moet een getal zijn tussen 0 en 0.10 (0% - 10%)' }, { status: 400 })
      }
    }
    if (body.ter_source !== undefined && body.ter_source !== null) {
      if (typeof body.ter_source !== 'string' || !['manual', 'lookup'].includes(body.ter_source)) {
        return NextResponse.json({ error: 'TER bron moet "manual" of "lookup" zijn' }, { status: 400 })
      }
    }

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
    if (body.currency !== undefined && typeof body.currency === 'string') updates.currency = body.currency.trim().toUpperCase() || 'EUR'
    if (body.ter !== undefined) updates.ter = body.ter != null ? Number(body.ter) : null
    if (body.ter_source !== undefined) updates.ter_source = body.ter_source || null
    if (body.current_price !== undefined) updates.last_price_update = new Date().toISOString()
    // Always bump updated_at on write so future conflict checks work
    updates.updated_at = new Date().toISOString()

    // Try update with all fields; retry without TER if column doesn't exist yet
    let { data: holding, error } = await supabase
      .from('holdings')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error && error.message?.includes("'ter'")) {
      // TER column not yet in schema — retry without TER fields
      const { ter: _t, ter_source: _ts, ...updatesNoTer } = updates
      void _t; void _ts
      ;({ data: holding, error } = await supabase
        .from('holdings')
        .update(updatesNoTer)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single())
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Sync linked asset's current_value from all holdings (aggregate)
    if (holding && holding.asset_id && (body.current_price !== undefined || body.units !== undefined)) {
      await syncAssetValueFromHoldings(supabase, holding.asset_id, user.id)
    }

    return NextResponse.json({ holding, source: 'holdings_table' })
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

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
