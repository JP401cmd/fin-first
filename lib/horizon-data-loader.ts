/**
 * Server-side data loader for the Horizon page.
 *
 * Extracts all Supabase queries from the client-side loadData callback
 * and runs them on the server, returning a typed HorizonPageData bundle.
 *
 * Dividend income and household/partner FIRE data are NOT included here —
 * they remain client-side fetches in horizon-landing.tsx.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ageAtDate,
  computeFireProjection,
  computeLifeEventImpact,
  type FinancialInput,
  type LifeEvent,
  type LifeEventImpact,
} from '@/lib/horizon-data'
import type { Action } from '@/lib/recommendation-data'
import { computeYearlyMustExpenses, computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { Asset } from '@/lib/asset-data'
import { type Debt, computeRenteAflossingsSplit } from '@/lib/debt-data'
import { resolveFireStrategyWithOverride, type FireStrategyConfig } from '@/lib/fire-strategy'
import { resolveFireParams, type FireParams } from '@/lib/fire-params'
import { resolveWithdrawalStrategy, type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { computeHealthScoreFromInputs, type HealthScore, type HealthScoreInput } from '@/lib/financial-health'
import { computeEffectiveExpenses, computeFireTarget, computeFreedomPercentage } from '@/lib/core-metrics'
import {
  parseHousingStrategy,
  deriveHousingContext,
  getFireEligibleNetWorth,
  getHousingLifeEvents,
  type HousingStrategyConfig,
  type HousingContext,
} from '@/lib/housing-strategy'
import { loadPerspectiveData } from '@/lib/household/perspective-loader'
import type { Perspective } from '@/lib/household-data'

// Snapshot type for resilience trend data
export type SnapshotForTrend = {
  snapshot_date: string
  resilience_score: number | null
  net_worth: number
  freedom_percentage: number | null
  fire_age: number | null
}

export interface HorizonPageData {
  effectiveInput: FinancialInput
  events: LifeEvent[]
  impacts: LifeEventImpact[]
  actions: Action[]
  debts: Debt[]
  fireStrategy: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
  fireParams: FireParams
  resilienceSnapshots: SnapshotForTrend[]
  snapshotResilience: number | null
  avgIncome6m: number
  avgExpenses6m: number
  /** Health score computed server-side (5 or 6 pillars) */
  healthScore: HealthScore
  /** Health score input data for client-side recomputation */
  healthScoreInput: HealthScoreInput
  /** Whether the user has active budgeting (cash accounts with budgets) */
  budgetingActive: boolean
  /** Full assets array for vermogensopbouw stacked chart */
  assets: Asset[]
  /** Box 3 berekeningsmethode (forfaitair of werkelijk), afgeleid uit fireParams */
  box3Method: 'forfaitair' | 'werkelijk'
  /** Of de gebruiker een fiscaal partner heeft (voor heffingsvrij vermogen berekening) */
  hasPartner: boolean
  /** Error message from profile query, null if successful */
  profileError: string | null
  /** Total balance of disconnected bank accounts (not linked to assets) */
  unlinkedCash: number
  /** Number of children from profile (for erfgenamen calculation) */
  numberOfChildren: number
  /** Of de gebruiker de Horizon-prognose setup-pane heeft doorlopen + opgeslagen.
   *  Bepaalt of de intro-card de hoofd-grafiek vervangt op /horizon. */
  hasCompletedHorizonSetup: boolean
  /** Maandelijks spaar-override uit profiles.monthly_savings_override.
   *  NULL = gebruik asset-aggregaat (monthlyContributionFromAssets). */
  monthlySavingsOverride: number | null
  /** Maandelijkse asset-contributie-aggregaat (assets.monthly_contribution).
   *  Voor weergave in setup-pane als "berekende waarde". */
  monthlyContributionFromAssets: number
  /** Maandelijks surplus uit budget-data (avgIncome6m - avgExpenses6m), null
   *  als budgetteren-module uit staat of geen surplus. Voor setup-pane summary. */
  monthlySurplusFromBudget: number | null
  /** Retirement-expense methode uit profile (raw, mogelijk null bij nieuwe users). */
  retirementExpenseMethod: RetirementExpenseMethod | null
  /** Retirement-expense custom amount uit profile (null als methode != custom_amount). */
  retirementExpenseCustomAmount: number | null
  /** Housing strategy uit profiles.housing_strategy_config (default include_full). */
  housingStrategy: HousingStrategyConfig
  /** Afgeleide context (eigen woning + linked mortgage aggregates). */
  housingContext: HousingContext
  /** Belegbaar vermogen voor pensioen — totaal vermogen minus equity bij relevante strategieën. */
  fireEligibleNetWorth: number
  /** ISO-timestamp wanneer de housing-strategy nudge-sheet is gedismist; null = nog niet getoond. */
  housingStrategyDismissedAt: string | null
}

/**
 * Cumulative FIRE impact calculation.
 * Each event is applied sequentially, so later events see the modified input.
 */
function computeCumulativeImpacts(
  baseInput: FinancialInput,
  events: LifeEvent[],
): LifeEventImpact[] {
  const sorted = [...events].sort((a, b) => (a.target_age ?? 999) - (b.target_age ?? 999))
  const results: LifeEventImpact[] = []
  let runningInput = { ...baseInput }

  for (const ev of sorted) {
    const impact = computeLifeEventImpact(runningInput, ev)
    results.push(impact)
    runningInput = {
      ...runningInput,
      totalAssets: runningInput.totalAssets - Number(ev.one_time_cost),
      monthlyExpenses: runningInput.monthlyExpenses + Number(ev.monthly_cost_change),
      monthlyIncome: runningInput.monthlyIncome + Number(ev.monthly_income_change),
    }
  }

  return events.map(ev => {
    const idx = sorted.findIndex(s => s.id === ev.id)
    return results[idx]
  })
}

/** Feature slug used to track whether the user has completed the Horizon
 *  prognose setup-pane. Stored in user_feature_visits. Shared with
 *  components/app/horizon/horizon-setup-pane.tsx so the POST after save
 *  matches the slug the loader reads. */
export const HORIZON_SETUP_COMPLETED_SLUG = 'horizon_setup_completed'

/** Default profile fallback values when profile query fails */
const PROFILE_DEFAULTS = {
  date_of_birth: null as string | null,
  retirement_expense_method: null as string | null,
  retirement_expense_custom_amount: null as number | null,
  fire_end_strategy: 'perpetual' as string,
  fire_end_age: 90,
  fire_legacy_amount: 0,
  expected_return: null as number | null,
  inflation_rate: null as number | null,
  net_monthly_income: 0,
  estimated_monthly_expenses: 0,
  household_type: 'solo' as string,
  withdrawal_strategy: 'static' as string,
  guardrail_floor: 0.80,
  guardrail_ceiling: 1.20,
  guardrail_cut_step: WITHDRAWAL_DEFAULTS.guardrailCutStep,
  guardrail_raise_step: WITHDRAWAL_DEFAULTS.guardrailRaiseStep,
  monthly_savings_override: null as number | null,
}

/**
 * Lichtgewicht Box 3-data voor tax_optimization-pillar. Geen volledige
 * calculateBox3-aanroep (vereist veel context) — een proxy-berekening:
 *  - Box 3-bezit = sum van cash + investment + savings + checking + crypto-assets
 *  - Heffingsvrij = €57.000 (single) of €114.000 (partner) per 2026
 *  - Tax = grondslag × 5,88% × 36% (forfaitair, vereenvoudigd)
 *
 * Niet 100% accuraat maar voldoende voor scoreTaxOptimization() in de
 * health-pillar. Voor exacte aangifte gebruikt /overzicht/belasting
 * de volledige calculateBox3.
 */
function buildTaxData(
  assets: ReadonlyArray<{ asset_type?: string; current_value?: number | string }>,
  unlinkedCash: number,
  profile: Record<string, unknown>,
): { box3Bezittingen: number; box3Tax: number; heffingsvrijVermogen: number; rendementsgrondslag: number } | null {
  const box3Types = new Set(['cash', 'savings', 'checking', 'investment', 'crypto'])
  const box3Bezittingen = assets
    .filter((a) => a.asset_type && box3Types.has(a.asset_type))
    .reduce((s, a) => s + Number(a.current_value ?? 0), 0) + unlinkedCash
  if (box3Bezittingen < 1_000) return null
  const householdType = String(profile.household_type ?? 'solo')
  const hasPartner = householdType === 'samenwonend' || householdType === 'getrouwd'
  const heffingsvrijVermogen = hasPartner ? 114_000 : 57_000
  const rendementsgrondslag = Math.max(0, box3Bezittingen - heffingsvrijVermogen)
  const box3Tax = Math.round(rendementsgrondslag * 0.0588 * 0.36)
  return { box3Bezittingen, box3Tax, heffingsvrijVermogen, rendementsgrondslag }
}

export async function loadHorizonData(
  supabase: SupabaseClient,
  /**
   * Perspectief (eigen / huishouden / partner). Optioneel + default 'personal'
   * zodat bestaande callers byte-identiek blijven. Alleen wanneer 'household'
   * of 'partner' worden de FIRE-vermogensaggregaten (totalAssets/totalDebts/
   * monthlyContributions) + de assets/debts-arrays via loadPerspectiveData
   * herberekend op het gevraagde aandeel. Health-score, housing-context en
   * Box 3 blijven op de eigen ruwe data — die zijn persoonlijk van aard.
   */
  perspective: Perspective = 'personal',
): Promise<HorizonPageData> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]
  const oneYearFromNow = new Date(Date.UTC(now.getFullYear() + 1, now.getMonth(), now.getDate())).toISOString().split('T')[0]
  const today = now.toISOString().split('T')[0]
  const twelveMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().split('T')[0]
  const sixMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 5, 1)).toISOString().split('T')[0]

  const [
    txResult,
    fullAssetsResult,
    debtsResult,
    profileResult,
    allBudgetsResult,
    eventsResult,
    actionsResult,
    fullDebtsResult,
    snapshotsResult,
    income12Result,
    earliestIncomeResult,
    tx6mResult,
    bankAccountsResult,
    wsResult,
    horizonSetupVisitResult,
    savingsOverrideResult,
  ] = await Promise.all([
    supabase.from('transactions').select('amount, budget_id').gte('date', monthStart).lt('date', monthEnd),
    // Single assets query: returns full rows (typed as Asset[]) used for both
    // aggregations (totalAssets, monthlyContributions, asset-type set) and the
    // unified projection. Replaces the previous trimmed-select + full-select
    // duplicate pair on the same table.
    supabase.from('assets').select('*').eq('is_active', true).limit(500),
    supabase.from('debts').select('current_balance, net_worth_inclusion_pct').eq('is_active', true),
    supabase.from('profiles').select('date_of_birth, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, expected_return, inflation_rate, net_monthly_income, estimated_monthly_expenses, budgeting_active, feature_preferences, household_type, number_of_children, housing_strategy_config, housing_strategy_dismissed_at').single(),
    // Single budget query (all budgets) — replaces separate essential + child queries
    supabase.from('budgets').select('id, name, default_limit, interval, budget_type, is_essential, parent_id'),
    supabase.from('life_events').select('id, name, event_type, target_age, target_date, one_time_cost, monthly_cost_change, monthly_income_change, duration_months, icon, is_active, sort_order, is_indexed, metadata').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase
      .from('actions')
      .select('*, recommendation:recommendations(title, recommendation_type)')
      .eq('status', 'open')
      .not('scheduled_week', 'is', null)
      .gte('scheduled_week', today)
      .lte('scheduled_week', oneYearFromNow)
      .order('scheduled_week', { ascending: true }),
    supabase.from('debts').select('*').eq('is_active', true).limit(200),
    supabase
      .from('net_worth_snapshots')
      .select('snapshot_date, resilience_score, net_worth, freedom_percentage, fire_age')
      .order('snapshot_date', { ascending: true })
      .limit(60),
    supabase.from('transactions').select('amount, date').gt('amount', 0).gte('date', twelveMonthsAgo).lt('date', monthEnd),
    supabase.from('transactions').select('date').gt('amount', 0).gte('date', twelveMonthsAgo).order('date', { ascending: true }).limit(1),
    // 6-month transactions for stable health score calculation (budget_id for savings-budget correction)
    supabase.from('transactions').select('amount, budget_id, date').gte('date', sixMonthsAgo).lt('date', monthEnd),
    supabase.from('bank_accounts').select('id, name, balance').eq('is_active', true).is('linked_asset_id', null),
    // Withdrawal-strategy profile columns. Folded into the main batch via
    // .maybeSingle() so a missing-column error on legacy DBs (migration
    // 20260318000001 still pending) returns null data instead of throwing —
    // saving the previous post-batch waterfall round-trip.
    supabase
      .from('profiles')
      .select('withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step')
      .maybeSingle(),
    // Horizon-setup-pane voltooid-marker. Wordt geschreven door
    // components/app/horizon/horizon-setup-pane.tsx na een succesvolle save.
    // Bepaalt of de intro-card de hoofd-grafiek vervangt op /horizon.
    // .maybeSingle() + try/catch downstream — table kan ontbreken op legacy DBs.
    supabase
      .from('user_feature_visits')
      .select('feature_slug')
      .eq('feature_slug', HORIZON_SETUP_COMPLETED_SLUG)
      .maybeSingle(),
    // monthly_savings_override profile-kolom. Aparte .maybeSingle()-query
    // zodat een ontbrekende kolom op legacy DBs (migratie 20260513000001
    // nog niet gerund) graceful null returnt ipv het hele profile-query
    // te laten falen.
    supabase
      .from('profiles')
      .select('monthly_savings_override')
      .maybeSingle(),
  ])

  // Same row both consumers want: alias instead of re-querying.
  const assetsResult = fullAssetsResult

  // Check profile query for errors and use fallback if needed
  if (profileResult.error) {
    console.error(
      `[horizon-data-loader] Profile query failed: code=${profileResult.error.code}, message=${profileResult.error.message}`,
      profileResult.error,
    )
  }
  const baseProfile = profileResult.data ?? PROFILE_DEFAULTS

  let wsData: {
    withdrawal_strategy?: string | null
    guardrail_floor?: number | null
    guardrail_ceiling?: number | null
    guardrail_cut_step?: number | null
    guardrail_raise_step?: number | null
  } = {}
  if (wsResult.error) {
    // Columns likely don't exist yet — use defaults silently
    console.warn(
      `[horizon-data-loader] Withdrawal strategy columns not available (migration pending): ${wsResult.error.code}`,
    )
  } else {
    wsData = wsResult.data ?? {}
  }

  const profile = {
    ...baseProfile,
    withdrawal_strategy: wsData.withdrawal_strategy ?? PROFILE_DEFAULTS.withdrawal_strategy,
    guardrail_floor: wsData.guardrail_floor ?? PROFILE_DEFAULTS.guardrail_floor,
    guardrail_ceiling: wsData.guardrail_ceiling ?? PROFILE_DEFAULTS.guardrail_ceiling,
    guardrail_cut_step: wsData.guardrail_cut_step ?? PROFILE_DEFAULTS.guardrail_cut_step,
    guardrail_raise_step: wsData.guardrail_raise_step ?? PROFILE_DEFAULTS.guardrail_raise_step,
  }

  // Monthly income/expenses from current month transactions
  let monthlyIncome = 0
  let monthlyExpenses = 0
  for (const tx of txResult.data ?? []) {
    const amt = Number(tx.amount)
    if (amt > 0) monthlyIncome += amt
    else monthlyExpenses += Math.abs(amt)
  }

  // Fallback to profile estimates for users without transactions
  const profileMonthlyIncome = Number(profile.net_monthly_income ?? 0)
  const profileMonthlyExpenses = Number(profile.estimated_monthly_expenses ?? 0)
  const effectiveMonthlyIncome = monthlyIncome > 0 ? monthlyIncome : profileMonthlyIncome
  const effectiveMonthlyExpenses = monthlyExpenses > 0 ? monthlyExpenses : profileMonthlyExpenses

  // 6-month average income/expenses for stable resilience calculation
  let totalIncome6m = 0
  let totalExpenses6m = 0
  for (const tx of tx6mResult.data ?? []) {
    const amt = Number(tx.amount)
    if (amt > 0) totalIncome6m += amt
    else totalExpenses6m += Math.abs(amt)
  }
  const avgIncome6m = totalIncome6m > 0 ? totalIncome6m / 6 : effectiveMonthlyIncome
  const avgExpenses6m = totalExpenses6m > 0 ? totalExpenses6m / 6 : effectiveMonthlyExpenses

  // Asset totals with inclusion percentages
  const totalAssetsOnly = (assetsResult.data ?? []).reduce((s, a) =>
    s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
  const unlinkedCash = (bankAccountsResult.data ?? []).reduce((s, a) => s + Number(a.balance), 0)
  const totalAssets = totalAssetsOnly + unlinkedCash
  const totalDebts = (debtsResult.data ?? []).reduce((s, d) =>
    s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
  const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

  // Extrapolated 12-month income
  const last12Income = income12Result.data?.reduce((s, t) => s + Number(t.amount), 0) ?? 0
  let extrapolatedIncome = last12Income
  const earliestIncomeDate = earliestIncomeResult.data?.[0]?.date
  if (earliestIncomeDate && last12Income > 0) {
    const earliest = new Date(earliestIncomeDate)
    const incomeMonths = Math.max(1, Math.min(12,
      (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth())
    ))
    if (incomeMonths < 12) {
      extrapolatedIncome = (last12Income / incomeMonths) * 12
    }
  }

  // ── Budget subsets from single query ──────────────────────────
  const allBudgetsRaw = (allBudgetsResult.data ?? []) as { id: string; name: string; default_limit: number; interval: string; budget_type: string; is_essential: boolean; parent_id: string | null }[]
  const essentialBudgets = allBudgetsRaw.filter(b => b.is_essential && b.budget_type === 'expense' && b.parent_id === null)
  const allParentBudgets = allBudgetsRaw.filter(b => b.parent_id === null)
  const allChildren = allBudgetsRaw.filter(b => b.parent_id !== null)

  // Budget type map: budget_id → budget_type (parent + child)
  const budgetTypeMap = new Map<string, string>()
  for (const b of allParentBudgets) budgetTypeMap.set(b.id, b.budget_type)
  for (const c of allChildren) {
    const parentType = budgetTypeMap.get(c.parent_id ?? '')
    if (parentType) budgetTypeMap.set(c.id, parentType)
  }

  // Yearly must expenses + retirement expenses
  const { yearlyMustExpenses } = computeYearlyMustExpenses(
    essentialBudgets,
    allChildren.filter(c => !['archive', 'income', 'savings'].includes(c.budget_type)),
  )

  const yearlyRetirementExpenses = computeRetirementExpenses(
    profile.retirement_expense_method as RetirementExpenseMethod,
    yearlyMustExpenses,
    extrapolatedIncome,
    profile.retirement_expense_custom_amount,
    profileMonthlyExpenses * 12,
  )

  const dob = profile.date_of_birth ?? null

  // FIRE strategy from profile — use override-aware resolver for pensioen fallback
  const fireStrategy = resolveFireStrategyWithOverride(profile)

  // Withdrawal strategy from profile (static/guardrails/vpw/bucket)
  const withdrawalStrategy = resolveWithdrawalStrategy(profile)

  // Berekeningsparameters uit profiel
  const fireParams = resolveFireParams(profile)

  // ── Perspectief-aware FIRE-vermogensaggregaten ────────────────────
  // Default 'personal' → byte-identiek aan voorheen. Bij 'household'/'partner'
  // herberekenen we totalAssets/totalDebts/monthlyContributions op het aandeel
  // dat in dat perspectief telt (via loadPerspectiveData; privacy reeds
  // server-side toegepast). De rest van de loader (health, housing, Box 3)
  // blijft op de eigen ruwe data — die metrics zijn persoonlijk van aard.
  let fireTotalAssets = totalAssets
  let fireTotalDebts = totalDebts
  let fireMonthlyContributions = monthlyContributions
  if (perspective !== 'personal') {
    try {
      const pd = await loadPerspectiveData(supabase, perspective)
      const share = (item: { ownership?: string; _myShareFraction?: number }, raw: number): number =>
        item.ownership === 'shared' && perspective !== 'household'
          ? raw * (item._myShareFraction ?? 1)
          : raw
      fireTotalAssets = pd.assets.reduce((s, a) => {
        const raw = Number(a.current_value) * ((Number(a.net_worth_inclusion_pct) || 100) / 100)
        return s + share(a, raw)
      }, 0) + unlinkedCash
      fireTotalDebts = pd.debts.reduce((s, d) => {
        const raw = Number(d.current_balance) * ((Number(d.net_worth_inclusion_pct) || 100) / 100)
        return s + share(d, raw)
      }, 0)
      fireMonthlyContributions = pd.assets.reduce((s, a) => {
        const raw = Number(a.monthly_contribution) || 0
        return s + share(a, raw)
      }, 0)
    } catch {
      // Perspectief-laden faalt (geen huishouden / RLS) → val terug op eigen data.
    }
  }

  // Build the effective FIRE input
  const effectiveInput: FinancialInput = {
    totalAssets: fireTotalAssets,
    totalDebts: fireTotalDebts,
    monthlyIncome: effectiveMonthlyIncome,
    monthlyExpenses: effectiveMonthlyExpenses,
    monthlyContributions: fireMonthlyContributions,
    yearlyMustExpenses: yearlyRetirementExpenses,
    dateOfBirth: dob,
  }

  // Process snapshot data for resilience score
  const allSnapshots = (snapshotsResult.data ?? []) as SnapshotForTrend[]
  const snapshotsWithResilience = allSnapshots.filter(s => s.resilience_score !== null && s.resilience_score !== undefined)
  const snapshotResilience = snapshotsWithResilience.length > 0
    ? snapshotsWithResilience[snapshotsWithResilience.length - 1].resilience_score
    : null

  // ── Health Score (5 or 6 pillars) ──────────────────────────
  // Detect budgetingActive from profile (defaults to true if column doesn't exist)
  const budgetingActive = (profile as Record<string, unknown>).budgeting_active !== false

  // ── savingsRate6m (same formula as dashboard-data-loader) ────
  // Savings-budget IDs: transactions mapped to savings budgets are saving, not spending
  const savingsBudgetIds = new Set<string>()
  for (const [id, type] of budgetTypeMap) {
    if (type === 'savings') savingsBudgetIds.add(id)
  }

  // 6-month savings-budget spend (add-back for spaarquote correction)
  let savingsBudgetSpent6m = 0
  // 6-month income/expenses split from tx6mResult (now has budget_id + date)
  let income6m = 0
  let expenses6m = 0
  for (const tx of tx6mResult.data ?? []) {
    const amt = Number(tx.amount)
    if (amt > 0) { income6m += amt; continue }
    expenses6m += Math.abs(amt)
    const bid = (tx as { budget_id?: string | null }).budget_id
    if (bid && savingsBudgetIds.has(bid)) {
      savingsBudgetSpent6m += Math.abs(amt)
    }
  }

  // Debt aflossing add-back (principal repayments count as saving)
  let debtAflossingMonthly = 0
  for (const d of fullDebtsResult.data ?? []) {
    if (!(d as any).include_aflossing_in_savings) continue
    const customAfl = (d as any).custom_aflossing_amount
    const aflossing = customAfl != null
      ? Number(customAfl)
      : (computeRenteAflossingsSplit(d as unknown as Debt)?.currentAflossing ?? 0)
    debtAflossingMonthly += aflossing * ((d as any).net_worth_inclusion_pct ?? 100) / 100
  }
  const debtAflossing6m = debtAflossingMonthly * 6

  // Extrapolate when < 6 months of data
  let dataMonths6 = 6
  const earliestIncomeDateH = earliestIncomeResult.data?.[0]?.date
  if (earliestIncomeDateH) {
    const earliest = new Date(earliestIncomeDateH)
    dataMonths6 = Math.max(1, Math.min(6,
      (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth())
    ))
  }
  const extIncome6 = dataMonths6 < 6 ? (income6m / dataMonths6) * 6 : income6m
  const extExpenses6 = dataMonths6 < 6 ? (expenses6m / dataMonths6) * 6 : expenses6m
  const extSavingsBudget6 = dataMonths6 < 6 ? (savingsBudgetSpent6m / dataMonths6) * 6 : savingsBudgetSpent6m

  let savingsRate6m = extIncome6 > 0
    ? ((extIncome6 - extExpenses6 + extSavingsBudget6 + debtAflossing6m) / extIncome6) * 100
    : 0

  // Fallback savings rate from profile estimates for users without transactions
  if (savingsRate6m === 0 && effectiveMonthlyIncome > 0 && effectiveMonthlyExpenses > 0) {
    savingsRate6m = Math.round(((effectiveMonthlyIncome - effectiveMonthlyExpenses) / effectiveMonthlyIncome) * 100)
  }

  // ── emergencyFundMonths: actual liquid assets (same as dashboard) ──
  const liquidAssets = (fullAssetsResult.data ?? [])
    .filter(a => {
      const type = (a as { asset_type?: string }).asset_type
      return type === 'savings' || type === 'checking' || type === 'cash'
    })
    .reduce((s, a) => s + Number(a.current_value), 0) + unlinkedCash
  const emergencyFundMonths = avgExpenses6m > 0 ? liquidAssets / avgExpenses6m : 0

  // ── freedomPct: strategy-adjusted FIRE target (same as dashboard) ──
  // Bij huishoud-/partnerweergave rekenen we met de perspectief-totalen
  // (fireTotalAssets/fireTotalDebts bevatten al partner-aandeel + gedeeld) zodat
  // netto vermogen, freedomPct én de healthScoreInput-totalen kloppen voor de
  // gekozen weergave. Eigen weergave blijft byte-identiek (zelfde totalAssets/Debts).
  const perspectiveTotalAssets = perspective !== 'personal' ? fireTotalAssets : totalAssets
  const perspectiveTotalDebts = perspective !== 'personal' ? fireTotalDebts : totalDebts
  const netWorth = perspectiveTotalAssets - perspectiveTotalDebts
  const fireSwr = fireParams.effectiveSwr
  const currentAge = dob ? ageAtDate(dob) : null
  const yearsInRetirement = (fireStrategy.strategy === 'deplete' && currentAge != null)
    ? Math.max(1, fireStrategy.endAge - Math.round(currentAge))
    : undefined
  const realReturn = (1 + fireParams.grossReturn) / (1 + fireParams.inflationRate) - 1
  const fireTarget = computeFireTarget(
    computeEffectiveExpenses(yearlyRetirementExpenses, effectiveMonthlyExpenses * 12),
    fireSwr,
    { strategy: fireStrategy.strategy, yearsInRetirement, realReturn },
  )
  const freedomPct = computeFreedomPercentage(netWorth, fireTarget)

  // ── assetTypeCount: distinct asset_type values ──
  const assetTypes = new Set((assetsResult.data ?? []).map(a => a.asset_type).filter(Boolean))
  if (unlinkedCash > 0) assetTypes.add('cash')
  const assetTypeCount = assetTypes.size

  // ── Budget discipline: actual budget limits vs spent (same as dashboard) ──
  const BUDGET_TYPES = ['income', 'expense', 'savings', 'debt'] as const
  const budgetLimits: Record<string, number> = { income: 0, expense: 0, savings: 0, debt: 0 }
  for (const b of allParentBudgets) {
    const type = b.budget_type as string
    if (!BUDGET_TYPES.includes(type as typeof BUDGET_TYPES[number])) continue
    const children = allChildren.filter(c => c.parent_id === b.id)
    const limit = children.length > 0
      ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
      : Number(b.default_limit)
    const monthlyLimit = b.interval === 'monthly' ? limit
      : b.interval === 'quarterly' ? limit / 3
      : limit / 12
    budgetLimits[type] = (budgetLimits[type] ?? 0) + monthlyLimit
  }

  const budgetSpent: Record<string, number> = { income: 0, expense: 0, savings: 0, debt: 0 }
  for (const tx of txResult.data ?? []) {
    const amt = Number(tx.amount)
    const budgetId = (tx as { budget_id?: string | null }).budget_id
    if (!budgetId) continue
    const type = budgetTypeMap.get(budgetId)
    if (!type || !BUDGET_TYPES.includes(type as typeof BUDGET_TYPES[number])) continue
    budgetSpent[type] = (budgetSpent[type] ?? 0) + Math.abs(amt)
  }

  const budgetCategories = [
    { limit: budgetLimits.expense, spent: budgetSpent.expense },
    { limit: budgetLimits.savings, spent: budgetSpent.savings },
    { limit: budgetLimits.debt, spent: budgetSpent.debt },
  ]

  const healthScoreInput: HealthScoreInput = {
    savingsRate6m,
    totalAssets: perspectiveTotalAssets,
    totalDebts: perspectiveTotalDebts,
    emergencyFundMonths,
    freedomPct,
    assetTypeCount,
    budgetCategories,
    taxData: buildTaxData(fullAssetsResult.data ?? [], unlinkedCash, profile),
  }
  const healthScore = computeHealthScoreFromInputs(healthScoreInput, budgetingActive)

  // Events, actions, debts, assets
  const realEvents = (eventsResult.data ?? []) as LifeEvent[]
  const actions = (actionsResult.data ?? []) as Action[]
  const debts = (fullDebtsResult.data ?? []) as Debt[]
  const assets = (fullAssetsResult.data ?? []) as Asset[]

  // ── Housing strategy ──────────────────────────────────────────
  // Parse strategy uit profile (default include_full bij missing/legacy users).
  // Context aggregeert eigen_huis + linked mortgage. fireEligibleNetWorth =
  // netWorth minus equity bij strategieën waar het huis niet meedoet.
  const housingStrategy = parseHousingStrategy(
    (profile as Record<string, unknown>).housing_strategy_config,
  )
  const housingContext = deriveHousingContext(assets, debts)
  const fireEligibleNetWorth = getFireEligibleNetWorth(netWorth, housingContext, housingStrategy)
  const housingStrategyDismissedAt =
    ((profile as Record<string, unknown>).housing_strategy_dismissed_at as string | null) ?? null

  // ── Virtuele housing-strategy LifeEvents ─────────────────────
  // Maken downsize/reverse_mortgage zichtbaar op de tijdlijn. Worden door de
  // bestaande LifeEvent → SimCashflow-pipeline opgepikt voor de simulatie.
  // Read-only — UI markeert ze via metadata.source = 'housing-strategy'.
  const currentAgeForHousing = dob ? ageAtDate(dob) : 40
  const liquidEstimate = Math.max(
    0,
    netWorth - (housingContext.eigenHuisValue - housingContext.mortgageBalance),
  )
  // Annual savings = monthly_contribution × 12 (aggregaat over alle assets,
  // of override uit profile). Wordt nog meegegeven als fallback maar de
  // phase-gate gebruikt nu primair `currentNetCashflowYearly` (income −
  // expenses) — robuuster wanneer asset-contributions niet zijn ingevuld.
  const housingOverrideRaw = savingsOverrideResult.error
    ? null
    : (savingsOverrideResult.data as { monthly_savings_override?: number | string | null } | null)?.monthly_savings_override ?? null
  const housingMonthlyOverride = housingOverrideRaw == null ? null : Number(housingOverrideRaw)
  const effectiveMonthlyContribForHousing =
    housingMonthlyOverride != null && housingMonthlyOverride >= 0
      ? housingMonthlyOverride
      : monthlyContributions
  const annualSavingsForHousing = effectiveMonthlyContribForHousing * 12
  // Phase-detectie: gebruiker zit in opbouw zolang z'n huidige cashflow
  // (income − expenses) positief is. Komt uit transacties of profile-fallback.
  const currentNetCashflowYearly = (effectiveMonthlyIncome - effectiveMonthlyExpenses) * 12
  const housingEvents = getHousingLifeEvents({
    config: housingStrategy,
    context: housingContext,
    currentAge: currentAgeForHousing,
    endAge: fireStrategy.endAge,
    yearlyExpenses: yearlyRetirementExpenses,
    currentLiquidPortfolio: liquidEstimate,
    annualSavings: annualSavingsForHousing,
    currentNetCashflowYearly,
    // Rendement-parameters voor de on_depletion-trigger: zonder rendement
    // valt de trigger te vroeg (liquide raakt sneller op dan in
    // werkelijkheid omdat de groei niet meetelt).
    grossReturn: fireParams.grossReturn,
    inflationRate: fireParams.inflationRate,
  })
  const loadedEvents: LifeEvent[] = [...realEvents, ...housingEvents]

  // Cumulative impacts
  const impacts = computeCumulativeImpacts(effectiveInput, loadedEvents)

  // Derive box3Method from fireParams and hasPartner from household_type
  const box3Method = fireParams.box3Method
  const householdType = String((profile as Record<string, unknown>).household_type ?? 'solo')
  const hasPartner = householdType === 'samenwonend' || householdType === 'getrouwd'
  const numberOfChildren = Number((profile as Record<string, unknown>).number_of_children ?? 0)

  // ── Horizon setup-pane state ──────────────────────────────────────
  // hasCompletedHorizonSetup: true zodra de gebruiker de Horizon-prognose-
  // setup-pane heeft doorlopen + opgeslagen. Bepaalt of de hoofd-grafiek
  // wordt vervangen door de intro-card.
  const hasCompletedHorizonSetup = !horizonSetupVisitResult.error
    && horizonSetupVisitResult.data?.feature_slug === HORIZON_SETUP_COMPLETED_SLUG

  // monthlySavingsOverride: handmatige override uit profiles. Null = geen
  // override, simulator gebruikt monthlyContributionFromAssets.
  const overrideRaw = savingsOverrideResult.error
    ? null
    : (savingsOverrideResult.data as { monthly_savings_override?: number | string | null } | null)?.monthly_savings_override ?? null
  const monthlySavingsOverride = overrideRaw == null ? null : Number(overrideRaw)

  // monthlyContributionFromAssets: raw asset-aggregaat (identiek aan
  // monthlyContributions hierboven, geëxporteerd voor de setup-pane).
  const monthlyContributionFromAssets = monthlyContributions

  // monthlySurplusFromBudget: surplus uit 6m gemiddelde transacties als
  // Budgetteren-module actief is. Null als module uit of geen surplus.
  const monthlySurplusFromBudget = budgetingActive && avgIncome6m > 0 && avgExpenses6m > 0
    ? Math.max(0, avgIncome6m - avgExpenses6m)
    : null

  return {
    effectiveInput,
    events: loadedEvents,
    impacts,
    actions,
    debts,
    fireStrategy,
    withdrawalStrategy,
    fireParams,
    resilienceSnapshots: allSnapshots,
    snapshotResilience,
    avgIncome6m,
    avgExpenses6m,
    healthScore,
    healthScoreInput,
    budgetingActive,
    assets,
    box3Method,
    hasPartner,
    profileError: profileResult.error
      ? `Profile query failed: ${profileResult.error.code} — ${profileResult.error.message}`
      : null,
    unlinkedCash,
    numberOfChildren,
    hasCompletedHorizonSetup,
    monthlySavingsOverride,
    monthlyContributionFromAssets,
    monthlySurplusFromBudget,
    retirementExpenseMethod: (profile.retirement_expense_method as RetirementExpenseMethod | null) ?? null,
    retirementExpenseCustomAmount: profile.retirement_expense_custom_amount ?? null,
    housingStrategy,
    housingContext,
    fireEligibleNetWorth,
    housingStrategyDismissedAt,
  }
}
