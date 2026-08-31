/**
 * Server-side data loader for the Fin (Overzicht) landing page.
 *
 * Assets/debts/profile komen uit de gedeelde basisdata-laag
 * (lib/server-data/base.ts, Task 2.1): React `cache()` dedupliceert die
 * queries binnen één request met dashboard/horizon/lever/shell, dus een
 * expliciete `shared`-parameter is niet meer nodig — de dedupe gebeurt op
 * cache-niveau. Interne queries zijn geconsolideerd: actions 2→1,
 * recommendations 2→1, goals 3→1.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
import type { Recommendation, Action } from '@/lib/recommendation-data'
import { computeGoalProgress, type Goal, type GoalProgress } from '@/lib/goal-data'
import { resolveEffectiveIncomeExpenses, type IncomeExpenseSources } from '@/lib/effective-financials'
import { localMonthBounds } from '@/lib/month-range'
import { getActiveAssets, getActiveDebts, getOwnProfile, getBudgets } from '@/lib/server-data/base'
import { loadBudgetBasis } from '@/lib/household/budget-share'
import type { BudgetBasisRow } from '@/lib/budget-basis'
import { syncActiveGoalValues } from '@/lib/goal-current-value'
import { isVrijheidsgetalGoal } from '@/lib/goals/vrijheidsgetal-goal'
import { loadVrijheidsgetalSnapshot } from '@/lib/goals/vrijheidsgetal-source'
// Doel-`current_value`-sync + cap-splitsing wonen nu in de gedeelde
// `lib/goal-current-value.ts` (ÉNE bron voor scherm + dashboard-widget). Deze
// re-export houdt de bestaande import-paden (o.a. lib/fin-data-loader.test.ts)
// intact.
export {
  isParameterGoal,
  splitActiveGoals,
  computeParameterEffectiveSalary,
  computeParameterWeightedReturnPct,
  pickLatestSnapshotFireAge,
} from '@/lib/goal-current-value'

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

export interface FinKpiData {
  completedActions: CompletedAction[]
  allActions: AllAction[]
  openActions: OpenAction[]
  allPendingRecs: PendingRec[]
  goals: GoalWithBudget[]
  completedGoalCount: number
  totalGoalCount: number
  goalProgresses: GoalProgress[]
}

export interface FinPageData {
  recommendations: Recommendation[]
  actions: Action[]
  kpiData: FinKpiData
  goals: GoalWithBudget[]
  goalProgresses: GoalProgress[]
  partnerInfo: { partnerId: string; partnerName: string } | null
  currentUserId: string | null
  userProfile: { full_name: string | null }
  completedGoalCount: number
  totalGoalCount: number
  /**
   * Draait het vrijheidsgetal-doel op de canonieke FIRE-motor (bevinding C10)?
   * `false` wanneer er geen zo'n doel is óf de motor geen doelbedrag kon leveren
   * — dan staan de opgeslagen waarden op de kaart en mag de UI géén
   * "volgt automatisch"-belofte doen.
   */
  vrijheidsgetalLive: boolean
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loadFinData(
  supabase: SupabaseClient,
): Promise<FinPageData> {
  const today = new Date().toISOString().split('T')[0]

  // 1. Get authenticated user. getCachedUser is React `cache()`-gewrapt, dus dit
  //    deelt de auth-round-trip met de andere loaders binnen hetzelfde request.
  const authUser = await getCachedUser(supabase)
  const currentUserId: string | null = authUser?.id ?? null

  // 2. Household membership + partner-name resolution.
  //    Started as a single chained promise so it runs in parallel with the
  //    main queries below. Goals depends on `householdFilter`, so its query
  //    is chained on this promise — it kicks off the moment membership
  //    resolves and runs in parallel with whatever else is still in flight.
  const householdPromise = (async (): Promise<{
    householdFilter: string
    partnerInfo: FinPageData['partnerInfo']
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
  // - Assets/debts/profile: uit de gedeelde basisdata-laag (lib/server-data/base.ts,
  //   Task 2.1). React cache() dedupliceert die met dashboard/horizon/lever/shell
  //   binnen hetzelfde request; de consumers lezen subsets (id/name/current_value ·
  //   id/name/current_balance · full_name) van select('*').
  const queries: PromiseLike<unknown>[] = [
    // [0] All actions with full fields + recommendation join (covers KPI + board).
    //     Expliciete `.limit(1000)` = de PostgREST-cap (supabase/config.toml
    //     max_rows = 1000); een client-`.limit()` boven die grens is een no-op, dus
    //     dit maakt de afkap zichtbaar i.p.v. impliciet. De board-modal (ActionList-
    //     Modal) toont álle statussen, dus de rijen zijn hier bewust nodig; de KPI-
    //     afleiding hieronder sommeert over ALLE teruggegeven rijen (geen kunstmatige
    //     JS-cap). Echte afkap-vrijheid voor tellingen bij >1000 acties zou — net als
    //     T2.2 voor transacties (ADR 0050) — een SECURITY-INVOKER aggregaat-RPC vergen
    //     (buiten scope T2.5, geen migratie).
    supabase
      .from('actions')
      .select('*, recommendation:recommendations(title, recommendation_type)')
      .order('status', { ascending: true })
      .order('priority_score', { ascending: false })
      .order('sort_order', { ascending: true })
      .limit(1000),
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
    // [3] Assets for GoalForm auto-link (gedeelde basisdata-laag)
    getActiveAssets(supabase),
    // [4] Debts for GoalForm auto-link (gedeelde basisdata-laag)
    getActiveDebts(supabase),
    // [5] User profile (RLS → eigen rij; gedeelde basisdata-laag)
    currentUserId
      ? getOwnProfile(supabase)
      : Promise.resolve({ data: null }),
  ]

  const [results, household] = await Promise.all([
    Promise.all(queries),
    householdPromise,
  ])
  const { partnerInfo } = household

  // Unpack results
  const actionsResult = results[0] as { data: unknown[] | null }
  const recsResult = results[1] as { data: unknown[] | null }
  const goalsResult = results[2] as { data: unknown[] | null }

  // Assets, debts, profile: uit de gedeelde basisdata-laag (results[3..5]).
  const loadedAssets = (((results[3] as { data: unknown[] | null })?.data ?? []) as { id: string; name: string; current_value: number }[])
  const loadedDebts = (((results[4] as { data: unknown[] | null })?.data ?? []) as { id: string; name: string; current_balance: number }[])
  const userProfile: { full_name: string | null } = {
    full_name: ((results[5] as { data: { full_name: string | null } | null })?.data as { full_name: string | null } | null)?.full_name ?? null,
  }

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
  // Tellingen blijven op `allGoals` (incl. parameter-doelen) → ongewijzigd correct.
  const completedGoalCount = allGoals.filter(g => g.is_completed).length
  const totalGoalCount = allGoals.length
  // Cap-splitsing (ronde 4) + LIVE-sync van de doel-`current_value`: parameter-
  // doelen (metadata.bron === 'parameter') staan BUITEN de max-5-slice en komen
  // vooraan; asset/debt-gekoppelde én parameter-doelen krijgen hun ACTUELE waarde
  // (huidig-vs-doel) uit consume-only bronnen vóór de voortgangsberekening. Dit
  // loopt via de GEDEELDE `syncActiveGoalValues` — exact dezelfde bron die de
  // dashboard-Doelen-widget consumeert, zodat scherm en widget nooit uiteenlopen.
  // LAZY: parameter-queries draaien alleen als er parameter-doelen zijn.
  // `goalProgresses` blijft index-gekoppeld aan deze `goals`-volgorde.
  // Het vrijheidsgetal-doel is de derde live bron (bevinding C10): huidige
  // waarde, doelbedrag én verwachte datum komen uit dezelfde canonieke FIRE-motor
  // die /overzicht toont. Thunk = lazy: zonder zo'n doel geen kernel-run.
  const { goals, fireSnapshot, vrijheidsgetalSynced } = await syncActiveGoalValues(
    supabase,
    allGoals,
    loadedAssets,
    loadedDebts,
    currentUserId,
    () => loadVrijheidsgetalSnapshot(supabase),
  )

  // 7. Compute goal progresses
  // De geprojecteerde FIRE-datum vervangt de opgeslagen streefdatum als `eta`;
  // alleen bij het vrijheidsgetal-doel, en alleen als de sync daadwerkelijk sloeg.
  const fireEta = vrijheidsgetalSynced > 0 ? (fireSnapshot?.eta ?? null) : null
  const goalProgresses = goals.map(g =>
    computeGoalProgress(g, isVrijheidsgetalGoal(g) ? { etaOverride: fireEta } : undefined),
  )

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
  const kpiData: FinKpiData = {
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
    partnerInfo,
    currentUserId,
    userProfile,
    completedGoalCount,
    totalGoalCount,
    vrijheidsgetalLive: vrijheidsgetalSynced > 0,
  }
}

/**
 * Effectieve maand-cijfers (inkomen + uitgaven) voor de Doelen-tab.
 *
 * CONSUME, don't recompute: aggregeert de lopende-maand-transacties (transfers
 * uitgesloten, spiegelt de dashboard-loader) en resolvet ze via de CANONIEKE
 * `resolveEffectiveIncomeExpenses` — dezelfde grondslag als `data.monthlyIncome`/
 * `data.monthlyExpenses` in de bundel. Handmatige profielbron ('manual') wint over
 * transacties. Bewust een aparte, lichte loader (2 gerichte queries) i.p.v. deze
 * kosten aan `loadFinData` (4 hot call-sites) toe te voegen — alleen de doelen-
 * pagina heeft de cijfers nodig, voor de gepersonaliseerde standaard-doelen-kiezer.
 */
export async function loadEffectiveMonthlyFigures(
  supabase: SupabaseClient,
): Promise<{ monthlyIncome: number; monthlyExpenses: number }> {
  const user = await getCachedUser(supabase)
  const { start: monthStart, end: monthEnd } = localMonthBounds(new Date())
  // BEWUST `getOwnProfile` (select('*')) i.p.v. de vroegere expliciete
  // kolomlijst: de grondslag-selectie leeft op `cashflow_basis_prefs` (ADR 0103)
  // en die kolom bestaat pas na migratie 20260811160000 — één onbekende kolom in
  // een expliciete lijst zou de hele profielquery laten falen. Bovendien is deze
  // fetcher cache()-gedeeld, dus binnen een render kost hij niets extra.
  const profileQuery: PromiseLike<{ data: Record<string, unknown> | null }> = user
    ? (getOwnProfile(supabase) as unknown as PromiseLike<{ data: Record<string, unknown> | null }>)
    : Promise.resolve({ data: null })
  const [txRes, profileRes, budgetsRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount, transaction_type')
      .gte('date', monthStart)
      .lt('date', monthEnd),
    profileQuery,
    // Budgetgrondslag (ADR 0103) — gedeelde, cache()'de fetch; zonder deze zou de
    // Doelen-tab een ander effectief maandinkomen tonen dan de bundel, terwijl
    // deze helper juist bestaat om diezelfde grondslag te garanderen.
    user ? getBudgets(supabase) : Promise.resolve({ data: null }),
  ])

  let txIncome = 0
  let txExpenses = 0
  for (const t of (txRes.data ?? []) as { amount: number | string; transaction_type?: string | null }[]) {
    if (t.transaction_type === 'transfer' || t.transaction_type === 'joint_transfer') continue
    const amt = Number(t.amount)
    if (!Number.isFinite(amt)) continue
    if (amt > 0) txIncome += amt
    else txExpenses += Math.abs(amt)
  }

  const goalsBudgetBasis = await loadBudgetBasis(
    supabase,
    profileRes.data,
    (budgetsRes.data ?? []) as unknown as BudgetBasisRow[],
  )
  const { income, expenses } = resolveEffectiveIncomeExpenses(
    (profileRes.data ?? {}) as IncomeExpenseSources,
    txIncome,
    txExpenses,
    { income: goalsBudgetBasis.income.monthlyTotal, expenses: goalsBudgetBasis.expenses.monthlyTotal },
  )
  return {
    monthlyIncome: income > 0 ? Math.round(income) : 0,
    monthlyExpenses: expenses > 0 ? Math.round(expenses) : 0,
  }
}
