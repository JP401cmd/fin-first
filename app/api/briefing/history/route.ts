import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/briefing/history
 * Returns a paginated list of past briefings for the current user.
 * Query params:
 *   - limit: number (default 20, max 50)
 *   - offset: number (default 0)
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

  const { data: briefings, error, count } = await supabase
    .from('briefing_history')
    .select('id, composed_at, cards', { count: 'exact' })
    .eq('user_id', user.id)
    .order('composed_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    // Graceful handling if table doesn't exist yet (migration pending)
    if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
      return NextResponse.json({ items: [], total: 0 })
    }
    console.error('[briefing/history] Query error:', error)
    return NextResponse.json({ error: 'Kon geschiedenis niet laden' }, { status: 500 })
  }

  // Return a lightweight list with card count and key metrics preview
  const items = (briefings ?? []).map((b) => {
    const cards = b.cards as unknown[]
    // Extract a preview: first insight or metric text
    let preview = ''
    for (const card of cards) {
      const c = card as Record<string, unknown>
      if (c.type === 'insight' && typeof c.text === 'string') {
        preview = c.text.slice(0, 100)
        break
      }
      if (c.type === 'metric' && typeof c.label === 'string') {
        preview = `${c.label}: ${c.value ?? ''}`
        break
      }
    }
    return {
      id: b.id,
      composedAt: b.composed_at,
      cardCount: cards.length,
      preview,
    }
  })

  return NextResponse.json({ items, total: count ?? 0 })
}

/**
 * POST /api/briefing/history
 * Saves a completed briefing to history.
 * Body: { cards: BriefingCardSpec[], composedAt: string }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { cards, composedAt } = body

    if (!cards || !Array.isArray(cards) || !composedAt) {
      return NextResponse.json({ error: 'Missing cards or composedAt' }, { status: 400 })
    }

    // Prevent duplicate saves for the same composedAt timestamp
    const { data: existing, error: checkError } = await supabase
      .from('briefing_history')
      .select('id')
      .eq('user_id', user.id)
      .eq('composed_at', composedAt)
      .limit(1)

    // Graceful handling if table doesn't exist yet (migration pending)
    if (checkError && (checkError.code === '42P01' || checkError.message?.includes('does not exist') || checkError.message?.includes('schema cache'))) {
      return NextResponse.json({ success: false, pending_migration: true })
    }

    if (existing && existing.length > 0) {
      return NextResponse.json({ success: true, id: existing[0].id, duplicate: true })
    }

    const { data: inserted, error } = await supabase
      .from('briefing_history')
      .insert({
        user_id: user.id,
        cards,
        composed_at: composedAt,
      })
      .select('id')
      .single()

    if (error) {
      // Graceful handling if table doesn't exist yet
      if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
        return NextResponse.json({ success: false, pending_migration: true })
      }
      console.error('[briefing/history] Insert error:', error)
      return NextResponse.json({ error: 'Kon briefing niet opslaan' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: inserted.id })
  } catch (err) {
    console.error('[briefing/history] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
