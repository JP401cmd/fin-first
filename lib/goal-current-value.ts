/**
 * Gedeelde bron-van-waarheid voor de ACTUELE `current_value` van actieve doelen.
 *
 * Voor asset/debt-gekoppelde doelen, lab-gegenereerde parameter-doelen
 * (`metadata.bron === 'parameter'`: spaarquote/salaris/rendement/vrijheidsleeftijd)
 * én het vrijheidsgetal-doel (`metadata.standaardDoel === 'vrijheidsgetal'`,
 * bevinding C10 — zie lib/goals/vrijheidsgetal-goal.ts) ligt de huidige waarde
 * NIET in de DB-kolom, maar wordt die live afgeleid uit consume-only bronnen. Voorheen leefde deze logica alleen in `lib/fin-data-loader.ts`
 * (doelen-scherm), waardoor de dashboard-Doelen-widget de RAUWE opgeslagen waarde
 * (vaak 0) toonde en afweek van het scherm. Deze module is de ÉNE plek zodat
 * beide oppervlakken (scherm + widget) identiek synchroniseren — geen drift.
 *
 * `computeGoalProgress` (lib/goal-data.ts) blijft de enige plek die
 * current/target → pct/onTrack/eta vertaalt; hier gaat het puur om de databewerking
 * (welke huidige waarde voeren we die functie).
 *
 * Alle queries zijn LAZY (alleen bij aanwezige parameter-doelen) en per-type gated;
 * er draait GEEN kernel/projectie. Elke bron CONSUMEERT de canonieke laag
 * (`loadForecastSectionData` voor de spaarquote, `resolveEffectiveIncomeExpenses`
 * voor het salaris) of dezelfde weegregels als `buildCategorieReturnGroups` —
 * geen tweede formule-thuis.
 *
 * SPIEGELEN IS GEEN CONSUMEREN (les, 31 aug 2026). Het spaarquote-doel rekende
 * hier tot vandaag met een eigen kopie van de loader-formule, met in de docstring
 * de belofte "DEZELFDE grondslag als de spaarquote-widget". Die belofte hield de
 * kopie niet: op productie stond 5,8 % op de doelkaart naast 9,5 % op de widget
 * en 30 % in het instellingenblok. Een tweede rekenweg met een parity-belofte in
 * een comment is geen parity; alleen dezelfde aanroep is dat.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { savingsRateWindow } from '@/lib/savings-source'
import { loadForecastSectionData } from '@/lib/cashflow-kpis'
import { resolveEffectiveIncomeExpenses, type IncomeExpenseSources } from '@/lib/effective-financials'
import { loadBudgetBasis } from '@/lib/household/budget-share'
import type { BudgetBasisRow } from '@/lib/budget-basis'
import { localMonthStart, localMonthBounds } from '@/lib/month-range'
import type { GoalType } from '@/lib/goal-data'
import {
  applyVrijheidsgetalSync,
  isVrijheidsgetalGoal,
  type VrijheidsgetalSnapshot,
} from '@/lib/goals/vrijheidsgetal-goal'

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
 * De velden ná `parent_id` worden gebruikt door de budgetGRONDSLAG (ADR 0103,
 * `computeBudgetBasis`) die het SALARIS-doel voedt. Ze staan hier zodat de
 * rij-vorm eerlijk is en de cast naar `BudgetBasisRow` geen velden verzint.
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

/*
 * VERWIJDERD (31 aug 2026): `computeParameterSavingsRatePct`.
 *
 * Deze functie claimde in haar docstring "DEZELFDE grondslag als de
 * spaarquote-widget" maar SPIEGELDE de loader-formule ("spiegelt
 * lib/horizon-data-loader.ts") in plaats van hem te consumeren — en de kopie
 * dreef weg. Op een productie-account van de eigenaar toonde de doelkaart 5,8 %
 * waar de widget 9,5 % toonde en het instellingenblok 30 %: drie percentages voor
 * één grootheid. De drift had drie oorzaken tegelijk, en dat is precies waarom een
 * kopie geen gelijkheid kan garanderen: (1) de eigen rij-lus filterde géén
 * eigen-rekening-overboekingen weg (de loaders doen dat met `realOnly`), (2) er
 * was geen <6-maands extrapolatie en geen profiel-/net-vermogen-delta-fallback,
 * en (3) ze rekende sowieso de MÉTING uit, niet de grondslag-geresolveerde quote
 * die elk ander oppervlak toont.
 *
 * Het doel consumeert nu `loadForecastSectionData(...).effectiveSavingsRatePct`
 * — dezelfde gedeelde laag die de forecast-pagina voedt, met alle acht fetches
 * `cache()`-gedeeld. Zie `injectParameterGoalCurrentValues` hieronder.
 */

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
 *
 * Vier bronnen, drie eigen queries + één gedeelde laag: het SPAARQUOTE-doel doet
 * sinds 31 aug 2026 geen eigen query meer maar consumeert
 * `loadForecastSectionData` (lib/cashflow-kpis.ts) — dezelfde acht `cache()`-gedeelde
 * fetches die de forecast-pagina en (via overlap) de dashboardbundel toch al
 * gebruiken. Dat is meer I/O dan de vroegere drie eigen queries wanneer er één
 * spaarquote-doel bestaat en verder niets op de pagina draait; die prijs is bewust
 * betaald voor één getal in plaats van drie.
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
  // Alleen het SALARIS-doel leest nog rauwe transactierijen. Het spaarquote-doel
  // deed dat ook, met een eigen rij-lus die transfers meetelde; het consumeert nu
  // de gedeelde forecast-laag (zie hieronder) en heeft dus geen eigen tx-, budget-
  // of schulden-query meer nodig.
  const needsTx = needsSalary

  const now = new Date()
  const monthStart = localMonthStart(now)
  const monthEnd = localMonthBounds(now).end
  // Ondergrens van de tx-query voor het salaris-doel. Bewust nog steeds het
  // spaarquote-venster (lib/savings-source.ts): dezelfde rijen, één query.
  const { fromDate: sixMonthsAgo } = savingsRateWindow(now)

  const [txRows, budgetRows, profileRow, basisPrefsRow, assetRows, snapshotRows, forecastScalars] = await Promise.all([
    needsTx
      ? supabase
          .from('transactions')
          .select('amount, budget_id, date')
          .gte('date', sixMonthsAgo)
          .lt('date', monthEnd)
          .then(r => ((r.data ?? []) as ParamTxRow[]))
      : Promise.resolve([] as ParamTxRow[]),
    // Het salaris-doel draait sinds ADR 0103 op de grondslag (budget/transactie/
    // handmatig), niet meer alleen op transacties.
    needsSalary
      ? supabase
          .from('budgets')
          .select('id, budget_type, parent_id, name, default_limit, interval, ownership, is_archived, merged_into, created_at')
          .then(r => ((r.data ?? []) as ParamBudgetRow[]))
      : Promise.resolve([] as ParamBudgetRow[]),
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
    // DE SPAARQUOTE WORDT GECONSUMEERD, NIET NAGEBOUWD (31 aug 2026).
    // `loadForecastSectionData` is de gedeelde slanke laag die ook de
    // forecast-pagina voedt; zijn `effectiveSavingsRatePct` komt uit dezelfde
    // `resolveSavingsSource` als /overzicht, het instellingenblok en de
    // spaarquote-widget — inclusief transfer-filter, <6-maands extrapolatie,
    // profiel-fallback, net-vermogen-delta-tak en de grondslagkeuze van de
    // gebruiker.
    //
    // STAAT BEWUST ÍN DEZE Promise.all. Hij hing er eerst serieel achter, met als
    // argument dat zijn acht fetches `cache()`-gedeeld zijn. Dat argument klopt
    // voor een render waarop `loadDashboardData` toch al draait, maar NIET voor
    // `loadFinData` (het doelen-scherm): daar is er niets om mee te delen en
    // wachtte de pagina eerst de doel-queries áf en dán nog eens acht fetches.
    // Als element van deze Promise.all lopen ze parallel; gedeelde fetches
    // blijven gedeeld, dus dit kost nooit méér.
    needsSavingsRate
      ? loadForecastSectionData(supabase)
      : Promise.resolve(null as Awaited<ReturnType<typeof loadForecastSectionData>> | null),
  ])

  // TOLERANTIE-GUARD OP DE INVOER, NIET OP DE UITKOMST (M4).
  // De vroegere regel was `income6m ≤ 0 → undefined`: geen bruikbaar inkomen ⇒
  // niets te zeggen ⇒ laat de opgeslagen doelwaarde staan. Die is hier eerst
  // vertaald naar `uitkomst !== 0`, en dat is iets anders: een gebruiker die
  // precies quitte speelt heeft een ECHTE spaarquote van 0 %, en die hoort het
  // doel wél te verversen — anders blijft er een oude, te rooskleurige waarde op
  // de kaart staan juist wanneer het slechter gaat. De guard staat daarom weer op
  // de invoer: is er geen effectief maandinkomen, dan is er geen noemer en dus
  // geen uitspraak; is die er wel, dan telt ook 0 % (en een negatieve quote).
  const savingsRatePct =
    forecastScalars && forecastScalars.monthlyIncome > 0
      ? forecastScalars.effectiveSavingsRatePct
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
 *
 * `loadFireSnapshot` is de DERDE synchronisatiebron (bevinding C10): het
 * vrijheidsgetal-doel volgt de canonieke FIRE-motor i.p.v. een statisch
 * opgeslagen bedrag. Bewust een THUNK en geen waarde: hij wordt alleen
 * aangeroepen wanneer er daadwerkelijk zo'n doel actief is, zodat gebruikers
 * zonder FIRE-doel geen kernel-run betalen — hetzelfde lazy-patroon als de
 * parameter-injectie hierboven.
 */
export async function syncActiveGoalValues<T extends SyncableGoal>(
  supabase: SupabaseClient,
  allGoals: T[],
  assets: readonly { id: string; current_value: number | string | null }[],
  debts: readonly { id: string; current_balance: number | string | null }[],
  userId: string | null,
  loadFireSnapshot?: () => Promise<VrijheidsgetalSnapshot | null>,
): Promise<{ goals: T[]; parameterGoals: T[]; fireSnapshot: VrijheidsgetalSnapshot | null; vrijheidsgetalSynced: number }> {
  const { goals, parameterGoals } = splitActiveGoals(allGoals)
  autolinkGoalCurrentValues(goals, assets, debts)

  const wantsFire = Boolean(loadFireSnapshot) && goals.some(isVrijheidsgetalGoal)
  const [, fireSnapshot] = await Promise.all([
    injectParameterGoalCurrentValues(supabase, parameterGoals, userId),
    wantsFire ? loadFireSnapshot!() : Promise.resolve(null),
  ])
  const vrijheidsgetalSynced = applyVrijheidsgetalSync(goals, fireSnapshot)

  return { goals, parameterGoals, fireSnapshot, vrijheidsgetalSynced }
}
