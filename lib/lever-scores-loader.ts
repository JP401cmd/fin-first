// lib/lever-scores-loader.ts
//
// SINGLE SOURCE OF TRUTH voor de vier-hefbomen-scores (Bezittingen, Schulden,
// Cashflow, Belasting) én de Belasting-box-statussen (Box 1/2/3) die de sidebar-
// dots tonen.
//
// Achtergrond: de berekening stond voorheen INLINE in app/(app)/layout.tsx (de
// sidebar-shell). De status-duiding-melding (lib/page-status/*) moet EXACT
// dezelfde status tonen als de nav-dot van een pagina — anders spreekt de banner
// de sidebar tegen. Door deze ene `cache()`-wrapped loader te delen tussen de
// shell én loadPageStatusMap kan er per definitie geen drift ontstaan, en wordt
// de query maar één keer per request uitgevoerd (React `cache()` dedupliceert op
// argument-identiteit).
//
// "Consume, don't recompute": niemand assembleert de lever-scores-input of roept
// computeLeverScores/box1JaarruimteStatus/box3TaxStatus zelf opnieuw aan — men
// importeert `loadLeverScores`.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
import {
  computeLeverScores,
  type LeverScores,
} from '@/components/app/shell/lever-scores'
import {
  computeBox3TaxableInput,
  box3TaxStatus,
  type Box3TaxableInput,
} from '@/lib/box3-taxable-input'
import { box1JaarruimteStatus } from '@/lib/jaarruimte'
import { resolveEffectiveIncomeExpenses } from '@/lib/effective-financials'
import { resolveFireParams } from '@/lib/fire-params'
import type { LeverageStatus } from '@/lib/leverage-status'
import type { Perspective } from '@/lib/household-data'

/** Resultaat van de gedeelde lever-scores-loader. */
export interface LeverScoresResult {
  /** De vier-hefbomen-scores (Bezittingen/Schulden/Cashflow/Belasting). */
  scores: LeverScores
  /**
   * Box 3-belast-vermogen-signaal — de canonieke input voor `box3TaxStatus`.
   * Gedeeld zodat de Box 3-dot, de Belasting-lever én de status-banner exact
   * dezelfde uitkomst geven.
   */
  taxInput: Box3TaxableInput
  /** Box 3-status (good/warn/bad/neutral) afgeleid uit `taxInput`. */
  box3Status: LeverageStatus
  /**
   * Box 1-status (onbenutte jaarruimte → belastingbesparingskans). Afgeleid uit
   * het effectieve maandinkomen + marginaal tarief, identiek aan de Belasting-
   * landingskaart en de sidebar-dot.
   */
  box1Status: LeverageStatus
}

/** Minimale profiel-velden die de loader nodig heeft. */
interface LeverScoresProfile {
  household_type?: string | null
  net_monthly_income?: number | null
  estimated_monthly_expenses?: number | null
  income_source?: string | null
  expenses_source?: string | null
  marginaal_tarief?: number | null
  expected_return?: number | null
  inflation_rate?: number | null
  box3_method?: string | null
}

type AssetRow = {
  current_value: number | string
  asset_type?: string | null
  net_worth_inclusion_pct?: number | null
}
type DebtRow = {
  current_balance: number | string
  original_amount?: number | string | null
  net_worth_inclusion_pct?: number | null
}
type BudgetHealthRow = { id: string; default_limit: number; budget_type: string }
type BudgetTxRow = { budget_id: string; amount: number | string }

/**
 * Laad de vier-hefbomen-scores + de Box 1/3-statussen voor de huidige gebruiker.
 *
 * Behaviour-preserving t.o.v. de oude inline-berekening in app/(app)/layout.tsx:
 * dezelfde queries (assets/debts/3m-transacties/budget-health/maand-budget-tx +
 * maand-inkomen), dezelfde input-assemblage en dezelfde pure helpers
 * (`computeLeverScores`, `box3TaxStatus`, `box1JaarruimteStatus`).
 *
 * @param supabase    Server-client (RLS-gescoped op de ingelogde gebruiker).
 * @param perspective Meegegeven voor signatuur-stabiliteit en `cache()`-dedup,
 *   maar de lever-scores zijn ALTIJD personal-perspectief: alle queries zijn
 *   user-scoped (eq('user_id')) — identiek aan de sidebar-dots, die óók geen
 *   huishoud-/partnerperspectief op de hefbomen toepassen. Een household/partner-
 *   view toont dus dezelfde (persoonlijke) hefboomstatus. Wil je dat veranderen,
 *   dan moet de aggregatie hiér perspectief-bewust worden (niet alleen de param
 *   doorgeven). Bewust niet gedaan: het matcht het bestaande sidebar-gedrag.
 */
export const loadLeverScores = cache(async function loadLeverScores(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _perspective: Perspective = 'personal',
): Promise<LeverScoresResult> {
  const user = await getCachedUser(supabase)
  if (!user) {
    const empty = computeLeverScores({
      totalAssets: 0,
      totalDebts: 0,
      assetTypeCount: 0,
      savingsRate: null,
      box3TaxableAboveThreshold: 0,
      hasBox3Assets: false,
    })
    const taxInput: Box3TaxableInput = {
      box3TaxableAboveThreshold: 0,
      hasBox3Assets: false,
    }
    return { scores: empty, taxInput, box3Status: 'neutral', box1Status: 'neutral' }
  }

  // 3-maands-venster voor de spaarquote (identiek aan de shell).
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const txWindowStart = threeMonthsAgo.toISOString().split('T')[0]

  // Huidige-maand-grenzen (UTC) voor budget-health en het maand-inkomen — exact
  // dezelfde grenzen als de shell, zodat de afgeleide statussen 1-op-1 matchen.
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    .toISOString()
    .split('T')[0]
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1))
    .toISOString()
    .split('T')[0]

  const [
    profileRes,
    assetsRes,
    debtsRes,
    txRes,
    budgetHealthRes,
    budgetTxRes,
    monthIncomeTxRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'household_type, net_monthly_income, estimated_monthly_expenses, income_source, expenses_source, marginaal_tarief, expected_return, inflation_rate, box3_method',
      )
      .eq('id', user.id)
      .single(),
    supabase
      .from('assets')
      .select('current_value, asset_type, net_worth_inclusion_pct')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase
      .from('debts')
      .select('current_balance, original_amount, net_worth_inclusion_pct')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase
      .from('transactions')
      .select('amount, is_income')
      .eq('user_id', user.id)
      .gte('date', txWindowStart),
    supabase
      .from('budgets')
      .select('id, default_limit, budget_type')
      .eq('user_id', user.id)
      .is('parent_id', null)
      .in('budget_type', ['expense', 'savings'])
      .eq('is_archived', false),
    supabase
      .from('transactions')
      .select('budget_id, amount')
      .eq('user_id', user.id)
      .not('budget_id', 'is', null)
      .gte('date', monthStart)
      .lt('date', monthEnd),
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .gte('date', monthStart)
      .lt('date', monthEnd),
  ])

  const profile = (profileRes.data ?? {}) as LeverScoresProfile
  const assetRows = (assetsRes.data ?? []) as AssetRow[]
  const debtRows = (debtsRes.data ?? []) as DebtRow[]

  // ── Bezittingen / schulden aggregaten (weighted via net_worth_inclusion_pct) ──
  const totalAssets = assetRows.reduce(
    (s, a) => s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100),
    0,
  )
  const totalDebts = debtRows.reduce(
    (s, d) => s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100),
    0,
  )
  const totalOriginalDebts = debtRows.reduce(
    (s, d) =>
      s +
      Number(d.original_amount ?? d.current_balance) *
        ((d.net_worth_inclusion_pct ?? 100) / 100),
    0,
  )
  const assetTypeSet = new Set(
    assetRows.map((a) => a.asset_type).filter((t): t is string => Boolean(t)),
  )

  // ── Spaarquote (3 maanden) ──
  const txData = (txRes.data ?? []) as Array<{ amount: number | string; is_income: boolean }>
  const txIncome = txData
    .filter((t) => t.is_income)
    .reduce((s, t) => s + Number(t.amount), 0)
  const txExpense = txData
    .filter((t) => !t.is_income)
    .reduce((s, t) => s + Number(t.amount), 0)
  const savingsRate3m = txIncome > 0 ? ((txIncome - txExpense) / txIncome) * 100 : null

  // ── Box 3-belast-vermogen-signaal (gedeelde helper) ──
  const householdType = (profile.household_type as string | undefined) ?? undefined
  const taxInput = computeBox3TaxableInput(assetRows, debtRows, householdType)

  // ── Budget-health (kompas cashflow-indicator) ──
  const healthBudgets = (budgetHealthRes.data ?? []) as BudgetHealthRow[]
  const budgetTxRows = (budgetTxRes.data ?? []) as BudgetTxRow[]
  const spendPerBudget = new Map<string, number>()
  for (const tx of budgetTxRows) {
    spendPerBudget.set(
      tx.budget_id,
      (spendPerBudget.get(tx.budget_id) ?? 0) + Math.abs(Number(tx.amount)),
    )
  }
  const budgetsTotal = healthBudgets.filter((b) => b.default_limit > 0).length
  const budgetsOver = healthBudgets.filter((b) => {
    if (b.default_limit <= 0) return false
    const spent = spendPerBudget.get(b.id) ?? 0
    return spent > b.default_limit
  }).length
  const budgetsOnTrack = budgetsTotal - budgetsOver

  const scores = computeLeverScores({
    totalAssets,
    totalDebts,
    totalOriginalDebts,
    debtCount: debtRows.length,
    assetTypeCount: assetTypeSet.size,
    savingsRate: savingsRate3m,
    box3TaxableAboveThreshold: taxInput.box3TaxableAboveThreshold,
    hasBox3Assets: taxInput.hasBox3Assets,
    householdType,
    budgetsTotal,
    budgetsOnTrack,
    budgetsOver,
  })

  // ── Box 3-status (canonieke helper, gedeeld met de lever) ──
  const box3Status = box3TaxStatus(taxInput)

  // ── Box 1-status (onbenutte jaarruimte) ──
  const monthTxRows = (monthIncomeTxRes.data ?? []) as Array<{ amount: number | string }>
  let monthTxIncome = 0
  let monthTxExpenses = 0
  for (const t of monthTxRows) {
    const amt = Number(t.amount)
    if (amt > 0) monthTxIncome += amt
    else monthTxExpenses += Math.abs(amt)
  }
  const { income: box1MonthlyIncome } = resolveEffectiveIncomeExpenses(
    profile,
    monthTxIncome,
    monthTxExpenses,
  )
  const box1MarginaalTarief = resolveFireParams(profile).marginaalTarief
  const { status: box1Status } = box1JaarruimteStatus({
    netMonthly: box1MonthlyIncome,
    marginaalTarief: box1MarginaalTarief,
  })

  return { scores, taxInput, box3Status, box1Status }
})
