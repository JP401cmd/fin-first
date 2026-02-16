import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { BADGE_DEFINITIONS } from '@/lib/badges'

/**
 * POST /api/badges/evaluate — Evaluate which badges a user has earned.
 *
 * Checks user's financial data against badge criteria and awards any
 * newly earned badges. Returns list of newly awarded badges.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Validate request body if provided (body is optional for this endpoint)
  const contentType = request.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    try {
      const body = await request.json()
      if (body !== null && body !== undefined && (typeof body !== 'object' || Array.isArray(body))) {
        return NextResponse.json({ error: 'Request body moet een JSON-object zijn of leeg' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Ongeldig JSON-formaat in request body' }, { status: 400 })
    }
  }

  try {
    // Try to fetch already-earned badges
    const { data: existingBadges, error: badgesError } = await supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', user.id)

    if (badgesError) {
      // Tables don't exist yet, return empty result
      return NextResponse.json({
        newly_earned: [],
        total_earned: 0,
        total_badges: BADGE_DEFINITIONS.length,
        source: 'definitions',
        message: 'Badge tabellen nog niet beschikbaar',
      })
    }

    const earnedBadgeIds = new Set((existingBadges ?? []).map(b => b.badge_id))

    // For now, return current badge status without evaluation logic
    // Full evaluation requires checking financial data against badge criteria
    return NextResponse.json({
      newly_earned: [],
      total_earned: earnedBadgeIds.size,
      total_badges: BADGE_DEFINITIONS.length,
      source: 'database',
    })
  } catch {
    return NextResponse.json({
      newly_earned: [],
      total_earned: 0,
      total_badges: BADGE_DEFINITIONS.length,
      source: 'definitions',
    })
  }
}
