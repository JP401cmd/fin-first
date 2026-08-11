import type { FireProjection } from './horizon-data'
import { computeScalarFireProjection } from './horizon-kernel/scalar-router'
import type { FinancialInput } from './core-metrics'
import { computeRetirementExpenses, type RetirementExpenseMethod } from './budget-utils'
import {
  BASIS_SOURCES,
  computeBudgetBasis,
  type BasisSource,
  type BudgetBasisResult,
  type BudgetBasisRow,
} from './budget-basis'
import type { BudgetRealizedWindow } from './budget-realized'

const METHODS: readonly RetirementExpenseMethod[] = [
  'essential_budgets',
  'custom_amount',
  'current_income',
]

/** Versie van de `profiles.cashflow_basis_prefs`-payload. */
export const CASHFLOW_BASIS_PREFS_VERSION = 1

/**
 * Bovengrens op het aantal uitgesloten id's per kant. Degeneratie-vangnet, geen
 * productregel: `MAX_BASIS_ENTRIES` (lib/budget-basis.ts) begrenst het aantal
 * selecteerbare posten, dus meer uitsluitingen dan dat kunnen nooit betekenis
 * hebben.
 */
export const MAX_EXCLUDED_BUDGET_IDS = 500

/**
 * De selectie binnen de budgetgrondslag (ADR 0103): welke budgetten tellen NIET
 * mee. Bewust een UITSLUITLIJST — "alles aangevinkt" is dan de lege lijst (de
 * blijvende, kosteloze default) en een later aangemaakt budget telt vanzelf mee
 * in plaats van stil buiten de grondslag te vallen.
 */
export interface CashflowBasisPrefs {
  v: typeof CASHFLOW_BASIS_PREFS_VERSION
  excludedIncomeBudgetIds: string[]
  excludedExpenseBudgetIds: string[]
}

export interface SanitizedCashSettings {
  net_monthly_income?: number
  estimated_monthly_expenses?: number
  retirement_expense_method?: RetirementExpenseMethod
  retirement_expense_custom_amount?: number
  // `target_savings_rate` valt hier BEWUST buiten (ronde 4, besluit 3): het
  // spaarquote-doel woont voortaan in de goals-bron (parameter-doel via het
  // /toekomst-lab). De profielkolom is DEPRECATED en wordt niet meer via PUT
  // geschreven; de sanitizer negeert het veld stilzwijgend.
  income_source?: BasisSource
  expenses_source?: BasisSource
  cashflow_basis_prefs?: CashflowBasisPrefs
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * `budgets.id` is een uuid. Elke string die daar niet op lijkt is per definitie
 * betekenisloos als uitsluiting en hoort de kolom niet in.
 *
 * Zonder deze vormcontrole begrensde `MAX_EXCLUDED_BUDGET_IDS` alleen het AANTAL
 * id's, niet hun inhoud: 500 willekeurige strings van willekeurige lengte pasten
 * er even goed in als 500 uuid's. Met de controle is de cap pas echt een grens.
 * Hoofdletter-ongevoelig; de canonieke 8-4-4-4-12-vorm, zonder versie-/variant-
 * eis (Postgres accepteert die ook).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Stringlijst → getrimd, alleen uuid-vormige waarden, ontdubbeld, afgekapt.
 * Niet-strings en niet-uuid's vallen stil weg — NOOIT een fout: een uitsluitlijst
 * met rommel erin moet blijven werken voor de id's die er wél toe doen.
 */
function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (!id || !UUID_RE.test(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= MAX_EXCLUDED_BUDGET_IDS) break
  }
  return out
}

/**
 * DEFENSIEVE PARSER — de enige schrijfpoort naar `profiles.cashflow_basis_prefs`.
 * Spiegelt `parseToekomstScenarioPrefs` (lib/horizon/toekomst-scenario.ts).
 *
 * Onbekende vorm (geen object, verkeerde `v`) → `null`: het veld wordt dan NIET
 * geschreven, in plaats van een fout of een lege overwrite. Onbekende of
 * verwijderde budget-id's in de lijst leveren NOOIT een fout op — die zijn
 * betekenisloos en worden bij het rekenen genegeerd (`computeBudgetBasis`).
 */
export function parseCashflowBasisPrefs(raw: unknown): CashflowBasisPrefs | null {
  if (!isPlainObject(raw)) return null
  if (raw.v !== CASHFLOW_BASIS_PREFS_VERSION) return null
  return {
    v: CASHFLOW_BASIS_PREFS_VERSION,
    excludedIncomeBudgetIds: parseIdList(raw.excludedIncomeBudgetIds),
    excludedExpenseBudgetIds: parseIdList(raw.excludedExpenseBudgetIds),
  }
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

  // Bronwaarde: de VOLLEDIGE union uit ADR 0103, getypt via BASIS_SOURCES —
  // geen losse stringvergelijkingen meer, zodat een nieuwe grondslag niet stil
  // in de else-tak van een oppervlak kan belanden.
  for (const key of ['income_source', 'expenses_source'] as const) {
    if (body[key] !== undefined) {
      const v = String(body[key]) as BasisSource
      if (BASIS_SOURCES.includes(v)) out[key] = v
    }
  }

  // Selectie binnen de budgetgrondslag. Landt BEWUST in dezelfde PUT als de
  // bronwaarde (ADR 0103): twee aanroepen zouden een waarneembare tussentoestand
  // geven — grondslag al op 'budget', selectie nog niet geschreven — en bij een
  // gefaalde tweede aanroep een blijvend verkeerde grondslag.
  if (body.cashflow_basis_prefs !== undefined) {
    const prefs = parseCashflowBasisPrefs(body.cashflow_basis_prefs)
    if (prefs) out.cashflow_basis_prefs = prefs
  }

  return out
}

/**
 * De budgetgrondslag van ÉÉN gebruiker, uit zijn profielrij + zijn budgetrijen.
 *
 * Bestaat zodat de vijf server-oppervlakken die de grondslag nodig hebben
 * (core-, dashboard-, horizon-loader, `loadCashflowKpis` en
 * `loadForecastSectionData`) niet elk hun eigen "prefs parsen + twee keer
 * `computeBudgetBasis`"-blok dragen. Dat blok is geen formule maar wél een
 * grondslag-samenstelling, en vijf kopieën ervan zouden op de eerste wijziging
 * uiteenlopen — precies de fout-klasse die ADR 0103 opruimt.
 *
 * Pure functie: de caller levert de (RLS-gescoopte) rijen aan.
 */
export function resolveBudgetBasisFromProfile(
  profile: Record<string, unknown> | null | undefined,
  budgets: BudgetBasisRow[],
  opts?: { shareFractionById?: Record<string, number>; realized?: BudgetRealizedWindow },
): { income: BudgetBasisResult; expenses: BudgetBasisResult } {
  const prefs = parseCashflowBasisPrefs(profile?.cashflow_basis_prefs)
  return {
    income: computeBudgetBasis(budgets, 'income', prefs?.excludedIncomeBudgetIds ?? [], opts),
    expenses: computeBudgetBasis(budgets, 'expense', prefs?.excludedExpenseBudgetIds ?? [], opts),
  }
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
