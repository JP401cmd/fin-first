import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { BADGE_DEFINITIONS, BADGE_CRITERIA, type BadgeWithStatus } from '@/lib/badges'

/**
 * Compute progress data for all badges based on user's financial data.
 * Returns a map of badge slug -> { progress: 0-1, label: string }
 */
async function computeBadgeProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Map<string, { progress: number; label: string }>> {
  const progressMap = new Map<string, { progress: number; label: string }>()

  try {
    // Fetch all required data in parallel
    const [
      accountsResult,
      budgetsResult,
      transactionsResult,
      debtsResult,
      assetsResult,
      actionsResult,
      fireResult,
    ] = await Promise.all([
      supabase.from('bank_accounts').select('id, balance').eq('user_id', userId),
      supabase.from('budgets').select('id').eq('user_id', userId),
      supabase.from('transactions').select('id').eq('user_id', userId),
      supabase.from('debts').select('id, current_balance, is_active').eq('user_id', userId),
      supabase.from('assets').select('id, current_value').eq('user_id', userId),
      supabase.from('actions').select('id, status').eq('user_id', userId),
      supabase.from('app_settings').select('value').eq('key', `fire_settings_${userId}`).maybeSingle(),
    ])

    const accounts = accountsResult.data ?? []
    const budgets = budgetsResult.data ?? []
    const transactions = transactionsResult.data ?? []
    const debts = debtsResult.data ?? []
    const assets = assetsResult.data ?? []
    const actions = actionsResult.data ?? []

    // Calculate totals
    const totalAssets = assets.reduce(
      (sum: number, a: { current_value?: number }) => sum + (Number(a.current_value) || 0), 0
    )
    const totalCash = accounts.reduce(
      (sum: number, a: { balance?: number }) => sum + (Number(a.balance) || 0), 0
    )
    const totalDebt = debts.reduce(
      (sum: number, d: { current_balance?: number; is_active?: boolean }) =>
        d.is_active !== false ? sum + (Number(d.current_balance) || 0) : sum, 0
    )
    const netWorth = totalAssets + totalCash - totalDebt
    const completedActions = actions.filter(
      (a: { status?: string }) => a.status === 'completed' || a.status === 'done'
    ).length

    // Get freedom percentage from FIRE settings if available
    let freedomPct = 0
    if (fireResult.data?.value && typeof fireResult.data.value === 'object') {
      const fireSettings = fireResult.data.value as Record<string, unknown>
      freedomPct = Number(fireSettings.freedom_percentage ?? fireSettings.freedomPercentage ?? 0)
    }

    // Compute current values for each badge criteria
    const currentValues: Record<string, number> = {
      positief_vermogen: netWorth,
      eerste_10k: Math.max(0, netWorth),
      '100k_club': Math.max(0, netWorth),
      eerste_actie: completedActions,
      actieheld_x10: completedActions,
      vrijheidsjager: completedActions,
      beslisser: completedActions,
      data_detective: transactions.length > 0 ? 1 : 0,
      budgetbouwer: budgets.length > 0 ? 1 : 0,
      fire_10_pct: freedomPct,
      fire_halftime: freedomPct,
      fire_bereikt: freedomPct,
    }

    // Calculate progress for each badge with criteria
    for (const [slug, criteria] of Object.entries(BADGE_CRITERIA)) {
      const current = currentValues[slug] ?? 0
      let progress: number

      if (slug === 'positief_vermogen') {
        // Special case: target is 0 (net worth > 0)
        progress = netWorth > 0 ? 1 : Math.max(0, Math.min(1, (netWorth + 50000) / 50000))
      } else {
        progress = criteria.target > 0 ? Math.min(1, current / criteria.target) : (current > 0 ? 1 : 0)
      }

      progressMap.set(slug, {
        progress: Math.max(0, Math.min(1, progress)),
        label: criteria.label(current, criteria.target),
      })
    }
  } catch (err) {
    console.error('Badge progress computation error:', err)
    // Return empty map on error — badges still render, just without progress
  }

  return progressMap
}

/**
 * GET /api/badges — List all badges with user's earned status and progress.
 *
 * Strategy (in order of preference):
 * 1. Database: If `badges` table has seed data, use badges + user_badges tables.
 * 2. App Settings: Use BADGE_DEFINITIONS + earned status from app_settings table.
 * 3. Fallback: Use BADGE_DEFINITIONS with all badges unearned.
 *
 * Both strategies 1 and 2 use real database-persisted data for earned status.
 * All strategies include progress data for partially-met badge criteria.
 */
export async function GET() {
  const supabase = await createClient()

  // Get the current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Compute progress for all badges
  const progressMap = await computeBadgeProgress(supabase, user.id)

  /** Attach progress data to a badge */
  function addProgress(badge: BadgeWithStatus): BadgeWithStatus {
    if (badge.earned) {
      return { ...badge, progress: 1, progress_label: null }
    }
    const prog = progressMap.get(badge.slug)
    if (prog) {
      return { ...badge, progress: prog.progress, progress_label: prog.label }
    }
    return { ...badge, progress: null, progress_label: null }
  }

  try {
    // ── Strategy 1: Try badges + user_badges tables ──────────────
    const { data: dbBadges, error: badgesError } = await supabase
      .from('badges')
      .select('*')
      .order('sort_order', { ascending: true })

    if (!badgesError && dbBadges && dbBadges.length > 0) {
      // Database badges table is populated — use user_badges for earned status
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
      }) => addProgress({
        slug: badge.slug,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        color: badge.color,
        category: badge.category as BadgeWithStatus['category'],
        sort_order: badge.sort_order,
        id: badge.id,
        earned: earnedMap.has(badge.id),
        earned_at: earnedMap.get(badge.id) ?? null,
      }))

      return NextResponse.json({
        badges,
        earned_count: earnedMap.size,
        total_count: badges.length,
        source: 'user_badges',
      })
    }

    // ── Strategy 2: BADGE_DEFINITIONS + app_settings earned status ─
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

    const badges: BadgeWithStatus[] = BADGE_DEFINITIONS.map((badge) => addProgress({
      ...badge,
      earned: earnedMap.has(badge.slug),
      earned_at: earnedMap.get(badge.slug) ?? null,
    }))

    return NextResponse.json({
      badges,
      earned_count: earnedMap.size,
      total_count: badges.length,
      source: 'app_settings',
    })
  } catch {
    // ── Strategy 3: Fallback to definitions with no earned badges ─
    const badges: BadgeWithStatus[] = BADGE_DEFINITIONS.map((badge) => addProgress({
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
