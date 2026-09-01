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
 * UITBREIDING (1 sep 2026), twee stuks, allebei op ditzelfde principe gebouwd:
 *  1. MEERDERE KOPPELINGEN per doel (tabel `goal_links`): een doel mag bezittingen
 *     én schulden tegelijk dragen. De ene formule staat in
 *     `computeLinkedCurrentValue` en wordt óók door het formulier gebruikt voor
 *     de prefill — prefill ≡ runtime, geen tweede rekenweg.
 *  2. AUTO-SYNC METRIC-DOELEN (`metadata.sync === 'auto'`): een doel op een
 *     afgeleid cijfer dat live meeloopt met de canonieke motor. Élke bron is een
 *     THUNK die een BESTAANDE laag aanroept (`GoalMetricSources` onderaan) —
 *     nooit een formule die hier opnieuw wordt opgeschreven.
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
import type { DebtTermBasis } from '@/lib/debt-term-basis'
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
  /**
   * Nodig om `goal_links`-rijen aan het doel te koppelen. OPTIONEEL zodat
   * bestaande lichte projecties (en de unit-tests) zonder id blijven voldoen:
   * een doel zonder id kan simpelweg geen link-rijen hebben en volgt dan het
   * legacy-pad.
   */
  id?: string
  goal_type: GoalType
  current_value: number
  target_value: number
  is_completed?: boolean
  metadata?: Record<string, unknown> | null
  linked_asset_id?: string | null
  linked_debt_id?: string | null
}

/**
 * Eén rij uit `goal_links` zoals de loaders 'm kolom-scoped ophalen. De DB-CHECK
 * garandeert dat precies één van `asset_id`/`debt_id` gevuld is; deze laag gaat
 * er defensief mee om (een rij met beide of geen van beide wordt genegeerd).
 */
export type GoalLinkRow = {
  goal_id: string
  asset_id: string | null
  debt_id: string | null
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
 * Marker voor een AUTO-SYNC metric-doel: een door de gebruiker aangemaakt doel op
 * een AFGELEID cijfer dat live uit een canonieke motor meesynchroniseert
 * (`metadata.sync === 'auto'`, gezet door de doelbasis-kiezer).
 *
 * Bewust een EIGEN marker naast `isParameterGoal`, niet een verbreding daarvan:
 * `metadata.bron === 'parameter'` betekent "door het /toekomst-lab gegenereerd"
 * en draagt zijn eigen levenscyclus (partial unique index, één per type). Een
 * auto-sync-doel is gewoon een handmatig doel met een live bron.
 *
 * REGRESSIE-EIS (docstring r. 60-69 hierboven, en de bestaande unit-tests):
 * bestaande doelen ZONDER marker blijven volledig ongemoeid. `metadata` mag
 * ontbreken (oude rijen), `null` of `{}` zijn — alle drie leveren false.
 */
export function isAutoSyncMetricGoal(goal: { metadata?: Record<string, unknown> | null }): boolean {
  const m = goal.metadata
  return typeof m === 'object' && m !== null && (m as Record<string, unknown>).sync === 'auto'
}

/**
 * Hoeveel door de GEBRUIKER aangemaakte doelen het doelen-scherm/de widget
 * hoogstens toont. Bewust ongewijzigd op 5 (bestaand gedrag) en bewust een
 * WEERGAVE-cap, geen financiële aanname — vandaar hier en niet in lib/constants.ts.
 */
export const MAX_HANDMATIGE_DOELEN = 5

/**
 * Cap-splitsing: actieve doelen → parameter-doelen (vooraan, ongelimiteerd; de
 * partial unique index begrenst ze feitelijk op één per type = max 4) + maximaal
 * 5 door de gebruiker aangemaakte doelen. `parameterGoals` en `autoSyncGoals`
 * worden apart teruggegeven zodat de injectie alleen die rijen hoeft te raken
 * (én zonder de gewone handmatige rijen aan te tikken).
 *
 * Dit is óók de canonieke VOLGORDE (parameter-doelen eerst) die het doelen-scherm
 * gebruikt; de dashboard-widget moet dezelfde slice/volgorde consumeren zodat
 * scherm en widget dezelfde top-doelen in dezelfde volgorde tonen.
 *
 * ## Waar auto-sync-doelen landen, en waarom de cap zinnig blijft
 * Auto-sync-doelen krijgen VOORRANG binnen de bestaande cap in plaats van erbuiten
 * te vallen zoals de parameter-doelen. Reden: parameter-doelen zijn per type
 * uniek (de partial unique index maakt er feitelijk hoogstens vier), dus die
 * kunnen de lijst niet laten ontsporen — auto-sync-doelen zijn gewone,
 * ONBEGRENSD door de gebruiker aan te maken rijen. Zou de cap ze overslaan, dan
 * kan één gebruiker met tien doelbasis-doelen elk handmatig spaardoel van het
 * scherm duwen. "Maximaal 5 door jou aangemaakte doelen" blijft dus letterlijk
 * gelden; binnen die vijf staan de live-getrackte doelen vooraan.
 *
 * Gevolg (bewust): een auto-sync-doel dat buiten de cap valt, wordt ook niet
 * gesynchroniseerd. Dat is de juiste kant om op te falen — het doel wordt dan
 * immers ook niet getoond, dus er verschijnt nooit een verouderd getal.
 */
export function splitActiveGoals<T extends { is_completed?: boolean; metadata?: Record<string, unknown> | null }>(
  allGoals: T[],
): { goals: T[]; parameterGoals: T[]; autoSyncGoals: T[] } {
  const active = allGoals.filter(g => !g.is_completed)
  const parameterGoals = active.filter(isParameterGoal)
  const overige = active.filter(g => !isParameterGoal(g))
  const autoSync = overige.filter(isAutoSyncMetricGoal)
  const handmatig = overige.filter(g => !isAutoSyncMetricGoal(g))
  const capped = [...autoSync, ...handmatig].slice(0, MAX_HANDMATIGE_DOELEN)
  return {
    goals: [...parameterGoals, ...capped],
    parameterGoals,
    // Alleen de auto-sync-doelen die de cap daadwerkelijk haalden: de injectie
    // mag geen rij aanraken die niet in `goals` staat.
    autoSyncGoals: capped.filter(isAutoSyncMetricGoal),
  }
}

/**
 * DE ENE huidige-waarde-formule voor een doel met koppelingen (`goal_links`).
 *
 * Drie takken, en de derde is de nieuwe:
 *  - alleen bezittingen  ⇒ Σ waarden. Identiek aan het legacy asset-pad.
 *  - alleen schulden     ⇒ max(0, doel − Σ saldi). Identiek aan het legacy
 *    debt-pad: bij een AFBOUW is de voortgang het AFGELOSTE bedrag, niet het
 *    resterende saldo. De clamp op 0 blijft: een schuld die groter is dan het
 *    doel betekent "nog niets afgelost", niet "negatieve voortgang".
 *  - GEMENGD             ⇒ Σ waarden − Σ saldi. Netto, en bewust NIET geklemd:
 *    wie €10.000 spaargeld tegenover €25.000 schuld zet staat op −€15.000, en
 *    dat is een eerlijk beeld. Een clamp zou "€0" tonen en daarmee suggereren
 *    dat de schuld niet meetelt.
 *
 * Bewust geëxporteerd: het formulier gebruikt 'm voor de PREFILL, zodat wat de
 * gebruiker bij het koppelen ziet exact is wat de sync er runtime van maakt.
 * Dat heft de bestaande afwijking op waarbij `handleDebtLink` in
 * `components/app/goal-form.tsx` de huidige waarde op het RUWE saldo zette —
 * een prefill die de eigen runtime-formule tegensprak.
 *
 * NUMERIEK: bedragen komen uit Supabase NUMERIC-kolommen en dus als STRING
 * binnen. Elke waarde gaat door `Number(...)`; niet-finite waarden tellen als 0
 * i.p.v. het totaal op NaN te zetten.
 */
export function computeLinkedCurrentValue(
  targetValue: number,
  linkedAssets: readonly { current_value: number | string | null }[],
  linkedDebts: readonly { current_balance: number | string | null }[],
): number {
  const sumAssets = linkedAssets.reduce((s, a) => {
    const v = Number(a.current_value)
    return s + (Number.isFinite(v) ? v : 0)
  }, 0)
  const sumDebts = linkedDebts.reduce((s, d) => {
    const v = Number(d.current_balance)
    return s + (Number.isFinite(v) ? v : 0)
  }, 0)

  const hasAssets = linkedAssets.length > 0
  const hasDebts = linkedDebts.length > 0

  if (hasAssets && hasDebts) return sumAssets - sumDebts
  if (hasDebts) {
    const target = Number(targetValue)
    return Math.max(0, (Number.isFinite(target) ? target : 0) - sumDebts)
  }
  return sumAssets
}

/**
 * Asset/debt-gekoppelde doelen: override `current_value` met de LIVE bron-waarde.
 * Pure, synchrone in-place mutatie — geen query (de assets/debts zijn al geladen).
 *
 * ROUTERING (`links` meegegeven én ≥1 rij voor dít doel):
 *  - ≥1 link-rij  ⇒ `computeLinkedCurrentValue` (meerdere bezittingen én
 *    schulden, netto-semantiek).
 *  - geen link-rij ⇒ EXACT het legacy-gedrag op `linked_asset_id`/
 *    `linked_debt_id`, byte-identiek aan voorheen. De legacy-kolommen worden niet
 *    meer geschreven maar blijven gevuld voor niet-gemigreerde rijen, dus deze
 *    tak mag nooit wijzigen.
 *
 * Een link-rij die naar een niet-geladen bezitting/schuld wijst (inactief,
 * verwijderd, buiten het perspectief) wordt overgeslagen. Kon GEEN ENKELE
 * link-rij worden opgelost, dan blijft de opgeslagen waarde staan — zelfde
 * tolerante degradatie als het legacy-pad (`if (asset)`), zodat een doel niet
 * stilletjes op €0 springt omdat de bronrijen ontbreken.
 */
export function autolinkGoalCurrentValues<
  T extends {
    id?: string
    linked_asset_id?: string | null
    linked_debt_id?: string | null
    current_value: number
    target_value: number
  },
>(
  goals: T[],
  assets: readonly { id: string; current_value: number | string | null }[],
  debts: readonly { id: string; current_balance: number | string | null }[],
  links?: readonly GoalLinkRow[],
): void {
  // Index de link-rijen één keer per goal_id (i.p.v. per doel over alle rijen).
  const linksByGoal = new Map<string, { assetIds: string[]; debtIds: string[] }>()
  for (const row of links ?? []) {
    if (!row?.goal_id) continue
    // CHECK-invariant: precies één van beide. Een rij die daar niet aan voldoet
    // is onbruikbaar en wordt genegeerd (geen gok welke kant bedoeld was).
    const isAsset = row.asset_id != null && row.debt_id == null
    const isDebt = row.debt_id != null && row.asset_id == null
    if (!isAsset && !isDebt) continue
    let entry = linksByGoal.get(row.goal_id)
    if (!entry) {
      entry = { assetIds: [], debtIds: [] }
      linksByGoal.set(row.goal_id, entry)
    }
    if (isAsset) entry.assetIds.push(row.asset_id as string)
    else entry.debtIds.push(row.debt_id as string)
  }

  for (const goal of goals) {
    const entry = goal.id ? linksByGoal.get(goal.id) : undefined

    if (entry && (entry.assetIds.length > 0 || entry.debtIds.length > 0)) {
      const linkedAssets = entry.assetIds
        .map(id => assets.find(a => a.id === id))
        .filter((a): a is { id: string; current_value: number | string | null } => !!a)
      const linkedDebts = entry.debtIds
        .map(id => debts.find(d => d.id === id))
        .filter((d): d is { id: string; current_balance: number | string | null } => !!d)
      if (linkedAssets.length > 0 || linkedDebts.length > 0) {
        goal.current_value = computeLinkedCurrentValue(
          Number(goal.target_value),
          linkedAssets,
          linkedDebts,
        )
      }
      continue
    }

    // ── Legacy-pad, ongewijzigd ──
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

/** Heeft dit doel ≥1 bruikbare link-rij? (Link wint van metric-injectie.) */
function hasGoalLinks(goalId: string | undefined, links: readonly GoalLinkRow[] | undefined): boolean {
  if (!goalId || !links || links.length === 0) return false
  return links.some(
    r =>
      r.goal_id === goalId &&
      ((r.asset_id != null && r.debt_id == null) || (r.debt_id != null && r.asset_id == null)),
  )
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
 *
 * NB: sinds 31-08-2026 is dit de TERUGVAL, niet de bron. De snapshotkolom wordt
 * afwisselend door de scalar- (daily-open-sync) en de kernel-motor (/toekomst-
 * bezoek) beschreven; `syncActiveGoalValues` laat daarom de canonieke kernel-run
 * (`VrijheidsgetalSnapshot.fireAgeFractional`) winnen zodra die er is.
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

// ── Auto-sync metric-bronnen ────────────────────────────────────────────────

/**
 * Wat één metric-bron oplevert. `null`/`undefined` = "deze bron kon niets
 * zeggen" ⇒ de opgeslagen DB-waarde blijft staan (tolerante degradatie, exact
 * het bestaande patroon van `injectParameterGoalCurrentValues`).
 */
export type GoalMetricValue = number | null | undefined

/**
 * Een metric-bron is een THUNK, geen waarde: hij wordt uitsluitend aangeroepen
 * wanneer er daadwerkelijk een actief doel van dat type is. Zelfde lazy-patroon
 * als `loadFireSnapshot` — een gebruiker zonder belastingdruk-doel betaalt geen
 * Box 1/Box 3-resolutie.
 */
export type GoalMetricThunk = () => GoalMetricValue | Promise<GoalMetricValue>

/**
 * Schuldenvrij-datum + PROVENANCE. De datum zelf is nooit meer dan de laatste
 * `debts.end_date`; of dat een hard feit is of een stille aanname hangt aan
 * `resolveDebtTermBasis` (lib/debt-term-basis.ts). Alleen `user_set` telt als
 * feit — bij `default_term`/`no_end_date` hoort er een aanname-label bij het
 * getal (`describeDebtTermBasis` → components/editorial/aanname-hint.tsx).
 */
export interface DebtFreeDateSource {
  /** Decimaal jaar (2031.5 = juli 2031), of `null` als onbepaalbaar. */
  decimalYear: number | null
  /** Waarop de datum rust. `null` wanneer er geen datum is. */
  basis: DebtTermBasis | null
}

/**
 * De canonieke bronnen voor auto-sync metric-doelen. Elke sleutel wijst naar een
 * BESTAANDE motor; deze module roept aan en rekent NIETS zelf uit.
 *
 * SPIEGELEN IS GEEN CONSUMEREN — zie de module-docstring bovenaan. Een bron die
 * hier binnenkomt is per constructie dezelfde aanroep die het bijbehorende
 * oppervlak toont; een bron die hier zou worden nagebouwd, drijft weg.
 *
 * `savings_rate`, `salary`, `expected_return` en `fire_age` staan hier bewust
 * NIET in: die lopen al via `injectParameterGoalCurrentValues` resp. de
 * kernel-snapshot, en krijgen sinds deze wijziging ook auto-sync-doelen mee.
 */
export interface GoalMetricSources {
  /** `net_worth` — inclusion-gewogen netto vermogen (€). */
  netWorth?: GoalMetricThunk
  /** `passive_income` — `computePassiveIncomeMonthly(netWorth, effectiveSwr)` (€/mnd). */
  passiveIncomeMonthly?: GoalMetricThunk
  /** `emergency_fund` — `resolveEmergencyFund(...).monthsCovered` (maanden). */
  emergencyFundMonths?: GoalMetricThunk
  /** `tax_burden` — `buildTaxOverview(...).effectiveRate × 100` (%). */
  taxBurdenPct?: GoalMetricThunk
  /** `debt_free_date` — laatste einddatum over actieve schulden + provenance. */
  debtFreeDate?: () => DebtFreeDateSource | null | Promise<DebtFreeDateSource | null>
}

/**
 * ENE ingang die beide loaders (doelen-scherm + dashboard-widget) consumeren:
 * split actieve doelen in canonieke volgorde (parameter-doelen eerst + max 5
 * gebruikersdoelen, auto-sync vooraan), synchroniseer daarna de `current_value`
 * van gekoppelde, parameter- en auto-sync-doelen live. Muteert de doelen
 * in-place en geeft de gesorteerde `goals` (+ subsets) terug.
 *
 * `loadFireSnapshot` is de DERDE synchronisatiebron (bevinding C10): het
 * vrijheidsgetal-doel, het fire_age-doel én (nieuw) het eindsaldo-doel volgen de
 * canonieke FIRE-motor i.p.v. een statisch opgeslagen bedrag resp. de
 * motor-wisselende snapshotkolom. Bewust een THUNK en geen waarde: hij wordt
 * alleen aangeroepen wanneer er daadwerkelijk zo'n FIRE-doel actief is, zodat
 * gebruikers zonder FIRE-doel geen kernel-run betalen — hetzelfde lazy-patroon
 * als de parameter-injectie hierboven.
 *
 * `links` en `metricSources` staan ACHTERAAN en zijn optioneel: zonder beide is
 * het gedrag byte-identiek aan voorheen (de regressie-eis).
 */
export async function syncActiveGoalValues<T extends SyncableGoal>(
  supabase: SupabaseClient,
  allGoals: T[],
  assets: readonly { id: string; current_value: number | string | null }[],
  debts: readonly { id: string; current_balance: number | string | null }[],
  userId: string | null,
  loadFireSnapshot?: () => Promise<VrijheidsgetalSnapshot | null>,
  links?: readonly GoalLinkRow[],
  metricSources?: GoalMetricSources,
): Promise<{
  goals: T[]
  parameterGoals: T[]
  autoSyncGoals: T[]
  fireSnapshot: VrijheidsgetalSnapshot | null
  vrijheidsgetalSynced: number
  /**
   * Provenance van de schuldenvrij-datum, zodat de UI een aanname-label kan
   * tonen wanneer de datum op een STILLE type-default rust i.p.v. op eigen
   * invoer. `null` wanneer er geen schuldenvrij-doel actief was.
   */
  debtFreeBasis: DebtTermBasis | null
}> {
  const { goals, parameterGoals, autoSyncGoals } = splitActiveGoals(allGoals)
  autolinkGoalCurrentValues(goals, assets, debts, links)

  // Auto-sync-doelen MET koppelingen volgen hun koppelingen: dat is de meer
  // specifieke intentie van de gebruiker, en de link-waarde staat er hierboven
  // al in. Alleen de ongekoppelde rest krijgt een motor-waarde.
  const metricGoals = autoSyncGoals.filter(g => !hasGoalLinks(g.id, links))

  // De parameter-injectie draait óók over de auto-sync-doelen: `savings_rate`,
  // `salary` en `expected_return` hebben daar al een canonieke bron, en die is
  // per definitie dezelfde als voor een lab-parameterdoel. Eén tak, één cijfer.
  const injectionSet = [...parameterGoals, ...metricGoals]

  // De fire-thunk draait bij ELK doel dat de canonieke FIRE-motor nodig heeft:
  // het vrijheidsgetal-doel (bevinding C10), het fire_age-doel en het
  // eindsaldo-doel. Wie er geen heeft betaalt geen kernel-run.
  const wantsFire =
    Boolean(loadFireSnapshot) &&
    (goals.some(isVrijheidsgetalGoal) ||
      injectionSet.some(gl => gl.goal_type === 'fire_age' || gl.goal_type === 'end_balance'))

  // Per-type gating: elke metric-thunk draait alleen bij een actief doel van dat
  // type. `has` kijkt uitsluitend in `metricGoals` — parameter-doelen hebben hun
  // eigen bronnen en mogen deze thunks niet activeren.
  const has = (type: GoalType) => metricGoals.some(g => g.goal_type === type)
  const wantNetWorth = has('net_worth') && !!metricSources?.netWorth
  const wantPassive = has('passive_income') && !!metricSources?.passiveIncomeMonthly
  const wantEmergency = has('emergency_fund') && !!metricSources?.emergencyFundMonths
  const wantTax = has('tax_burden') && !!metricSources?.taxBurdenPct
  const wantDebtFree = has('debt_free_date') && !!metricSources?.debtFreeDate

  const [, fireSnapshot, netWorthValue, passiveValue, emergencyValue, taxValue, debtFree] =
    await Promise.all([
      injectParameterGoalCurrentValues(supabase, injectionSet, userId),
      wantsFire ? loadFireSnapshot!() : Promise.resolve(null),
      wantNetWorth ? metricSources!.netWorth!() : Promise.resolve(undefined),
      wantPassive ? metricSources!.passiveIncomeMonthly!() : Promise.resolve(undefined),
      wantEmergency ? metricSources!.emergencyFundMonths!() : Promise.resolve(undefined),
      wantTax ? metricSources!.taxBurdenPct!() : Promise.resolve(undefined),
      wantDebtFree ? metricSources!.debtFreeDate!() : Promise.resolve(null),
    ])

  const vrijheidsgetalSynced = applyVrijheidsgetalSync(goals, fireSnapshot)

  // fire_age-doel: de canonieke kernel-run wint van de snapshotkolom.
  // `net_worth_snapshots.fire_age` wordt 's ochtends door de daily-open-sync met
  // de SCALAR-motor herschreven en pas bij een /toekomst-bezoek door de kernel
  // gepatcht — zonder deze override wisselde de doelkaart binnen één dag van
  // motor (scalar 42,8 vs kernel 46,3 op een productie-account, 31 aug 2026).
  // De injectie hierboven blijft de terugval wanneer de kernel geen uitkomst
  // heeft (geen geboortedatum, FIRE onhaalbaar): dan is de laatste snapshot
  // eerlijker dan niets.
  const kernelFireAge = fireSnapshot?.fireAgeFractional
  if (kernelFireAge != null && Number.isFinite(kernelFireAge) && kernelFireAge > 0) {
    for (const gl of injectionSet) {
      if (gl.goal_type === 'fire_age') gl.current_value = kernelFireAge
    }
  }

  // ── Auto-sync metric-waarden toepassen ──
  // Overal dezelfde tolerantie-regel: alleen een FINITE getal overschrijft de
  // DB-waarde. Nul is een geldige uitkomst (0% belastingdruk, €0 vermogen) en
  // wordt dus wél doorgezet — het is `null`/`undefined`/NaN dat "geen uitspraak"
  // betekent, niet de nul zelf (bevinding M4).
  const apply = (goal: T, value: GoalMetricValue) => {
    if (value == null) return
    const n = Number(value)
    if (Number.isFinite(n)) goal.current_value = n
  }

  const endBalance = fireSnapshot?.endBalanceAtEndAge
  for (const goal of metricGoals) {
    switch (goal.goal_type) {
      case 'net_worth':
        apply(goal, netWorthValue)
        break
      case 'passive_income':
        apply(goal, passiveValue)
        break
      case 'emergency_fund':
        apply(goal, emergencyValue)
        break
      case 'tax_burden':
        apply(goal, taxValue)
        break
      case 'end_balance':
        apply(goal, endBalance)
        break
      case 'debt_free_date':
        apply(goal, debtFree?.decimalYear)
        break
    }
  }

  return {
    goals,
    parameterGoals,
    autoSyncGoals,
    fireSnapshot,
    vrijheidsgetalSynced,
    debtFreeBasis: debtFree?.basis ?? null,
  }
}
