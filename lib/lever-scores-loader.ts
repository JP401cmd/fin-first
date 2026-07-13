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
import { computeSavingsRate6m, computeDebtAflossingMonthly } from '@/lib/savings-source'
import { localMonthStartMonthsAgo } from '@/lib/month-range'
import type { Debt } from '@/lib/debt-data'
import type { LeverageStatus } from '@/lib/leverage-status'
import type { Perspective } from '@/lib/household-data'
import { loadPerspectiveDataServer } from '@/lib/household/perspective-loader-server'

/** Filter own-account transfers uit inkomen/uitgaven (spiegelt de dashboard-loader). */
const isRealTx = (t: { transaction_type?: string | null }) =>
  t.transaction_type !== 'transfer' && t.transaction_type !== 'joint_transfer'

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
  /**
   * Canoniek netto vermogen (bezittingen − schulden), perspectief-correct en
   * INCLUSIEF de niet-gekoppelde bankrekening-saldi (`bank_accounts` met
   * `linked_asset_id IS NULL`). Dit is exact dezelfde grondslag als de
   * /overzicht-hero/-grafiek (`healthScoreInput.totalAssets − totalDebts`,
   * lib/horizon-data-loader.ts): de sidebar consumeert dit i.p.v. een eigen
   * inline-som, zodat sidebar == hero == dashboard per definitie gelijk zijn.
   */
  netWorth: number
  /**
   * Aantal top-level expense/savings-budgets dat deze maand OVER de limiet zit
   * (kompas cashflow-indicator #847). Voedt het sidebar-`budgetOver`-signaal.
   * Intern al berekend uit dezelfde budget-health-queries; hier ge-expose-d
   * zodat de shell het consumeert i.p.v. een eigen inline-blok met dubbele
   * queries te draaien ("consume, don't recompute").
   */
  budgetsOver: number
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
type BudgetRow = {
  id: string
  default_limit: number
  budget_type: string
  parent_id: string | null
  is_archived: boolean
}
type BudgetTxRow = { budget_id: string; amount: number | string }
type Tx6mRow = {
  amount: number | string
  budget_id?: string | null
  transaction_type?: string | null
  date: string
}

/**
 * Laad de vier-hefbomen-scores + de Box 1/3-statussen voor de huidige gebruiker.
 *
 * Queries: assets/debts/6m-transacties (canonieke spaarquote)/alle-budgetten/
 * maand-budget-tx/maand-inkomen + vroegste-inkomen (extrapolatie). De cashflow-
 * hefboom consumeert de canonieke 6-maands spaarquote (`computeSavingsRate6m` →
 * `savingsRateFromAggregates`), identiek aan het cashflow-instellingenblok en de
 * gezondheidsscore; de overige velden gebruiken dezelfde pure helpers
 * (`computeLeverScores`, `box3TaxStatus`, `box1JaarruimteStatus`).
 *
 * @param supabase    Server-client (RLS-gescoped op de ingelogde gebruiker).
 * @param perspective Stuurt UITSLUITEND `netWorth` (perspectief-correct, via
 *   `loadPerspectiveDataServer` — privacy reeds server-side toegepast). De vier
 *   LEVER-SCORES + Box 1/3-statussen blijven ALTIJD personal-perspectief: hun
 *   queries zijn user-scoped (eq('user_id')) — identiek aan de sidebar-dots,
 *   die óók geen huishoud-/partnerperspectief op de hefbomen-status toepassen.
 *   Een household/partner-view toont dus dezelfde (persoonlijke) hefboomstatus,
 *   maar wél het perspectief-correcte netto vermogen — gelijk aan de hero.
 */
export const loadLeverScores = cache(async function loadLeverScores(
  supabase: SupabaseClient,
  perspective: Perspective = 'personal',
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
    return { scores: empty, taxInput, box3Status: 'neutral', box1Status: 'neutral', netWorth: 0, budgetsOver: 0 }
  }

  // Huidige-maand-grenzen (UTC) voor budget-health en het maand-inkomen — exact
  // dezelfde grenzen als de shell, zodat de afgeleide statussen 1-op-1 matchen.
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    .toISOString()
    .split('T')[0]
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1))
    .toISOString()
    .split('T')[0]

  // 6-maands-venster voor de CANONIEKE spaarquote (identiek aan de dashboard-loader:
  // `localMonthStartMonthsAgo(now, 5)` = de 1e van 5 maanden terug ⇒ 6 kalendermaanden
  // incl. de huidige). Het 12-maands-venster levert de vroegste inkomens-datum voor
  // de extrapolatie bij <6 maanden historie. Voorheen rekende deze loader een eigen
  // 3-maands quote met een tekenfout (uitgaven negatief zonder Math.abs) → 164%
  // i.p.v. de canonieke ~50% (KRUIS-06).
  const sixMonthsAgo = localMonthStartMonthsAgo(now, 5)
  const twelveMonthsAgo = localMonthStartMonthsAgo(now, 11)

  const [
    profileRes,
    assetsRes,
    debtsRes,
    tx6mRes,
    budgetsRes,
    budgetTxRes,
    monthIncomeTxRes,
    bankAccountsRes,
    earliestIncomeRes,
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
    // select('*') zodat computeDebtAflossingMonthly de aflossing-velden
    // (include_aflossing_in_savings, custom_aflossing_amount, rente/looptijd) heeft —
    // de spaarquote telt schuldaflossing als sparen (identiek aan dashboard/core).
    supabase
      .from('debts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true),
    // 6-maands transacties voor de canonieke spaarquote (transfer-gefilterd via
    // transaction_type; spaarbudget-correctie via budget_id). Vervangt de vroegere
    // 3-maands `amount, is_income`-query met de tekenfout.
    supabase
      .from('transactions')
      .select('amount, budget_id, transaction_type, date')
      .eq('user_id', user.id)
      .gte('date', sixMonthsAgo)
      .lt('date', monthEnd),
    // Alle budgetten (parent + child) — de budget-health-subset (budgetsOver) filtert
    // hieruit de top-level expense/savings-budgetten; de spaarbudget-ID-set (incl.
    // kinderen) voedt de spaarquote-correctie.
    supabase
      .from('budgets')
      .select('id, default_limit, budget_type, parent_id, is_archived')
      .eq('user_id', user.id),
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
    // Niet-gekoppelde bankrekeningen (linked_asset_id IS NULL) — RLS-gescoped op
    // de gebruiker. Identiek aan lib/horizon-data-loader.ts:298 zodat de
    // netto-vermogen-grondslag byte-gelijk is aan de hero. unlinkedCash is altijd
    // de eigen liquiditeit (geen perspectief-split — net als in de horizon-loader).
    supabase
      .from('bank_accounts')
      .select('balance')
      .eq('is_active', true)
      .is('linked_asset_id', null),
    // Vroegste inkomens-transactie in het 12-maands venster → aantal maanden data
    // voor de spaarquote-extrapolatie bij <6 maanden historie (identiek aan dashboard).
    supabase
      .from('transactions')
      .select('date')
      .eq('user_id', user.id)
      .gt('amount', 0)
      .gte('date', twelveMonthsAgo)
      .order('date', { ascending: true })
      .limit(1),
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

  // ── Canoniek netto vermogen (perspectief-correct, incl. unlinkedCash) ─────────
  // Spiegelt lib/horizon-data-loader.ts (healthScoreInput.totalAssets−totalDebts):
  // bezittingen + niet-gekoppelde bankrekeningen − schulden, in eigen weergave
  // byte-gelijk aan de eigen aggregaten hierboven. Bij household/partner via de
  // gedeelde, privacy-veilige `loadPerspectiveDataServer` (zelfde share()-regel).
  // Dit voedt UITSLUITEND de sidebar-netWorth-metric — niet de lever-scores.
  const unlinkedCash = ((bankAccountsRes.data ?? []) as Array<{ balance: number | string }>).reduce(
    (s, a) => s + Number(a.balance),
    0,
  )
  let perspectiveTotalAssets = totalAssets + unlinkedCash
  let perspectiveTotalDebts = totalDebts
  if (perspective !== 'personal') {
    try {
      const pd = await loadPerspectiveDataServer(supabase, perspective)
      const share = (item: { ownership?: string; _myShareFraction?: number }, raw: number): number =>
        item.ownership === 'shared' && perspective !== 'household'
          ? raw * (item._myShareFraction ?? 1)
          : raw
      perspectiveTotalAssets =
        pd.assets.reduce((s, a) => {
          const raw = Number(a.current_value) * ((Number(a.net_worth_inclusion_pct) || 100) / 100)
          return s + share(a, raw)
        }, 0) + unlinkedCash
      perspectiveTotalDebts = pd.debts.reduce((s, d) => {
        const raw = Number(d.current_balance) * ((Number(d.net_worth_inclusion_pct) || 100) / 100)
        return s + share(d, raw)
      }, 0)
    } catch {
      // Perspectief-laden faalt (geen huishouden / RLS) → val terug op eigen data.
    }
  }
  const netWorth = perspectiveTotalAssets - perspectiveTotalDebts

  // ── Budgetten: type-map (parent+child) + spaarbudget-ID-set ──
  // Transacties hangen aan child-budgetten, dus de spaarbudget-correctie op de
  // spaarquote heeft de child-IDs nodig (child erft het type van zijn parent).
  const allBudgets = (budgetsRes.data ?? []) as BudgetRow[]
  const budgetTypeById = new Map<string, string>()
  for (const b of allBudgets) if (b.parent_id === null) budgetTypeById.set(b.id, b.budget_type)
  for (const b of allBudgets) {
    if (b.parent_id !== null) {
      const parentType = budgetTypeById.get(b.parent_id)
      if (parentType) budgetTypeById.set(b.id, parentType)
    }
  }
  const savingsBudgetIds = new Set<string>()
  for (const [id, type] of budgetTypeById) if (type === 'savings') savingsBudgetIds.add(id)

  // ── Spaarquote (canoniek 6-maands — gedeelde helper) ──
  // Consume, don't recompute: dezelfde grondslag als het cashflow-instellingenblok
  // en de gezondheidsscore (savingsRateFromAggregates via computeSavingsRate6m):
  // transfer-gefilterd, spaarbudget-stortingen + schuldaflossing tellen als sparen,
  // <6m data geëxtrapoleerd. GEEN profiel-fallback hier (net als de oude 3-maands
  // variant): zonder transactie-inkomen blijft de quote `null` zodat de cashflow-
  // hefboom "onvoldoende data" toont i.p.v. een getal.
  const tx6m = (tx6mRes.data ?? []) as Tx6mRow[]
  let income6m = 0
  let expenses6m = 0
  let savingsBudgetSpent6m = 0
  for (const t of tx6m) {
    if (!isRealTx(t)) continue
    const amt = Number(t.amount)
    if (amt > 0) {
      income6m += amt
      continue
    }
    const abs = Math.abs(amt)
    expenses6m += abs
    if (t.budget_id && savingsBudgetIds.has(t.budget_id)) savingsBudgetSpent6m += abs
  }
  const debtAflossing6m = computeDebtAflossingMonthly(debtRows as unknown as Debt[]) * 6

  let savingsDataMonths = 6
  const earliestIncomeDate = earliestIncomeRes.data?.[0]?.date
  if (earliestIncomeDate) {
    const earliest = new Date(earliestIncomeDate)
    savingsDataMonths = Math.max(
      1,
      Math.min(
        6,
        (now.getFullYear() - earliest.getFullYear()) * 12 + (now.getMonth() - earliest.getMonth()),
      ),
    )
  }

  const savingsRate: number | null =
    income6m > 0
      ? computeSavingsRate6m({
          income6m,
          expenses6m,
          savingsBudgetSpent6m,
          debtAflossing6m,
          dataMonths: savingsDataMonths,
        }).savingsRate6m
      : null

  // ── Box 3-belast-vermogen-signaal (gedeelde helper) ──
  const householdType = (profile.household_type as string | undefined) ?? undefined
  const taxInput = computeBox3TaxableInput(assetRows, debtRows, householdType)

  // ── Budget-health (kompas cashflow-indicator) ──
  // Top-level expense/savings-budgetten die deze maand OVER de limiet zitten. Filter
  // byte-identiek aan de vroegere query (parent_id IS NULL · budget_type ∈
  // {expense,savings} · is_archived = false).
  const healthBudgets = allBudgets.filter(
    (b) =>
      b.parent_id === null &&
      (b.budget_type === 'expense' || b.budget_type === 'savings') &&
      b.is_archived === false,
  )
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
    savingsRate,
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

  return { scores, taxInput, box3Status, box1Status, netWorth, budgetsOver }
})
