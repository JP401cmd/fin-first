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
import { localMonthStartMonthsAgo, localMonthBounds } from '@/lib/month-range'
import {
  getActiveAssets,
  getActiveDebts,
  getOwnProfile,
  getBudgets,
  getUnlinkedBankAccounts,
  getCurrentMonthTx,
  getEarliestIncomeDate,
} from '@/lib/server-data/base'
import {
  fetchTxMonthAggregate,
  aggSumPositief,
  aggSumNegatiefAbs,
  type TxMonthAggregateRow,
} from '@/lib/server-data/tx-aggregates'
import type { Debt } from '@/lib/debt-data'
import type { LeverageStatus } from '@/lib/leverage-status'
import type { Perspective } from '@/lib/household-data'
import { loadPerspectiveDataServer } from '@/lib/household/perspective-loader-server'

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

  const now = new Date()

  // 6-maands-venster voor de CANONIEKE spaarquote (identiek aan de dashboard-loader:
  // `localMonthStartMonthsAgo(now, 5)` = de 1e van 5 maanden terug ⇒ 6 kalendermaanden
  // incl. de huidige). Voorheen rekende deze loader een eigen 3-maands quote met een
  // tekenfout (uitgaven negatief zonder Math.abs) → 164% i.p.v. de canonieke ~50%
  // (KRUIS-06).
  const sixMonthsAgo = localMonthStartMonthsAgo(now, 5)

  // Gedeelde basisdata-laag (lib/server-data/base.ts): assets/debts/profiel/
  // budgetten/bank + het huidige-maand-tx-venster draaien als ÉÉN query per tabel
  // per request, gedeeld met de andere loaders + de shell-layout. De vroegere
  // per-venster/per-teken tx-queries (6-maands, huidige-maand budget-tx, maand-
  // inkomen) worden hieronder in JS uit dit venster + het 6-maands-aggregaat
  // geslicet — byte-identiek, want die vensters zijn subsets. Vroegste-inkomen
  // komt via de aparte all-time `getEarliestIncomeDate` (zie hieronder), niet
  // meer uit een 12-maands-slice. RLS scopet al op de gebruiker, dus de
  // expliciete .eq('user_id') is vervallen.
  const [
    profileRes,
    assetsRes,
    debtsRes,
    budgetsRes,
    bankAccountsRes,
    currentMonthTxRes,
    tx6mAggRes,
    earliestIncomeRes,
  ] = await Promise.all([
    getOwnProfile(supabase),
    getActiveAssets(supabase),
    getActiveDebts(supabase),
    getBudgets(supabase),
    getUnlinkedBankAccounts(supabase),
    getCurrentMonthTx(supabase),
    // 6-maands maandaggregaat voor de canonieke spaarquote (transfer-gefilterd via
    // realOnly; spaarbudget-correctie via budgetIds). SQL-aggregaat i.p.v. een
    // 6-maands rijen-slice: kan niet stil afkappen op max_rows=1000
    // (correctheid). RLS-breed (geen ownOnly) — identiek aan getTx12m's vroegere
    // scope, waar T2.1 de expliciete .eq('user_id') liet vervallen.
    fetchTxMonthAggregate(supabase, { from: sixMonthsAgo, to: localMonthBounds(now).end }),
    // Vroegste inkomens-datum (all-time, één rij) — afkap-vrij, i.p.v. de vroegere
    // reduce over een gecapte 12-maands-slice (die kon bij >1000 positieve rijen
    // stil afkappen → savingsDataMonths te klein → over-extrapolatie). Zelfde
    // gedeelde helper als dashboard-data-loader.ts/horizon-data-loader.ts;
    // cache() dedupliceert met die calls binnen hetzelfde request.
    getEarliestIncomeDate(supabase),
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
  // 6-maands sommen uit het maandaggregaat (transfer-gefilterd via realOnly,
  // spaarbudget-correctie via budgetIds) — byte-identiek aan de vroegere rij-
  // reductie, maar zonder de stille max_rows-afkap.
  const tx6mAgg = (tx6mAggRes.data ?? []) as TxMonthAggregateRow[]
  const income6m = aggSumPositief(tx6mAgg, { realOnly: true })
  const expenses6m = aggSumNegatiefAbs(tx6mAgg, { realOnly: true })
  const savingsBudgetSpent6m = aggSumNegatiefAbs(tx6mAgg, { realOnly: true, budgetIds: savingsBudgetIds })
  const debtAflossing6m = computeDebtAflossingMonthly(debtRows as unknown as Debt[]) * 6

  let savingsDataMonths = 6
  // Vroegste inkomens-datum: all-time via de gedeelde `getEarliestIncomeDate`
  // (order(date asc).limit(1)) i.p.v. een reduce over een gecapte 12-maands-slice —
  // die kon bij >1000 positieve rijen stil afkappen (savingsDataMonths te klein →
  // over-extrapolatie). Spiegelt dashboard-data-loader.ts/horizon-data-loader.ts.
  const earliestIncomeDate =
    (earliestIncomeRes.data as { date?: string | null } | null)?.date ?? undefined
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
  // Huidige-maand budget-transacties (budget_id NOT NULL) — geslicet uit de
  // gedeelde huidige-maand fetch (byte-identiek aan .not('budget_id','is',null)).
  const budgetTxRows: BudgetTxRow[] = ((currentMonthTxRes.data ?? []) as Tx6mRow[]).flatMap((t) =>
    t.budget_id != null ? [{ budget_id: t.budget_id, amount: t.amount }] : [],
  )
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
  // Huidige-maand transacties (alle) voor het Box 1-maandinkomen — dezelfde
  // gedeelde huidige-maand fetch (de vroegere query had geen budget_id-filter).
  const monthTxRows = (currentMonthTxRes.data ?? []) as Array<{ amount: number | string }>
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
