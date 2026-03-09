/**
 * Server-side data loader for the Will (De Wil) landing page.
 *
 * Extracts the data-fetching logic from the client-side will/page.tsx
 * so it can be called from a Server Component or API route.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
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
// Loader
// ---------------------------------------------------------------------------

export async function loadWillData(supabase: SupabaseClient): Promise<WillPageData> {
  const today = new Date().toISOString().split('T')[0]

  // 1. Get authenticated user
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  const currentUserId = authUser?.id ?? null

  // 2. Check household membership for shared goals
  let householdFilter = ''
  let partnerInfo: WillPageData['partnerInfo'] = null

  if (authUser) {
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', authUser.id)
      .maybeSingle()

    if (membership?.household_id) {
      householdFilter = `,and(ownership.eq.shared,household_id.eq.${membership.household_id})`

      // 3. Fetch partner info if household exists
      const { data: allMembers } = await supabase
        .from('household_members')
        .select('user_id')
        .eq('household_id', membership.household_id)

      const partnerId = (allMembers ?? []).find((m: { user_id: string }) => m.user_id !== authUser.id)?.user_id
      if (partnerId) {
        const { data: partnerProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', partnerId)
          .single()
        partnerInfo = {
          partnerId,
          partnerName: partnerProfile?.full_name ?? 'Partner',
        }
      }
    }
  }

  const goalFilter = authUser
    ? `user_id.eq.${authUser.id}${householdFilter}`
    : `user_id.eq.00000000-0000-0000-0000-000000000000`

  // 4. Run the 10 parallel queries
  const [
    actionsRes,
    pendingRecsRes,
    _feedbackRes,
    activeGoalsRes,
    completedGoalCountRes,
    totalGoalCountRes,
    recsForListRes,
    actionsForBoardRes,
    assetsRes,
    debtsRes,
  ] = await Promise.all([
    // KPI actions (lightweight select)
    supabase
      .from('actions')
      .select('id, status, freedom_days_impact, source, completed_at, due_date, created_at, recommendation:recommendations(recommendation_type)')
      .order('created_at', { ascending: false }),
    // Pending / postponed recommendations for KPI
    supabase
      .from('recommendations')
      .select('id, status, recommendation_type, freedom_days_per_year, decided_at, created_at')
      .in('status', ['pending', 'postponed']),
    // Feedback (fetched for completeness, matches original loadData)
    supabase
      .from('recommendation_feedback')
      .select('id, feedback_type, recommendation_type, freedom_days_impact, created_at'),
    // Active goals (max 5)
    supabase
      .from('goals')
      .select('*, budgets:budget_id(id, name)')
      .or(goalFilter)
      .eq('is_completed', false)
      .order('sort_order', { ascending: true })
      .limit(5),
    // Completed goal count
    supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .or(goalFilter)
      .eq('is_completed', true),
    // Total goal count
    supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .or(goalFilter),
    // Full recommendations for RecommendationList
    supabase
      .from('recommendations')
      .select('*')
      .or(`status.eq.pending,and(status.eq.postponed,postponed_until.lte.${today})`)
      .order('priority_score', { ascending: false })
      .order('created_at', { ascending: false }),
    // Full actions for ActionBoard
    supabase
      .from('actions')
      .select('*, recommendation:recommendations(title, recommendation_type)')
      .order('status', { ascending: true })
      .order('priority_score', { ascending: false })
      .order('sort_order', { ascending: true }),
    // Assets for GoalForm auto-link
    supabase.from('assets').select('id, name, current_value').eq('is_active', true),
    // Debts for GoalForm auto-link
    supabase.from('debts').select('id, name, current_balance').eq('is_active', true),
  ])

  const allActions = (actionsRes.data ?? []) as AllAction[]
  const allPendingRecs = (pendingRecsRes.data ?? []) as PendingRec[]
  const goals = (activeGoalsRes.data ?? []) as GoalWithBudget[]
  const loadedAssets = (assetsRes.data ?? []) as { id: string; name: string; current_value: number }[]
  const loadedDebts = (debtsRes.data ?? []) as { id: string; name: string; current_balance: number }[]

  const completedGoalCount = completedGoalCountRes.count ?? 0
  const totalGoalCount = totalGoalCountRes.count ?? 0

  // 5. Fetch user profile
  let userProfile: { full_name: string | null } = { full_name: null }
  if (authUser?.id) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', authUser.id)
      .single()
    userProfile = { full_name: profileData?.full_name ?? null }
  }

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
  let enrichedActions = (actionsForBoardRes.data as Action[]) ?? []
  const assignerIds = [
    ...new Set(
      enrichedActions
        .filter(a => a.assigned_by && a.assigned_by !== authUser?.id)
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
    recommendations: (recsForListRes.data as Recommendation[]) ?? [],
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
