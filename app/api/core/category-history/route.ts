import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { loadCategoryHistory } from '@/lib/load-category-history'

/**
 * GET /api/core/category-history
 *
 * Thin user-scoped wrapper rond `loadCategoryHistory`. Wordt aangeroepen
 * door <CategoryHistoryChart> wanneer de gebruiker een ander tijdvak
 * (3, 6, 12, 'all') kiest dan het server-side default.
 *
 * Query params:
 * - entityType: 'asset' | 'debt'    (verplicht)
 * - subtype:    string              (verplicht, niet-leeg)
 * - period:     '3' | '6' | '12' | 'all'  (optioneel, default 12)
 * - includeInactive: 'true' | anders → false (optioneel)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const entityType = searchParams.get('entityType')
  const subtype = searchParams.get('subtype')?.trim()
  const periodRaw = searchParams.get('period')
  const includeInactive = searchParams.get('includeInactive') === 'true'

  if (entityType !== 'asset' && entityType !== 'debt') {
    return NextResponse.json(
      { error: 'Ongeldige parameters: entityType moet "asset" of "debt" zijn' },
      { status: 400 },
    )
  }

  if (!subtype) {
    return NextResponse.json(
      { error: 'Ongeldige parameters: subtype is verplicht' },
      { status: 400 },
    )
  }

  let period: 3 | 6 | 12 | 'all' = 12
  if (periodRaw != null) {
    if (periodRaw === '3') period = 3
    else if (periodRaw === '6') period = 6
    else if (periodRaw === '12') period = 12
    else if (periodRaw === 'all') period = 'all'
    else {
      return NextResponse.json(
        { error: 'Ongeldige parameters: period moet 3, 6, 12 of "all" zijn' },
        { status: 400 },
      )
    }
  }

  try {
    const data = await loadCategoryHistory(supabase, {
      entityType,
      subtype,
      period,
      includeInactive,
    })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: 'Fout bij laden categoriehistorie' },
      { status: 500 },
    )
  }
}
