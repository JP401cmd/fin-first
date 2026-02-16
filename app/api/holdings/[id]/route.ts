import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/holdings/[id] — Fetch a single holding by its UUID.
 *
 * Returns 200 with the holding data if found,
 * 404 if the holding does not exist or was deleted,
 * 401 if not authenticated.
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

  const { id } = await params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Ongeldig ID' }, { status: 400 })
  }

  try {
    // Try the dedicated holdings table first
    const { error: tableCheckError } = await supabase.from('holdings').select('id').limit(0)
    const hasHoldingsTable = !tableCheckError || !tableCheckError.message.includes('Could not find')

    if (hasHoldingsTable) {
      const { data: holding, error } = await supabase
        .from('holdings')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (!holding) {
        return NextResponse.json(
          { error: 'Holding niet gevonden', notFound: true },
          { status: 404 }
        )
      }

      return NextResponse.json({ holding, source: 'holdings_table' })
    }

    // Fallback: try the assets table
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (assetError) {
      return NextResponse.json({ error: assetError.message }, { status: 500 })
    }

    if (!asset) {
      return NextResponse.json(
        { error: 'Holding niet gevonden', notFound: true },
        { status: 404 }
      )
    }

    // Map asset to holding shape
    const holding = {
      id: asset.id,
      user_id: asset.user_id,
      asset_id: asset.id,
      ticker: asset.ticker_symbol || null,
      isin: null,
      name: asset.name,
      units: 1,
      avg_purchase_price: Number(asset.purchase_value) || 0,
      current_price: Number(asset.current_value) || 0,
      last_price_update: asset.updated_at || null,
      purchase_date: asset.purchase_date || null,
      notes: asset.notes || null,
      is_active: true,
      created_at: asset.created_at,
      updated_at: asset.updated_at || asset.created_at,
      asset_type: asset.asset_type,
      institution: asset.institution,
      expected_return: asset.expected_return,
      monthly_contribution: asset.monthly_contribution,
    }

    return NextResponse.json({ holding, source: 'assets_fallback' })
  } catch {
    return NextResponse.json({ error: 'Er is een fout opgetreden' }, { status: 500 })
  }
}
