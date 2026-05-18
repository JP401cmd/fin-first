import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/briefing/history/[id]
 * Returns a single briefing by ID (with full card data).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { data: briefing, error } = await supabase
    .from('briefing_history')
    .select('id, user_id, cards, composed_at, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    // Graceful handling if table doesn't exist yet (migration pending)
    if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
      return NextResponse.json({ error: 'Briefing niet gevonden' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Briefing niet gevonden' }, { status: 404 })
  }

  if (!briefing) {
    return NextResponse.json({ error: 'Briefing niet gevonden' }, { status: 404 })
  }

  return NextResponse.json({
    id: briefing.id,
    composedAt: briefing.composed_at,
    cards: briefing.cards,
    createdAt: briefing.created_at,
  })
}
