// lib/household-projection.ts
//
// Huishouden-brede FIRE-projectie (plan Onderdeel 6 — TOEKOMST / FIRE).
//
// Bouwt de invoer voor de gecombineerde + per-partner FIRE-projectie van een
// huishouden. In tegenstelling tot de oude `/api/household/fire-projections`
// (die de lichtgewicht `computeFireProjection` gebruikt) draait dit op de
// VOLLEDIGE `runUnifiedProjection`-engine — dezelfde nauwkeurigheid als de
// solo-Horizon (per-asset-type rendement, Box 3, per-schuld aflossing,
// withdrawal-strategie).
//
// Kernontwerp:
//   • TWEE projecties worden gedraaid en samengevoegd — er wordt NOOIT een
//     tweede persoon in één `runUnifiedProjection` gepropt. Elke partner krijgt
//     z'n eigen tijdas (eigen DOB → currentAge → endAge).
//   • De GECOMBINEERDE projectie draait op de tijdas van de OUDSTE partner
//     (head-age). De AOW/pensioen van de jongere partner wordt naar deze
//     head-age-as omgerekend via de DOB-offset, en als income-cashflow
//     toegevoegd — dual-AOW ZONDER engine-wijziging.
//   • Gedeelde events/goals tellen hun VOLLE kost in de combined projectie en
//     bij elke partner naar diens aandeel; persoonlijke events tellen alleen
//     bij die partner (en in de combined). Nooit dubbel.
//   • Partner-DOB/vermogen verborgen (privacy) → graceful degrade: combined valt
//     terug op enkel de eigen projectie + een notice-vlag.
//
// Solo-gebruiker → identiek aan vandaag: één projectie, geen partner-as.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import {
  ageAtDate,
  computeAowMonthly,
  computeFireProjection,
  projectForward,
  DEFAULT_RETURN,
  INFLATION,
  type LifeEvent,
  type FinancialInput,
  type FireProjection,
} from '@/lib/horizon-data'
import { NL_AOW_AGE } from '@/lib/constants'
import {
  lifeEventsToCashflows,
  type SimCashflow,
  type SimRow,
} from '@/lib/fire-simulation'
import {
  runUnifiedProjection,
  toSimResult,
  type UnifiedProjectionInput,
} from '@/lib/unified-projection'
import { DEFAULT_FIRE_STRATEGY, resolveFireStrategyWithOverride } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { resolveFireParams } from '@/lib/fire-params'
import { computeYearlyMustExpenses, computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import type { Box3Method } from '@/lib/bucket-projection'
import { computeSharePct, type SplitMode } from '@/lib/household-data'

// ── Result types ────────────────────────────────────────────────────────────

/** Per-partner FIRE-uitkomst (mirror van het oude API-formaat voor de UI). */
/**
 * Persisted FIRE-samenvatting van een lid (in profiles.fire_summary). De partner
 * leest deze zodat de partnerkaart EXACT de cijfers toont die het lid zelf ziet
 * (i.p.v. een herberekening uit gegate fragmenten).
 */
export interface HouseholdFireSummary {
  projection: HouseholdFireProjectionData
  financials: {
    totalAssets: number
    totalDebts: number
    netWorth: number
    monthlyIncome: number
    monthlyExpenses: number
    monthlyContributions: number
    yearlyMustExpenses: number
    dateOfBirth: string | null
    sharedAssetsValue: number
    sharedDebtsValue: number
  }
}

export interface HouseholdPartnerProjection {
  userId: string
  fullName: string | null
  isCurrentUser: boolean
  /** Lid verbergt z'n toekomst-gegevens voor het huishouden. */
  futureHidden: boolean
  financials: {
    userId: string
    fullName: string | null
    isCurrentUser: boolean
    totalAssets: number
    totalDebts: number
    monthlyIncome: number
    monthlyExpenses: number
    monthlyContributions: number
    yearlyMustExpenses: number
    dateOfBirth: string | null
    netWorth: number
    sharedAssetsValue: number
    sharedDebtsValue: number
  }
  projection: HouseholdFireProjectionData
  /**
   * Volledige projectie-pad (vermogen per leeftijd) zodat de Horizon-grafiek
   * EXACT dezelfde lijn kan tekenen als deze projectie. Leeg (`[]`) wanneer er
   * geen precieze itemized projectie is (partner deelt alleen 'totals', toekomst
   * verborgen, of geen DOB/uitgaven).
   */
  rows: SimRow[]
  /** Fractionele FIRE-leeftijd horend bij `rows` (voor de FIRE-marker op de as). */
  fireAgeFractional: number | null
  /** Compacte instellingen voor de partner-vergelijking (klein weergegeven). */
  settings: {
    currentAge: number | null
    expectedReturn: number | null
    inflationRate: number | null
    retirementExpenseMethod: string | null
    fireEndStrategy: string | null
    fireEndAge: number | null
  }
  /** Levensgebeurtenissen van dit lid (eigen + gedeeld), compact. */
  lifeEvents: Array<{ id: string; name: string; targetAge: number | null; ownership: 'personal' | 'shared'; icon?: string }>
}

/** FIRE-projectie-uitkomst, gevuld vanuit de unified engine. */
export interface HouseholdFireProjectionData {
  fireTarget: number
  netWorth: number
  freedomPercentage: number
  fireAge: number | null
  currentAge: number | null
  fireDate: string
  countdownDays: number
  freedomYears: number
  freedomMonths: number
  monthlyPassiveIncome: number
  monthlySavings: number
  savingsRate: number
}

export interface HouseholdProjectionResult {
  hasHousehold: boolean
  householdName: string
  splitMode: SplitMode
  customSplitPct: number | null
  combined: {
    projection: HouseholdFireProjectionData
    /**
     * Volledige gecombineerde projectie-pad (vermogen per leeftijd op de
     * head-age-as) zodat de Horizon-grafiek de gezamenlijke lijn EXACT
     * consistent met deze projectie tekent. Leeg (`[]`) bij privacy-degrade
     * (partner deelt alleen 'totals'/verborgen) of ontbrekende DOB/uitgaven.
     */
    rows: SimRow[]
    /** Fractionele gecombineerde FIRE-leeftijd horend bij `rows`. */
    fireAgeFractional: number | null
  }
  partners: HouseholdPartnerProjection[]
  comparison: {
    combinedNetWorth: number
    combinedMonthlyIncome: number
    combinedMonthlyExpenses: number
    combinedMonthlySavings: number
    combinedSavingsRate: number
    combinedFireTarget: number
    combinedFreedomPercentage: number
    sharedFireTarget: number
    /** Gecombineerde jaarlijkse uitgaven ná pensioen (FIRE-uitgaven). */
    combinedRetirementExpenses: number
    individualFireTargets: Array<{
      userId: string
      fullName: string | null
      fireTarget: number
      fireAge: number | null
      freedomPercentage: number
    }>
  }
  /**
   * True wanneer de partner z'n financiële data (vermogen/DOB) afschermt
   * (privacy = totals/hidden), zodat de combined projectie niet volledig kan
   * worden opgebouwd. De UI toont dan PrivacyHiddenNotice i.p.v. een
   * misleidende projectie.
   */
  partnerDataHidden: boolean
  /** True wanneer de partner z'n volledige TOEKOMST-gegevens verbergt. */
  partnerFutureHidden: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** SWR voor passief inkomen / freedom-time (consistent met horizon-data NL_SWR). */
const HOUSEHOLD_SWR = 0.035

/** Maandelijkse begroting → SimResult → projection-uitkomst. */
function simResultToProjection(
  netWorth: number,
  monthlyIncome: number,
  monthlyExpenses: number,
  yearlyExpenses: number,
  currentAge: number | null,
  sim: ReturnType<typeof toSimResult>,
): HouseholdFireProjectionData {
  const fireTarget = sim.requiredFirePortfolio > 0
    ? sim.requiredFirePortfolio
    : yearlyExpenses / HOUSEHOLD_SWR
  const freedomPercentage = fireTarget > 0 ? Math.min(100, (netWorth / fireTarget) * 100) : 0
  const fireAge = sim.fireAge
  const monthlySavings = monthlyIncome - monthlyExpenses
  const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0

  // Vrijheidstijd op huidig vermogen (jaren/maanden dekking van uitgaven)
  const yearsOfFreedom = yearlyExpenses > 0 ? netWorth / yearlyExpenses : 0
  const freedomYears = Math.max(0, Math.floor(yearsOfFreedom))
  const freedomMonths = Math.max(0, Math.round((yearsOfFreedom - freedomYears) * 12))

  // FIRE-datum + countdown afgeleid uit fireAge vs currentAge
  let fireDate = '—'
  let countdownDays = 0
  if (fireAge !== null && currentAge !== null) {
    if (fireAge <= currentAge && netWorth >= fireTarget) {
      fireDate = 'Bereikt!'
      countdownDays = 0
    } else {
      const yearsToFire = Math.max(0, fireAge - currentAge)
      countdownDays = Math.round(yearsToFire * 365)
      const target = new Date()
      target.setDate(target.getDate() + countdownDays)
      fireDate = target.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
    }
  }

  return {
    fireTarget: Math.round(fireTarget),
    netWorth: Math.round(netWorth),
    freedomPercentage,
    fireAge,
    currentAge,
    fireDate,
    countdownDays,
    freedomYears,
    freedomMonths,
    monthlyPassiveIncome: Math.round((netWorth * HOUSEHOLD_SWR) / 12),
    monthlySavings: Math.round(monthlySavings),
    savingsRate,
  }
}

/** Map de lichtgewicht FireProjection (computeFireProjection) naar de UI-shape. */
function fireProjectionToHousehold(fp: FireProjection): HouseholdFireProjectionData {
  return {
    fireTarget: fp.fireTarget,
    netWorth: fp.netWorth,
    freedomPercentage: fp.freedomPercentage,
    fireAge: fp.fireAge,
    currentAge: fp.currentAge,
    fireDate: fp.fireDate,
    countdownDays: fp.countdownDays,
    freedomYears: fp.freedomYears,
    freedomMonths: fp.freedomMonths,
    monthlyPassiveIncome: fp.monthlyPassiveIncome,
    monthlySavings: fp.monthlySavings,
    savingsRate: fp.savingsRate,
  }
}

/**
 * Bouw een vereenvoudigd projectie-pad uit TOTALEN via projectForward — de
 * pad-companion van computeFireProjection. Gebruikt voor de grafiek-lijn wanneer
 * er GEEN itemized unified-projectie is (partner deelt alleen 'totals'), zodat de
 * lijn tóch verschijnt én consistent is met de getoonde (lichte) FIRE-leeftijd.
 * Levert jaarlijkse SimRow-punten (alleen age + endPortfolio gevuld — de grafiek
 * gebruikt enkel die twee voor de lijn).
 */
function projectTotalsToSimRows(input: FinancialInput, currentAge: number, endAge: number): SimRow[] {
  const months = Math.max(12, Math.round((endAge - currentAge) * 12))
  const proj = projectForward(input, months)
  const rows: SimRow[] = []
  for (let i = 0; i < proj.length; i += 12) {
    const m = proj[i]
    if (m.age == null) continue
    const nw = m.netWorth
    rows.push({
      age: m.age,
      phase: 'accumulation',
      startPortfolio: nw,
      growth: 0,
      savings: 0,
      withdrawal: 0,
      cashflowNet: 0,
      oneTimeNet: 0,
      endPortfolio: nw,
      grossIncome: 0,
      grossExpenses: 0,
      flowIn: 0,
      flowOut: 0,
    })
  }
  return rows
}

/**
 * Profiel-shape die zowel resolveFireParams/resolveFireStrategyWithOverride als
 * de retirement-expense-berekening nodig hebben. Per-member opgehaald.
 */
interface MemberProfile {
  id: string
  full_name: string | null
  date_of_birth: string | null
  retirement_expense_method: string | null
  retirement_expense_custom_amount: number | null
  fire_end_strategy: string | null
  fire_end_age: number | null
  fire_legacy_amount: number | null
  expected_return: number | null
  inflation_rate: number | null
  net_monthly_income: number | null
  estimated_monthly_expenses: number | null
  household_type: string | null
  number_of_children: number | null
  /** Lid verbergt z'n toekomst-gegevens voor het huishouden (privacy 'future'='hidden'). */
  future_hidden?: boolean
  /** Persisted eigen FIRE-samenvatting (door het lid zelf berekend). */
  fire_summary?: HouseholdFireSummary | null
}

/** Bouw een AOW-income-cashflow voor een partner op de gevraagde tijdas. */
function buildAowCashflow(
  id: string,
  name: string,
  leefsituatie: 'alleenstaand' | 'samenwonend',
  fromAge: number,
): SimCashflow | null {
  const monthly = computeAowMonthly(leefsituatie, 0)
  if (monthly <= 0) return null
  return {
    id,
    name,
    type: 'recurring',
    direction: 'income',
    amount: monthly,
    fromAge,
    toAge: null, // levenslang
    indexed: true,
  }
}

// ── Hoofdbouwer ──────────────────────────────────────────────────────────────

/**
 * Bouw de huishouden-brede FIRE-projectie-invoer en draai twee unified
 * projecties (per partner) + een gecombineerde unified projectie op de
 * head-age-as van de oudste partner.
 *
 * Gebruikt de SERVER- of BROWSER-client (beide werken; pass de juiste door op
 * basis van waar je aanroept). Privacy van de partner wordt via dezelfde
 * `household_partner_items`-RPC afgedwongen als de rest van het perspectief-
 * fundament — als de partner z'n vermogen verbergt, krijg je hier geen rijen
 * en degradeert de combined projectie netjes.
 *
 * Retourneert `hasHousehold:false` voor solo-gebruikers; de aanroeper rendert
 * dan niets (de bestaande solo-Horizon dekt dat geval al).
 */
export async function buildHouseholdProjectionInput(
  supabase: SupabaseClient,
): Promise<HouseholdProjectionResult> {
  const SOLO: HouseholdProjectionResult = {
    hasHousehold: false,
    householdName: '',
    splitMode: 'equal',
    customSplitPct: null,
    combined: { projection: emptyProjection(), rows: [], fireAgeFractional: null },
    partners: [],
    comparison: emptyComparison(),
    partnerDataHidden: false,
    partnerFutureHidden: false,
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return SOLO

  // Membership van de huidige gebruiker
  const { data: myMembership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!myMembership?.household_id) return SOLO
  const householdId = myMembership.household_id as string

  // Huishouden-instellingen + alle leden
  const [householdRes, membersRes] = await Promise.all([
    supabase
      .from('households')
      .select('name, split_mode, custom_split_pct, primary_payer_id')
      .eq('id', householdId)
      .maybeSingle(),
    supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', householdId)
      .order('sort_order', { ascending: true }),
  ])

  const members = (membersRes.data ?? []) as Array<{ user_id: string }>
  if (members.length < 2) {
    // Partner heeft nog niet geaccepteerd — solo gedrag, maar mét household-vlag
    // zodat de UI de "nodig je partner uit"-notice kan tonen.
    return { ...SOLO, hasHousehold: members.length >= 1 ? false : false }
  }

  const memberIds = members.map(m => m.user_id)
  const splitMode = (householdRes.data?.split_mode ?? 'equal') as SplitMode
  const customSplitPct = householdRes.data?.custom_split_pct ?? null
  const primaryPayerId = householdRes.data?.primary_payer_id ?? null
  const householdName = (householdRes.data?.name as string | null) ?? 'Huishouden'

  // ── Financiële data: eigen-RLS levert eigen-persoonlijk + ALLE gedeeld ──
  // Partner-persoonlijke data komt privacy-gated uit de RPC. Wanneer de partner
  // z'n vermogen verbergt, is partnerAssets/partnerDebts leeg → partnerDataHidden.
  const [
    profilesRes,
    baseAssetsRes,
    baseDebtsRes,
    budgetsRes,
    txRes,
    eventsRes,
    partnerAssetsRes,
    partnerDebtsRes,
    partnerIncomeRes,
    partnerEventsRes,
  ] = await Promise.all([
    // Profiles RLS is own-only; de RPC levert (privacy-respecterend) de
    // projectie-velden van ALLE huishoudleden — incl. partner-DOB/-naam.
    supabase.rpc('household_member_profiles'),
    supabase.from('assets').select('*').eq('is_active', true),
    supabase.from('debts').select('*').eq('is_active', true),
    supabase.from('budgets').select('id, name, default_limit, interval, budget_type, is_essential, parent_id, user_id, ownership'),
    supabase.from('transactions').select('amount, user_id, date'),
    supabase.from('life_events').select('id, name, event_type, target_age, target_date, one_time_cost, monthly_cost_change, monthly_income_change, duration_months, icon, is_active, sort_order, is_indexed, metadata, user_id, ownership').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.rpc('household_partner_items', { p_category: 'assets' }),
    supabase.rpc('household_partner_items', { p_category: 'debts' }),
    // Partner-maandinkomen (privacy-gated; 'hidden' → leeg).
    supabase.rpc('household_partner_items', { p_category: 'income' }),
    // Partner-levensgebeurtenissen (RLS-blind anders; gedeeld binnen huishouden).
    supabase.rpc('household_partner_life_events'),
  ])

  const profiles = (profilesRes.data ?? []) as MemberProfile[]
  const baseAssets = (baseAssetsRes.data ?? []) as Asset[]
  const baseDebts = (baseDebtsRes.data ?? []) as Debt[]
  const allBudgets = (budgetsRes.data ?? []) as Array<{ id: string; name: string; default_limit: number; interval: string; budget_type: string; is_essential: boolean; parent_id: string | null; user_id: string; ownership: 'personal' | 'shared' }>
  const allTransactions = (txRes.data ?? []) as Array<{ amount: number; user_id: string; date: string }>
  // Levensgebeurtenissen: eigen + gedeeld (RLS) ∪ partner-persoonlijk (RPC), dedup op id.
  const ownAndSharedEvents = (eventsRes.data ?? []) as Array<LifeEvent & { user_id?: string; ownership?: 'personal' | 'shared' }>
  const partnerPersonalEvents = (partnerEventsRes.data ?? []) as Array<LifeEvent & { user_id?: string; ownership?: 'personal' | 'shared' }>
  const eventsById = new Map<string, LifeEvent & { user_id?: string; ownership?: 'personal' | 'shared' }>()
  for (const ev of [...ownAndSharedEvents, ...partnerPersonalEvents]) eventsById.set(ev.id, ev)
  const allEvents = [...eventsById.values()]

  const partnerId = memberIds.find(id => id !== user.id) ?? null
  // Toekomst-privacy: verbergt de partner z'n toekomst-gegevens, dan negeren we
  // ALLE partner-data voor deze (toekomst-)projectie: assets/debts/income/events.
  const partnerProfileRow = profiles.find(p => p.id === partnerId) ?? null
  const partnerFutureHidden = partnerProfileRow?.future_hidden === true

  // Partner-persoonlijke assets/debts (privacy-gated): 'full' → itemized rijen
  // (bruikbaar voor de unified engine); 'totals' → één aggregaatrij; 'hidden' →
  // niets. Toekomst verborgen → alles leeg.
  const rawPartnerAssets = partnerFutureHidden ? [] : ((partnerAssetsRes.data ?? []) as Array<Record<string, unknown>>)
  const rawPartnerDebts = partnerFutureHidden ? [] : ((partnerDebtsRes.data ?? []) as Array<Record<string, unknown>>)
  const partnerAssets = rawPartnerAssets.filter(r => r._aggregated !== true) as unknown as Asset[]
  const partnerDebts = rawPartnerDebts.filter(r => r._aggregated !== true) as unknown as Debt[]
  // Aggregaat-totaal (privacy='totals') — gebruikt wanneer er geen itemized rijen zijn.
  const partnerAssetsAggTotal = rawPartnerAssets.find(r => r._aggregated === true)?.current_value as number | undefined
  const partnerDebtsAggTotal = rawPartnerDebts.find(r => r._aggregated === true)?.current_balance as number | undefined
  // Partner-maandinkomen uit de income-RPC (toont bij 'full'/'totals'; null bij 'hidden'/verborgen).
  const partnerIncomeRow = partnerFutureHidden ? undefined : ((partnerIncomeRes.data ?? [])[0] as { monthly_income?: number } | undefined)
  const partnerMonthlyIncomeShared = partnerIncomeRow?.monthly_income != null ? Number(partnerIncomeRow.monthly_income) : null

  const partnerHasItemizedAssets = partnerAssets.length > 0
  const partnerHasAggregate = partnerAssetsAggTotal != null
  // Verborgen = partner deelt vermogen NIET (geen itemized én geen aggregaat).
  const partnerDataHidden = !partnerHasItemizedAssets && !partnerHasAggregate

  // ── Per-member income (voor split-mode income_ratio + comparison) ──
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const memberMonthlyIncome = new Map<string, number>()
  const memberMonthlyExpenses = new Map<string, number>()
  for (const id of memberIds) {
    let inc = 0
    let exp = 0
    for (const tx of allTransactions) {
      if (tx.user_id !== id) continue
      if (tx.date < monthStart) continue
      const amt = Number(tx.amount)
      if (amt > 0) inc += amt
      else exp += Math.abs(amt)
    }
    memberMonthlyIncome.set(id, inc)
    memberMonthlyExpenses.set(id, exp)
  }

  // Profiel-fallback voor income/expenses wanneer er geen transacties zijn.
  function memberIncome(id: string): number {
    const fromTx = memberMonthlyIncome.get(id) ?? 0
    if (fromTx > 0) return fromTx
    const p = profiles.find(pr => pr.id === id)
    return Number(p?.net_monthly_income ?? 0)
  }
  function memberExpenses(id: string): number {
    const fromTx = memberMonthlyExpenses.get(id) ?? 0
    if (fromTx > 0) return fromTx
    const p = profiles.find(pr => pr.id === id)
    return Number(p?.estimated_monthly_expenses ?? 0)
  }

  const householdSettings = { splitMode, customSplitPct, primaryPayerId }

  // ── Event-/cashflow-splitsing: shared vs personal ──────────────────────────
  // Shared events: volle kost in combined; bij elke partner naar diens aandeel
  // is hier conceptueel niet eenvoudig (events zijn niet altijd lineair
  // splitsbaar). We rekenen daarom: shared events tellen vol in de combined
  // projectie, en bij de per-partner projectie alleen de eigen-persoonlijke
  // events (shared events worden door het gezamenlijke vermogen al gedekt en
  // tellen niet dubbel bij beide partners). Goals/life_events zonder owner
  // gelden als persoonlijk van de eigenaar.
  function eventsForMember(memberId: string): LifeEvent[] {
    return allEvents.filter(ev => {
      const owner = ev.user_id
      const ownership = ev.ownership
      if (ownership === 'shared') return false // shared telt in combined, niet per-partner
      return owner == null || owner === memberId
    })
  }
  // Combined: persoonlijke events van álle leden + gedeelde events (één keer).
  const combinedEvents: LifeEvent[] = allEvents

  // ── Per-member yearly retirement expenses (uit budgetten) ──────────────────
  function yearlyExpensesForMember(memberId: string, shareFraction: number): number {
    const p = profiles.find(pr => pr.id === memberId)
    // Essentiële parents: eigen + gedeeld; child-budgetten idem.
    const essentialParents = allBudgets.filter(
      b => b.is_essential && b.budget_type === 'expense' && b.parent_id === null &&
        (b.user_id === memberId || b.ownership === 'shared'),
    )
    const children = allBudgets.filter(
      b => b.parent_id !== null && !['archive', 'income', 'savings'].includes(b.budget_type) &&
        (b.user_id === memberId || b.ownership === 'shared'),
    )
    const { yearlyMustExpenses } = computeYearlyMustExpenses(
      essentialParents as never,
      children as never,
    )
    // Gedeelde budgetten naar aandeel: benadering — pas shareFraction toe op het
    // gedeelde deel. We splitsen niet per-budget, maar de meeste must-expenses
    // zijn gedeeld; shareFraction op het totaal benadert dit redelijk.
    const incomeYear = memberIncome(memberId) * 12
    const retire = computeRetirementExpenses(
      (p?.retirement_expense_method as RetirementExpenseMethod | null) ?? null,
      yearlyMustExpenses,
      incomeYear,
      p?.retirement_expense_custom_amount ?? null,
      memberExpenses(memberId) * 12,
    )
    // shareFraction is reeds in de gedeelde-budget-selectie verdisconteerd via
    // computeYearlyMustExpenses op de eigen+gedeelde set; we passen het hier
    // niet nóg eens toe (zou dubbel verlagen). Parameter blijft voor toekomstige
    // per-budget splitsing.
    void shareFraction
    return retire
  }

  // ── Bouw per-partner projectie ─────────────────────────────────────────────
  const partners: HouseholdPartnerProjection[] = memberIds.map(memberId => {
    const profile = profiles.find(p => p.id === memberId) ?? null
    const isCurrentUser = memberId === user.id
    const myIncome = memberIncome(memberId)
    const partnerIncome = memberIds
      .filter(id => id !== memberId)
      .reduce((s, id) => s + memberIncome(id), 0)
    const sharePct = computeSharePct(householdSettings, memberId, myIncome, partnerIncome)
    const shareFraction = sharePct / 100

    // Assets/debts voor deze partner.
    // - eigen partner (current user): basisset bevat z'n persoonlijke + gedeeld.
    // - andere partner: partner-persoonlijke (RPC) + gedeeld.
    const isMe = isCurrentUser
    // Andere partner die ALLEEN totalen deelt (privacy='totals'): geen itemized
    // rijen, wel een aggregaat-totaal. Dan rekenen we op de totalen.
    const isOtherAggregateOnly = !isMe && !partnerHasItemizedAssets && partnerHasAggregate
    const personalAssets = isMe
      ? baseAssets.filter(a => a.ownership === 'personal')
      : partnerAssets.filter(a => (a as Asset).ownership === 'personal')
    const personalDebts = isMe
      ? baseDebts.filter(d => d.ownership === 'personal')
      : partnerDebts.filter(d => (d as Debt).ownership === 'personal')
    const sharedAssets = baseAssets.filter(a => a.ownership === 'shared')
    const sharedDebts = baseDebts.filter(d => d.ownership === 'shared')

    // Gewogen totalen voor financials + freedom %. Bij een partner die alleen
    // TOTALEN deelt, gebruiken we het aggregaat-totaal i.p.v. itemized rijen.
    const personalAssetsVal = isOtherAggregateOnly
      ? (partnerAssetsAggTotal ?? 0)
      : personalAssets.reduce((s, a) => s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
    const sharedAssetsValue = sharedAssets.reduce((s, a) =>
      s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0) * shareFraction
    const totalAssets = personalAssetsVal + sharedAssetsValue

    const personalDebtsVal = isOtherAggregateOnly
      ? (partnerDebtsAggTotal ?? 0)
      : personalDebts.reduce((s, d) => s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
    const sharedDebtsValue = sharedDebts.reduce((s, d) => {
      const bal = Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100)
      if (d.partner_split_pct != null) {
        const ownerFrac = d.partner_split_pct / 100
        const myFrac = (d as Debt).user_id === memberId ? ownerFrac : 1 - ownerFrac
        return s + bal * myFrac
      }
      return s + bal * shareFraction
    }, 0)
    const totalDebts = personalDebtsVal + sharedDebtsValue
    const netWorth = totalAssets - totalDebts

    // Inkomen: eigen uit transacties; partner uit de (privacy-gated) income-RPC.
    const monthlyIncome = isMe ? myIncome : (partnerMonthlyIncomeShared ?? myIncome)
    const monthlyExpenses = memberExpenses(memberId)
    const monthlyContributions = personalAssets.reduce((s, a) => s + Number(a.monthly_contribution), 0)
      + sharedAssets.reduce((s, a) => s + Number(a.monthly_contribution), 0) * shareFraction
    const yearlyExpenses = yearlyExpensesForMember(memberId, shareFraction)
    const dob = profile?.date_of_birth ?? null
    const currentAge = dob ? ageAtDate(dob) : null

    // Levensgebeurtenissen van dit lid (eigen + gedeeld) voor de compacte
    // partner-vergelijking.
    const memberLifeEvents = allEvents
      .filter(ev => ev.user_id === memberId || ev.ownership === 'shared')
      .map(ev => ({
        id: ev.id,
        name: ev.name,
        targetAge: ev.target_age ?? null,
        ownership: (ev.ownership ?? 'personal') as 'personal' | 'shared',
        icon: ev.icon ?? undefined,
      }))

    // FIRE-projectie.
    const fireParams = profile ? resolveFireParams(profile) : { grossReturn: DEFAULT_RETURN, inflationRate: INFLATION, effectiveSwr: HOUSEHOLD_SWR, box3Method: 'forfaitair' as Box3Method }
    const fireStrategy = profile ? resolveFireStrategyWithOverride(profile) : DEFAULT_FIRE_STRATEGY
    const hasPartnerTax = (profile?.household_type === 'samenwonend' || profile?.household_type === 'getrouwd')
    const strategyOpts = {
      strategy: (profile?.fire_end_strategy ?? undefined) as 'perpetual' | 'legacy' | 'deplete' | undefined,
      endAge: profile?.fire_end_age ?? undefined,
    }

    let projection: HouseholdFireProjectionData
    // Projectie-pad (vermogen per leeftijd) voor de grafieklijn. Bij itemized
    // ('full') komt dit uit de unified engine; bij 'totals' uit projectForward
    // op de totalen (consistent met de lichte FIRE-leeftijd). Leeg → geen lijn.
    let projectionRows: SimRow[] = []
    let projectionFireAgeFractional: number | null = null
    if (isOtherAggregateOnly && currentAge !== null && yearlyExpenses > 0) {
      // Partner deelt alleen totalen → lichte projectie + pad uit de totalen.
      const fin: FinancialInput = {
        totalAssets,
        totalDebts,
        monthlyIncome,
        monthlyExpenses,
        monthlyContributions,
        yearlyMustExpenses: yearlyExpenses,
        dateOfBirth: dob,
      }
      const fp = computeFireProjection(fin, fireParams.grossReturn, fireParams.effectiveSwr, fireParams.inflationRate, strategyOpts)
      projection = fireProjectionToHousehold(fp)
      projectionRows = projectTotalsToSimRows(fin, currentAge, fireStrategy.endAge)
      projectionFireAgeFractional = fp.fireAge
    } else if (!isOtherAggregateOnly && currentAge !== null && yearlyExpenses > 0) {
      // Volledige (itemized) projectie via de unified engine.
      const projAssets = scaleSharedAssets(personalAssets, sharedAssets, shareFraction)
      const projDebts = scaleSharedDebts(personalDebts, sharedDebts, shareFraction, memberId)
      // Eigen AOW als cashflow op de eigen as.
      const ownEvents = eventsForMember(memberId)
      const cashflows = buildMemberCashflows(ownEvents, currentAge, hasPartnerTax)
      const input: UnifiedProjectionInput = {
        assets: projAssets,
        debts: projDebts,
        currentAge,
        endAge: fireStrategy.endAge,
        yearlyExpenses,
        annualSavings: monthlyContributions * 12,
        monthlySurplus: monthlyContributions,
        monthlyIncome,
        incomeGrowthRate: 0,
        grossReturn: fireParams.grossReturn,
        inflationRate: fireParams.inflationRate,
        box3Method: fireParams.box3Method,
        cashflows,
        strategyConfig: fireStrategy,
        withdrawalStrategy: WITHDRAWAL_DEFAULTS,
        hasPartner: hasPartnerTax,
      }
      const sim = toSimResult(runUnifiedProjection(input))
      projection = simResultToProjection(netWorth, monthlyIncome, monthlyExpenses, yearlyExpenses, currentAge, sim)
      projectionRows = sim.rows
      projectionFireAgeFractional = sim.fireAgeFractional
    } else {
      projection = emptyProjection(netWorth, monthlyIncome, monthlyExpenses, yearlyExpenses, currentAge)
    }

    // Partnerkaart toont de EIGEN (persisted) cijfers van de partner zodat ze
    // exact overeenkomen met wat de partner zelf ziet. Verborgen → geen cijfers;
    // nog geen summary (partner heeft /toekomst nog niet geladen) → herberekening.
    const futureHidden = !isMe && profile?.future_hidden === true
    const summary = (!isMe && !futureHidden)
      ? ((profile?.fire_summary as HouseholdFireSummary | null | undefined) ?? null)
      : null

    const recomputedFinancials = {
      userId: memberId,
      fullName: profile?.full_name ?? null,
      isCurrentUser,
      totalAssets: Math.round(totalAssets),
      totalDebts: Math.round(totalDebts),
      monthlyIncome: Math.round(monthlyIncome),
      monthlyExpenses: Math.round(monthlyExpenses),
      monthlyContributions: Math.round(monthlyContributions),
      yearlyMustExpenses: Math.round(yearlyExpenses),
      dateOfBirth: dob,
      netWorth: Math.round(netWorth),
      sharedAssetsValue: Math.round(sharedAssetsValue),
      sharedDebtsValue: Math.round(sharedDebtsValue),
    }

    return {
      userId: memberId,
      fullName: profile?.full_name ?? null,
      isCurrentUser,
      futureHidden,
      financials: summary
        ? { userId: memberId, fullName: profile?.full_name ?? null, isCurrentUser, ...summary.financials }
        : recomputedFinancials,
      projection: futureHidden
        ? emptyProjection(0, 0, 0, 0, null)
        : (summary?.projection ?? projection),
      // Het pad volgt de zelf-berekende unified-projectie (niet de persisted
      // summary, die alleen scalars bevat). Verborgen toekomst → geen lijn.
      rows: futureHidden ? [] : projectionRows,
      fireAgeFractional: futureHidden ? null : projectionFireAgeFractional,
      settings: {
        currentAge,
        expectedReturn: profile?.expected_return ?? null,
        inflationRate: profile?.inflation_rate ?? null,
        retirementExpenseMethod: profile?.retirement_expense_method ?? null,
        fireEndStrategy: profile?.fire_end_strategy ?? null,
        fireEndAge: profile?.fire_end_age ?? null,
      },
      lifeEvents: memberLifeEvents,
    }
  })

  // Persist de EIGEN summary zodat de partner exact deze cijfers ziet.
  const mineEntry = partners.find(p => p.isCurrentUser)
  if (mineEntry) {
    const summaryToStore: HouseholdFireSummary = {
      projection: mineEntry.projection,
      financials: {
        totalAssets: mineEntry.financials.totalAssets,
        totalDebts: mineEntry.financials.totalDebts,
        netWorth: mineEntry.financials.netWorth,
        monthlyIncome: mineEntry.financials.monthlyIncome,
        monthlyExpenses: mineEntry.financials.monthlyExpenses,
        monthlyContributions: mineEntry.financials.monthlyContributions,
        yearlyMustExpenses: mineEntry.financials.yearlyMustExpenses,
        dateOfBirth: mineEntry.financials.dateOfBirth,
        sharedAssetsValue: mineEntry.financials.sharedAssetsValue,
        sharedDebtsValue: mineEntry.financials.sharedDebtsValue,
      },
    }
    try {
      await supabase.from('profiles').update({ fire_summary: summaryToStore }).eq('id', user.id)
    } catch {
      // Persisteren is niet kritisch voor de weergave.
    }
  }

  // ── Gecombineerde projectie op de head-age (oudste partner) ─────────────────
  // Verzamel alle DOBs; head = oudste (vroegste DOB).
  const dobs = profiles
    .map(p => ({ id: p.id, dob: p.date_of_birth }))
    .filter((d): d is { id: string; dob: string } => !!d.dob)
  const sortedByDob = [...dobs].sort((a, b) => a.dob.localeCompare(b.dob))
  const headDobEntry = sortedByDob[0] ?? null
  const headAge = headDobEntry ? ageAtDate(headDobEntry.dob) : null
  void partnerId // gereserveerd voor toekomstige per-partner privacy-labeling

  // Gecombineerde financials: alle persoonlijke (beide leden) + gedeeld één keer.
  // De partner-persoonlijke assets/debts komen uit de RPC (privacy-gated).
  const myPersonalAssets = baseAssets.filter(a => a.ownership === 'personal')
  const myPersonalDebts = baseDebts.filter(d => d.ownership === 'personal')
  const sharedAssetsAll = baseAssets.filter(a => a.ownership === 'shared')
  const sharedDebtsAll = baseDebts.filter(d => d.ownership === 'shared')

  const combinedAssets: Asset[] = [...myPersonalAssets, ...partnerAssets, ...sharedAssetsAll]
  const combinedDebts: Debt[] = [...myPersonalDebts, ...partnerDebts, ...sharedDebtsAll]

  // Partner deelt alleen TOTALEN (geen itemized rijen) → tel het aggregaat-
  // totaal apart mee in het gecombineerde vermogen.
  const partnerAggregateOnly = !partnerHasItemizedAssets && partnerHasAggregate
  const partnerAggAssetsExtra = partnerAggregateOnly ? (partnerAssetsAggTotal ?? 0) : 0
  const partnerAggDebtsExtra = partnerAggregateOnly ? (partnerDebtsAggTotal ?? 0) : 0

  const combinedNetWorthAssets = combinedAssets.reduce((s, a) =>
    s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0) + partnerAggAssetsExtra
  const combinedNetWorthDebts = combinedDebts.reduce((s, d) =>
    s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0) + partnerAggDebtsExtra
  const combinedNetWorth = combinedNetWorthAssets - combinedNetWorthDebts

  // Inkomen/uitgaven/inleg + netto vermogen worden gesommeerd uit de per-partner
  // entries (summary-gebaseerd) zodat BEIDE partners EXACT dezelfde gecombineerde
  // kerngetallen zien — geen asymmetrische "eigen-transacties vs partner-RPC"-mix.
  const combinedMonthlyIncome = partners.reduce((s, p) => s + p.financials.monthlyIncome, 0)
  const combinedMonthlyExpenses = partners.reduce((s, p) => s + p.financials.monthlyExpenses, 0)
  const combinedMonthlySavings = combinedMonthlyIncome - combinedMonthlyExpenses
  const combinedSavingsRate = combinedMonthlyIncome > 0
    ? (combinedMonthlySavings / combinedMonthlyIncome) * 100
    : 0
  const combinedMonthlyContributions = partners.reduce((s, p) => s + p.financials.monthlyContributions, 0)

  // Gecombineerde yearly expenses: alle essentiële budgetten één keer.
  const combinedYearlyExpenses = computeCombinedYearlyExpenses(allBudgets, profiles, memberIds, combinedMonthlyExpenses, combinedMonthlyIncome)

  // Combined cashflows: persoonlijke + gedeelde events op de head-age-as +
  // dual-AOW (head AOW op headAge, partner AOW omgerekend naar head-as).
  const headProfile = headDobEntry ? profiles.find(p => p.id === headDobEntry.id) ?? null : null
  const headFireParams = headProfile ? resolveFireParams(headProfile) : { grossReturn: DEFAULT_RETURN, inflationRate: INFLATION, effectiveSwr: HOUSEHOLD_SWR, box3Method: 'forfaitair' as Box3Method }
  const headFireStrategy = headProfile ? resolveFireStrategyWithOverride(headProfile) : DEFAULT_FIRE_STRATEGY

  let combinedProjection: HouseholdFireProjectionData
  // Gecombineerd projectie-pad voor de grafieklijn. Bij itemized ('full') uit de
  // unified engine; bij 'totals' uit projectForward op de gecombineerde totalen
  // (consistent met de lichte gecombineerde FIRE-leeftijd). Leeg → geen lijn.
  let combinedRows: SimRow[] = []
  let combinedFireAgeFractional: number | null = null
  if (partnerAggregateOnly && headAge !== null && combinedYearlyExpenses > 0) {
    // Partner deelt alleen totalen → lichte gecombineerde projectie + pad uit de totalen.
    const fin: FinancialInput = {
      totalAssets: combinedNetWorthAssets,
      totalDebts: combinedNetWorthDebts,
      monthlyIncome: combinedMonthlyIncome,
      monthlyExpenses: combinedMonthlyExpenses,
      monthlyContributions: combinedMonthlyContributions,
      yearlyMustExpenses: combinedYearlyExpenses,
      dateOfBirth: headDobEntry!.dob,
    }
    const cfp = computeFireProjection(fin, headFireParams.grossReturn, headFireParams.effectiveSwr, headFireParams.inflationRate, {
      strategy: (headProfile?.fire_end_strategy ?? undefined) as 'perpetual' | 'legacy' | 'deplete' | undefined,
      endAge: headProfile?.fire_end_age ?? undefined,
    })
    combinedProjection = fireProjectionToHousehold(cfp)
    combinedRows = projectTotalsToSimRows(fin, headAge, headFireStrategy.endAge)
    combinedFireAgeFractional = cfp.fireAge
  } else if (headAge !== null && combinedYearlyExpenses > 0 && !partnerDataHidden) {
    const cashflows = buildCombinedCashflows({
      combinedEvents,
      headAge,
      headDob: headDobEntry!.dob,
      profiles,
      memberIds,
    })
    const input: UnifiedProjectionInput = {
      assets: combinedAssets,
      debts: combinedDebts,
      currentAge: headAge,
      endAge: headFireStrategy.endAge,
      yearlyExpenses: combinedYearlyExpenses,
      annualSavings: combinedMonthlyContributions * 12,
      monthlySurplus: combinedMonthlyContributions,
      monthlyIncome: combinedMonthlyIncome,
      incomeGrowthRate: 0,
      grossReturn: headFireParams.grossReturn,
      inflationRate: headFireParams.inflationRate,
      box3Method: headFireParams.box3Method,
      cashflows,
      strategyConfig: headFireStrategy,
      withdrawalStrategy: WITHDRAWAL_DEFAULTS,
      hasPartner: true, // huishouden = fiscaal partner voor Box 3 heffingsvrij
    }
    const sim = toSimResult(runUnifiedProjection(input))
    combinedProjection = simResultToProjection(
      combinedNetWorth, combinedMonthlyIncome, combinedMonthlyExpenses, combinedYearlyExpenses, headAge, sim,
    )
    combinedRows = sim.rows
    combinedFireAgeFractional = sim.fireAgeFractional
  } else {
    // Graceful degrade: partner-data verborgen of geen DOB → val terug op de
    // eigen individuele projectie als combined-benadering.
    const mine = partners.find(p => p.isCurrentUser)?.projection
    combinedProjection = mine ?? emptyProjection(combinedNetWorth, combinedMonthlyIncome, combinedMonthlyExpenses, combinedYearlyExpenses, headAge)
  }

  return {
    hasHousehold: true,
    householdName,
    splitMode,
    customSplitPct,
    combined: {
      projection: combinedProjection,
      rows: combinedRows,
      fireAgeFractional: combinedFireAgeFractional,
    },
    partners,
    comparison: {
      combinedNetWorth: Math.round(combinedNetWorth),
      combinedMonthlyIncome: Math.round(combinedMonthlyIncome),
      combinedMonthlyExpenses: Math.round(combinedMonthlyExpenses),
      combinedMonthlySavings: Math.round(combinedMonthlySavings),
      combinedSavingsRate,
      combinedFireTarget: combinedProjection.fireTarget,
      combinedFreedomPercentage: combinedProjection.freedomPercentage,
      sharedFireTarget: combinedProjection.fireTarget,
      combinedRetirementExpenses: Math.round(combinedYearlyExpenses),
      individualFireTargets: partners.map(p => ({
        userId: p.userId,
        fullName: p.fullName,
        fireTarget: p.projection.fireTarget,
        fireAge: p.projection.fireAge,
        freedomPercentage: p.projection.freedomPercentage,
      })),
    },
    partnerDataHidden,
    partnerFutureHidden,
  }
}

// ── Cashflow-bouw ─────────────────────────────────────────────────────────────

/**
 * Bouw cashflows voor een enkele partner: hun life-events + een AOW-income-flow
 * op hun eigen AOW-leeftijd (alleenstaand-tarief voor de individuele projectie,
 * samenwonend wanneer fiscaal partner). AOW wordt alleen toegevoegd als er nog
 * geen aow-event in de life-events zit (anders dubbeltelling).
 */
function buildMemberCashflows(events: LifeEvent[], currentAge: number, hasPartner: boolean): SimCashflow[] {
  const flows = lifeEventsToCashflows(events)
  const hasAowEvent = events.some(ev => ev.event_type === 'aow' && ev.is_active)
  if (!hasAowEvent && currentAge < NL_AOW_AGE) {
    const aow = buildAowCashflow(
      'household-own-aow',
      'AOW',
      hasPartner ? 'samenwonend' : 'alleenstaand',
      NL_AOW_AGE,
    )
    if (aow) flows.push(aow)
  }
  return flows
}

/**
 * Bouw de cashflows voor de GECOMBINEERDE projectie op de head-age-as.
 * Dual-AOW ZONDER engine-wijziging:
 *   • Head AOW: income vanaf head's AOW-leeftijd op de head-as.
 *   • Partner AOW: omgerekend naar de head-as via de DOB-offset.
 *       headAxisFromAge = partnerAowAge − (partnerAge − headAge)
 *     d.w.z. wanneer de partner z'n AOW bereikt, is de head al
 *     (partnerAge − headAge) jaar ouder geweest tot dat punt.
 * Bestaande aow/pension life-events worden via lifeEventsToCashflows op hun
 * eigen target_age verwerkt; we voegen alleen een AOW-flow toe per lid dat er
 * geen aow-event heeft. Persoonlijke + gedeelde events tellen één keer in de
 * combined as.
 */
function buildCombinedCashflows(args: {
  combinedEvents: LifeEvent[]
  headAge: number
  headDob: string
  profiles: MemberProfile[]
  memberIds: string[]
}): SimCashflow[] {
  const { combinedEvents, headAge, headDob, profiles, memberIds } = args

  // Persoonlijke + gedeelde events op hun eigen target_age. Voor de combined
  // projectie laten we de target_age zoals opgeslagen — die staat al op de
  // eigenaar's as, en de combined as is de head-as. Voor events van de jongere
  // partner zou strikt genomen een offset moeten gelden; de meeste gedeelde
  // events (huis, kinderen) zijn echter op de head-as ingevoerd. We verwerken
  // de events as-is en voegen alleen de AOW-streams expliciet offset toe.
  const flows = lifeEventsToCashflows(combinedEvents)

  for (const id of memberIds) {
    const p = profiles.find(pr => pr.id === id)
    if (!p?.date_of_birth) continue
    // Heeft dit lid al een aow-event? Dan niet dubbel toevoegen.
    const hasAow = combinedEvents.some(ev => ev.event_type === 'aow' && ev.is_active && (ev as LifeEvent & { user_id?: string }).user_id === id)
    if (hasAow) continue

    const memberAge = ageAtDate(p.date_of_birth)
    const ageOffset = memberAge - headAge // >0 wanneer lid ouder dan head (head=oudste, dus <=0)
    // AOW van dit lid op de head-as: partnerAowAge − (partnerAge − headAge)
    const headAxisAowAge = NL_AOW_AGE - ageOffset
    const aow = buildAowCashflow(
      `household-combined-aow-${id}`,
      'AOW',
      'samenwonend', // huishouden = samenwonend-tarief per partner
      Math.max(headAge, headAxisAowAge),
    )
    if (aow) flows.push(aow)
  }

  void headDob
  return flows
}

// ── Asset/debt-schaling naar aandeel ──────────────────────────────────────────

/** Schaal gedeelde assets naar het aandeel van een partner (downscale value). */
function scaleSharedAssets(personal: Asset[], shared: Asset[], shareFraction: number): Asset[] {
  const scaled = shared.map(a => ({
    ...a,
    current_value: Number(a.current_value) * shareFraction,
    monthly_contribution: Number(a.monthly_contribution) * shareFraction,
  }))
  return [...personal, ...scaled]
}

/** Schaal gedeelde schulden naar het aandeel van een partner. */
function scaleSharedDebts(personal: Debt[], shared: Debt[], shareFraction: number, memberId: string): Debt[] {
  const scaled = shared.map(d => {
    let frac = shareFraction
    if (d.partner_split_pct != null) {
      const ownerFrac = d.partner_split_pct / 100
      frac = d.user_id === memberId ? ownerFrac : 1 - ownerFrac
    }
    return {
      ...d,
      current_balance: Number(d.current_balance) * frac,
      monthly_payment: Number(d.monthly_payment) * frac,
      minimum_payment: Number(d.minimum_payment) * frac,
    }
  })
  return [...personal, ...scaled]
}

// ── Gecombineerde yearly expenses ─────────────────────────────────────────────

function computeCombinedYearlyExpenses(
  allBudgets: Array<{ id: string; name: string; default_limit: number; interval: string; budget_type: string; is_essential: boolean; parent_id: string | null; user_id: string; ownership: 'personal' | 'shared' }>,
  profiles: MemberProfile[],
  memberIds: string[],
  combinedMonthlyExpenses: number,
  combinedMonthlyIncome: number,
): number {
  // Alle essentiële parents (eigen van álle leden + gedeeld) — één keer.
  const essentialParents = allBudgets.filter(
    b => b.is_essential && b.budget_type === 'expense' && b.parent_id === null &&
      (memberIds.includes(b.user_id) || b.ownership === 'shared'),
  )
  const children = allBudgets.filter(
    b => b.parent_id !== null && !['archive', 'income', 'savings'].includes(b.budget_type) &&
      (memberIds.includes(b.user_id) || b.ownership === 'shared'),
  )
  const { yearlyMustExpenses } = computeYearlyMustExpenses(
    essentialParents as never,
    children as never,
  )
  if (yearlyMustExpenses > 0) return yearlyMustExpenses
  // Fallback: huidige uitgaven of inkomen.
  if (combinedMonthlyExpenses > 0) return combinedMonthlyExpenses * 12
  return combinedMonthlyIncome * 12 * 0.7
}

// ── Lege/fallback-structuren ──────────────────────────────────────────────────

function emptyProjection(
  netWorth = 0,
  monthlyIncome = 0,
  monthlyExpenses = 0,
  yearlyExpenses = 0,
  currentAge: number | null = null,
): HouseholdFireProjectionData {
  const fireTarget = yearlyExpenses > 0 ? Math.round(yearlyExpenses / HOUSEHOLD_SWR) : 0
  const freedomPercentage = fireTarget > 0 ? Math.min(100, (netWorth / fireTarget) * 100) : 0
  const monthlySavings = monthlyIncome - monthlyExpenses
  const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0
  const yearsOfFreedom = yearlyExpenses > 0 ? netWorth / yearlyExpenses : 0
  return {
    fireTarget,
    netWorth: Math.round(netWorth),
    freedomPercentage,
    fireAge: null,
    currentAge,
    fireDate: '—',
    countdownDays: 0,
    freedomYears: Math.max(0, Math.floor(yearsOfFreedom)),
    freedomMonths: Math.max(0, Math.round((yearsOfFreedom - Math.floor(yearsOfFreedom)) * 12)),
    monthlyPassiveIncome: Math.round((netWorth * HOUSEHOLD_SWR) / 12),
    monthlySavings: Math.round(monthlySavings),
    savingsRate,
  }
}

function emptyComparison(): HouseholdProjectionResult['comparison'] {
  return {
    combinedNetWorth: 0,
    combinedMonthlyIncome: 0,
    combinedMonthlyExpenses: 0,
    combinedMonthlySavings: 0,
    combinedSavingsRate: 0,
    combinedFireTarget: 0,
    combinedFreedomPercentage: 0,
    sharedFireTarget: 0,
    combinedRetirementExpenses: 0,
    individualFireTargets: [],
  }
}
