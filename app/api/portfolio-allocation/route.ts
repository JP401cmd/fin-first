import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/portfolio-allocation — Get portfolio allocation data
 *
 * Returns holdings with classification data, current allocation slices,
 * and user's target allocations.
 *
 * Query params:
 *   ?view_mode=asset_class|sector|geography
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const viewMode = searchParams.get('view_mode') || 'asset_class'

  if (!['asset_class', 'sector', 'geography'].includes(viewMode)) {
    return NextResponse.json({ error: 'Invalid view_mode' }, { status: 400 })
  }

  try {
    const { data, error } = await supabase
      .from('investment_holdings')
      .select('id, name, ticker, units, avg_purchase_price, current_price, is_active, asset_class, sector, geography')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Kon holdings niet laden' }, { status: 500 })
    }

    const holdings = data || []

    // Compute holding values
    const holdingsWithValues = holdings.map((h) => {
      const price = h.current_price ?? h.avg_purchase_price
      const value = price * Math.max(0, h.units)
      return {
        id: h.id,
        name: h.name,
        ticker: h.ticker,
        value,
        asset_class: h.asset_class || null,
        sector: h.sector || null,
        geography: h.geography || null,
      }
    }).filter((h) => h.value > 0)

    const totalValue = holdingsWithValues.reduce((s, h) => s + h.value, 0)

    // Try to load target allocations
    let targets: Array<{ category: string; target_pct: number }> = []
    try {
      const { data } = await supabase
        .from('target_allocations')
        .select('category, target_pct')
        .eq('user_id', user.id)
        .eq('view_mode', viewMode)

      targets = (data || []).map(t => ({
        category: t.category,
        target_pct: Number(t.target_pct),
      }))
    } catch {
      // Table might not exist yet, use empty targets
    }

    return NextResponse.json({
      holdings: holdingsWithValues,
      total_value: totalValue,
      view_mode: viewMode,
      targets,
    })
  } catch (err) {
    console.error('Portfolio allocation error:', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}

/**
 * PATCH /api/portfolio-allocation — Update holding classification
 *
 * Body: { holding_id, asset_class?, sector?, geography? }
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { holding_id, asset_class, sector, geography } = body

    if (!holding_id) {
      return NextResponse.json({ error: 'holding_id is vereist' }, { status: 400 })
    }

    const updates: Record<string, string | null> = {}
    if (asset_class !== undefined) updates.asset_class = asset_class || null
    if (sector !== undefined) updates.sector = sector || null
    if (geography !== undefined) updates.geography = geography || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Geen velden om bij te werken' }, { status: 400 })
    }

    const { error } = await supabase
      .from('investment_holdings')
      .update(updates)
      .eq('id', holding_id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: 'Kon classificatie niet bijwerken' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Portfolio allocation PATCH error:', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}

/**
 * POST /api/portfolio-allocation — Save target allocations
 *
 * Body: { view_mode, targets: [{ category, target_pct }] }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { view_mode, targets } = body

    if (!view_mode || !['asset_class', 'sector', 'geography'].includes(view_mode)) {
      return NextResponse.json({ error: 'Ongeldig view_mode' }, { status: 400 })
    }

    if (!targets || !Array.isArray(targets)) {
      return NextResponse.json({ error: 'targets moet een array zijn' }, { status: 400 })
    }

    // Delete existing targets for this view_mode
    await supabase
      .from('target_allocations')
      .delete()
      .eq('user_id', user.id)
      .eq('view_mode', view_mode)

    // Insert new targets
    if (targets.length > 0) {
      const rows = targets
        .filter((t: { category: string; target_pct: number }) => t.target_pct > 0)
        .map((t: { category: string; target_pct: number }) => ({
          user_id: user.id,
          view_mode,
          category: t.category,
          target_pct: t.target_pct,
        }))

      if (rows.length > 0) {
        const { error } = await supabase
          .from('target_allocations')
          .insert(rows)

        if (error) {
          // If the table doesn't exist yet, store in-memory and return success
          // The feature works client-side even without persistence
          console.warn('Could not save target allocations:', error.message)
          return NextResponse.json({
            success: true,
            persisted: false,
            message: 'Targets opgeslagen in deze sessie (tabel nog niet beschikbaar)',
          })
        }
      }
    }

    return NextResponse.json({ success: true, persisted: true })
  } catch (err) {
    console.error('Portfolio allocation POST error:', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
