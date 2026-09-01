/**
 * Core financial types, shared FIRE calculation primitives,
 * and dashboard metric calculations.
 *
 * FinancialInput  — raw data from the database (assets, debts, income, expenses, etc.)
 * FinancialMetrics — computed values derived from FinancialInput (FIRE target, freedom %, etc.)
 *
 * Shared primitives (computeFireTarget, computeFreedomPercentage, etc.) are the
 * single source of truth — used by computeCoreData(), computeFireProjection(),
 * and dashboard inline calculations.
 *
 * SWR (Safe Withdrawal Rate): defaults to NL Box 3-corrected SWR (≈2.88%)
 * via resolveFireParams(). Callers can override with swrOverride parameter.
 */

import { DEFAULT_RETURN } from '@/lib/constants'
import { resolveFireParams } from '@/lib/fire-params'

// ── Shared FIRE calculation primitives ───────────────────────

/** Determine effective yearly expenses: prefer must-expenses when available. */
export function computeEffectiveExpenses(
  yearlyMustExpenses: number,
  yearlyExpenses: number,
): number {
  return yearlyMustExpenses > 0 ? yearlyMustExpenses : yearlyExpenses
}

/**
 * FIRE target = yearly expenses / SWR (perpetuele formule).
 *
 * Optioneel: bij deplete strategie wordt depleteFireTarget() gebruikt
 * als strategy en yearsInRetirement worden meegegeven.
 */
export function computeFireTarget(
  effectiveYearlyExpenses: number,
  swr: number,
  options?: {
    strategy?: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'
    yearsInRetirement?: number
    realReturn?: number
  },
): number {
  if (effectiveYearlyExpenses <= 0) return 0

  if (options?.strategy === 'deplete' && options.yearsInRetirement && options.yearsInRetirement > 0) {
    const r = options.realReturn ?? swr
    return depleteFireTarget(effectiveYearlyExpenses, r, options.yearsInRetirement)
  }

  return effectiveYearlyExpenses / swr
}

/**
 * FIRE-target voor deplete strategie: contante waarde van een annuïteit.
 *
 * target = uitgaven × (1 − (1+r)^(−n)) / r
 *
 * Dit geeft het minimale vermogen dat nodig is om n jaar lang
 * de uitgaven te dekken met een reëel rendement van r per jaar,
 * waarna het vermogen ≈ €0 is.
 */
export function depleteFireTarget(
  yearlyExpenses: number,
  realReturn: number,
  yearsInRetirement: number,
): number {
  if (yearlyExpenses <= 0 || yearsInRetirement <= 0) return 0

  if (Math.abs(realReturn) < 1e-10) {
    // Zero return: simple multiplication
    return yearlyExpenses * yearsInRetirement
  }

  // PV annuity formula: PMT × (1 − (1+r)^(−n)) / r
  return yearlyExpenses * (1 - Math.pow(1 + realReturn, -yearsInRetirement)) / realReturn
}

/**
 * PASSIEF INKOMEN — één home, twee vensters (jaar en maand).
 *
 * Formule: vermogen × onttrekkingsvoet. `swr` is ALTIJD de per-gebruiker
 * afgeleide `computeEffectiveSwr` (lib/fire-params.ts) of een expliciete
 * referentie-SWR uit lib/constants.ts — nooit een hardcoded 0.04 op de call-site.
 *
 * LET OP DE SCHAAL. Deze twee zijn twaalf keer elkaar en werden tot nu toe elk
 * apart uitgeschreven: de JAAR-variant in `computeCoreData` (vrije-dagen-teller,
 * `passiveIncome / dailyMustExpense` — een jaarbedrag gedeeld door een dagtarief
 * geeft dagen per jaar, dus die was correct), de MAAND-variant in
 * `lib/horizon/fire-scalar.ts`, twee keer in `lib/horizon/fire-sim-legacy.ts` en
 * nog eens in `components/widgets/swr-monitor-widget.tsx`. Vijf kopieën van één
 * formule met twee verschillende schalen is precies hoe een €/mnd-getal op het
 * ene scherm naast een €/jr-getal met hetzelfde label op het andere belandt.
 * `computePassiveIncomeMonthly` is de canonieke maandvariant; de jaarvariant is
 * de gedeelde wortel zodat (x/12)×12 nergens een afrondingsverschil introduceert.
 */
export function computePassiveIncomeAnnual(netWorth: number, swr: number): number {
  return netWorth * swr
}

/**
 * Passief inkomen per MAAND bij de gegeven onttrekkingsvoet — `netWorth × swr / 12`.
 * Consumeer deze helper i.p.v. de formule te herhalen (zie de toelichting bij
 * {@link computePassiveIncomeAnnual}).
 */
export function computePassiveIncomeMonthly(netWorth: number, swr: number): number {
  return computePassiveIncomeAnnual(netWorth, swr) / 12
}

/** Freedom percentage: progress toward FIRE (0–100). */
export function computeFreedomPercentage(
  netWorth: number,
  fireTarget: number,
): number {
  return fireTarget > 0
    ? Math.max(0, Math.min((netWorth / fireTarget) * 100, 100))
    : 0
}

/**
 * Canonieke vrijheidsvoortgang (0–100): FIRE-eligible netto vermogen afgezet
 * tegen de benodigde portfolio uit de unified projection.
 *
 * Dit is de ENIGE grondslag voor de voortgangsbalk: dezelfde noemer en teller
 * als de "nog X jaar"-aftelling (FIRE-eligible vermogen, huis gefilterd via de
 * housing-strategie; benodigde portfolio uit runUnifiedProjection). Daardoor
 * kan 100% nooit naast "nog jaren" verschijnen.
 *
 * Contrast met computeFreedomPercentage (primitief op vrije netWorth ÷ doel):
 * dat blijft bestaan voor losse percentage-berekeningen, maar de voortgang-
 * call-sites gebruiken deze helper.
 *
 * Semantiek (vastgepind in core-metrics.test.ts):
 *  - requiredPortfolio ≤ 0 / null / niet-finite          ⇒ 0
 *  - fireEligibleNetWorth niet-finite of negatief         ⇒ 0
 *  - eligible ≥ required                                  ⇒ exact 100
 *  - anders                                               ⇒ (eligible / required) × 100, [0,100]
 */
export function computeFreedomProgress({
  fireEligibleNetWorth,
  requiredPortfolio,
}: {
  fireEligibleNetWorth: number
  requiredPortfolio: number | null
}): number {
  if (
    requiredPortfolio == null ||
    !Number.isFinite(requiredPortfolio) ||
    requiredPortfolio <= 0
  ) {
    return 0
  }
  if (!Number.isFinite(fireEligibleNetWorth) || fireEligibleNetWorth < 0) {
    return 0
  }
  if (fireEligibleNetWorth >= requiredPortfolio) return 100
  return Math.max(0, Math.min((fireEligibleNetWorth / requiredPortfolio) * 100, 100))
}

// ── Vrijheidsvoortgang-grondslag: incl./excl. eigen woning (ADR 0009 herzien) ──
//
// Beslissing (2026-07): de vrijheidsvoortgang staat STANDAARD op de INCL.-woning
// grondslag — teller = volledig netto vermogen incl. eigen woning + niet-liquide
// assets; noemer = FIRE-doel incl. woning (Prognose!I@FIRE). Zolang de woning
// uiteindelijk wordt ingezet om de doelen te halen (include_full / downsize /
// opeethypotheek) is dát de juiste grondslag. Alleen wanneer de woning EXPLICIET
// is UITGESLOTEN van FIRE (housing-strategie `exclude_from_fire`) valt de
// grondslag terug op EXCL. (liquide): teller = FIRE-eligible vermogen, noemer =
// benodigde portefeuille (Prognose!J@FIRE) — precies het pre-2026-07-gedrag.
//
// Harde invariant: teller en noemer staan ALTIJD op dezelfde grondslag. Nooit
// incl.-teller ÷ excl.-noemer (dat is de grondslag-mismatch die de balk zou
// opblazen). `computeFreedomProgress` blijft de grondslag-agnostische primitief;
// deze helper kiest enkel wélke teller/noemer erin gaan.
export interface FreedomProgressBasisInput {
  /**
   * True ⇒ eigen woning is uitgesloten van FIRE (exclude_from_fire mét eigen
   * woning) ⇒ EXCL.-grondslag. False ⇒ INCL.-woning grondslag (default).
   */
  homeExcludedFromFire: boolean
  /** Volledig netto vermogen incl. eigen woning + niet-liquide assets — teller bij INCL. */
  netWorthInclHome: number
  /** FIRE-eligible netto vermogen (huis gefilterd via housing-strategie) — teller bij EXCL. */
  fireEligibleNetWorth: number
  /**
   * FIRE-doel incl. woning (Prognose!I@FIRE uit de unified projection, of het
   * scalar-fallback-doel via `inclHomeTargetFromScalar`) — noemer bij INCL.
   * Null / ≤ 0 ⇒ 0% (geen deling door nul).
   */
  requiredNetWorthInclHome: number | null
  /**
   * Benodigde portefeuille excl. woning (Prognose!J@FIRE / strategie-bewust
   * fireTarget) — noemer bij EXCL. Null / ≤ 0 ⇒ 0%.
   */
  requiredPortfolioExclHome: number | null
}

/** Kies teller + noemer op basis van de grondslag-keuze. Enige home voor die keuze. */
export function selectFreedomProgressBasis(input: FreedomProgressBasisInput): {
  currentNetWorth: number
  requiredPortfolio: number | null
} {
  if (input.homeExcludedFromFire) {
    return {
      currentNetWorth: input.fireEligibleNetWorth,
      requiredPortfolio: input.requiredPortfolioExclHome,
    }
  }
  return {
    currentNetWorth: input.netWorthInclHome,
    requiredPortfolio: input.requiredNetWorthInclHome,
  }
}

/**
 * Canonieke vrijheidsvoortgang mét grondslag-keuze (incl./excl. eigen woning).
 * Alle display-consumers (dashboard/core/horizon-loader, AI shared-context,
 * freedom-card, report, /toekomst-client) routeren hierlangs zodat de grondslag
 * op één plek leeft.
 */
export function computeFreedomProgressWithBasis(input: FreedomProgressBasisInput): number {
  const { currentNetWorth, requiredPortfolio } = selectFreedomProgressBasis(input)
  return computeFreedomProgress({ fireEligibleNetWorth: currentNetWorth, requiredPortfolio })
}

/**
 * Scalar-fallback voor de INCL.-woning noemer wanneer er GEEN unified projection
 * beschikbaar is (loaders/routes die alleen een strategie-loos `fireTarget` op de
 * EXCL.-grondslag kennen). De incl.-noemer = excl.-doel + (volledig netto vermogen
 * − FIRE-eligible vermogen). Die verschuiving is exact het bedrag dat óók de teller
 * incl.→excl. verschuift, dus 100% wordt op HETZELFDE punt bereikt als op de
 * excl.-grondslag (invariant blijft: 100% ⇔ FIRE-doel bereikt). Waar de sim wél
 * draait gebruik je requiredFireNetWorth (Prognose!I@FIRE) direct — geen eigen som.
 */
export function inclHomeTargetFromScalar(
  exclTarget: number | null,
  netWorthInclHome: number,
  fireEligibleNetWorth: number,
): number | null {
  if (exclTarget == null || !Number.isFinite(exclTarget) || exclTarget <= 0) return null
  const inclTarget = exclTarget + (netWorthInclHome - fireEligibleNetWorth)
  return Number.isFinite(inclTarget) && inclTarget > 0 ? inclTarget : null
}

/** Freedom time: how many years + months net worth covers expenses. */
export function computeFreedomTime(
  netWorth: number,
  effectiveYearlyExpenses: number,
): { years: number; months: number } {
  const totalMonths =
    effectiveYearlyExpenses > 0 ? (netWorth / effectiveYearlyExpenses) * 12 : 0
  const clamped = Math.max(0, totalMonths)
  return {
    years: Math.floor(clamped / 12),
    months: Math.floor(clamped % 12),
  }
}

/** Savings rate as percentage of income.
 *  savingsBudgetSpent: absolute amount spent on savings-type budgets (counted as saving, not expense). */
export function computeSavingsRate(
  monthlyIncome: number,
  monthlyExpenses: number,
  savingsBudgetSpent = 0,
): number {
  if (monthlyIncome <= 0) return 0
  return ((monthlyIncome - monthlyExpenses + savingsBudgetSpent) / monthlyIncome) * 100
}

/** Savings rate method used to determine the displayed rate. */
export type SavingsRateMethod = 'transaction' | 'estimate' | 'net_worth_delta'

/**
 * Alternative savings rate computed from net worth snapshots (delta method).
 * Used when budgetteren is not active — compares net worth change over time
 * relative to estimated monthly income.
 *
 * `opts.expectedAnnualAppreciation` (€/jaar): de verwachte koerswinst/rendement op
 * beleggingen over de periode. Vermogensgroei door koerswinst is GEEN sparen, dus
 * dat deel wordt van de delta afgetrokken voordat de quote wordt bepaald. Default 0
 * → byte-gelijk aan het oude gedrag.
 *
 * Returns null if insufficient data (need >= 2 snapshots spanning >= 28 days).
 */
export function computeSavingsRateFromNetWorthDelta(
  snapshots: { snapshot_date: string; net_worth: number }[],
  monthlyIncome: number,
  opts?: { expectedAnnualAppreciation?: number },
): { rate: number; months: number } | null {
  if (snapshots.length < 2 || monthlyIncome <= 0) return null

  const sorted = [...snapshots].sort((a, b) =>
    a.snapshot_date.localeCompare(b.snapshot_date),
  )

  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  const daysDiff =
    (new Date(last.snapshot_date).getTime() - new Date(first.snapshot_date).getTime()) /
    (1000 * 60 * 60 * 24)

  // Need at least ~1 month of data for a meaningful rate
  if (daysDiff < 28) return null

  const months = daysDiff / 30.44 // average days per month
  const deltaNetWorth = last.net_worth - first.net_worth
  // Koerswinst over de periode is geen sparen → eraf voor een eerlijker quote.
  const appreciation = (opts?.expectedAnnualAppreciation ?? 0) * (months / 12)
  const avgMonthlySaving = (deltaNetWorth - appreciation) / months
  const rate = (avgMonthlySaving / monthlyIncome) * 100

  return { rate: Math.round(rate * 10) / 10, months: Math.round(months) }
}

// ── Input: raw financial data from DB ────────────────────────

export interface FinancialInput {
  // Shared (used by both core metrics and horizon projections)
  totalAssets: number
  totalDebts: number
  monthlyIncome: number
  monthlyExpenses: number
  yearlyMustExpenses: number

  // Horizon-specific
  monthlyContributions: number       // sum of asset monthly_contributions
  dateOfBirth: string | null         // ISO date or null
  expectedReturn?: number            // annual decimal, default 0.07

  // Core-specific
  last12MonthsIncome?: number        // actual 12-month income (more accurate than monthly×12)
}

// ── Output: computed metrics ─────────────────────────────────

export type FinancialMetrics = {
  // Freedom timeline
  freedomPercentage: number
  freedomYears: number
  freedomMonths: number
  netWorth: number
  fireTarget: number
  expectedFireDate: string
  yearsToFire: number
  monthsToFire: number

  // KPIs
  daysWonPerMonth: number
  savingsRate: number
  freeDaysPerYear: number
  autonomyScore: string

  // Derived/annualized values
  /**
   * Best estimate of annual income, preferring actual 12-month history.
   * = last12MonthsIncome ?? (monthlyIncome × 12)
   * Contrast with yearlyIncome (local var): simple extrapolation = monthlyIncome × 12.
   */
  estimatedYearlyIncome: number
  yearlyMustExpenses: number
  yearlyExpenses: number
}

export function computeCoreData(
  input: FinancialInput,
  swrOverride?: number,
  strategyOptions?: {
    strategy?: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'
    yearsInRetirement?: number
    realReturn?: number
  },
): FinancialMetrics {
  const { monthlyIncome, monthlyExpenses, totalAssets, totalDebts, last12MonthsIncome, yearlyMustExpenses } = input
  const swr = swrOverride ?? resolveFireParams({}).effectiveSwr
  const yearlyIncome = monthlyIncome * 12
  const yearlyExpenses = monthlyExpenses * 12
  const effectiveYearlyExpenses = computeEffectiveExpenses(yearlyMustExpenses ?? 0, yearlyExpenses)
  const monthlySavings = monthlyIncome - monthlyExpenses
  const netWorth = totalAssets - totalDebts

  // FIRE calculations (shared primitives) — strategy-aware
  const fireTarget = computeFireTarget(effectiveYearlyExpenses, swr, strategyOptions)
  const freedomPercentage = computeFreedomPercentage(netWorth, fireTarget)
  const { years: freedomYears, months: freedomMonths } = computeFreedomTime(netWorth, effectiveYearlyExpenses)
  const savingsRate = computeSavingsRate(monthlyIncome, monthlyExpenses)

  // Days won per month (how many days of expenses covered by monthly savings)
  // dailyExpense = all expenses / 365 (used for daysWonPerMonth: general savings impact)
  const dailyExpense = monthlyExpenses > 0 ? yearlyExpenses / 365 : 0
  const daysWonPerMonth = dailyExpense > 0 ? Math.round(monthlySavings / dailyExpense) : 0

  // Free days per year (passive income from net worth at SWR / daily must expenses)
  // dailyMustExpense = essential expenses only / 365 (used for FIRE freedom-day calculations)
  // Falls back to dailyExpense when no essential budget data is available.
  // See also: DailyExpenseProvider (dailyExpenseRate) — transaction-history-based daily rate.
  const dailyMustExpense = effectiveYearlyExpenses > 0 ? effectiveYearlyExpenses / 365 : dailyExpense
  // JAAR-variant (canonieke helper hierboven): het quotiënt met een DAGtarief
  // levert dagen per jaar, dus hier hoort bewust géén /12.
  const passiveIncome = computePassiveIncomeAnnual(netWorth, swr)
  const freeDaysPerYear = dailyMustExpense > 0 ? Math.round(passiveIncome / dailyMustExpense) : 0

  // Expected FIRE date
  let yearsToFire = 0
  let monthsToFire = 0
  let expectedFireDate = ''
  if (monthlySavings > 0 && fireTarget > netWorth) {
    const annualReturn = DEFAULT_RETURN
    const monthlyReturn = annualReturn / 12
    let projected = netWorth
    let months = 0
    while (projected < fireTarget && months < 600) {
      projected = projected * (1 + monthlyReturn) + monthlySavings
      months++
    }
    yearsToFire = Math.floor(months / 12)
    monthsToFire = months % 12

    const fireDate = new Date()
    fireDate.setMonth(fireDate.getMonth() + months)
    expectedFireDate = fireDate.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
  } else if (netWorth >= fireTarget && fireTarget > 0) {
    expectedFireDate = 'Bereikt!'
  }

  // Autonomy score (A-F based on freedom %)
  let autonomyScore: string
  if (freedomPercentage >= 100) autonomyScore = 'A+'
  else if (freedomPercentage >= 75) autonomyScore = 'A'
  else if (freedomPercentage >= 50) autonomyScore = 'B'
  else if (freedomPercentage >= 25) autonomyScore = 'C'
  else if (freedomPercentage >= 10) autonomyScore = 'D'
  else autonomyScore = 'E'

  return {
    freedomPercentage,
    freedomYears,
    freedomMonths,
    netWorth,
    fireTarget,
    expectedFireDate,
    yearsToFire,
    monthsToFire,
    daysWonPerMonth,
    savingsRate,
    freeDaysPerYear,
    autonomyScore,
    estimatedYearlyIncome: last12MonthsIncome ?? yearlyIncome,
    yearlyMustExpenses: yearlyMustExpenses ?? 0,
    yearlyExpenses,
  }
}
