import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { assetHasActiveHoldings } from '@/lib/holdings-sync'

/**
 * GET /api/assets/has-holdings?asset_id=<uuid>
 *
 * Check if an asset has active holdings linked to it.
 * When an asset has active holdings, the portfolio tracker is the source of truth
 * and manual edits to current_value would be overwritten on the next sync.
 *
 * Returns: { has_holdings, holdings_count, total_value }
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const assetId = searchParams.get('asset_id')

  if (!assetId) {
    return NextResponse.json({ error: 'asset_id is verplicht' }, { status: 400 })
  }

  try {
    const result = await assetHasActiveHoldings(supabase, assetId, user.id)

    return NextResponse.json({
      has_holdings: result.hasHoldings,
      holdings_count: result.holdingsCount,
      total_value: result.totalValue,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
