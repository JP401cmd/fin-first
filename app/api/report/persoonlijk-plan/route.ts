/**
 * GET /api/report/persoonlijk-plan
 *
 * Persoonlijk plan-rapport. Levert de volledige set van persoonlijke
 * voorkeuren + aannames die de FIRE- en horizon-berekeningen aansturen:
 * demografie, inkomen, AOW & pensioen, uitgaven (nu vs. na pensioen),
 * FIRE-rekenparameters, eindstrategie, onttrekkingsstrategie.
 *
 * Single source of truth voor de waarden:
 * - `profiles` voor demografie/inkomen/instellingen
 * - `aow_leeftijd` + `lib/aow-leeftijd.ts` voor AOW-leeftijd lookup
 * - `life_events` voor AOW/pensioen cashflows (spec verwees naar `cashflows`
 *   maar deze codebase gebruikt `life_events` met `event_type IN ('aow',
 *   'pension')` — zie `lib/fire-simulation.ts:lifeEventsToCashflows`).
 * - `budgets` + `lib/budget-utils.ts` voor uitgaven nu / na pensioen
 * - `lib/fire-params.ts` + `lib/fire-strategy.ts` + `lib/withdrawal-strategy.ts`
 *   voor de strategie-resolvers (zelfde paden als horizon-page/dashboard).
 *
 * Spec: docs/superpowers/specs/2026-05-11-kern-rapport-en-instellingen-rapport-design.md
 */
import { createClient } from '@/lib/supabase/server'
import { BOX3_DRAG, DEFAULT_RETURN, INFLATION } from '@/lib/constants'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { resolveFireParams } from '@/lib/fire-params'
import { parseFireStrategy, STRATEGY_LABELS } from '@/lib/fire-strategy'
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
  PersoonlijkPlanData,
  PersoonlijkPlanCashflow,
  PersoonlijkPlanHero,
  PersoonlijkPlanDemografie,
  PersoonlijkPlanInkomen,
  PersoonlijkPlanUitgaven,
  PersoonlijkPlanFireParams,
  PersoonlijkPlanEindstrategie,
  PersoonlijkPlanOnttrekking,
} from '@/lib/persoonlijk-plan-data'
import { HOUSEHOLD_TYPE_LABELS, WITHDRAWAL_LABELS } from '@/lib/persoonlijk-plan-data'

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Bereken huidige leeftijd in hele jaren vanaf `date_of_birth`. Returnt
 * `null` als de geboortedatum leeg of ongeldig is — UI toont dan "—".
 */
function computeCurrentAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}

interface ProfileRow {
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
  retirement_expense_method: string | null
  retirement_expense_custom_amount: number | null
  withdrawal_strategy: string | null
  guardrail_floor: number | null
  guardrail_ceiling: number | null
  guardrail_cut_step: number | null
  guardrail_raise_step: number | null
  feature_preferences: Record<string, unknown> | null
}

interface LifeEventRow {
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

// ── Main handler ─────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    // ── Parallel loads ──
    const [profileResult, aowResult, lifeEventsResult, budgetsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'full_name, date_of_birth, household_type, number_of_children, net_monthly_income, estimated_monthly_expenses, expected_return, inflation_rate, marginaal_tarief, fire_end_strategy, fire_end_age, fire_legacy_amount, retirement_expense_method, retirement_expense_custom_amount, withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step, feature_preferences',
        )
        .single(),
      supabase.from('aow_leeftijd').select('*'),
      // Spec sectie 3.2 v: `cashflow_type IN ('aow', 'pension')` AND
      // `is_active = true`. In deze codebase = `life_events.event_type`.
      supabase
        .from('life_events')
        .select('id, name, event_type, target_age, target_date, monthly_income_change, is_active, is_indexed, metadata')
        .in('event_type', ['aow', 'pension'])
        .eq('is_active', true)
        .order('target_age', { ascending: true, nullsFirst: false }),
      supabase
        .from('budgets')
        .select('id, parent_id, name, default_limit, interval, budget_type, is_essential')
        .eq('is_archived', false),
    ])

    const profile = (profileResult.data ?? {}) as ProfileRow
    const aowRows = (aowResult.data ?? []) as unknown as AowLeeftijdRow[]
    const events = (lifeEventsResult.data ?? []) as unknown as LifeEventRow[]
    const budgetRows = (budgetsResult.data ?? []) as Array<{
      id: string
      parent_id: string | null
      name: string | null
      default_limit: number | string | null
      interval: string | null
      budget_type: string | null
      is_essential: boolean | null
    }>

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

    const householdType = profile.household_type ?? 'single'
    const demografie: PersoonlijkPlanDemografie = {
      fullName: profile.full_name ?? null,
      dateOfBirth: profile.date_of_birth ?? null,
      currentAge,
      householdType: profile.household_type ?? null,
      householdTypeLabel: HOUSEHOLD_TYPE_LABELS[householdType] ?? householdType,
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
      // Formule: net × 12 / 0.65 — UI toont expliciete disclaimer.
      // `null` als geen netto-inkomen ingevuld.
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
      // Pensioenpot-koppeling: het `life_events`-schema heeft geen
      // `linked_asset_id`-veld in MVP. We laten dit op `null` — een
      // toekomstige migratie kan dit invullen zonder API-shape te breken.
      linkedAsset: null,
    }))

    // ── Uitgaven nu vs. na pensioen ──
    const essentialParents: BudgetRow[] = budgetRows
      .filter((b) => !b.parent_id && b.is_essential === true)
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
    // `estimated_monthly_expenses × 12` als fallback voor users zonder budgetten.
    const estimatedYearlyExpenses = Number(profile.estimated_monthly_expenses ?? 0) * 12

    const retirementExpenseMethod = (profile.retirement_expense_method as RetirementExpenseMethod | null) ?? 'essential_budgets'
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
    const eindstrategie: PersoonlijkPlanEindstrategie = {
      strategy: strategyCfg.strategy,
      strategyName: STRATEGY_LABELS[strategyCfg.strategy].name,
      strategySubtitle: STRATEGY_LABELS[strategyCfg.strategy].subtitle,
      endAge: strategyCfg.endAge,
      legacyAmount: Math.round(strategyCfg.legacyAmount),
    }

    // ── Onttrekkingsstrategie ──
    const withdrawalCfg = resolveWithdrawalStrategy(profile)
    // Default-vergelijking: bij guardrails op default-waardes (0) toont de
    // UI default-friendly fallback. Maar de raw waarden komen uit profile —
    // we passen WITHDRAWAL_DEFAULTS niet aan voor andere strategieën.
    const onttrekking: PersoonlijkPlanOnttrekking = {
      type: withdrawalCfg.strategy,
      typeLabel: WITHDRAWAL_LABELS[withdrawalCfg.strategy].name,
      typeSubtitle: WITHDRAWAL_LABELS[withdrawalCfg.strategy].subtitle,
      // Als alle guardrail-velden 0 zijn in profile (default vóór gebruiker
      // ze heeft aangepast), valt resolveWithdrawalStrategy terug op de
      // hardcoded `WITHDRAWAL_DEFAULTS` waardes — wat de gebruiker dus
      // visueel als guardrail-waardes zou zien zonder dat hij ze
      // expliciet heeft gezet. Voor het rapport tonen we direct wat het
      // simulator-pad gebruikt, niet "0" — dat is hier het meest eerlijk
      // signaal van "wat draait er nu".
      guardrailFloor: withdrawalCfg.guardrailFloor || WITHDRAWAL_DEFAULTS.guardrailFloor,
      guardrailCeiling: withdrawalCfg.guardrailCeiling || WITHDRAWAL_DEFAULTS.guardrailCeiling,
      guardrailCutStep: withdrawalCfg.guardrailCutStep || WITHDRAWAL_DEFAULTS.guardrailCutStep,
      guardrailRaiseStep: withdrawalCfg.guardrailRaiseStep || WITHDRAWAL_DEFAULTS.guardrailRaiseStep,
    }

    const payload: PersoonlijkPlanData = {
      generatedAt: new Date().toISOString(),
      hero,
      demografie,
      inkomen,
      cashflows,
      uitgaven,
      fireParams: fireParamsBlock,
      eindstrategie,
      onttrekking,
    }

    return Response.json(payload)
  } catch (error) {
    console.error('Persoonlijk plan generation error:', error)
    return Response.json(
      { error: 'Persoonlijk plan genereren mislukt. Probeer het later opnieuw.' },
      { status: 500 },
    )
  }
}
