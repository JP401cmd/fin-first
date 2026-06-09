/**
 * resolveSavingsSource — canonieke spaarbron voor de FIRE-prognose.
 *
 * Spiegelt exact het getal dat het instellingenblok onderaan
 * /overzicht/cashflow toont (`components/overview/cashflow-instellingen-blok.tsx`):
 *
 *   - inkomen     = handmatig ? net_monthly_income × 12 : extrapolated jaarinkomen
 *   - spaarquote  = uitgaven-handmatig
 *                     ? (inkomen − handmatige uitgaven) / inkomen
 *                     : savingsRate6m  (incl. spaarbudgetten + schuldaflossing)
 *   - baseAnnualSavings = inkomen × spaarquote%
 *
 * Door precies dezelfde keuzeregel te gebruiken kan de prognose nooit
 * divergeren van wat de gebruiker op de cashflow-pagina ziet.
 */

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
}

export interface SavingsSource {
  /** Effectief jaarinkomen (handmatig of berekend). */
  effectiveAnnualIncome: number
  /** Effectieve spaarquote in procenten. */
  effectiveSavingsRatePct: number
  /** Jaarlijks spaarbedrag = effectiveAnnualIncome × effectiveSavingsRatePct%. */
  baseAnnualSavings: number
}

export function resolveSavingsSource(input: SavingsSourceInput): SavingsSource {
  const incomeManual = input.incomeSource === 'manual' && input.netMonthlyIncome > 0
  const effectiveAnnualIncome = incomeManual
    ? input.netMonthlyIncome * 12
    : input.estimatedAnnualIncome

  const effectiveMonthlyIncome = effectiveAnnualIncome / 12

  const expensesManual = input.expensesSource === 'manual'
  const effectiveSavingsRatePct = expensesManual
    ? (effectiveMonthlyIncome > 0
        ? ((effectiveMonthlyIncome - input.estimatedMonthlyExpenses) / effectiveMonthlyIncome) * 100
        : 0)
    : input.savingsRate6m

  const baseAnnualSavings = effectiveAnnualIncome * (effectiveSavingsRatePct / 100)

  return { effectiveAnnualIncome, effectiveSavingsRatePct, baseAnnualSavings }
}
