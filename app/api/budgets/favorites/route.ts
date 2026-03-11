import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * PUT /api/budgets/favorites — Sync budget favorites.
 * Body: { favoriteIds: string[] }
 * Sets is_favorite=true for listed IDs, is_favorite=false for all others.
 */
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const body = await request.json()
  const favoriteIds: string[] = body.favoriteIds

  if (!Array.isArray(favoriteIds)) {
    return NextResponse.json({ error: 'favoriteIds must be an array' }, { status: 400 })
  }

  // Clear all favorites first
  await supabase
    .from('budgets')
    .update({ is_favorite: false })
    .eq('is_favorite', true)

  // Set selected as favorite
  if (favoriteIds.length > 0) {
    await supabase
      .from('budgets')
      .update({ is_favorite: true })
      .in('id', favoriteIds)
  }

  return NextResponse.json({ ok: true })
}
