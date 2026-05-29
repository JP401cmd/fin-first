/**
 * Server-side data loader for the Will (Overzicht) landing page.
 *
 * Optimized to accept shared data from loadDashboardData to avoid
 * duplicate Supabase queries (assets, debts, auth, profile).
 * Internal queries are consolidated: actions 2→1, recommendations 2→1, goals 3→1.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
import type { Recommendation, Action } from '@/lib/recommendation-data'
import { computeGoalProgress, type Goal } from '@/lib/goal-data'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GoalWithBudget = Goal & {
  budgets?: { id: string; name: string } | null
}

export type CompletedAction = {
  id: string
  status: string
  freedom_days_impact: number
  source: string
  completed_at: string | null
  due_date: string | null
  created_at: string
  recommendation: { recommendation_type: string }[] | null
}

export type AllAction = CompletedAction

export type OpenAction = {
  id: string
  status: string
  freedom_days_impact: number
  due_date: string | null
}

export type PendingRec = {
  id: string
  status: string
  recommendation_type: string
  freedom_days_per_year: number
  decided_at: string | null
  created_at: string
}

export interface WillKpiData {
  completedActions: CompletedAction[]
  allActions: AllAction[]
  openActions: OpenAction[]
  allPendingRecs: PendingRec[]
  goals: GoalWithBudget[]
  completedGoalCount: number
  totalGoalCount: number
  goalProgresses: { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }[]
}

export interface WillPageData {
  recommendations: Recommendation[]
  actions: Action[]
  kpiData: WillKpiData
  goals: GoalWithBudget[]
  goalProgresses: { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }[]
  goalAssets: { id: string; name: string; current_value: number }[]
  goalDebts: { id: string; name: string; current_balance: number }[]
  partnerInfo: { partnerId: string; partnerName: string } | null
  currentUserId: string | null
  userProfile: { full_name: string | null }
  completedGoalCount: number
  totalGoalCount: number
}

// ---------------------------------------------------------------------------
// Shared data from dashboard loader (avoids duplicate queries)
// ---------------------------------------------------------------------------

export interface WillSharedData {
  /** Authenticated user ID (from dashboard's auth.getUser) */
  userId: string | null
  /** Active assets with id+name+current_value */
  assets: { id: string; name: string; current_value: number }[]
  /** Active debts with id+name+current_balance */
  debts: { id: string; name: string; current_balance: number }[]
  /** User's full_name from profile */
  fullName: string | null
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loadWillData(
  supabase: SupabaseClient,
  shared?: WillSharedData,
): Promise<WillPageData> {
  const today = new Date().toISOString().split('T')[0]

  // 1. Get authenticated user (reuse from shared data if available)
  let currentUserId: string | null
  if (shared) {
    currentUserId = shared.userId
  } else {
    const authUser = await getCachedUser(supabase)
    currentUserId = authUser?.id ?? null
  }

  // 2. Household membership + partner-name resolution.
  //    Started as a single chained promise so it runs in parallel with the
  //    main queries below. Goals depends on `householdFilter`, so its query
  //    is chained on this promise — it kicks off the moment membership
  //    resolves and runs in parallel with whatever else is still in flight.
  const householdPromise = (async (): Promise<{
    householdFilter: string
    partnerInfo: WillPageData['partnerInfo']
  }> => {
    if (!currentUserId) return { householdFilter: '', partnerInfo: null }
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', currentUserId)
      .maybeSingle()
    if (!membership?.household_id) return { householdFilter: '', partnerInfo: null }
    const householdFilter = `,and(ownership.eq.shared,household_id.eq.${membership.household_id})`
    const { data: allMembers } = await supabase
      .from('household_members')
      .select('user_id, profile:profiles!user_id(full_name)')
      .eq('household_id', membership.household_id)
    type HouseholdMemberRow = { user_id: string; profile: { full_name: string | null }[] }
    const partner = (allMembers as HouseholdMemberRow[] ?? []).find(
      (m) => m.user_id !== currentUserId,
    )
    return {
      householdFilter,
      partnerInfo: partner
        ? { partnerId: partner.user_id, partnerName: partner.profile?.[0]?.full_name ?? 'Partner' }
        : null,
    }
  })()

  // Goals query depends on `householdFilter`. Chain on the household promise
  // so the request starts as soon as the filter is known, while the
  // independent queries below also run in parallel.
  const goalsPromise = householdPromise.then(({ householdFilter }) => {
    const goalFilter = currentUserId
      ? `user_id.eq.${currentUserId}${householdFilter}`
      : `user_id.eq.00000000-0000-0000-0000-000000000000`
    return supabase
      .from('goals')
      .select('*, budgets:budget_id(id, name)')
      .or(goalFilter)
      .order('sort_order', { ascending: true })
  })

  // 3. Consolidated parallel queries
  // - Actions: 1 broad query (was 2) — derive KPI + board data from same result
  // - Recommendations: 1 broad query (was 2) — derive KPI + list from same result
  // - Goals: 1 query for all goals (was 3) — derive active/counts in JS
  // - Assets/debts/profile: skip when shared data provided (was 3 queries)
  const queries: PromiseLike<unknown>[] = [
    // [0] All actions with full fields + recommendation join (covers KPI + board)
    supabase
      .from('actions')
      .select('*, recommendation:recommendations(title, recommendation_type)')
      .order('status', { ascending: true })
      .order('priority_score', { ascending: false })
      .order('sort_order', { ascending: true }),
    // [1] All pending/postponed recommendations with full fields (covers KPI + list)
    supabase
      .from('recommendations')
      .select('*')
      .in('status', ['pending', 'postponed'])
      .order('priority_score', { ascending: false })
      .order('created_at', { ascending: false }),
    // [2] All goals (derive active list + counts in JS) — runs in parallel
    //     with [0] and [1], gated on household resolution.
    goalsPromise,
  ]

  // Only query assets/debts/profile if not provided via shared data
  if (!shared) {
    queries.push(
      // [3] Assets for GoalForm auto-link
      supabase.from('assets').select('id, name, current_value').eq('is_active', true),
      // [4] Debts for GoalForm auto-link
      supabase.from('debts').select('id, name, current_balance').eq('is_active', true),
      // [5] User profile
      currentUserId
        ? supabase.from('profiles').select('full_name').eq('id', currentUserId).single()
        : Promise.resolve({ data: null }),
    )
  }

  const [results, household] = await Promise.all([
    Promise.all(queries),
    householdPromise,
  ])
  const { partnerInfo } = household

  // Unpack results
  const actionsResult = results[0] as { data: unknown[] | null }
  const recsResult = results[1] as { data: unknown[] | null }
  const goalsResult = results[2] as { data: unknown[] | null }

  // Assets, debts, profile: from shared data or query results
  const loadedAssets: { id: string; name: string; current_value: number }[] = shared
    ? shared.assets
    : ((results[3] as { data: unknown[] | null })?.data ?? []) as { id: string; name: string; current_value: number }[]
  const loadedDebts: { id: string; name: string; current_balance: number }[] = shared
    ? shared.debts
    : ((results[4] as { data: unknown[] | null })?.data ?? []) as { id: string; name: string; current_balance: number }[]
  const userProfile: { full_name: string | null } = shared
    ? { full_name: shared.fullName }
    : { full_name: ((results[5] as { data: { full_name: string | null } | null })?.data as { full_name: string | null } | null)?.full_name ?? null }

  // ── Actions: derive KPI + board data from single query ──
  const allActionsRaw = (actionsResult.data ?? []) as (Action & { created_at: string; source: string; completed_at: string | null; recommendation: { title?: string; recommendation_type: string }[] | null })[]
  const allActions: AllAction[] = allActionsRaw.map(a => ({
    id: a.id,
    status: a.status,
    freedom_days_impact: Number(a.freedom_days_impact) || 0,
    source: a.source ?? '',
    completed_at: a.completed_at ?? null,
    due_date: a.due_date ?? null,
    created_at: a.created_at,
    recommendation: a.recommendation as { recommendation_type: string }[] | null,
  }))
  const enrichedActionsRaw = allActionsRaw as Action[]

  // ── Recommendations: derive KPI pending list + recommendation list ──
  const allRecsRaw = (recsResult.data ?? []) as (Recommendation & { decided_at?: string | null; created_at: string })[]
  const allPendingRecs: PendingRec[] = allRecsRaw.map(r => ({
    id: r.id,
    status: r.status,
    recommendation_type: r.recommendation_type,
    freedom_days_per_year: Number(r.freedom_days_per_year) || 0,
    decided_at: r.decided_at ?? null,
    created_at: r.created_at,
  }))
  // Filter for recommendation list: pending, or postponed with postponed_until <= today
  const recsForList = allRecsRaw.filter(r =>
    r.status === 'pending' ||
    (r.status === 'postponed' && r.postponed_until != null && r.postponed_until <= today)
  ) as Recommendation[]

  // ── Goals: derive active list + counts from single query ──
  const allGoals = (goalsResult.data ?? []) as GoalWithBudget[]
  const goals = allGoals.filter(g => !g.is_completed).slice(0, 5)
  const completedGoalCount = allGoals.filter(g => g.is_completed).length
  const totalGoalCount = allGoals.length

  // 6. Auto-link goals to assets/debts — override current_value
  for (const goal of goals) {
    if (goal.linked_asset_id) {
      const asset = loadedAssets.find(a => a.id === goal.linked_asset_id)
      if (asset) goal.current_value = Number(asset.current_value)
    } else if (goal.linked_debt_id) {
      const debt = loadedDebts.find(d => d.id === goal.linked_debt_id)
      if (debt) {
        // For debt payoff: progress = original target − remaining balance
        goal.current_value = Math.max(0, Number(goal.target_value) - Number(debt.current_balance))
      }
    }
  }

  // 7. Compute goal progresses
  const goalProgresses = goals.map(g => computeGoalProgress(g))

  // 8. Enrich actions with assigner display names
  let enrichedActions = enrichedActionsRaw
  const assignerIds = [
    ...new Set(
      enrichedActions
        .filter(a => a.assigned_by && a.assigned_by !== currentUserId)
        .map(a => a.assigned_by as string),
    ),
  ]
  if (assignerIds.length > 0) {
    const { data: assignerProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', assignerIds)
    if (assignerProfiles) {
      const nameMap = Object.fromEntries(
        assignerProfiles.map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]),
      )
      enrichedActions = enrichedActions.map(a =>
        a.assigned_by && nameMap[a.assigned_by]
          ? { ...a, assigned_by_name: nameMap[a.assigned_by] }
          : a,
      )
    }
  }

  // 9. Build KPI data
  const kpiData: WillKpiData = {
    completedActions: allActions.filter(a => a.status === 'completed'),
    allActions,
    openActions: allActions.filter(a => a.status === 'open' || a.status === 'postponed'),
    allPendingRecs,
    goals,
    completedGoalCount,
    totalGoalCount,
    goalProgresses,
  }

  // 10. Return assembled result
  return {
    recommendations: recsForList,
    actions: enrichedActions,
    kpiData,
    goals,
    goalProgresses,
    goalAssets: loadedAssets,
    goalDebts: loadedDebts,
    partnerInfo,
    currentUserId,
    userProfile,
    completedGoalCount,
    totalGoalCount,
  }
}
