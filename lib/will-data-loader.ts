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
import type { Debt } from '@/lib/debt-data'
import { savingsRateFromAggregates, computeDebtAflossingMonthly } from '@/lib/savings-source'
import { resolveEffectiveIncomeExpenses, type IncomeExpenseSources } from '@/lib/effective-financials'
import { localMonthStart, localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'

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
  // Tellingen blijven op `allGoals` (incl. parameter-doelen) → ongewijzigd correct.
  const completedGoalCount = allGoals.filter(g => g.is_completed).length
  const totalGoalCount = allGoals.length
  // Cap-splitsing (ronde 4): lab-gegenereerde parameter-doelen (metadata.bron ===
  // 'parameter') staan BUITEN de max-5-slice zodat ze nooit door gewone handmatige
  // doelen worden verdrongen; ze komen vooraan. `goalProgresses` blijft index-
  // gekoppeld aan deze `goals`-volgorde.
  const { goals, parameterGoals } = splitActiveGoals(allGoals)

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

  // 6b. Parameter-doelen (ronde 4): injecteer de ACTUELE waarde (huidig-vs-doel)
  // uit consume-only bronnen — spaarquote/salaris/rendement/vrijheidsleeftijd — vóór
  // de voortgangsberekening. LAZY: draait alleen queries als er parameter-doelen in
  // de selectie zitten, en per type alleen wat nodig is. Handmatige savings_rate/
  // salary-doelen (zonder bron-tag) blijven ongemoeid.
  await injectParameterGoalCurrentValues(supabase, parameterGoals, currentUserId)

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
    partnerInfo,
    currentUserId,
    userProfile,
    completedGoalCount,
    totalGoalCount,
  }
}

// ---------------------------------------------------------------------------
// Parameter-doelen (ronde 4) — cap-splitsing + actuele-waarde-injectie
// ---------------------------------------------------------------------------
//
// Parameter-doelen worden door het /toekomst-lab gegenereerd ("verkennen wordt
// richten", DOEL_PARAMETERS in lib/horizon/toekomst-scenario.ts) en dragen
// `metadata.bron === 'parameter'`. Twee taken hier:
//   1. Ze staan BUITEN de max-5-slice (`splitActiveGoals`) — parameter-doelen
//      eerst, daarna max 5 handmatige.
//   2. Hun `current_value` (huidig-vs-doel) komt uit CONSUME-ONLY bronnen i.p.v.
//      de DB-kolom: de actuele stand van spaarquote/salaris/rendement/
//      vrijheidsleeftijd. Alle queries zijn LAZY (alleen bij aanwezige
//      parameter-doelen) en per-type gated; er draait GEEN kernel/projectie hier.
//
// Elke bron reuse't de canonieke rekenhelpers (savingsRateFromAggregates,
// computeDebtAflossingMonthly, resolveEffectiveIncomeExpenses) of dezelfde
// weegregels als `buildCategorieReturnGroups` — geen tweede formule-thuis.
// De vier ondersteunde types (savings_rate | salary | expected_return | fire_age)
// worden in `injectParameterGoalCurrentValues` per stuk gate't.

/**
 * Is dit een lab-gegenereerd parameter-doel? Defensief: `metadata` kan ontbreken
 * (oude rijen), `null` (oud) of `{}` (default) zijn. Alleen een object met
 * `bron === 'parameter'` telt — handmatige savings_rate/salary-doelen (zonder
 * bron-tag) blijven dus expliciet BUITEN deze set (regressie-eis).
 */
export function isParameterGoal(goal: { metadata?: Record<string, unknown> | null }): boolean {
  const m = goal.metadata
  return typeof m === 'object' && m !== null && (m as Record<string, unknown>).bron === 'parameter'
}

/**
 * Cap-splitsing: actieve doelen → parameter-doelen (vooraan, ongelimiteerd; de
 * partial unique index begrenst ze feitelijk op één per type = max 4) + maximaal
 * 5 handmatige. `parameterGoals` wordt apart teruggegeven zodat de injectie
 * alleen die rijen hoeft te raken (én zonder de handmatige rijen aan te tikken).
 */
export function splitActiveGoals<T extends GoalWithBudget>(
  allGoals: T[],
): { goals: T[]; parameterGoals: T[] } {
  const active = allGoals.filter(g => !g.is_completed)
  const parameterGoals = active.filter(isParameterGoal)
  const overige = active.filter(g => !isParameterGoal(g))
  return { goals: [...parameterGoals, ...overige.slice(0, 5)], parameterGoals }
}

// ── Rij-types voor de lazy injectie-queries (kolom-scoped, licht) ──
type ParamTxRow = { amount: number | string; budget_id: string | null; date: string }
type ParamBudgetRow = { id: string; budget_type: string | null; parent_id: string | null }
type ParamAssetRow = {
  current_value: number | string | null
  expected_return: number | string | null
  net_worth_inclusion_pct: number | string | null
  asset_type: string
  is_active: boolean
}

/**
 * Actuele spaarquote (%) — CONSUME van de canonieke `savingsRateFromAggregates`
 * op 6-maands transactie-aggregaten, mét de savings-budget- en schuldaflossing-
 * add-backs die /overzicht/cashflow óók toepast (spiegelt lib/horizon-data-loader.ts
 * `savingsRate6m`: spaarbudget-uitgaven tellen als sparen → uit de uitgaven-term;
 * schuldaflossing via de gedeelde `computeDebtAflossingMonthly`). Zo staat het
 * getal op de goal-kaart op DEZELFDE grondslag als de spaarquote-widget.
 *
 * BEWUSTE VEREENVOUDIGINGEN t.o.v. de volledige loader (gedocumenteerd in rapport):
 *   - GEEN <6-maands extrapolatie: bij ≥6 mnd data byte-identiek; <6 mnd wijkt licht
 *     af (de ratio is grotendeels schaal-invariant).
 *   - GEEN nul-transactie profiel-fallback: `income6m ≤ 0` → `undefined` (tolerant:
 *     laat de DB-waarde staan i.p.v. een misleidende 0%).
 * Rondt op 1 decimaal (zoals `formatGoalValue` voor `%`). Een negatieve quote
 * (meer uitgeven dan verdienen) blijft eerlijk behouden — geen kunstmatige clamp.
 */
export function computeParameterSavingsRatePct(
  tx: readonly ParamTxRow[],
  budgets: readonly ParamBudgetRow[],
  debts: readonly Debt[],
): number | undefined {
  // Savings-budget-ids: eigen type 'savings' OF (kind met savings-parent) — zelfde
  // parent-eerst-erving als de dashboard/horizon-loader.
  const typeById = new Map<string, string>()
  for (const b of budgets) if (b.budget_type) typeById.set(b.id, b.budget_type)
  const effType = (b: ParamBudgetRow): string | undefined =>
    b.parent_id ? (typeById.get(b.parent_id) ?? b.budget_type ?? undefined) : (b.budget_type ?? undefined)
  const savingsBudgetIds = new Set<string>()
  for (const b of budgets) if (effType(b) === 'savings') savingsBudgetIds.add(b.id)

  let income6m = 0
  let expenses6m = 0
  let savingsBudgetSpent6m = 0
  for (const t of tx) {
    const amt = Number(t.amount)
    if (!Number.isFinite(amt)) continue
    if (amt > 0) { income6m += amt; continue }
    expenses6m += Math.abs(amt)
    if (t.budget_id && savingsBudgetIds.has(t.budget_id)) savingsBudgetSpent6m += Math.abs(amt)
  }
  if (!(income6m > 0)) return undefined

  const debtAflossing6m = computeDebtAflossingMonthly(debts as Debt[]) * 6
  const pct = savingsRateFromAggregates(income6m, expenses6m - savingsBudgetSpent6m, debtAflossing6m)
  return Math.round(pct * 10) / 10
}

/**
 * Effectief maandinkomen (€) — CONSUME van de canonieke `resolveEffectiveIncomeExpenses`
 * met de HUIDIGE-maand transactie-splitsing (zelfde bron als de bestaande loaders).
 * Handmatige bron ('manual') wint over transacties. `income ≤ 0` (geen bron) →
 * `undefined` (tolerant: laat de DB-waarde staan). Afgerond op hele euro's (unit EUR).
 */
export function computeParameterEffectiveSalary(
  profile: IncomeExpenseSources | null,
  tx: readonly ParamTxRow[],
  monthStart: string,
): number | undefined {
  let monthIncome = 0
  let monthExpenses = 0
  for (const t of tx) {
    if (t.date < monthStart) continue // alleen de lopende maand
    const amt = Number(t.amount)
    if (!Number.isFinite(amt)) continue
    if (amt > 0) monthIncome += amt
    else monthExpenses += Math.abs(amt)
  }
  const { income } = resolveEffectiveIncomeExpenses(profile ?? {}, monthIncome, monthExpenses)
  return income > 0 ? Math.round(income) : undefined
}

/**
 * Gewogen verwacht rendement (%) over de actieve assets — één TOTAAL met exact de
 * weegregels van `buildCategorieReturnGroups` (lib/horizon/toekomst-scenario.ts):
 * actieve assets, inclusion-gewogen waarde, `expected_return/100` (nul-basis).
 * Σ(waarde × rendement) / Σ(waarde). Geen assets/waarde → `undefined` (tolerant).
 * Rondt op 1 decimaal (zoals `formatGoalValue` voor `%`).
 */
export function computeParameterWeightedReturnPct(
  assets: readonly ParamAssetRow[],
): number | undefined {
  let totalValue = 0
  let weightedReturnSum = 0
  for (const a of assets) {
    if (a.is_active === false) continue
    const inclRaw = Number(a.net_worth_inclusion_pct ?? 100) / 100
    const inclFactor = Number.isFinite(inclRaw) ? inclRaw : 1
    const value = Number(a.current_value ?? 0) * inclFactor
    if (!(value > 0)) continue
    const retRaw = Number(a.expected_return ?? 0) / 100
    const ret = Number.isFinite(retRaw) ? retRaw : 0
    totalValue += value
    weightedReturnSum += value * ret
  }
  if (!(totalValue > 0)) return undefined
  return Math.round((weightedReturnSum / totalValue) * 100 * 10) / 10
}

/**
 * Laatste bekende `net_worth_snapshots.fire_age` (fractioneel toegestaan). De query
 * levert de meest recente niet-NULL rij vooraan; NUMERIC komt als string terug uit
 * Supabase → expliciet casten. Geen snapshot / niet-positief → `undefined` (tolerant:
 * laat de DB-waarde staan, geen misleidende 0 die "0% rood" zou schreeuwen).
 */
export function pickLatestSnapshotFireAge(
  rows: readonly { fire_age?: number | string | null }[],
): number | undefined {
  const raw = rows[0]?.fire_age
  if (raw == null) return undefined
  const fa = Number(raw)
  return Number.isFinite(fa) && fa > 0 ? fa : undefined
}

/**
 * LAZY per-type injectie van de actuele waarde op parameter-doelen. Muteert de
 * meegegeven `parameterGoals` in-place (zelfde patroon als de asset/debt-auto-link
 * hierboven). Draait GEEN query wanneer er geen parameter-doelen zijn, en per bron
 * alleen wat een aanwezig doel-type nodig heeft. Ontbrekende bron → `current_value`
 * blijft op de DB-waarde (tolerante degradatie; de UI toont "onbekend/live in het lab").
 */
async function injectParameterGoalCurrentValues(
  supabase: SupabaseClient,
  parameterGoals: GoalWithBudget[],
  userId: string | null,
): Promise<void> {
  if (parameterGoals.length === 0) return

  const needsSavingsRate = parameterGoals.some(g => g.goal_type === 'savings_rate')
  const needsSalary = parameterGoals.some(g => g.goal_type === 'salary')
  const needsReturn = parameterGoals.some(g => g.goal_type === 'expected_return')
  const needsFireAge = parameterGoals.some(g => g.goal_type === 'fire_age')
  const needsTx = needsSavingsRate || needsSalary

  const now = new Date()
  const monthStart = localMonthStart(now)
  const monthEnd = localMonthBounds(now).end
  const sixMonthsAgo = localMonthStartMonthsAgo(now, 5)

  const [txRows, budgetRows, debtRows, profileRow, assetRows, snapshotRows] = await Promise.all([
    needsTx
      ? supabase
          .from('transactions')
          .select('amount, budget_id, date')
          .gte('date', sixMonthsAgo)
          .lt('date', monthEnd)
          .then(r => ((r.data ?? []) as ParamTxRow[]))
      : Promise.resolve([] as ParamTxRow[]),
    needsSavingsRate
      ? supabase
          .from('budgets')
          .select('id, budget_type, parent_id')
          .then(r => ((r.data ?? []) as ParamBudgetRow[]))
      : Promise.resolve([] as ParamBudgetRow[]),
    needsSavingsRate
      ? supabase
          .from('debts')
          .select(
            'id, current_balance, interest_rate, monthly_payment, repayment_type, end_date, is_active, include_aflossing_in_savings, custom_aflossing_amount, net_worth_inclusion_pct',
          )
          .eq('is_active', true)
          .then(r => ((r.data ?? []) as unknown as Debt[]))
      : Promise.resolve([] as Debt[]),
    needsSalary && userId
      ? supabase
          .from('profiles')
          .select('net_monthly_income, income_source, estimated_monthly_expenses, expenses_source')
          // Belt-and-suspenders: eigen-rij expliciet (spiegelt de profiles-query
          // op regel ~194). RLS scopet al op auth.uid(); dit maakt de intentie
          // hard en voorkomt een cross-account lek mocht RLS ooit wijken.
          .eq('id', userId)
          .maybeSingle()
          .then(r => (r.data as IncomeExpenseSources | null))
      : Promise.resolve(null as IncomeExpenseSources | null),
    needsReturn
      ? supabase
          .from('assets')
          .select('current_value, expected_return, net_worth_inclusion_pct, asset_type, is_active')
          .eq('is_active', true)
          .then(r => ((r.data ?? []) as ParamAssetRow[]))
      : Promise.resolve([] as ParamAssetRow[]),
    needsFireAge
      ? supabase
          .from('net_worth_snapshots')
          .select('fire_age')
          .not('fire_age', 'is', null)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .then(r => ((r.data ?? []) as { fire_age?: number | string | null }[]))
      : Promise.resolve([] as { fire_age?: number | string | null }[]),
  ])

  const savingsRatePct = needsSavingsRate
    ? computeParameterSavingsRatePct(txRows, budgetRows, debtRows)
    : undefined
  const salaryMonthly = needsSalary
    ? computeParameterEffectiveSalary(profileRow, txRows, monthStart)
    : undefined
  const weightedReturnPct = needsReturn ? computeParameterWeightedReturnPct(assetRows) : undefined
  const fireAge = needsFireAge ? pickLatestSnapshotFireAge(snapshotRows) : undefined

  for (const g of parameterGoals) {
    switch (g.goal_type) {
      case 'savings_rate':
        if (savingsRatePct !== undefined) g.current_value = savingsRatePct
        break
      case 'salary':
        if (salaryMonthly !== undefined) g.current_value = salaryMonthly
        break
      case 'expected_return':
        if (weightedReturnPct !== undefined) g.current_value = weightedReturnPct
        break
      case 'fire_age':
        if (fireAge !== undefined) g.current_value = fireAge
        break
    }
  }
}
