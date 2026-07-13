/**
 * resolveSavingsSource — canonieke spaarbron voor de FIRE-prognose.
 *
 * Spiegelt exact het getal dat het instellingenblok onderaan
 * /overzicht/cashflow toont (`components/overview/cashflow-instellingen-blok.tsx`):
 *
 *   - inkomen     = handmatig ? net_monthly_income × 12 : extrapolated jaarinkomen
 *   - spaarquote  = uitgaven-handmatig
 *                     ? (inkomen − (handmatige uitgaven − spaarbudget) + aflossing) / inkomen
 *                     : savingsRate6m  (incl. spaarbudgetten + schuldaflossing)
 *   - baseAnnualSavings = inkomen × spaarquote%
 *
 * Beide paden volgen dus dezelfde definitie (spaarbudgetten + aflossing tellen als
 * sparen). Op het handmatige pad zijn die correcties optioneel (default 0) en
 * geldt de aanname dat het handmatige uitgavenbedrag de VOLLEDIGE uitstroom is.
 *
 * Door precies dezelfde keuzeregel te gebruiken kan de prognose nooit
 * divergeren van wat de gebruiker op de cashflow-pagina ziet.
 */
import { type Debt, computeRenteAflossingsSplit } from '@/lib/debt-data'

export interface SavingsSourceInput {
  /** profiles.income_source — 'manual' wint over de berekende waarde. */
  incomeSource?: string | null
  /** profiles.expenses_source — 'manual' wint over de berekende waarde. */
  expensesSource?: string | null
  /** profiles.net_monthly_income — handmatige maandinkomen-override. */
  netMonthlyIncome: number
  /** Berekend (geëxtrapoleerd) jaarinkomen uit transacties. */
  estimatedAnnualIncome: number
  /** profiles.estimated_monthly_expenses — handmatige maanduitgaven-override. */
  estimatedMonthlyExpenses: number
  /** Canonieke 6-maands spaarquote (%) incl. spaarbudgetten + aflossing-correctie. */
  savingsRate6m: number
  /**
   * Maandelijkse schuldaflossing die als sparen telt (computeDebtAflossingMonthly).
   * Optioneel; default 0. Wordt op het HANDMATIGE pad bij het spaardeel opgeteld,
   * zodat dat pad dezelfde definitie volgt als het transactie-pad (savingsRate6m).
   */
  monthlyDebtAflossing?: number
  /**
   * Maandelijkse storting op spaarbudgetten (savings-type budgetten).
   * Optioneel; default 0. Wordt op het HANDMATIGE pad van de uitgaven afgetrokken
   * (telt als sparen, niet als uitgave), symmetrisch met het transactie-pad.
   */
  monthlySavingsContribution?: number
}

export interface SavingsSource {
  /** Effectief jaarinkomen (handmatig of berekend). */
  effectiveAnnualIncome: number
  /** Effectieve spaarquote in procenten. */
  effectiveSavingsRatePct: number
  /** Jaarlijks spaarbedrag = effectiveAnnualIncome × effectiveSavingsRatePct%. */
  baseAnnualSavings: number
}

/**
 * Maandelijkse schuldaflossing die meetelt als vermogensopbouw ("sparen").
 * Zelfde regels als de loaders en de check-in-route: alleen actieve schulden
 * met include_aflossing_in_savings, gewogen met net_worth_inclusion_pct.
 */
export function computeDebtAflossingMonthly(debts: Debt[]): number {
  let monthly = 0
  for (const d of debts) {
    if (!d.is_active || !d.include_aflossing_in_savings) continue
    const aflossing = d.custom_aflossing_amount != null
      ? Number(d.custom_aflossing_amount)
      : (computeRenteAflossingsSplit(d)?.currentAflossing ?? 0)
    monthly += aflossing * ((d.net_worth_inclusion_pct ?? 100) / 100)
  }
  return monthly
}

/**
 * Kern-formule van de 6-maands spaarquote (%):
 *   (inkomen − uitgaven + aflossing) / inkomen × 100
 *
 * De loaders (dashboard/horizon) voegen hier extrapolatie bij <6 maanden
 * data en een spaarbudget-term aan toe; dit is de gedeelde basis voor
 * call-sites die met rauwe 6-maands-aggregaten werken (check-in, what-if).
 */
export function savingsRateFromAggregates(
  income6m: number,
  expenses6m: number,
  debtAflossing6m: number,
): number {
  return income6m > 0 ? ((income6m - expenses6m + debtAflossing6m) / income6m) * 100 : 0
}

/**
 * Inverse van savingsRateFromAggregates: het maandelijkse spaarbedrag (€) dat bij
 * een gegeven spaarquote (%) en maandinkomen hoort — `inkomen × quote%`.
 *
 * Dé canonieke "quote → bedrag"-conversie zodat het getoonde spaarpercentage en
 * het getoonde €-bedrag ALTIJD op dezelfde grondslag staan (bedrag / inkomen × 100
 * == quote). Voorkomt dat een oppervlak (bv. de spaarquote-widget) naast de
 * canonieke quote een tweede, afwijkend huidige-maand-bedrag optelt.
 */
export function monthlySavingsFromRate(monthlyIncome: number, savingsRatePct: number): number {
  return monthlyIncome * (savingsRatePct / 100)
}

/**
 * Ruwe 6-maands aggregaten waaruit de canonieke spaarquote volgt. De loaders
 * (dashboard/horizon/core/lever-scores) leveren deze uit hun eigen queries; de
 * extrapolatie + `savingsRateFromAggregates` + profiel-fallback wonen HIER, zodat
 * er niet vier onderling-driftende kopieën van dat staartstuk bestaan.
 */
export interface SavingsRate6mAggregates {
  /** Ruwe (of <6m) inkomsten uit transacties — transfer-gefilterd. */
  income6m: number
  /** Ruwe (of <6m) uitgaven, absoluut — transfer-gefilterd. */
  expenses6m: number
  /** 6-maands stortingen op spaarbudgetten (telt als sparen, niet als uitgave). */
  savingsBudgetSpent6m: number
  /** 6-maands schuldaflossing (`computeDebtAflossingMonthly` × 6). */
  debtAflossing6m: number
  /** Aantal maanden werkelijke data (1–6) voor extrapolatie bij <6m historie. */
  dataMonths: number
  /**
   * Profiel-fallback bij een transactieloze gebruiker (aggregaat-quote = 0):
   * `(inkomen − uitgaven) / inkomen`, afgerond. Beide moeten > 0 zijn, anders
   * geen fallback. Optioneel — laat weg om GEEN profiel-fallback toe te passen
   * (dan blijft de quote de aggregaat-uitkomst, bv. de lichte sidebar-loader die
   * bij ontbrekende transactie-inkomsten bewust `null` toont).
   */
  fallbackMonthlyIncome?: number
  fallbackMonthlyExpenses?: number
}

export interface SavingsRate6mResult {
  /** Spaarquote (%) — 6-maands, incl. spaarbudget/aflossing-correctie + fallback. */
  savingsRate6m: number
  /**
   * De aggregaat-formule gaf 0 (geen bruikbare transactie-inkomsten) → true. Callers
   * gebruiken dit om een verdere fallback (net-worth-delta) te triggeren én om te
   * weten of het inkomen-anker het 6m-gemiddelde of het profiel-inkomen is.
   */
  isEstimate: boolean
  /** Geëxtrapoleerde 6m-inkomsten (= income6m bij ≥6m data). */
  extIncome6: number
  /** Geëxtrapoleerde 6m-uitgaven. */
  extExpenses6: number
  /** Geëxtrapoleerde 6m-spaarbudget-stortingen. */
  extSavingsBudget6: number
}

/**
 * Canonieke 6-maands spaarquote (%). Ééns geëxtraheerd uit de vier loaders die
 * dit staartstuk inline dupliceerden (dashboard/horizon/core/lever-scores):
 *   1. extrapoleer <6m data naar een 6-maands basis,
 *   2. `savingsRateFromAggregates(extInkomen, extUitgaven − extSpaarbudget, extAflossing)`,
 *   3. optionele profiel-fallback bij aggregaat = 0.
 *
 * Byte-identiek aan de vroegere inline-versies; verving GEEN semantiek, alleen de
 * plaats waar de formule woont ("consume, don't recompute").
 */
export function computeSavingsRate6m(agg: SavingsRate6mAggregates): SavingsRate6mResult {
  const dataMonths = Math.max(1, Math.min(6, agg.dataMonths))
  const extIncome6 = dataMonths < 6 ? (agg.income6m / dataMonths) * 6 : agg.income6m
  const extExpenses6 = dataMonths < 6 ? (agg.expenses6m / dataMonths) * 6 : agg.expenses6m
  const extSavingsBudget6 =
    dataMonths < 6 ? (agg.savingsBudgetSpent6m / dataMonths) * 6 : agg.savingsBudgetSpent6m

  const rate = savingsRateFromAggregates(extIncome6, extExpenses6 - extSavingsBudget6, agg.debtAflossing6m)
  const isEstimate = rate === 0

  let savingsRate6m = rate
  if (
    rate === 0 &&
    agg.fallbackMonthlyIncome != null &&
    agg.fallbackMonthlyIncome > 0 &&
    agg.fallbackMonthlyExpenses != null &&
    agg.fallbackMonthlyExpenses > 0
  ) {
    savingsRate6m = Math.round(
      ((agg.fallbackMonthlyIncome - agg.fallbackMonthlyExpenses) / agg.fallbackMonthlyIncome) * 100,
    )
  }

  return { savingsRate6m, isEstimate, extIncome6, extExpenses6, extSavingsBudget6 }
}

export function resolveSavingsSource(input: SavingsSourceInput): SavingsSource {
  const incomeManual = input.incomeSource === 'manual' && input.netMonthlyIncome > 0
  const effectiveAnnualIncome = incomeManual
    ? input.netMonthlyIncome * 12
    : input.estimatedAnnualIncome

  const effectiveMonthlyIncome = effectiveAnnualIncome / 12

  const expensesManual = input.expensesSource === 'manual'
  // Handmatig pad volgt dezelfde definitie als het transactie-pad: spaarbudgetten
  // van de uitgaven af, schuldaflossing erbij. Aanname: het handmatige
  // estimated_monthly_expenses is de VOLLEDIGE maandelijkse uitstroom (incl.
  // hypotheeklast en spaarstortingen) — de cashflow-UI maakt dat expliciet.
  // Met defaults 0 valt dit terug op de oude (inkomen − uitgaven)/inkomen.
  const monthlyAflossing = input.monthlyDebtAflossing ?? 0
  const monthlySavingsContribution = input.monthlySavingsContribution ?? 0
  const effectiveSavingsRatePct = expensesManual
    ? savingsRateFromAggregates(
        effectiveMonthlyIncome,
        input.estimatedMonthlyExpenses - monthlySavingsContribution,
        monthlyAflossing,
      )
    : input.savingsRate6m

  const baseAnnualSavings = effectiveAnnualIncome * (effectiveSavingsRatePct / 100)

  return { effectiveAnnualIncome, effectiveSavingsRatePct, baseAnnualSavings }
}
