/**
 * Persoonlijk plan — pure input-assemblage (gedeeld).
 *
 * Zet de rauwe DB-rijen (profiel, AOW-tabel, AOW/pensioen-life-events, budgetten)
 * om naar de acht input-secties van het persoonlijk-plan-rapport. GEEN
 * toekomstprojectie — puur de aannames-zijde.
 *
 * Eén bron van waarheid voor die assemblage: zowel `GET /api/report/persoonlijk-plan`
 * (het losse input-rapport) als `GET /api/report/totaalplan` (het gecomponeerde
 * totaalplan) consumeren deze functie, zodat de aannames-blokken in beide rapporten
 * byte-identiek zijn (nul duplicatie, geen drift).
 *
 * Pure functie: geen Supabase/fs/Date.now buiten de meegegeven rijen (currentAge
 * gebruikt `new Date()` — dezelfde afhankelijkheid als het oorspronkelijke route-pad).
 *
 * Spec: docs/superpowers/specs/2026-05-11-kern-rapport-en-instellingen-rapport-design.md
 */
import { BOX3_DRAG, DEFAULT_RETURN, INFLATION } from '@/lib/constants'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { resolveFireParams } from '@/lib/fire-params'
import { parseFireStrategy, resolveFirePlanWithOverride, STRATEGY_LABELS } from '@/lib/fire-strategy'
import {
  resolveWithdrawalStrategy,
  WITHDRAWAL_DEFAULTS,
} from '@/lib/withdrawal-strategy'
import {
  computeYearlyMustExpenses,
  computeRetirementExpenses,
  type RetirementExpenseMethod,
  type BudgetRow,
  type ChildBudgetRow,
} from '@/lib/budget-utils'
import type {
  PersoonlijkPlanCashflow,
  PersoonlijkPlanHero,
  PersoonlijkPlanDemografie,
  PersoonlijkPlanInkomen,
  PersoonlijkPlanUitgaven,
  PersoonlijkPlanFireParams,
  PersoonlijkPlanEindstrategie,
  PersoonlijkPlanOnttrekking,
} from '@/lib/persoonlijk-plan-data'
import { WITHDRAWAL_LABELS } from '@/lib/persoonlijk-plan-data'
import { householdTypeLabel } from '@/lib/household-type'

// ── Rauwe rij-vormen ─────────────────────────────────────────────────

/** Profiel-rij zoals door de rapport-routes geselecteerd. */
export interface PersoonlijkPlanProfileRow {
  full_name: string | null
  date_of_birth: string | null
  household_type: string | null
  number_of_children: number | null
  net_monthly_income: number | null
  estimated_monthly_expenses: number | null
  expected_return: number | null
  inflation_rate: number | null
  marginaal_tarief: number | null
  fire_end_strategy: string | null
  fire_end_age: number | null
  fire_legacy_amount: number | null
  /** Het stop-anker (ADR 0129) — in de select via `FIRE_PLAN_COLUMNS`; optioneel voor oudere fixtures. */
  fire_stop_anchor?: string | null
  fire_stop_age?: number | string | null
  retirement_expense_method: string | null
  retirement_expense_custom_amount: number | null
  withdrawal_strategy: string | null
  guardrail_floor: number | null
  guardrail_ceiling: number | null
  guardrail_cut_step: number | null
  guardrail_raise_step: number | null
  feature_preferences: Record<string, unknown> | null
}

/** AOW/pensioen life-event-rij. */
export interface PersoonlijkPlanLifeEventRow {
  id: string
  name: string
  event_type: string
  target_age: number | null
  target_date: string | null
  monthly_income_change: number | null
  is_active: boolean
  is_indexed: boolean | null
  metadata: Record<string, unknown> | null
}

/** Budget-rij (parent + child) zoals door de rapport-routes geselecteerd. */
export interface PersoonlijkPlanBudgetRow {
  id: string
  parent_id: string | null
  name: string | null
  default_limit: number | string | null
  interval: string | null
  budget_type: string | null
  is_essential: boolean | null
}

/** Rauwe invoer voor de assemblage. */
export interface PersoonlijkPlanRawInputs {
  profile: PersoonlijkPlanProfileRow
  aowRows: AowLeeftijdRow[]
  events: PersoonlijkPlanLifeEventRow[]
  budgetRows: PersoonlijkPlanBudgetRow[]
}

/** De acht input-secties (root minus `generatedAt`). */
export interface PersoonlijkPlanSections {
  hero: PersoonlijkPlanHero
  demografie: PersoonlijkPlanDemografie
  inkomen: PersoonlijkPlanInkomen
  cashflows: PersoonlijkPlanCashflow[]
  uitgaven: PersoonlijkPlanUitgaven
  fireParams: PersoonlijkPlanFireParams
  eindstrategie: PersoonlijkPlanEindstrategie
  onttrekking: PersoonlijkPlanOnttrekking
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Bereken huidige leeftijd in hele jaren vanaf `date_of_birth`. Returnt
 * `null` als de geboortedatum leeg of ongeldig is — UI toont dan "—".
 */
export function computeCurrentAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}

// ── Assemblage ───────────────────────────────────────────────────────

/**
 * Bouw de acht input-secties uit de rauwe rijen. Byte-identiek aan het
 * oorspronkelijke inline-pad in `GET /api/report/persoonlijk-plan`.
 */
export function buildPersoonlijkPlanSections(
  raw: PersoonlijkPlanRawInputs,
): PersoonlijkPlanSections {
  const { profile, aowRows, events, budgetRows } = raw

  // ── Hero / demografie ──
  const currentAge = computeCurrentAge(profile.date_of_birth)
  const aowAge = lookupAowAge(aowRows, profile.date_of_birth)
  const fireEndAge = profile.fire_end_age ?? 90

  const hero: PersoonlijkPlanHero = {
    currentAge,
    aowAgeYears: aowAge.years,
    aowAgeMonths: aowAge.months,
    aowDefinitive: aowAge.isDefinitive,
    fireEndAge,
    // Open vraag 1, aanbeveling (b): gebruik `fire_end_age` als
    // levensverwachting-proxy zolang er nog geen separaat veld is.
    lifeExpectancyProxy: fireEndAge,
  }

  const demografie: PersoonlijkPlanDemografie = {
    fullName: profile.full_name ?? null,
    dateOfBirth: profile.date_of_birth ?? null,
    currentAge,
    householdType: profile.household_type ?? null,
    householdTypeLabel: householdTypeLabel(profile.household_type),
    numberOfChildren: profile.number_of_children ?? 0,
    fireEndAge,
    aowAgeYears: aowAge.years,
    aowAgeMonths: aowAge.months,
  }

  // ── Inkomen ──
  const netMonthlyIncome = Number(profile.net_monthly_income ?? 0)
  const fireParams = resolveFireParams(profile)
  const inkomen: PersoonlijkPlanInkomen = {
    netMonthlyIncome,
    // Open vraag 3, default (a): ruwe schatting bruto/jaar uit netto/mnd.
    estimatedGrossAnnualIncome: netMonthlyIncome > 0
      ? Math.round((netMonthlyIncome * 12) / 0.65)
      : null,
    marginaalTarief: fireParams.marginaalTarief,
    box3Method: fireParams.box3Method,
  }

  // ── AOW & pensioen cashflows ──
  const cashflows: PersoonlijkPlanCashflow[] = events.map((ev) => ({
    id: ev.id,
    name: ev.name,
    type: ev.event_type === 'aow' ? 'aow' : 'pension',
    startAge: ev.target_age ?? null,
    monthlyAmount: Math.round(Number(ev.monthly_income_change) || 0),
    isIndexed: ev.is_indexed === true,
    // Pensioenpot-koppeling: MVP houdt dit veld `null` (geen linked_asset_id-kolom).
    linkedAsset: null,
  }))

  // ── Uitgaven nu vs. na pensioen ──
  // Alleen ECHTE uitgave-budgetten tellen als essentiële uitgave. Zonder het
  // `budget_type`-filter tellen essentiële Inkomen-/Sparen-parents mee als
  // "must expense" (bug: Willem €127.140 i.p.v. €13.140/jaar). Dit is exact de
  // grondslag die álle andere call-sites van `computeYearlyMustExpenses` al
  // hanteren (dashboard-/core-/horizon-loader, periodiek rapport, what-if,
  // year-in-review, huishouden-projectie) — hier ontbrak hij als enige.
  const essentialParents: BudgetRow[] = budgetRows
    .filter((b) => !b.parent_id && b.is_essential === true && b.budget_type === 'expense')
    .map((b) => ({
      id: b.id,
      name: b.name,
      default_limit: b.default_limit ?? 0,
      interval: b.interval,
      budget_type: b.budget_type,
      is_essential: b.is_essential,
    }))
  const allChildren: ChildBudgetRow[] = budgetRows
    .filter((b) => b.parent_id != null)
    .map((b) => ({
      id: b.id,
      parent_id: b.parent_id,
      name: b.name,
      default_limit: b.default_limit ?? 0,
      interval: b.interval,
      budget_type: b.budget_type,
      is_essential: b.is_essential,
    }))
  const { yearlyMustExpenses } = computeYearlyMustExpenses(essentialParents, allChildren)
  const yearlyNetIncome = netMonthlyIncome * 12
  const estimatedYearlyExpenses = Number(profile.estimated_monthly_expenses ?? 0) * 12

  const retirementExpenseMethod =
    (profile.retirement_expense_method as RetirementExpenseMethod | null) ?? 'essential_budgets'
  const yearlyRetirementExpenses = computeRetirementExpenses(
    retirementExpenseMethod,
    yearlyMustExpenses,
    yearlyNetIncome,
    profile.retirement_expense_custom_amount ?? null,
    estimatedYearlyExpenses,
  )

  const uitgaven: PersoonlijkPlanUitgaven = {
    yearlyEssentialExpenses: Math.round(yearlyMustExpenses),
    yearlyNetIncome: Math.round(yearlyNetIncome),
    yearlyRetirementExpenses: Math.round(yearlyRetirementExpenses),
    retirementExpenseMethod,
    retirementExpenseCustomAmount: profile.retirement_expense_custom_amount == null
      ? null
      : Math.round(Number(profile.retirement_expense_custom_amount)),
    delta: Math.round(yearlyRetirementExpenses - yearlyMustExpenses),
    pctOfCurrent: yearlyMustExpenses > 0
      ? Math.round((yearlyRetirementExpenses / yearlyMustExpenses) * 100)
      : null,
  }

  // ── FIRE-rekenparameters ──
  const fireParamsBlock: PersoonlijkPlanFireParams = {
    grossReturn: fireParams.grossReturn ?? DEFAULT_RETURN,
    inflationRate: fireParams.inflationRate ?? INFLATION,
    effectiveSwr: fireParams.effectiveSwr,
    box3Method: fireParams.box3Method,
    box3Drag: BOX3_DRAG,
  }

  // ── Eindstrategie ──
  const strategyCfg = parseFireStrategy(profile)
  // Het PLAN (stop-anker × eind-vorm, ADR 0129) — dezelfde rij-lezing als de kernel-
  // adapter, incl. het schaduwpad `feature_preferences.fire_strategy_override`.
  const plan = resolveFirePlanWithOverride(profile)
  const eindstrategie: PersoonlijkPlanEindstrategie = {
    strategy: strategyCfg.strategy,
    strategyName: STRATEGY_LABELS[strategyCfg.strategy].name,
    strategySubtitle: STRATEGY_LABELS[strategyCfg.strategy].subtitle,
    endAge: strategyCfg.endAge,
    legacyAmount: Math.round(strategyCfg.legacyAmount),
    stopAnchor: plan.anchor.kind,
    stopAge: plan.anchor.kind === 'age' ? plan.anchor.age : null,
  }

  // ── Onttrekkingsstrategie ──
  const withdrawalCfg = resolveWithdrawalStrategy(profile)
  const onttrekking: PersoonlijkPlanOnttrekking = {
    type: withdrawalCfg.strategy,
    typeLabel: WITHDRAWAL_LABELS[withdrawalCfg.strategy].name,
    typeSubtitle: WITHDRAWAL_LABELS[withdrawalCfg.strategy].subtitle,
    guardrailFloor: withdrawalCfg.guardrailFloor || WITHDRAWAL_DEFAULTS.guardrailFloor,
    guardrailCeiling: withdrawalCfg.guardrailCeiling || WITHDRAWAL_DEFAULTS.guardrailCeiling,
    guardrailCutStep: withdrawalCfg.guardrailCutStep || WITHDRAWAL_DEFAULTS.guardrailCutStep,
    guardrailRaiseStep: withdrawalCfg.guardrailRaiseStep || WITHDRAWAL_DEFAULTS.guardrailRaiseStep,
  }

  return {
    hero,
    demografie,
    inkomen,
    cashflows,
    uitgaven,
    fireParams: fireParamsBlock,
    eindstrategie,
    onttrekking,
  }
}
