import type { FireProjection } from './horizon-data'
import { computeScalarFireProjection } from './horizon-kernel/scalar-router'
import type { FinancialInput } from './core-metrics'
import { computeRetirementExpenses, type RetirementExpenseMethod } from './budget-utils'

const METHODS: readonly RetirementExpenseMethod[] = [
  'essential_budgets',
  'custom_amount',
  'current_income',
]

export interface SanitizedCashSettings {
  net_monthly_income?: number
  estimated_monthly_expenses?: number
  retirement_expense_method?: RetirementExpenseMethod
  retirement_expense_custom_amount?: number
  // `target_savings_rate` valt hier BEWUST buiten (ronde 4, besluit 3): het
  // spaarquote-doel woont voortaan in de goals-bron (parameter-doel via het
  // /toekomst-lab). De profielkolom is DEPRECATED en wordt niet meer via PUT
  // geschreven; de sanitizer negeert het veld stilzwijgend.
  income_source?: string
  expenses_source?: string
}

/**
 * Whitelist + clamp voor de cash-settings die via PUT /api/parameters
 * binnenkomen. Onbekende velden en out-of-range waarden worden genegeerd
 * (niet meegeschreven), zodat de DB nooit met rommel wordt geüpdatet.
 */
export function sanitizeCashSettingsInput(body: Record<string, unknown>): SanitizedCashSettings {
  const out: SanitizedCashSettings = {}

  if (body.net_monthly_income !== undefined) {
    const n = Number(body.net_monthly_income)
    if (Number.isFinite(n) && n >= 0 && n <= 1_000_000) out.net_monthly_income = n
  }
  if (body.estimated_monthly_expenses !== undefined) {
    const n = Number(body.estimated_monthly_expenses)
    if (Number.isFinite(n) && n >= 0 && n <= 1_000_000) out.estimated_monthly_expenses = n
  }
  if (body.retirement_expense_method !== undefined) {
    const m = String(body.retirement_expense_method)
    if ((METHODS as readonly string[]).includes(m)) {
      out.retirement_expense_method = m as RetirementExpenseMethod
    }
  }
  if (body.retirement_expense_custom_amount !== undefined) {
    const n = Number(body.retirement_expense_custom_amount)
    if (Number.isFinite(n) && n >= 0 && n <= 10_000_000) out.retirement_expense_custom_amount = n
  }
  // target_savings_rate wordt bewust NIET meer gelezen/geschreven (ronde 4,
  // besluit 3 — de goals-bron is dé bron). Een meegestuurd veld wordt genegeerd.

  for (const key of ['income_source', 'expenses_source'] as const) {
    if (body[key] !== undefined) {
      const v = String(body[key])
      if (v === 'auto' || v === 'manual') out[key] = v
    }
  }

  return out
}

export interface CashSettingsOverrides {
  monthlyIncome: number
  monthlyExpenses: number
}

export interface FireRecomputeParams {
  grossReturn: number
  effectiveSwr: number
  inflationRate: number
  retirementMethod: RetirementExpenseMethod
  retirementCustomAmount: number
  /** Wanneer false vallen de jaaruitgaven terug op (maanduitgaven × 12). */
  budgetingActive: boolean
  /** Jaarlijkse must-expenses uit essentiële budgetten (alleen relevant als budgetingActive). */
  yearlyMustExpenses: number
  fireStrategy: {
    strategy: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'
    endAge: number
    /** Nalatenschap-doelbedrag; alleen relevant voor 'legacy' op de kernel-tak. */
    legacyAmount?: number
  }
  /**
   * Scalar-router-doorvoer (FASE 5, stap 2e): de per-gebruiker-vlag
   * `horizon_kernel_scalar` van de aanroepende surface. Weggelaten/false =
   * byte-identiek aan de directe computeFireProjection-aanroep van vandaag.
   */
  kernelScalarEnabled?: boolean
}

/**
 * Herberekent de FIRE-projectie op basis van live-bewerkte inkomen/uitgaven.
 * Spiegelt de constructie in dashboard-data-loader: de jaarlijkse
 * retirement-uitgaven worden bepaald via computeRetirementExpenses, met de
 * maanduitgaven × 12 als fallback wanneer er geen budgetten zijn.
 */
export function recomputeFireFromSettings(
  base: FinancialInput,
  overrides: CashSettingsOverrides,
  params: FireRecomputeParams,
): FireProjection {
  const estimatedYearly = overrides.monthlyExpenses * 12
  const yearlyMust = params.budgetingActive ? params.yearlyMustExpenses : estimatedYearly
  const yearlyRetirement = computeRetirementExpenses(
    params.retirementMethod,
    yearlyMust,
    overrides.monthlyIncome * 12,
    params.retirementCustomAmount,
    estimatedYearly,
  )

  const input: FinancialInput = {
    ...base,
    monthlyIncome: overrides.monthlyIncome,
    monthlyExpenses: overrides.monthlyExpenses,
    yearlyMustExpenses: yearlyRetirement,
  }

  // Via de scalar-router (kernel-only; de tijd-velden komen uit de horizon-kernel).
  return computeScalarFireProjection({
    input,
    annualReturn: params.grossReturn,
    swrOverride: params.effectiveSwr,
    inflationOverride: params.inflationRate,
    strategyOptions: {
      strategy: params.fireStrategy.strategy,
      endAge: params.fireStrategy.endAge,
      legacyAmount: params.fireStrategy.legacyAmount,
    },
  }).result
}
