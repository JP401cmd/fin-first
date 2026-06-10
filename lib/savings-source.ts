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
