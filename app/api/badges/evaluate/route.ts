import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { BADGE_DEFINITIONS } from '@/lib/badges'

/**
 * Earned badge record stored in app_settings or user_badges table.
 */
type EarnedBadge = {
  slug: string
  earned_at: string
  notified: boolean
}

/**
 * Helper: Get earned badges for a user.
 * Tries user_badges table first, falls back to app_settings key-value store.
 */
async function getEarnedBadges(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ badges: EarnedBadge[]; source: 'user_badges' | 'app_settings' }> {
  // Try user_badges table first
  const { data: userBadgesData, error: ubError } = await supabase
    .from('user_badges')
    .select('badge_id, earned_at, notified')
    .eq('user_id', userId)

  if (!ubError && userBadgesData) {
    // Need to resolve badge_id to slug via badges table
    const { data: badgesData } = await supabase.from('badges').select('id, slug')
    const idToSlug = new Map((badgesData ?? []).map((b: { id: string; slug: string }) => [b.id, b.slug]))

    return {
      badges: userBadgesData.map((ub: { badge_id: string; earned_at: string; notified: boolean }) => ({
        slug: idToSlug.get(ub.badge_id) ?? ub.badge_id,
        earned_at: ub.earned_at,
        notified: ub.notified,
      })),
      source: 'user_badges',
    }
  }

  // Fallback: app_settings key-value store
  const settingsKey = `earned_badges_${userId}`
  const { data: settingsData } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', settingsKey)
    .maybeSingle()

  if (settingsData?.value && Array.isArray(settingsData.value)) {
    return { badges: settingsData.value as EarnedBadge[], source: 'app_settings' }
  }

  return { badges: [], source: 'app_settings' }
}

/**
 * Helper: Save earned badges for a user.
 */
async function saveEarnedBadges(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  badges: EarnedBadge[],
  source: 'user_badges' | 'app_settings'
): Promise<void> {
  if (source === 'user_badges') {
    // Insert into user_badges table (need badge IDs)
    const { data: badgesData } = await supabase.from('badges').select('id, slug')
    const slugToId = new Map((badgesData ?? []).map((b: { id: string; slug: string }) => [b.slug, b.id]))

    for (const badge of badges) {
      const badgeId = slugToId.get(badge.slug)
      if (badgeId) {
        await supabase.from('user_badges').upsert(
          {
            user_id: userId,
            badge_id: badgeId,
            earned_at: badge.earned_at,
            notified: badge.notified,
          },
          { onConflict: 'user_id,badge_id' }
        )
      }
    }
  } else {
    // Fallback: store in app_settings
    const settingsKey = `earned_badges_${userId}`
    await supabase.from('app_settings').upsert(
      { key: settingsKey, value: badges },
      { onConflict: 'key' }
    )
  }
}

/**
 * Evaluate badge criteria against real data from existing tables.
 */
async function evaluateBadges(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  existingEarned: Set<string>
): Promise<string[]> {
  const newlyEarned: string[] = []

  // ── Fetch all required data in parallel ───────────────────────
  const [
    profileResult,
    accountsResult,
    budgetsResult,
    transactionsResult,
    debtsResult,
    assetsResult,
    actionsResult,
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('bank_accounts').select('id, balance').eq('user_id', userId),
    supabase.from('budgets').select('id, name, amount').eq('user_id', userId),
    supabase.from('transactions').select('id, amount, type, date, bank_account_id').eq('user_id', userId),
    supabase.from('debts').select('id, current_balance, original_amount, name, is_active').eq('user_id', userId),
    supabase.from('assets').select('id, current_value, name, type').eq('user_id', userId),
    supabase.from('actions').select('id, status').eq('user_id', userId),
  ])

  const profile = profileResult.data
  const accounts = accountsResult.data ?? []
  const budgets = budgetsResult.data ?? []
  const transactions = transactionsResult.data ?? []
  const debts = debtsResult.data ?? []
  const assets = assetsResult.data ?? []
  const actions = actionsResult.data ?? []

  // ── 1. Onboarding badges ─────────────────────────────────────

  // eerste_stap: User exists (logged in = first login)
  if (!existingEarned.has('eerste_stap')) {
    newlyEarned.push('eerste_stap')
  }

  // data_detective: User has imported bank data (has transactions)
  if (!existingEarned.has('data_detective') && transactions.length > 0) {
    newlyEarned.push('data_detective')
  }

  // budgetbouwer: User has at least one budget
  if (!existingEarned.has('budgetbouwer') && budgets.length > 0) {
    newlyEarned.push('budgetbouwer')
  }

  // ── 2. Financial Health badges ────────────────────────────────

  // Calculate totals
  const totalAssets = assets.reduce(
    (sum: number, a: { current_value?: number }) => sum + (Number(a.current_value) || 0),
    0
  )
  const totalCash = accounts.reduce(
    (sum: number, a: { balance?: number }) => sum + (Number(a.balance) || 0),
    0
  )
  const totalDebt = debts.reduce(
    (sum: number, d: { current_balance?: number; is_active?: boolean }) =>
      d.is_active !== false ? sum + (Number(d.current_balance) || 0) : sum,
    0
  )
  const netWorth = totalAssets + totalCash - totalDebt

  // schuldenvrij: No active debts
  const activeDebts = debts.filter(
    (d: { is_active?: boolean; current_balance?: number }) =>
      d.is_active !== false && Number(d.current_balance) > 0
  )
  if (!existingEarned.has('schuldenvrij') && activeDebts.length === 0) {
    newlyEarned.push('schuldenvrij')
  }

  // positief_vermogen: Net worth > 0
  if (!existingEarned.has('positief_vermogen') && netWorth > 0) {
    newlyEarned.push('positief_vermogen')
  }

  // eerste_10k: Net worth >= 10000
  if (!existingEarned.has('eerste_10k') && netWorth >= 10000) {
    newlyEarned.push('eerste_10k')
  }

  // 100k_club: Net worth >= 100000
  if (!existingEarned.has('100k_club') && netWorth >= 100000) {
    newlyEarned.push('100k_club')
  }

  // ── 3. Actions badges ────────────────────────────────────────

  const completedActions = actions.filter(
    (a: { status?: string }) => a.status === 'completed' || a.status === 'done'
  )

  if (!existingEarned.has('eerste_actie') && completedActions.length >= 1) {
    newlyEarned.push('eerste_actie')
  }
  if (!existingEarned.has('actieheld_x10') && completedActions.length >= 10) {
    newlyEarned.push('actieheld_x10')
  }
  if (!existingEarned.has('vrijheidsjager') && completedActions.length >= 25) {
    newlyEarned.push('vrijheidsjager')
  }
  if (!existingEarned.has('beslisser') && completedActions.length >= 50) {
    newlyEarned.push('beslisser')
  }

  return newlyEarned
}

/**
 * Valid trigger sources for badge evaluation.
 * Used to track what triggered the evaluation for analytics and debugging.
 */
const VALID_TRIGGERS = ['login', 'action_complete', 'import', 'month_close', 'page_load', 'manual'] as const
type EvaluationTrigger = typeof VALID_TRIGGERS[number]

/**
 * POST /api/badges/evaluate — Evaluate which badges a user has earned.
 *
 * Checks user's financial data against badge criteria and awards any
 * newly earned badges. Returns list of newly awarded badges.
 *
 * Accepts optional JSON body:
 *   { trigger?: 'login' | 'action_complete' | 'import' | 'month_close' | 'page_load' | 'manual' }
 *
 * Trigger sources:
 *   - login: Called after successful user authentication
 *   - action_complete: Called after an action is marked as completed
 *   - import: Called after a bank file import completes
 *   - month_close: Called after a monthly snapshot is created
 *   - page_load: Called by BadgeEvaluator component on page mount
 *   - manual: Called explicitly by user or test
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Parse request body (optional) to extract trigger
  let trigger: EvaluationTrigger = 'manual'
  const contentType = request.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    try {
      const body = await request.json()
      if (body !== null && body !== undefined && (typeof body !== 'object' || Array.isArray(body))) {
        return NextResponse.json({ error: 'Request body moet een JSON-object zijn of leeg' }, { status: 400 })
      }
      // Extract trigger from body
      if (body && typeof body === 'object' && 'trigger' in body) {
        const t = body.trigger
        if (typeof t === 'string' && VALID_TRIGGERS.includes(t as EvaluationTrigger)) {
          trigger = t as EvaluationTrigger
        }
      }
    } catch {
      return NextResponse.json({ error: 'Ongeldig JSON-formaat in request body' }, { status: 400 })
    }
  }

  try {
    // Get existing earned badges
    const { badges: existingBadges, source } = await getEarnedBadges(supabase, user.id)
    const existingEarned = new Set(existingBadges.map((b) => b.slug))

    // Evaluate all badge criteria
    const newlySlugs = await evaluateBadges(supabase, user.id, existingEarned)

    if (newlySlugs.length === 0) {
      return NextResponse.json({
        newly_earned: [],
        total_earned: existingBadges.length,
        total_badges: BADGE_DEFINITIONS.length,
        message: 'Geen nieuwe badges verdiend. Blijf groeien!',
        source,
        trigger,
      })
    }

    // Create new earned badge records
    const now = new Date().toISOString()
    const newBadgeRecords: EarnedBadge[] = newlySlugs.map((slug) => ({
      slug,
      earned_at: now,
      notified: false,
    }))

    // Merge with existing and save
    const allBadges = [...existingBadges, ...newBadgeRecords]
    await saveEarnedBadges(supabase, user.id, allBadges, source)

    // Return newly earned badge details
    const newlyEarnedDetails = newlySlugs.map((slug) => {
      const def = BADGE_DEFINITIONS.find((b) => b.slug === slug)
      return {
        slug,
        name: def?.name ?? slug,
        description: def?.description ?? '',
        icon: def?.icon ?? '🏆',
        color: def?.color ?? 'amber',
        category: def?.category ?? 'onboarding',
        earned_at: now,
      }
    })

    return NextResponse.json({
      newly_earned: newlyEarnedDetails,
      total_earned: allBadges.length,
      total_badges: BADGE_DEFINITIONS.length,
      message: `${newlyEarnedDetails.length} nieuwe badge${newlyEarnedDetails.length === 1 ? '' : 's'} verdiend!`,
      source,
      trigger,
    })
  } catch (err) {
    console.error('Badge evaluation error:', err)
    return NextResponse.json({
      newly_earned: [],
      total_earned: 0,
      total_badges: BADGE_DEFINITIONS.length,
      message: 'Er ging iets mis bij het evalueren van badges.',
      source: 'definitions',
      trigger,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
