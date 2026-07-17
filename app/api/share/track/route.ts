import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * POST /api/share/track — Track a share event for analytics.
 *
 * Body: {
 *   "share_type": "copy_link" | "download_image" | "web_share" | "whatsapp" | "twitter" | "fallback_whatsapp" | "fallback_twitter",
 *   "content_type": "freedom_card" | "milestone" | "achievement",
 *   "privacy_level": "anonymous" | "named" | "full" (optional),
 *   "metadata": {} (optional extra data)
 * }
 *
 * GET /api/share/track — Get share analytics for the current user.
 */

const VALID_SHARE_TYPES = [
  'copy_link',
  'download_image',
  'web_share',
  'whatsapp',
  'twitter',
  'fallback_whatsapp',
  'fallback_twitter',
] as const

const VALID_CONTENT_TYPES = [
  'freedom_card',
  'milestone',
  'achievement',
  'badge',
] as const

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  try {
    const body = await req.json()
    const { share_type, content_type, privacy_level, metadata } = body

    if (!share_type || !VALID_SHARE_TYPES.includes(share_type)) {
      return NextResponse.json(
        { error: `Ongeldig share_type. Keuzes: ${VALID_SHARE_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    if (!content_type || !VALID_CONTENT_TYPES.includes(content_type)) {
      return NextResponse.json(
        { error: `Ongeldig content_type. Keuzes: ${VALID_CONTENT_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // Try to insert into share_events table
    const { data: event, error: insertError } = await supabase
      .from('share_events')
      .insert({
        user_id: user.id,
        share_type,
        content_type,
        privacy_level: privacy_level || null,
        metadata: metadata || null,
      })
      .select('id, share_type, content_type, privacy_level, created_at')
      .single()

    if (insertError) {
      // Table might not exist yet — log but don't fail the share action
      console.warn('Share event tracking failed:', insertError.message)
      return NextResponse.json({
        tracked: false,
        source: 'fallback',
        message: 'Share event niet opgeslagen (tabel niet beschikbaar)',
        share_type,
        content_type,
      })
    }

    return NextResponse.json({
      tracked: true,
      source: 'database',
      event,
    })
  } catch (err) {
    return serverError(err, 'share-track:POST')
  }
}

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  try {
    const { data: events, error } = await supabase
      .from('share_events')
      .select('id, share_type, content_type, privacy_level, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      return NextResponse.json({
        events: [],
        source: 'fallback',
        message: 'Share events tabel nog niet beschikbaar',
      })
    }

    // Compute stats
    const stats = {
      total_shares: events?.length ?? 0,
      by_type: {} as Record<string, number>,
      by_content: {} as Record<string, number>,
    }

    for (const event of events ?? []) {
      stats.by_type[event.share_type] = (stats.by_type[event.share_type] || 0) + 1
      stats.by_content[event.content_type] = (stats.by_content[event.content_type] || 0) + 1
    }

    return NextResponse.json({
      events: events ?? [],
      stats,
      source: 'database',
    })
  } catch {
    return NextResponse.json({
      events: [],
      source: 'fallback',
    })
  }
}
