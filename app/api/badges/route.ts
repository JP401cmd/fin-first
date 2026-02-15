import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { BADGE_DEFINITIONS, type BadgeWithStatus } from '@/lib/badges'

/**
 * GET /api/badges — List all badges with user's earned status.
 *
 * If the badges table exists in the database, fetches from there.
 * Falls back to client-defined badge definitions with all badges locked.
 */
export async function GET() {
  const supabase = await createClient()

  // Get the current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    // Try to fetch badges from database
    const { data: dbBadges, error: badgesError } = await supabase
      .from('badges')
      .select('*')
      .order('sort_order', { ascending: true })

    if (badgesError) {
      // Table probably doesn't exist yet — use client-side definitions
      const badges: BadgeWithStatus[] = BADGE_DEFINITIONS.map((badge) => ({
        ...badge,
        earned: false,
        earned_at: null,
      }))

      return NextResponse.json({
        badges,
        earned_count: 0,
        total_count: badges.length,
        source: 'definitions',
      })
    }

    // Fetch user's earned badges
    const { data: userBadges } = await supabase
      .from('user_badges')
      .select('badge_id, earned_at')
      .eq('user_id', user.id)

    const earnedMap = new Map(
      (userBadges ?? []).map((ub) => [ub.badge_id, ub.earned_at])
    )

    const badges: BadgeWithStatus[] = dbBadges.map((badge) => ({
      slug: badge.slug,
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      color: badge.color,
      category: badge.category,
      sort_order: badge.sort_order,
      id: badge.id,
      earned: earnedMap.has(badge.id),
      earned_at: earnedMap.get(badge.id) ?? null,
    }))

    return NextResponse.json({
      badges,
      earned_count: earnedMap.size,
      total_count: badges.length,
      source: 'database',
    })
  } catch {
    // Fallback to definitions
    const badges: BadgeWithStatus[] = BADGE_DEFINITIONS.map((badge) => ({
      ...badge,
      earned: false,
      earned_at: null,
    }))

    return NextResponse.json({
      badges,
      earned_count: 0,
      total_count: badges.length,
      source: 'definitions',
    })
  }
}
