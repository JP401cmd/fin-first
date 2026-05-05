// ── Core Data Loader ──────────────────────────────────────────
// Extracts all data-loading logic from core/page.tsx into a
// reusable async function that only needs a SupabaseClient.
// Wrapped with React cache() for request-level deduplication.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SparklineDataPoint } from '@/components/app/budget-sparkline'
import type { NetWorthSnapshot } from '@/lib/net-worth-data'
import type { Budget, BudgetWithChildren } from '@/lib/budget-data'
import type { Asset } from '@/lib/asset-data'
import { type Debt, computeRenteAflossingsSplit, DEBT_TYPE_ICONS } from '@/lib/debt-data'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import type { FireParams } from '@/lib/fire-params'
import {
  type SavingsRateMethod,
  computeSavingsRateFromNetWorthDelta,
} from '@/lib/core-metrics'
import { computeHorizonFireTarget } from '@/lib/fire-target-shared'
import { computeYearlyMustExpenses, computeRetirementExpenses } from '@/lib/budget-utils'
import { resolveFireParams } from '@/lib/fire-params'
import { DEFAULT_RETURN, INFLATION } from '@/lib/constants'
import { ALL_MODULES } from '@/lib/module-registry'
import { parseFireStrategy, type FireStrategyConfig } from '@/lib/fire-strategy'
import { ageAtDate } from '@/lib/horizon-data'
import { loadCombinedCashStats, type CashAssetStats } from '@/lib/kpi-context'

/** Filter out own-account transfers from income/expense calculations */
const isRealTx = (t: { transaction_type?: string | null }) =>
  t.transaction_type !== 'transfer' && t.transaction_type !== 'joint_transfer'

// ── Result type ────────────────────────────────────────────────

export interface CorePageData {
  // Profile / budgeting
  /** Volledige naam uit profile.full_name — voor editorial begroeting in hero. */
  userName: string | null
  budgetingActive: boolean
  activeModules: string[]
  profileIncome: number
  profileExpenses: number

  // Income data
  incomeMonths: number
  incomeByMonth: { month: string; amount: number }[]

  // Savings rate
  savingsRate6m: number
  savingsRateMonths: number
  savingsRateMethod: SavingsRateMethod
  savingsReceiptData: {
    extHalfYearIncome: number
    extHalfYearExpenses: number
    halfYearSavings: number
    rawIncome6m: number
    rawExpenses6m: number
  }
  savingsBreakdown: { name: string; icon: string; budgetType: string; amount6m: number }[]
  savingsBudgetTotal6m: number
  debtAflossingTotal6m: number
  debtAflossingItems: { name: string; icon: string; amount6m: number }[]

  // Expenses & FIRE params
  mustExpenseItems: { name: string; monthlyAmount: number; annualAmount: number; interval: string }[]
  retirementMethodUsed: RetirementExpenseMethod
  fireParams: FireParams
  /**
   * FIRE eindstrategie afgeleid uit profile-kolommen
   * (`fire_end_strategy`, `fire_end_age`, `fire_legacy_amount`).
   * Identiek aan wat Horizon gebruikt — zorgt dat de Kern-FIRE-strip
   * exact hetzelfde doelbedrag toont als de Horizon-pagina.
   */
  fireStrategy: FireStrategyConfig
  /**
   * Huidige leeftijd in hele jaren of `null` als geboortedatum onbekend is.
   * Nodig om `yearsInRetirement` voor de deplete-strategie af te leiden;
   * de loader doet dit nu zelf zodat client-componenten geen extra
   * `dateOfBirth`-gegevens hoeven te kennen.
   */
  currentAge: number | null

  // Assets / debts / cash
  assetsList: { id: string; name: string; current_value: number; net_worth_inclusion_pct: number }[]
  debtsList: { id: string; name: string; current_balance: number; net_worth_inclusion_pct: number }[]
  cashAccounts: { id: string; name: string; balance: number; source: 'asset' | 'bank' }[]
  nonCashAssets: { id: string; name: string; current_value: number; net_worth_inclusion_pct: number }[]
  totalCash: number
  totalNonCashAssets: number

  // Raw financials bundle (used by client for computeCoreData and other effects)
  rawFinancials: {
    monthlyIncome: number
    monthlyExpenses: number
    totalAssets: number
    totalDebts: number
    extrapolatedIncome: number
    yearlyMustExpenses: number
    yearlyRetirementExpenses?: number
  }
  fullAssets: Asset[]
  fullDebts: Debt[]

  // Feature state
  hasTransactions: boolean
  hasGoals: boolean
  fireUnreachable: boolean

  // Budget state
  budgetCount: number
  overBudgetCount: number
  totalBudgetLimit: number
  totalBudgetSpent: number
  overviewBudgetGroups: BudgetWithChildren[]
  overviewSpending: Record<string, number>
  prevMonthSpending: Record<string, number>

  // Progress indicators
  debtProgress: { totalOriginal: number; totalCurrent: number; progressPct: number } | null
  assetGrowthDirection: 'up' | 'down' | 'flat'
  snapshots: NetWorthSnapshot[]
  /**
   * FIRE-doelbedrag berekend door `computeHorizonFireTarget` — zelfde
   * `runUnifiedProjection`-aanroep als Horizon's `useHorizonFireSim`-hook,
   * dus identieke output. `null` wanneer essentiële inputs ontbreken
   * (geen geboortedatum, geen yearly expenses).
   */
  fireTargetFromHorizon: number | null

  // Sparklines
  budgetSparklines: { id: string; name: string; icon: string; budgetType: string; data: SparklineDataPoint[] }[]
  budgetSpendingHistory: { label: string; spent: number; isProjection: boolean }[]

  // Holdings portfolio summary (tracked assets only)
  holdingsPortfolio: {
    totalValue: number
    dailyChangeAbsolute: number
    dailyChangePct: number
    positionCount: number
    top3: { ticker: string; value: number }[]
  } | null

  /**
   * Raw holdings-rijen van getrackde investment-assets, voor de samengestelde
   * KPI-strip op categoriekaarten. Bevat alleen velden die de KPI-functies
   * gebruiken (`asset_id`, `units`, `current_price`, `avg_purchase_price`,
   * `daily_change_percent`). De Map-vorm wordt client-side opgebouwd via
   * `buildKpiContext` — als raw lijst doorgeven houdt de wire serializable.
   */
  rawHoldings: Array<{
    asset_id: string
    units: number
    current_price: number | null
    avg_purchase_price: number | null
    daily_change_percent: number | null
  }>

  /**
   * Cash-stats per asset_id voor de cash-KPI's (laatste transactie,
   * maandmutatie, hoogste uitgave). Server-side berekend uit transactions ×
   * bank_accounts. Cash-assets zonder bank-koppeling staan niet in de map —
   * de UI valt dan terug op een rente-fallback.
   */
  cashStatsByAssetId: Record<string, CashAssetStats>

  /**
   * Per-categorie sparkline-waarden over de afgelopen 6 maanden, opgebouwd
   * uit `balance_snapshots`. Key is `asset:<asset_type>` of
   * `debt:<debt_type>`; value is een array van 6 maandwaarden (oudste →
   * nieuwste), gewogen met `net_worth_inclusion_pct`. Categorieën zonder
   * historische snapshots staan niet in de map — de UI valt dan terug op
   * geen sparkline (alleen tinted achtergrond).
   */
  categorySparklines: Record<string, number[]>
}

// ── Main loader ────────────────────────────────────────────────
// Wrapped with React cache() — multiple calls within a single server
// request return the same promise, avoiding duplicate DB round-trips.

export const loadCoreData = cache(async function loadCoreData(
  supabase: SupabaseClient,
): Promise<CorePageData> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]
  const twelveMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().split('T')[0]

  // ── FIRE-target promise: vroeg gestart zodat hij parallel met de
  //    Kern-batches draait. We awaiten 'em pas vlak voor de return.
  //    Cache via React `cache()` zorgt voor dedup binnen één request.
  const fireTargetPromise = computeHorizonFireTarget(supabase).catch(() => null)

  // ── Cash-stats promise: parallel met alle andere batches. Combineert
  //    transactie-stats (cash mét bank-koppeling/budgetteren) en
  //    herwaarderings-stats (cash zónder, via valuations) zodat elk
  //    cash-asset een passende KPI-bron krijgt. Failure → leeg object,
  //    KPI valt op de UI-laag terug op rente.
  const cashStatsPromise = loadCombinedCashStats(supabase).catch(() => ({} as Record<string, CashAssetStats>))

  // ── Sparkline-transacties promise: parallel met alle batches. Voorheen
  //    ran deze query als blocking await ná batch 2 (waterfall ~200-400ms).
  //    Hij hangt qua DATA niet af van batch 2 — alleen de parent/child
  //    budget-aggregatie wel. Door 'em vroeg te starten en pas bij gebruik
  //    te awaiten besparen we de waterfall. Failure → lege array,
  //    sparklines vervallen non-fataal (zelfde gedrag als de oude try/catch).
  type SparkTx = { budget_id: string | null; amount: number | string; date: string }
  const sparkTxPromise: Promise<SparkTx[]> = (async () => {
    try {
      const result = await supabase
        .from('transactions')
        .select('budget_id, amount, date')
        .gte('date', twelveMonthsAgo)
        .lt('date', monthEnd)
      return (result.data ?? []) as SparkTx[]
    } catch {
      return []
    }
  })()

  // ── Categorie-sparklines promise: balance_snapshots over de afgelopen
  //    12 maanden, geaggregeerd per (entity_type, entity_subtype) per maand
  //    en gewogen met inclusion_pct. Bij categorieën waarvan de eerste
  //    snapshot recenter is dan 12 maanden geleden, knippen we het venster
  //    af op die eerste meting — geen valse historie tonen via leading
  //    forward-fill. Parallel gestart, pas vlak voor de return geawait.
  //    Failure → leeg object, kaarten tonen geen sparkline.
  const twelveMonthsAgoForSparkline = new Date(
    Date.UTC(now.getFullYear(), now.getMonth() - 11, 1),
  ).toISOString().split('T')[0]
  type SnapRow = {
    snapshot_date: string
    entity_type: 'asset' | 'debt'
    entity_subtype: string | null
    balance: number | string
    net_worth_inclusion_pct: number | string | null
  }
  const categorySparklinesPromise: Promise<Record<string, number[]>> = (async () => {
    try {
      const result = await supabase
        .from('balance_snapshots')
        .select('snapshot_date, entity_type, entity_subtype, balance, net_worth_inclusion_pct')
        .gte('snapshot_date', twelveMonthsAgoForSparkline)
        .order('snapshot_date', { ascending: true })
      const rows = (result.data ?? []) as SnapRow[]
      if (rows.length === 0) return {}

      // Bouw tot 12 maand-keys op (YYYY-MM, oudste → nieuwste).
      const monthKeys: string[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1))
        monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
      }
      const monthIdx = new Map<string, number>(monthKeys.map((k, i) => [k, i]))

      // Per (categoryKey, monthIdx) → som van gewogen balance van de laatste
      // snapshot in die maand. We willen één waarde per maand per categorie:
      // aggregeer per (categorie, maand) door per entity de meest recente
      // snapshot in die maand te kiezen, en daarna over alle entities binnen
      // de categorie te sommeren.
      type EntityKey = string // `${type}:${subtype}:${entityId}` — niet beschikbaar zonder entity_id, dus we vereenvoudigen: per snapshot_date sommeren we alle balances binnen categorie + maand. Snapshots worden idealiter eens per maand gemaakt; bij meerdere per maand pakken we de laatste snapshot_date binnen die maand.

      // Eerst: per (categorie, maand) → laatste snapshot_date.
      const latestDateByCatMonth = new Map<string, string>()
      for (const r of rows) {
        const subtype = r.entity_subtype ?? 'other'
        const month = r.snapshot_date.substring(0, 7)
        if (!monthIdx.has(month)) continue
        const catKey = `${r.entity_type}:${subtype}:${month}`
        const cur = latestDateByCatMonth.get(catKey)
        if (!cur || r.snapshot_date > cur) {
          latestDateByCatMonth.set(catKey, r.snapshot_date)
        }
      }

      // Tweede pas: som balances voor (categorie, maand) op de laatste datum.
      const sumByCatMonth = new Map<string, number>()
      for (const r of rows) {
        const subtype = r.entity_subtype ?? 'other'
        const month = r.snapshot_date.substring(0, 7)
        if (!monthIdx.has(month)) continue
        const catKey = `${r.entity_type}:${subtype}:${month}`
        if (latestDateByCatMonth.get(catKey) !== r.snapshot_date) continue
        const weight = (Number(r.net_worth_inclusion_pct ?? 100)) / 100
        const val = Number(r.balance) * weight
        const k = `${r.entity_type}:${subtype}|${month}`
        sumByCatMonth.set(k, (sumByCatMonth.get(k) ?? 0) + val)
      }

      // Verzamel alle categorie-keys.
      const catKeys = new Set<string>()
      for (const k of sumByCatMonth.keys()) {
        catKeys.add(k.split('|')[0])
      }

      const out: Record<string, number[]> = {}
      for (const cat of catKeys) {
        const series = new Array<number | null>(monthKeys.length).fill(null)
        for (let i = 0; i < monthKeys.length; i++) {
          const v = sumByCatMonth.get(`${cat}|${monthKeys[i]}`)
          series[i] = v ?? null
        }
        // Knip leading nulls af zodat we niet visueel een lange vlakke
        // periode tonen voor een categorie die pas later begon te meten.
        // Forward-fill alleen tussen de eerste en laatste echte waarde.
        const firstRealIdx = series.findIndex((v) => v != null)
        if (firstRealIdx === -1) continue
        const trimmed = series.slice(firstRealIdx)
        let last = trimmed[0] as number
        const filled: number[] = []
        for (const v of trimmed) {
          if (v != null) last = v
          filled.push(last)
        }
        // Sla altijd op zodra we ten minste één snapshot hebben — een
        // vlakke lijn (alle waarden gelijk) is OK: de UI rendert die als
        // horizontale breuklijn op het midden van de kaart, wat correct
        // de "geen variatie"-status communiceert.
        if (filled.some((v) => v > 0)) out[cat] = filled
      }
      return out
    } catch {
      return {}
    }
  })()

  // ── Batch 1: Primary data fetches ──
  const [
    txResult, assetsResult, debtsResult, income12Result,
    essentialBudgetsResult, earliestIncomeResult, childBudgetsResult,
    expense12Result, earliestTxResult, profileResult, bankAccountsResult,
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount')
      .gte('date', monthStart)
      .lt('date', monthEnd),
    supabase
      .from('assets')
      .select('*')
      .eq('is_active', true),
    supabase
      .from('debts')
      .select('id, name, current_balance, net_worth_inclusion_pct, interest_rate, monthly_payment, repayment_type, end_date, debt_type, is_active, original_amount, minimum_payment, start_date, creditor, subtype, is_tax_deductible, linked_asset_id, nhg, include_aflossing_in_savings, custom_aflossing_amount')
      .eq('is_active', true),
    supabase
      .from('transactions')
      .select('amount, date, transaction_type')
      .gt('amount', 0)
      .gte('date', twelveMonthsAgo)
      .lt('date', monthEnd),
    supabase
      .from('budgets')
      .select('id, name, default_limit, interval, budget_type, is_essential')
      .eq('is_essential', true)
      .in('budget_type', ['expense'])
      .is('parent_id', null),
    supabase
      .from('transactions')
      .select('date')
      .gt('amount', 0)
      .not('transaction_type', 'in', '("transfer","joint_transfer")')
      .gte('date', twelveMonthsAgo)
      .order('date', { ascending: true })
      .limit(1),
    supabase
      .from('budgets')
      .select('id, name, parent_id, default_limit, is_essential, interval, budget_type')
      .not('parent_id', 'is', null)
      .not('budget_type', 'in', '("archive","income","savings")'),
    supabase
      .from('transactions')
      .select('amount, date, transaction_type')
      .lt('amount', 0)
      .gte('date', twelveMonthsAgo)
      .lt('date', monthEnd),
    supabase
      .from('transactions')
      .select('date')
      .gte('date', twelveMonthsAgo)
      .order('date', { ascending: true })
      .limit(1),
    supabase
      .from('profiles')
      .select('full_name, retirement_expense_method, retirement_expense_custom_amount, expected_return, inflation_rate, box3_method, net_monthly_income, estimated_monthly_expenses, budgeting_active, active_modules, fire_end_strategy, fire_end_age, fire_legacy_amount, date_of_birth')
      .single(),
    supabase
      .from('bank_accounts')
      .select('id, name, balance')
      .eq('is_active', true)
      .is('linked_asset_id', null),
  ])

  if (txResult.error) throw txResult.error
  if (assetsResult.error) throw assetsResult.error
  if (debtsResult.error) throw debtsResult.error
  if (income12Result.error) throw income12Result.error
  if (essentialBudgetsResult.error) throw essentialBudgetsResult.error
  if (earliestIncomeResult.error) throw earliestIncomeResult.error
  if (childBudgetsResult.error) throw childBudgetsResult.error
  if (expense12Result.error) throw expense12Result.error
  if (earliestTxResult.error) throw earliestTxResult.error

  // ── Calculate monthly income & expenses from transactions ──
  let monthlyIncome = 0
  let monthlyExpenses = 0
  for (const tx of txResult.data) {
    const amt = Number(tx.amount)
    if (amt > 0) monthlyIncome += amt
    else monthlyExpenses += Math.abs(amt)
  }

  // Fallback to profile estimates for users without transactions
  const profileMonthlyIncome = Number(profileResult.data?.net_monthly_income ?? 0)
  const profileMonthlyExpenses = Number(profileResult.data?.estimated_monthly_expenses ?? 0)
  const effectiveMonthlyIncome = monthlyIncome > 0 ? monthlyIncome : profileMonthlyIncome
  const effectiveMonthlyExpenses = monthlyExpenses > 0 ? monthlyExpenses : profileMonthlyExpenses
  const budgetingActive = profileResult.data?.budgeting_active !== false
  const activeModules: string[] = (profileResult.data?.active_modules as string[] | null) ?? [...ALL_MODULES]
  const hasVermogen = activeModules.includes('vermogensregistratie')

  // ── Last 12 months income — extrapolate if less than 12 months of data ──
  // Filter out own-account transfers for accurate income/expense totals
  const realIncome12 = income12Result.data.filter(isRealTx)
  const realExpense12 = expense12Result.data.filter(isRealTx)

  const last12MonthsIncome = realIncome12.reduce((s, t) => s + Number(t.amount), 0)
  let extrapolatedIncome = last12MonthsIncome
  let actualIncomeMonths = 12
  const earliestIncomeDate = earliestIncomeResult.data?.[0]?.date
  if (earliestIncomeDate && last12MonthsIncome > 0) {
    const earliest = new Date(earliestIncomeDate)
    actualIncomeMonths = Math.max(1,
      (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth()),
    )
    actualIncomeMonths = Math.min(actualIncomeMonths, 12)
    if (actualIncomeMonths < 12) {
      extrapolatedIncome = (last12MonthsIncome / actualIncomeMonths) * 12
    }
  }

  // ── Group income by month for kassabon ──
  const incomeMonthMap: Record<string, number> = {}
  for (const tx of realIncome12) {
    const d = new Date(tx.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    incomeMonthMap[key] = (incomeMonthMap[key] ?? 0) + Number(tx.amount)
  }
  const sortedIncomeMonths = Object.entries(incomeMonthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount }))

  // ── Last 6 months expenses & savings rate (rolling average) ──
  const sixMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 6, 1))
    .toISOString().split('T')[0]
  const last6MonthsIncome = realIncome12
    .filter(t => t.date >= sixMonthsAgo)
    .reduce((s, t) => s + Number(t.amount), 0)
  const last6MonthsExpenses = Math.abs(
    realExpense12
      .filter(t => t.date >= sixMonthsAgo)
      .reduce((s, t) => s + Number(t.amount), 0),
  )
  // Use earliest income date (matching dashboard-data-loader) for month extrapolation
  let savingsRateDataMonths = 6
  if (earliestIncomeDate && (last6MonthsIncome > 0 || last6MonthsExpenses > 0)) {
    const earliest = new Date(earliestIncomeDate)
    savingsRateDataMonths = Math.max(1,
      (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth()),
    )
    savingsRateDataMonths = Math.min(savingsRateDataMonths, 6)
  }
  const extHalfYearIncome = savingsRateDataMonths < 6
    ? (last6MonthsIncome / savingsRateDataMonths) * 6
    : last6MonthsIncome
  const extHalfYearExpenses = savingsRateDataMonths < 6
    ? (last6MonthsExpenses / savingsRateDataMonths) * 6
    : last6MonthsExpenses
  const halfYearSavings = extHalfYearIncome - extHalfYearExpenses

  // ── Yearly must expenses from essential budgets ──
  const allChildren = childBudgetsResult.data ?? []
  const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses(
    essentialBudgetsResult.data ?? [],
    allChildren,
  )

  const activeRetirementMethod = (profileResult.data?.retirement_expense_method as RetirementExpenseMethod) ?? 'essential_budgets'
  // When budgeting is off, don't use (potentially stale) essential budget data
  // for retirement expenses — pass 0 so the fallback to estimatedYearlyExpenses kicks in
  const effectiveMustExpenses = budgetingActive ? yearlyMustExpenses : 0
  const yearlyRetirementExpenses = computeRetirementExpenses(
    budgetingActive ? activeRetirementMethod : activeRetirementMethod,
    effectiveMustExpenses,
    extrapolatedIncome,
    profileResult.data?.retirement_expense_custom_amount,
    profileMonthlyExpenses * 12,
  )
  const fireParams = resolveFireParams(profileResult.data ?? {})
  const fireSwr = fireParams.effectiveSwr
  // Strategie + leeftijd: identiek aan Horizon's loaders zodat de FIRE-strip
  // op /core exact hetzelfde doelbedrag berekent als de Horizon-pagina.
  const fireStrategy = parseFireStrategy(profileResult.data ?? {})
  const dobIso = profileResult.data?.date_of_birth ?? null
  const currentAge = dobIso ? ageAtDate(dobIso) : null

  // ── Total assets (weighted by net_worth_inclusion_pct) ──
  const totalAssetsOnly = assetsResult.data.reduce((s, a) =>
    s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
  const unlinkedCash = (bankAccountsResult.data ?? []).reduce((s, a) => s + Number(a.balance), 0)
  const totalAssets = totalAssetsOnly + unlinkedCash

  // ── Total debts (weighted by net_worth_inclusion_pct) ──
  const totalDebts = debtsResult.data.reduce((s, d) =>
    s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)

  // ── Assets/debts lists for net worth kassabon ──
  const assetsList = assetsResult.data.map(a => ({
    id: a.id,
    name: a.name,
    current_value: Number(a.current_value),
    net_worth_inclusion_pct: a.net_worth_inclusion_pct ?? 100,
  }))
  const debtsList = debtsResult.data.map(d => ({
    id: d.id,
    name: d.name,
    current_balance: Number(d.current_balance),
    net_worth_inclusion_pct: d.net_worth_inclusion_pct ?? 100,
  }))

  // ── Split assets into cash (all cash-type) and everything else ──
  const allCashAssets = assetsResult.data
    .filter(a => a.asset_type === 'cash')
    .map(a => ({ id: a.id, name: a.name, balance: Number(a.current_value), source: 'asset' as const }))
  const unlinkedBanks = (bankAccountsResult.data ?? [])
    .map(a => ({ id: a.id, name: a.name, balance: Number(a.balance), source: 'bank' as const }))
  const cashAccounts = [...allCashAssets, ...unlinkedBanks]

  const nonCashAssets = assetsResult.data
    .filter(a => a.asset_type !== 'cash')
    .map(a => ({ id: a.id, name: a.name, current_value: Number(a.current_value), net_worth_inclusion_pct: a.net_worth_inclusion_pct ?? 100 }))

  const totalCashValue = allCashAssets.reduce((s, a) => s + a.balance, 0) + unlinkedCash
  const totalNonCashAssets = totalAssets - totalCashValue

  const effectiveTotalAssets = hasVermogen ? totalAssets : totalCashValue
  const effectiveTotalDebts = hasVermogen ? totalDebts : 0

  const rawFinancials = {
    monthlyIncome: effectiveMonthlyIncome,
    monthlyExpenses: effectiveMonthlyExpenses,
    totalAssets: effectiveTotalAssets,
    totalDebts: effectiveTotalDebts,
    extrapolatedIncome,
    yearlyMustExpenses: effectiveMustExpenses,
    yearlyRetirementExpenses,
  }

  const netWorth = effectiveTotalAssets - effectiveTotalDebts
  const monthlySavings = effectiveMonthlyIncome - effectiveMonthlyExpenses

  // ── Has transactions ──
  const hasTransactions = (txResult.data?.length ?? 0) > 0

  // ── FIRE reachability for smart prioritization ──
  const fireTarget = yearlyRetirementExpenses > 0
    ? yearlyRetirementExpenses / fireSwr
    : (effectiveMonthlyExpenses * 12) > 0
      ? (effectiveMonthlyExpenses * 12) / fireSwr
      : 0
  let fireUnreachable = false
  if (fireTarget > 0 && netWorth < fireTarget) {
    if (monthlySavings <= 0) {
      fireUnreachable = true
    } else {
      const realReturn = (1 + DEFAULT_RETURN) / (1 + INFLATION) - 1
      const monthlyReturnRate = realReturn / 12
      let projectedNW = netWorth
      let fireMonths = 0
      while (projectedNW < fireTarget && fireMonths < 600) {
        projectedNW = projectedNW * (1 + monthlyReturnRate) + monthlySavings
        fireMonths++
      }
      fireUnreachable = fireMonths >= 600
    }
  }

  // ── Batch 2: Budget alerts + debt progress + asset valuations + goals + 6m spending ──
  const sixMonthsAgoForBudgets = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 6, 1)).toISOString().split('T')[0]
  const prevMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1)).toISOString().split('T')[0]
  const [
    budgetResult, spendingResult, snapshotResult,
    debtFullResult, assetValuationResult, goalsResult, spending6mResult,
    holdingsResult, prevSpendingResult,
  ] = await Promise.all([
    supabase.from('budgets').select('id, name, icon, default_limit, budget_type, parent_id, is_essential, interval, is_favorite, alert_threshold').limit(500),
    supabase.from('transactions').select('budget_id, amount').gte('date', monthStart).lt('date', monthEnd),
    supabase.from('net_worth_snapshots').select('snapshot_date, total_assets, total_debts, net_worth, freedom_percentage, fire_age, sovereignty_level, savings_rate, resilience_score, fire_portfolio_required').order('snapshot_date', { ascending: true }).limit(24),
    supabase.from('debts').select('current_balance, original_amount').eq('is_active', true),
    supabase.from('valuations').select('value, valuation_date').eq('entity_type', 'asset').order('valuation_date', { ascending: false }).limit(50),
    supabase.from('goals').select('id').limit(1),
    supabase.from('transactions').select('budget_id, amount').gte('date', sixMonthsAgoForBudgets).lt('date', monthEnd),
    // Holdings from tracked assets for portfolio card. Na de tabel-split
    // (migratie 20260502000003) zit deze data alleen in `investment_holdings`
    // — crypto-holdings hebben (nog) geen `daily_change_percent` en worden
    // separaat afgehandeld via de exchange-sync.
    supabase
      .from('investment_holdings')
      .select('id, name, ticker, units, current_price, avg_purchase_price, daily_change_percent, asset_id, asset:assets!asset_id(has_holdings_tracking)')
      .eq('is_active', true),
    supabase.from('transactions').select('budget_id, amount').gte('date', prevMonthStart).lt('date', monthStart),
  ])

  // Goals state
  const hasGoals = (goalsResult.data?.length ?? 0) > 0

  // ── Process budgets ──
  let budgetCount = 0
  let overBudgetCount = 0
  let totalBudgetLimit = 0
  let totalBudgetSpent = 0
  let overviewSpending: Record<string, number> = {}
  let prevMonthSpending: Record<string, number> = {}
  let overviewBudgetGroups: BudgetWithChildren[] = []
  let savingsBreakdown: { name: string; icon: string; budgetType: string; amount6m: number }[] = []
  let savingsBudgetTotal6m = 0
  let debtAflossingTotal6m = 0
  let debtAflossingItems: { name: string; icon: string; amount6m: number }[] = []
  let computedSavingsRate6m = 0
  let savingsRateMethod: SavingsRateMethod = 'estimate'

  if (budgetResult.data) {
    budgetCount = (budgetResult.data as Budget[]).filter(b => !b.parent_id).length
  }

  if (budgetResult.data && spendingResult.data) {
    const spendMap: Record<string, number> = {}
    for (const t of spendingResult.data) {
      if (t.budget_id) {
        spendMap[t.budget_id] = (spendMap[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
      }
    }

    // Compute over-budget count for mission control card
    const expenseParents = (budgetResult.data as Budget[])
      .filter(b => !b.parent_id && (b.budget_type === 'expense'))
    let overCount = 0
    for (const b of expenseParents) {
      const children = (budgetResult.data as Budget[]).filter(c => c.parent_id === b.id)
      const spent = children.length > 0
        ? children.reduce((sum, c) => sum + (spendMap[c.id] ?? 0), 0)
        : (spendMap[b.id] ?? 0)
      const limit = children.length > 0
        ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
        : Number(b.default_limit)
      if (limit > 0 && spent > limit) overCount++
    }
    overBudgetCount = overCount

    // Compute total budget progress for hero (expense budgets only)
    let heroLimit = 0
    let heroSpent = 0
    for (const b of expenseParents) {
      const children = (budgetResult.data as Budget[]).filter(c => c.parent_id === b.id)
      const spent = children.length > 0
        ? children.reduce((sum, c) => sum + (spendMap[c.id] ?? 0), 0)
        : (spendMap[b.id] ?? 0)
      const limit = children.length > 0
        ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
        : Number(b.default_limit)
      heroLimit += limit
      heroSpent += spent
    }
    totalBudgetLimit = heroLimit
    totalBudgetSpent = heroSpent

    // Store data for budget legend overview
    overviewSpending = spendMap

    // Build previous-month spending map
    if (prevSpendingResult.data) {
      const prevMap: Record<string, number> = {}
      for (const t of prevSpendingResult.data) {
        if (t.budget_id) {
          prevMap[t.budget_id] = (prevMap[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
        }
      }
      prevMonthSpending = prevMap
    }

    const allBudgets = budgetResult.data as Budget[]
    const parents = allBudgets.filter(b => !b.parent_id)
    const budgetChildren = allBudgets.filter(b => !!b.parent_id)
    overviewBudgetGroups = parents.map(p => ({
      ...p,
      children: budgetChildren.filter(c => c.parent_id === p.id),
    }))

    // Compute 6-month spending per parent budget for kassabon breakdown
    if (spending6mResult.data) {
      const spend6mMap: Record<string, number> = {}
      for (const t of spending6mResult.data) {
        if (t.budget_id) {
          spend6mMap[t.budget_id] = (spend6mMap[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
        }
      }
      const breakdown = parents
        .filter(p => p.budget_type !== 'archive')
        .map(p => {
          const kids = budgetChildren.filter(c => c.parent_id === p.id)
          const amount6m = kids.length > 0
            ? kids.reduce((sum, c) => sum + (spend6mMap[c.id] ?? 0), 0)
            : (spend6mMap[p.id] ?? 0)
          return { name: p.name, icon: p.icon, budgetType: p.budget_type ?? 'expense', amount6m }
        })
        .filter(b => b.amount6m > 0)
        .sort((a, b) => b.amount6m - a.amount6m)
      savingsBreakdown = breakdown

      // Compute savings-budget total for spaarquote correction
      const sbTotal6m = breakdown
        .filter(b => b.budgetType === 'savings')
        .reduce((s, b) => s + b.amount6m, 0)
      savingsBudgetTotal6m = sbTotal6m

      // Compute debt aflossing total (principal repayment = vermogensopbouw)
      if (debtsResult.data) {
        const activeDebts = (debtsResult.data as Debt[]).filter(d => d.is_active && d.include_aflossing_in_savings)
        const items: typeof debtAflossingItems = []
        let monthlyAflossing = 0
        for (const d of activeDebts) {
          const aflossing = d.custom_aflossing_amount != null
            ? Number(d.custom_aflossing_amount)
            : (computeRenteAflossingsSplit(d)?.currentAflossing ?? 0)
          const adjusted = aflossing * (d.net_worth_inclusion_pct / 100)
          monthlyAflossing += adjusted
          if (adjusted > 0) {
            items.push({
              name: d.name,
              icon: DEBT_TYPE_ICONS[d.debt_type] ?? 'CircleDot',
              amount6m: adjusted * 6,
            })
          }
        }
        debtAflossingTotal6m = monthlyAflossing * 6
        debtAflossingItems = items.sort((a, b) => b.amount6m - a.amount6m)
      }

      // Compute corrected savings rate (savings budgets + debt aflossing count as saving, not expense)
      const extSb6m = savingsRateDataMonths < 6
        ? (sbTotal6m / savingsRateDataMonths) * 6
        : sbTotal6m
      const extAfl6m = debtAflossingTotal6m
      const correctedHalfYearSavings = extHalfYearIncome - extHalfYearExpenses + extSb6m + extAfl6m
      const rate = extHalfYearIncome > 0 ? (correctedHalfYearSavings / extHalfYearIncome) * 100 : 0
      if (rate === 0 && effectiveMonthlyIncome > 0 && effectiveMonthlyExpenses > 0) {
        computedSavingsRate6m = Math.round(((effectiveMonthlyIncome - effectiveMonthlyExpenses) / effectiveMonthlyIncome) * 100)
        savingsRateMethod = 'estimate'
      } else {
        computedSavingsRate6m = rate
        savingsRateMethod = 'transaction'
      }
    }
  } else if (effectiveMonthlyIncome > 0 && effectiveMonthlyExpenses > 0) {
    // No spending data at all — use profile estimates for savings rate
    computedSavingsRate6m = Math.round(((effectiveMonthlyIncome - effectiveMonthlyExpenses) / effectiveMonthlyIncome) * 100)
    savingsRateMethod = 'estimate'
  }

  // Try net-worth-delta method when still on 'estimate' and snapshots are available
  if (savingsRateMethod === 'estimate' && snapshotResult.data && effectiveMonthlyIncome > 0) {
    const deltaResult = computeSavingsRateFromNetWorthDelta(
      snapshotResult.data as NetWorthSnapshot[],
      effectiveMonthlyIncome,
    )
    if (deltaResult) {
      computedSavingsRate6m = deltaResult.rate
      savingsRateMethod = 'net_worth_delta'
    }
  }

  // ── Compute debt payoff progress ──
  let debtProgress: CorePageData['debtProgress'] = null
  if (debtFullResult.data && debtFullResult.data.length > 0) {
    const totalOriginal = debtFullResult.data.reduce((s, d) => s + Number(d.original_amount || d.current_balance), 0)
    const totalCurrent = debtFullResult.data.reduce((s, d) => s + Number(d.current_balance), 0)
    const progressPct = totalOriginal > 0 ? ((totalOriginal - totalCurrent) / totalOriginal) * 100 : 0
    debtProgress = { totalOriginal, totalCurrent, progressPct: Math.max(0, Math.min(100, progressPct)) }
  }

  // ── Compute asset growth direction from recent valuations ──
  let assetGrowthDirection: 'up' | 'down' | 'flat' = 'flat'
  if (assetValuationResult.data && assetValuationResult.data.length >= 2) {
    const sorted = [...assetValuationResult.data].sort((a, b) => b.valuation_date.localeCompare(a.valuation_date))
    const latestTotal = Number(sorted[0].value)
    const previousTotal = Number(sorted[1].value)
    if (latestTotal > previousTotal * 1.001) assetGrowthDirection = 'up'
    else if (latestTotal < previousTotal * 0.999) assetGrowthDirection = 'down'
    else assetGrowthDirection = 'flat'
  } else if (snapshotResult.data && snapshotResult.data.length >= 2) {
    const snaps = snapshotResult.data as NetWorthSnapshot[]
    const latestAssets = Number(snaps[snaps.length - 1].total_assets)
    const prevAssets = Number(snaps[snaps.length - 2].total_assets)
    if (latestAssets > prevAssets * 1.001) assetGrowthDirection = 'up'
    else if (latestAssets < prevAssets * 0.999) assetGrowthDirection = 'down'
    else assetGrowthDirection = 'flat'
  }

  const snapshots = (snapshotResult.data ?? []) as NetWorthSnapshot[]

  // ── FIRE target via shared helper (single source of truth) ──
  // Promise is vroeg gestart (zie boven), nu pas resolven zodat hij parallel
  // met de Kern-batches heeft kunnen draaien. Identieke output als Horizon.
  const fireTargetFromHorizon = await fireTargetPromise

  // ── Load 12-month budget spending sparklines per parent category ──
  // Aggregeert in één pass over de transacties ipv O(parents × months × txs).
  // De query is al vroeg gestart (sparkTxPromise) zodat hij parallel met de
  // batches draait i.p.v. als waterfall daarná.
  let budgetSparklines: CorePageData['budgetSparklines'] = []
  let budgetSpendingHistory: CorePageData['budgetSpendingHistory'] = []

  try {
    const sparkTxData = await sparkTxPromise

    if (budgetResult.data && budgetResult.data.length > 0 && sparkTxData.length > 0) {
      const allBudgets = budgetResult.data as Budget[]
      const parentBudgets = allBudgets.filter(b => !b.parent_id)
      const childBudgets = allBudgets.filter(b => b.parent_id)

      // Build 12-month date ranges
      const sparkMonths: { month: string; start: string; monthKey: string; label: string }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().split('T')[0]
        const label = d.toLocaleDateString('nl-NL', { month: 'short' })
        sparkMonths.push({ month: start, start, monthKey: start.substring(0, 7), label })
      }

      // Eén pass: bouw twee maps op uit alle transacties.
      //  - sumByBudgetMonth: budgetId → monthKey → som van |amount|
      //  - totalExpenseByMonth: monthKey → som van |amount| voor uitgaven
      // Hierdoor is de daaropvolgende per-parent loop O(parents × months)
      // i.p.v. O(parents × months × txs) — dat scheelt op een typisch user
      // met 50K transacties enkele honderden ms aan CPU.
      const sumByBudgetMonth = new Map<string, Map<string, number>>()
      const totalExpenseByMonth = new Map<string, number>()
      for (const t of sparkTxData) {
        const mKey = t.date.substring(0, 7)
        const amt = Math.abs(Number(t.amount))
        if (t.budget_id) {
          let bMap = sumByBudgetMonth.get(t.budget_id)
          if (!bMap) {
            bMap = new Map()
            sumByBudgetMonth.set(t.budget_id, bMap)
          }
          bMap.set(mKey, (bMap.get(mKey) ?? 0) + amt)
        }
        if (Number(t.amount) < 0) {
          totalExpenseByMonth.set(mKey, (totalExpenseByMonth.get(mKey) ?? 0) + amt)
        }
      }

      const sparklines: CorePageData['budgetSparklines'] = []
      for (const parent of parentBudgets) {
        const childIds = childBudgets.filter(c => c.parent_id === parent.id).map(c => c.id)
        const budgetIds = childIds.length > 0 ? childIds : [parent.id]

        const monthlyData: SparklineDataPoint[] = sparkMonths.map(m => {
          let spent = 0
          for (const bid of budgetIds) {
            const bMap = sumByBudgetMonth.get(bid)
            if (bMap) spent += bMap.get(m.monthKey) ?? 0
          }
          return { month: m.month, label: m.label, spent }
        })

        if (monthlyData.some(d => d.spent > 0)) {
          sparklines.push({
            id: parent.id,
            name: parent.name,
            icon: parent.icon,
            budgetType: parent.budget_type ?? 'expense',
            data: monthlyData,
          })
        }
      }
      budgetSparklines = sparklines

      // Total per maand voor hero-sparkline + projectie van komende 6 maanden
      const monthlyTotals = sparkMonths.map(m => ({
        label: m.label,
        spent: totalExpenseByMonth.get(m.monthKey) ?? 0,
        isProjection: false,
      }))
      const monthsWithData = monthlyTotals.filter(m => m.spent > 0)
      const avgSpent = monthsWithData.length > 0
        ? monthsWithData.reduce((s, m) => s + m.spent, 0) / monthsWithData.length
        : 0
      if (avgSpent > 0) {
        for (let i = 1; i <= 6; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
          monthlyTotals.push({
            label: d.toLocaleDateString('nl-NL', { month: 'short' }),
            spent: avgSpent,
            isProjection: true,
          })
        }
      }
      budgetSpendingHistory = monthlyTotals
    }
  } catch {
    // Budget sparklines are non-critical
  }

  // ── Aggregate holdings portfolio for the card ──
  let holdingsPortfolio: CorePageData['holdingsPortfolio'] = null
  // Raw holdings exposed onto CorePageData voor de KPI-strip op
  // categoriekaarten en (later) de investment-categorie-pagina. Wordt
  // gevuld met dezelfde tracked-set als `holdingsPortfolio` zodat beide
  // oppervlakken consistent dezelfde scope hanteren.
  let rawHoldingsForKpi: CorePageData['rawHoldings'] = []
  try {
    const rawHoldings = (holdingsResult.data ?? []) as Array<Record<string, unknown>>
    // Filter to only holdings where the joined asset has has_holdings_tracking = true
    const trackedHoldings = rawHoldings.filter(h => {
      const asset = h.asset as { has_holdings_tracking?: boolean } | null
      return asset?.has_holdings_tracking === true
    })

    if (trackedHoldings.length > 0) {
      let totalValue = 0
      let dailyChangeAbsolute = 0
      const holdingValues: { ticker: string; value: number }[] = []

      for (const h of trackedHoldings) {
        const units = Number(h.units) || 0
        const currentPrice = h.current_price != null ? Number(h.current_price) : Number(h.avg_purchase_price) || 0
        const dailyChangePct = Number(h.daily_change_percent) || 0
        const value = units * currentPrice
        totalValue += value
        dailyChangeAbsolute += value * (dailyChangePct / 100)
        holdingValues.push({ ticker: (h.ticker as string) || (h.name as string) || '?', value })
      }

      // Top 3 by value
      holdingValues.sort((a, b) => b.value - a.value)
      const top3 = holdingValues.slice(0, 3)

      const dailyChangePct = totalValue > 0 ? (dailyChangeAbsolute / (totalValue - dailyChangeAbsolute)) * 100 : 0

      holdingsPortfolio = {
        totalValue,
        dailyChangeAbsolute,
        dailyChangePct,
        positionCount: trackedHoldings.length,
        top3,
      }
    }

    // Bouw de afgeslankte holdings-lijst voor de KPI-strip. We projecteren
    // alleen de velden die `computeAssetKpi` gebruikt — niet het hele rij —
    // zodat de over-de-wire payload klein blijft.
    rawHoldingsForKpi = trackedHoldings
      .filter((h) => h.asset_id != null)
      .map((h) => ({
        asset_id: h.asset_id as string,
        units: Number(h.units) || 0,
        current_price: h.current_price != null ? Number(h.current_price) : null,
        avg_purchase_price: h.avg_purchase_price != null ? Number(h.avg_purchase_price) : null,
        daily_change_percent: h.daily_change_percent != null ? Number(h.daily_change_percent) : null,
      }))
  } catch {
    // Holdings portfolio is non-critical
  }

  // Volledige naam voor editorial begroeting (op /core hero)
  const userName = (profileResult.data?.full_name as string | null) ?? null

  // ── Return complete data bundle ──
  return {
    userName,
    budgetingActive,
    activeModules,
    profileIncome: profileMonthlyIncome,
    profileExpenses: profileMonthlyExpenses,

    incomeMonths: actualIncomeMonths,
    incomeByMonth: sortedIncomeMonths,

    savingsRate6m: Math.round(computedSavingsRate6m * 10) / 10,
    savingsRateMonths: savingsRateDataMonths,
    savingsRateMethod,
    savingsReceiptData: {
      extHalfYearIncome,
      extHalfYearExpenses,
      halfYearSavings,
      rawIncome6m: last6MonthsIncome,
      rawExpenses6m: last6MonthsExpenses,
    },
    savingsBreakdown,
    savingsBudgetTotal6m,
    debtAflossingTotal6m,
    debtAflossingItems,

    mustExpenseItems: expenseItems,
    retirementMethodUsed: activeRetirementMethod,
    fireParams,
    fireStrategy,
    currentAge,

    assetsList,
    debtsList,
    cashAccounts,
    nonCashAssets,
    totalCash: totalCashValue,
    totalNonCashAssets,

    rawFinancials,
    fullAssets: assetsResult.data as unknown as Asset[],
    fullDebts: debtsResult.data as unknown as Debt[],

    hasTransactions,
    hasGoals,
    fireUnreachable,

    budgetCount,
    overBudgetCount,
    totalBudgetLimit,
    totalBudgetSpent,
    overviewBudgetGroups,
    overviewSpending,
    prevMonthSpending,

    debtProgress,
    assetGrowthDirection,
    snapshots,
    fireTargetFromHorizon,

    budgetSparklines,
    budgetSpendingHistory,

    holdingsPortfolio,
    rawHoldings: rawHoldingsForKpi,
    cashStatsByAssetId: await cashStatsPromise,
    categorySparklines: await categorySparklinesPromise,
  }
})
