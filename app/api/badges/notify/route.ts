import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/badges/notify — Mark a badge as notified (shown via toast).
 *
 * Prevents repeat toast notifications for already-notified badges.
 * Supports both user_badges table and app_settings fallback.
 *
 * Body: { slug: string } or { slugs: string[] }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let slugs: string[] = []

  try {
    const body = await request.json()
    if (body.slug) {
      slugs = [body.slug]
    } else if (Array.isArray(body.slugs)) {
      slugs = body.slugs.filter((s: unknown) => typeof s === 'string')
    }
  } catch {
    return NextResponse.json({ error: 'Ongeldig JSON-formaat' }, { status: 400 })
  }

  if (slugs.length === 0) {
    return NextResponse.json({ error: 'Geen badge slug(s) opgegeven' }, { status: 400 })
  }

  try {
    // ── Strategy 1: Try user_badges table ──────────────────────────
    const { data: badgesData } = await supabase.from('badges').select('id, slug')

    if (badgesData && badgesData.length > 0) {
      const slugToId = new Map(
        badgesData.map((b: { id: string; slug: string }) => [b.slug, b.id])
      )

      let updatedCount = 0
      for (const slug of slugs) {
        const badgeId = slugToId.get(slug)
        if (badgeId) {
          const { error } = await supabase
            .from('user_badges')
            .update({ notified: true })
            .eq('user_id', user.id)
            .eq('badge_id', badgeId)
          if (!error) updatedCount++
        }
      }

      return NextResponse.json({
        success: true,
        updated: updatedCount,
        source: 'user_badges',
      })
    }

    // ── Strategy 2: Fallback to app_settings ───────────────────────
    const settingsKey = `earned_badges_${user.id}`
    const { data: settingsData } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', settingsKey)
      .maybeSingle()

    type EarnedBadge = { slug: string; earned_at: string; notified: boolean }
    const earnedBadges: EarnedBadge[] =
      settingsData?.value && Array.isArray(settingsData.value)
        ? (settingsData.value as EarnedBadge[])
        : []

    const slugSet = new Set(slugs)
    let updatedCount = 0
    const updatedBadges = earnedBadges.map((b) => {
      if (slugSet.has(b.slug) && !b.notified) {
        updatedCount++
        return { ...b, notified: true }
      }
      return b
    })

    if (updatedCount > 0) {
      await supabase.from('app_settings').upsert(
        { key: settingsKey, value: updatedBadges },
        { onConflict: 'key' }
      )
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      source: 'app_settings',
    })
  } catch (err) {
    console.error('Badge notify error:', err)
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}

/**
 * GET /api/badges/notify — Get un-notified badges for the current user.
 *
 * Returns badges that have been earned but not yet shown via toast notification.
 * The client uses this to show pending badge toasts on page load.
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    // ── Strategy 1: Try user_badges table ──────────────────────────
    const { data: userBadgesData, error: ubError } = await supabase
      .from('user_badges')
      .select('badge_id, earned_at, notified')
      .eq('user_id', user.id)
      .eq('notified', false)

    if (!ubError && userBadgesData && userBadgesData.length > 0) {
      // Resolve badge details
      const badgeIds = userBadgesData.map((ub: { badge_id: string }) => ub.badge_id)
      const { data: badgesData } = await supabase
        .from('badges')
        .select('id, slug, name, description, icon, color, category')
        .in('id', badgeIds)

      const badgeMap = new Map(
        (badgesData ?? []).map((b: { id: string; slug: string; name: string; description: string; icon: string; color: string; category: string }) => [b.id, b])
      )

      const unnotified = userBadgesData.map((ub: { badge_id: string; earned_at: string }) => {
        const badge = badgeMap.get(ub.badge_id)
        return badge ? {
          slug: badge.slug,
          name: badge.name,
          description: badge.description,
          icon: badge.icon,
          color: badge.color,
          category: badge.category,
          earned_at: ub.earned_at,
        } : null
      }).filter(Boolean)

      return NextResponse.json({
        unnotified,
        count: unnotified.length,
        source: 'user_badges',
      })
    }

    // Check if user_badges table works but just has no unnotified badges
    if (!ubError) {
      return NextResponse.json({
        unnotified: [],
        count: 0,
        source: 'user_badges',
      })
    }

    // ── Strategy 2: Fallback to app_settings ───────────────────────
    const settingsKey = `earned_badges_${user.id}`
    const { data: settingsData } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', settingsKey)
      .maybeSingle()

    type EarnedBadge = { slug: string; earned_at: string; notified: boolean }
    const earnedBadges: EarnedBadge[] =
      settingsData?.value && Array.isArray(settingsData.value)
        ? (settingsData.value as EarnedBadge[])
        : []

    // Import badge definitions for display info
    const { BADGE_DEFINITIONS } = await import('@/lib/badges')
    const defMap = new Map(BADGE_DEFINITIONS.map((b) => [b.slug, b]))

    const unnotified = earnedBadges
      .filter((b) => !b.notified)
      .map((b) => {
        const def = defMap.get(b.slug)
        return def ? {
          slug: b.slug,
          name: def.name,
          description: def.description,
          icon: def.icon,
          color: def.color,
          category: def.category,
          earned_at: b.earned_at,
        } : null
      })
      .filter(Boolean)

    return NextResponse.json({
      unnotified,
      count: unnotified.length,
      source: 'app_settings',
    })
  } catch (err) {
    console.error('Badge notify GET error:', err)
    return NextResponse.json({
      unnotified: [],
      count: 0,
      source: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
