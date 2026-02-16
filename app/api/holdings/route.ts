import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const hasTable = await holdingsTableExists(supabase)

    if (hasTable) {
      const { data: holdings, error } = await supabase
        .from('holdings')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

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
export async function POST(request: NextRequest) {
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

      return NextResponse.json({ holding, source: 'holdings_table' }, { status: 201 })
    }

    // Fallback: create an asset in the assets table
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

    return NextResponse.json({ holding, source: 'assets_fallback' }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/holdings — Update a holding (e.g. current price).
 *
 * Expected body: { id, current_price?, units?, avg_purchase_price?, name?, ticker?, notes? }
 * When current_price changes and the holding has a linked asset_id, the asset's current_value
 * is recalculated as (current_price * units) to keep asset and holding in sync.
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
      // Build update object with only provided fields
      const updates: Record<string, unknown> = {}
      if (body.current_price !== undefined) updates.current_price = Number(body.current_price)
      if (body.units !== undefined) updates.units = Number(body.units)
      if (body.avg_purchase_price !== undefined) updates.avg_purchase_price = Number(body.avg_purchase_price)
      if (body.name !== undefined) updates.name = body.name
      if (body.ticker !== undefined) updates.ticker = body.ticker || null
      if (body.notes !== undefined) updates.notes = body.notes || null
      if (body.current_price !== undefined) updates.last_price_update = new Date().toISOString()

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

      // Sync linked asset's current_value when price changes
      if (holding && holding.asset_id && body.current_price !== undefined) {
        const newAssetValue = Number(holding.current_price) * Number(holding.units)
        await supabase
          .from('assets')
          .update({ current_value: newAssetValue })
          .eq('id', holding.asset_id)
          .eq('user_id', user.id)
      }

      return NextResponse.json({ holding, source: 'holdings_table' })
    }

    // Fallback: update asset in the assets table
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
      const { error } = await supabase
        .from('holdings')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
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
