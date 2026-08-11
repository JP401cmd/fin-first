/**
 * Gedeelde bron-van-waarheid voor de ACTUELE `current_value` van actieve doelen.
 *
 * Voor asset/debt-gekoppelde doelen én lab-gegenereerde parameter-doelen
 * (`metadata.bron === 'parameter'`: spaarquote/salaris/rendement/vrijheidsleeftijd)
 * ligt de huidige waarde NIET in de DB-kolom, maar wordt die live afgeleid uit
 * consume-only bronnen. Voorheen leefde deze logica alleen in `lib/fin-data-loader.ts`
 * (doelen-scherm), waardoor de dashboard-Doelen-widget de RAUWE opgeslagen waarde
 * (vaak 0) toonde en afweek van het scherm. Deze module is de ÉNE plek zodat
 * beide oppervlakken (scherm + widget) identiek synchroniseren — geen drift.
 *
 * `computeGoalProgress` (lib/goal-data.ts) blijft de enige plek die
 * current/target → pct/onTrack/eta vertaalt; hier gaat het puur om de databewerking
 * (welke huidige waarde voeren we die functie).
 *
 * Alle queries zijn LAZY (alleen bij aanwezige parameter-doelen) en per-type gated;
 * er draait GEEN kernel/projectie. Elke bron reuse't de canonieke rekenhelpers
 * (`savingsRateFromAggregates`, `computeDebtAflossingMonthly`,
 * `resolveEffectiveIncomeExpenses`) of dezelfde weegregels als
 * `buildCategorieReturnGroups` — geen tweede formule-thuis.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Debt } from '@/lib/debt-data'
import { savingsRateFromAggregates, computeDebtAflossingMonthly } from '@/lib/savings-source'
import { resolveEffectiveIncomeExpenses, type IncomeExpenseSources } from '@/lib/effective-financials'
import { loadBudgetBasis } from '@/lib/household/budget-share'
import type { BudgetBasisRow } from '@/lib/budget-basis'
import { localMonthStart, localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'
import type { GoalType } from '@/lib/goal-data'

/**
 * Minimale velden die de doel-`current_value`-sync leest/muteert. Zowel het
 * volledige `Goal`/`GoalWithBudget` als de lichtere dashboard-goal-rij voldoen
 * hieraan, dus beide loaders kunnen deze helpers zonder cast consumeren.
 */
export type SyncableGoal = {
  goal_type: GoalType
  current_value: number
  target_value: number
  is_completed?: boolean
  metadata?: Record<string, unknown> | null
  linked_asset_id?: string | null
  linked_debt_id?: string | null
}

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
 *
 * Dit is óók de canonieke VOLGORDE (parameter-doelen eerst) die het doelen-scherm
 * gebruikt; de dashboard-widget moet dezelfde slice/volgorde consumeren zodat
 * scherm en widget dezelfde top-doelen in dezelfde volgorde tonen.
 */
export function splitActiveGoals<T extends { is_completed?: boolean; metadata?: Record<string, unknown> | null }>(
  allGoals: T[],
): { goals: T[]; parameterGoals: T[] } {
  const active = allGoals.filter(g => !g.is_completed)
  const parameterGoals = active.filter(isParameterGoal)
  const overige = active.filter(g => !isParameterGoal(g))
  return { goals: [...parameterGoals, ...overige.slice(0, 5)], parameterGoals }
}

/**
 * Asset/debt-gekoppelde doelen: override `current_value` met de LIVE bron-waarde
 * (asset `current_value`, of voor debt-payoff: doel − resterende schuld). Pure,
 * synchrone in-place mutatie — geen query (de assets/debts zijn al geladen).
 */
export function autolinkGoalCurrentValues<
  T extends { linked_asset_id?: string | null; linked_debt_id?: string | null; current_value: number; target_value: number },
>(
  goals: T[],
  assets: readonly { id: string; current_value: number | string | null }[],
  debts: readonly { id: string; current_balance: number | string | null }[],
): void {
  for (const goal of goals) {
    if (goal.linked_asset_id) {
      const asset = assets.find(a => a.id === goal.linked_asset_id)
      if (asset) goal.current_value = Number(asset.current_value)
    } else if (goal.linked_debt_id) {
      const debt = debts.find(d => d.id === goal.linked_debt_id)
      if (debt) {
        // For debt payoff: progress = original target − remaining balance
        goal.current_value = Math.max(0, Number(goal.target_value) - Number(debt.current_balance))
      }
    }
  }
}

// ── Rij-types voor de lazy injectie-queries (kolom-scoped, licht) ──
type ParamTxRow = { amount: number | string; budget_id: string | null; date: string }
/**
 * De velden ná `parent_id` worden alleen door de budgetGRONDSLAG gebruikt
 * (ADR 0103, `computeBudgetBasis`); `computeParameterSavingsRatePct` heeft
 * genoeg aan de eerste drie. Ze staan hier zodat de rij-vorm eerlijk is en de
 * cast naar `BudgetBasisRow` geen velden verzint.
 */
type ParamBudgetRow = {
  id: string
  budget_type: string | null
  parent_id: string | null
  name?: string | null
  default_limit?: number | string | null
  interval?: string | null
  ownership?: string | null
  is_archived?: boolean | null
  merged_into?: string | null
  created_at?: string | null
}
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
  /**
   * Budgetgrondslag (ADR 0103). Weglaten → transactie/handmatig zoals voorheen;
   * dat houdt de bestaande unit-tests en elke andere aanroeper inert.
   */
  budgetBasis?: { income: { monthlyTotal: number }; expenses: { monthlyTotal: number } },
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
  const { income } = resolveEffectiveIncomeExpenses(
    profile ?? {},
    monthIncome,
    monthExpenses,
    budgetBasis
      ? { income: budgetBasis.income.monthlyTotal, expenses: budgetBasis.expenses.monthlyTotal }
      : undefined,
  )
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
export async function injectParameterGoalCurrentValues(
  supabase: SupabaseClient,
  parameterGoals: { goal_type: GoalType; current_value: number }[],
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

  const [txRows, budgetRows, debtRows, profileRow, basisPrefsRow, assetRows, snapshotRows] = await Promise.all([
    needsTx
      ? supabase
          .from('transactions')
          .select('amount, budget_id, date')
          .gte('date', sixMonthsAgo)
          .lt('date', monthEnd)
          .then(r => ((r.data ?? []) as ParamTxRow[]))
      : Promise.resolve([] as ParamTxRow[]),
    // Ook nodig voor `needsSalary`: het salaris-doel draait sinds ADR 0103 op de
    // grondslag (budget/transactie/handmatig), niet meer alleen op transacties.
    needsSavingsRate || needsSalary
      ? supabase
          .from('budgets')
          .select('id, budget_type, parent_id, name, default_limit, interval, ownership, is_archived, merged_into, created_at')
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
          // Belt-and-suspenders: eigen-rij expliciet. RLS scopet al op auth.uid();
          // dit maakt de intentie hard en voorkomt een cross-account lek mocht RLS
          // ooit wijken.
          .eq('id', userId)
          .maybeSingle()
          .then(r => (r.data as IncomeExpenseSources | null))
      : Promise.resolve(null as IncomeExpenseSources | null),
    // Grondslag-selectie (ADR 0103), apart en tolerant: `cashflow_basis_prefs`
    // bestaat pas na migratie 20260811160000 en zou als extra kolom de
    // profielselect hierboven laten falen.
    needsSalary && userId
      ? supabase
          .from('profiles')
          .select('cashflow_basis_prefs')
          .eq('id', userId)
          .maybeSingle()
          .then(r => (r.data as Record<string, unknown> | null), () => null)
      : Promise.resolve(null as Record<string, unknown> | null),
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
    ? computeParameterEffectiveSalary(
        profileRow,
        txRows,
        monthStart,
        // Budgetgrondslag (ADR 0103) — het salaris-doel meet zich aan hetzelfde
        // effectieve maandinkomen als /overzicht, niet aan een transactie-only
        // variant daarvan.
        await loadBudgetBasis(supabase, basisPrefsRow, budgetRows as unknown as BudgetBasisRow[]),
      )
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

/**
 * ENE ingang die beide loaders (doelen-scherm + dashboard-widget) consumeren:
 * split actieve doelen in canonieke volgorde (parameter-doelen eerst + max 5
 * handmatige), synchroniseer daarna de `current_value` van asset/debt-gekoppelde
 * en parameter-doelen live. Muteert de doelen in-place en geeft de gesorteerde
 * `goals` (+ de `parameterGoals`-subset) terug.
 */
export async function syncActiveGoalValues<T extends SyncableGoal>(
  supabase: SupabaseClient,
  allGoals: T[],
  assets: readonly { id: string; current_value: number | string | null }[],
  debts: readonly { id: string; current_balance: number | string | null }[],
  userId: string | null,
): Promise<{ goals: T[]; parameterGoals: T[] }> {
  const { goals, parameterGoals } = splitActiveGoals(allGoals)
  autolinkGoalCurrentValues(goals, assets, debts)
  await injectParameterGoalCurrentValues(supabase, parameterGoals, userId)
  return { goals, parameterGoals }
}
