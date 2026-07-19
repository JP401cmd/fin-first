import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { assetHasActiveHoldings, assetsWithActiveHoldings } from '@/lib/holdings-sync'
import { unauthorized, serverError } from '@/lib/api/respond'

/** Max aantal asset-ids per batch-call (URL-lengte + query-veiligheid). */
const MAX_BATCH_IDS = 200

/**
 * GET /api/assets/has-holdings
 *
 * Twee modi (één auth-check per request):
 * - `?asset_id=<uuid>` → `{ has_holdings, holdings_count, total_value }` voor één asset.
 * - `?asset_ids=<id1,id2,...>` → `{ holdings: { [assetId]: boolean } }` voor meerdere
 *   assets in 2 queries (i.p.v. N calls). Alle gevraagde ids zitten in de map;
 *   `false` als een asset geen actieve holdings heeft. Lege lijst → `{ holdings: {} }`.
 *
 * Wanneer een asset actieve holdings heeft, is de portfolio-tracker de bron van
 * waarheid en zou een handmatige current_value-wijziging bij de volgende sync
 * worden overschreven.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return unauthorized()
  }

  const { searchParams } = new URL(request.url)
  const assetIdsParam = searchParams.get('asset_ids')

  // ── Batch-modus ────────────────────────────────────────────────────
  if (assetIdsParam !== null) {
    const ids = Array.from(
      new Set(
        assetIdsParam
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      )
    )

    if (ids.length === 0) {
      return NextResponse.json({ holdings: {} })
    }
    if (ids.length > MAX_BATCH_IDS) {
      return NextResponse.json(
        { error: `Maximaal ${MAX_BATCH_IDS} asset_ids per verzoek` },
        { status: 400 }
      )
    }

    try {
      const withHoldings = await assetsWithActiveHoldings(supabase, ids, claims.sub)
      const holdings: Record<string, boolean> = {}
      for (const id of ids) {
        holdings[id] = withHoldings.has(id)
      }
      return NextResponse.json({ holdings })
    } catch (err) {
      return serverError(err, 'assets-has-holdings:GET')
    }
  }

  // ── Single-asset-modus (backward-compat) ───────────────────────────
  const assetId = searchParams.get('asset_id')

  if (!assetId) {
    return NextResponse.json({ error: 'asset_id is verplicht' }, { status: 400 })
  }

  try {
    const result = await assetHasActiveHoldings(supabase, assetId, claims.sub)

    return NextResponse.json({
      has_holdings: result.hasHoldings,
      holdings_count: result.holdingsCount,
      total_value: result.totalValue,
    })
  } catch (err) {
    return serverError(err, 'assets-has-holdings:GET')
  }
}
