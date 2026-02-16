import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { BADGE_DEFINITIONS, type BadgeWithStatus } from '@/lib/badges'

/**
 * GET /api/badges — List all badges with user's earned status.
 *
 * If the badges table exists in the database, fetches from there.
 * Falls back to client-defined badge definitions with earned status from app_settings.
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

    if (!badgesError && dbBadges && dbBadges.length > 0) {
      // Database tables exist — use them
      const { data: userBadges } = await supabase
        .from('user_badges')
        .select('badge_id, earned_at')
        .eq('user_id', user.id)

      const earnedMap = new Map(
        (userBadges ?? []).map((ub: { badge_id: string; earned_at: string }) => [ub.badge_id, ub.earned_at])
      )

      const badges: BadgeWithStatus[] = dbBadges.map((badge: {
        id: string; slug: string; name: string; description: string;
        icon: string; color: string; category: string; sort_order: number
      }) => ({
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
    }

    // Fallback: Use client-side definitions + check app_settings for earned badges
    const settingsKey = `earned_badges_${user.id}`
    const { data: settingsData } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', settingsKey)
      .maybeSingle()

    type EarnedRecord = { slug: string; earned_at: string }
    const earnedBadges: EarnedRecord[] =
      settingsData?.value && Array.isArray(settingsData.value)
        ? (settingsData.value as EarnedRecord[])
        : []
    const earnedMap = new Map(earnedBadges.map((b) => [b.slug, b.earned_at]))

    const badges: BadgeWithStatus[] = BADGE_DEFINITIONS.map((badge) => ({
      ...badge,
      earned: earnedMap.has(badge.slug),
      earned_at: earnedMap.get(badge.slug) ?? null,
    }))

    return NextResponse.json({
      badges,
      earned_count: earnedMap.size,
      total_count: badges.length,
      source: 'definitions',
    })
  } catch {
    // Fallback to definitions with no earned badges
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
