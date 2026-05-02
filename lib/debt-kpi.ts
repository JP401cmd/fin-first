/**
 * Debt KPI berekeningen — pure functies per debt-type.
 *
 * Levert per schuld 1 of 2 KPI's voor de strip onder de naam/balans-row.
 * Categorie-aggregaten leven in `lib/category-kpi.ts`.
 *
 * Uitgangspunten:
 * - Server-safe (geen 'use client', geen DOM, geen hooks).
 * - Pure: zelfde input → zelfde output.
 * - Lege KPI = `undefined`; de strip filtert dat zelf weg.
 */
import {
  type Debt,
  type DebtType,
  REPAYMENT_TYPE_LABELS,
  amortizationSchedule,
  linearAmortization,
} from './debt-data'
import { formatCurrency } from './format'
import type { KpiPair, KpiValue } from './asset-kpi'

// ── Context ────────────────────────────────────────────────────

export interface DebtKpiContext {
  /**
   * Map van `debt.id` → marktwaarde van het gekoppelde asset (eigen huis).
   * Nodig voor LTV-berekening op hypotheken.
   */
  linkedAssetValueByDebtId?: Map<string, number>
  /** Referentiedatum voor looptijd-berekeningen — default `new Date()`. */
  now?: Date
}

// ── Format-helpers ─────────────────────────────────────────────

const NL = 'nl-NL'

function formatPercent(value: number, opts: { decimals?: number; signed?: boolean } = {}): string {
  const { decimals = 1, signed = false } = opts
  const formatted = value.toLocaleString(NL, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  if (signed && value > 0) return `+${formatted}%`
  return `${formatted}%`
}

function diffMonths(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  return Math.max(0, months)
}

/**
 * Resterende looptijd in maanden. Twee paden:
 * 1. Als `end_date` is gezet, gebruik kalendervergelijking — dat is wat de
 *    gebruiker zelf heeft ingevuld en moet dus leidend zijn.
 * 2. Anders projectie via amortisatie-schedule (balance + rente + maandlast).
 *    Aflossingsvrije schulden geven null terug — daar is geen einde te zien.
 */
function remainingMonths(debt: Debt, now: Date): number | null {
  if (debt.end_date) {
    const end = new Date(debt.end_date)
    const m = diffMonths(now, end)
    return m > 0 ? m : null
  }

  const balance = Number(debt.current_balance)
  const rate = Number(debt.interest_rate)
  const payment = Number(debt.monthly_payment)
  if (balance <= 0 || payment <= 0) return null

  const rt = debt.repayment_type ?? 'annuiteit'
  if (rt === 'aflossingsvrij') return null

  if (rt === 'lineair') {
    // Voor lineair willen we de resterende termijn — die volgt uit de huidige
    // balans gedeeld door het maandelijkse aflossingsbedrag (rente niet
    // meegerekend). We projecteren simpel met `linearAmortization` over
    // 600 maanden en pakken de eerste rij waar saldo 0 wordt.
    const sched = linearAmortization(balance, rate, 600, now)
    if (sched.length === 0) return null
    const last = sched[sched.length - 1]
    return last.balance <= 0.01 ? sched.length : null
  }

  // Annuïteit / default — gebruik amortizationSchedule
  const sched = amortizationSchedule(balance, rate, payment, now)
  if (sched.length === 0) return null
  const last = sched[sched.length - 1]
  return last.balance <= 0.01 ? sched.length : null
}

// ── Per-type implementaties ────────────────────────────────────

function kpiMortgage(debt: Debt, ctx: DebtKpiContext): KpiPair {
  // KPI 1 — LTV
  let primary: KpiValue | undefined
  const linkedValue = ctx.linkedAssetValueByDebtId?.get(debt.id)
  const balance = Number(debt.current_balance)
  if (linkedValue && linkedValue > 0 && balance > 0) {
    const ltv = (balance / linkedValue) * 100
    primary = {
      value: formatPercent(ltv, { decimals: 0 }),
      label: 'LTV',
      // Onder 80% is de gangbare grens voor beste hypotheekrente — pos.
      // Boven 100% (onderwater) is risico — neg.
      tone: ltv > 100 ? 'neg' : ltv < 80 ? 'pos' : 'neutral',
    }
  }

  // KPI 2 — resterende looptijd in jaren
  let secondary: KpiValue | undefined
  const now = ctx.now ?? new Date()
  const months = remainingMonths(debt, now)
  if (months != null && months > 0) {
    const years = Math.round(months / 12)
    if (years > 0) {
      secondary = { value: `${years} jr`, label: 'resterend', tone: 'neutral' }
    }
  }
  return { primary, secondary }
}

function kpiSimpleRateAndTerm(debt: Debt, ctx: DebtKpiContext): KpiPair {
  // Gedeelde shape voor personal_loan, car_loan, dga_schuld, other —
  // KPI 1 = rente, KPI 2 = resterende looptijd in maanden.
  const rate = Number(debt.interest_rate)
  const primary: KpiValue | undefined = isFinite(rate) && rate > 0
    ? { value: formatPercent(rate, { decimals: 1 }), label: 'rente', tone: 'neutral' }
    : undefined

  let secondary: KpiValue | undefined
  const now = ctx.now ?? new Date()
  const months = remainingMonths(debt, now)
  if (months != null && months > 0) {
    secondary = { value: `${months} mnd`, label: 'resterend', tone: 'neutral' }
  }
  return { primary, secondary }
}

function kpiStudentLoan(debt: Debt, _ctx: DebtKpiContext): KpiPair {
  const rate = Number(debt.interest_rate)
  const monthly = Number(debt.monthly_payment)
  return {
    primary: isFinite(rate) && rate >= 0
      ? { value: formatPercent(rate, { decimals: 2 }), label: 'rente', tone: 'neutral' }
      : undefined,
    secondary: monthly > 0
      ? { value: `${formatCurrency(monthly)}/mnd`, tone: 'neutral' }
      : undefined,
  }
}

function kpiCreditCard(debt: Debt, _ctx: DebtKpiContext): KpiPair {
  const balance = Number(debt.current_balance)
  const limit = Number(debt.credit_limit)
  const rate = Number(debt.interest_rate)

  // KPI 1 — utilization (% van credit limit)
  let primary: KpiValue | undefined
  if (limit > 0 && balance >= 0) {
    const utilization = (balance / limit) * 100
    primary = {
      value: formatPercent(utilization, { decimals: 0 }),
      label: 'benutting',
      // <30% = goed (FICO best practice), <10% = ideaal, >50% = waarschuwing.
      tone: utilization < 30 ? 'pos' : utilization < 70 ? 'neutral' : 'neg',
    }
  }

  // KPI 2 — rente
  const secondary: KpiValue | undefined = isFinite(rate) && rate > 0
    ? { value: formatPercent(rate, { decimals: 1 }), label: 'rente', tone: 'neutral' }
    : undefined

  return { primary, secondary }
}

function kpiBelastingschuld(debt: Debt, _ctx: DebtKpiContext): KpiPair {
  // KPI 1 — belastingjaar
  const primary: KpiValue | undefined = debt.tax_year
    ? { value: String(debt.tax_year), label: 'jaar', tone: 'neutral' }
    : undefined

  // KPI 2 — heeft betalingsregeling?
  const secondary: KpiValue = debt.has_payment_plan
    ? { value: 'Regeling', tone: 'pos' }
    : { value: 'Geen regeling', tone: 'neg' }

  return { primary, secondary }
}

function kpiPaymentPlan(debt: Debt, ctx: DebtKpiContext): KpiPair {
  // KPI 1 — resterende looptijd in maanden
  let primary: KpiValue | undefined
  const now = ctx.now ?? new Date()
  const months = remainingMonths(debt, now)
  if (months != null && months > 0) {
    primary = { value: `${months} mnd`, label: 'resterend', tone: 'neutral' }
  }

  // KPI 2 — maandlast
  const monthly = Number(debt.monthly_payment)
  const secondary: KpiValue | undefined = monthly > 0
    ? { value: `${formatCurrency(monthly)}/mnd`, tone: 'neutral' }
    : undefined

  return { primary, secondary }
}

function kpiFamilielening(debt: Debt, _ctx: DebtKpiContext): KpiPair {
  // KPI 1 — heeft schriftelijke afspraak?
  const primary: KpiValue = debt.has_written_agreement
    ? { value: 'Schriftelijk', tone: 'pos' }
    : { value: 'Mondeling', tone: 'neg' }

  // KPI 2 — rente, alleen als > 0 (vaak rentevrij bij familie)
  const rate = Number(debt.interest_rate)
  const secondary: KpiValue | undefined = isFinite(rate) && rate > 0
    ? { value: formatPercent(rate, { decimals: 1 }), label: 'rente', tone: 'neutral' }
    : undefined

  return { primary, secondary }
}

function kpiDgaSchuld(debt: Debt, _ctx: DebtKpiContext): KpiPair {
  const rate = Number(debt.interest_rate)
  const primary: KpiValue | undefined = isFinite(rate) && rate > 0
    ? { value: formatPercent(rate, { decimals: 1 }), label: 'rente', tone: 'neutral' }
    : undefined

  // KPI 2 — aflossingstype label
  const secondary: KpiValue | undefined = debt.repayment_type
    ? { value: REPAYMENT_TYPE_LABELS[debt.repayment_type], tone: 'neutral' }
    : undefined

  return { primary, secondary }
}

function kpiOther(debt: Debt, _ctx: DebtKpiContext): KpiPair {
  // Generieke fallback — rente + maandlast.
  const rate = Number(debt.interest_rate)
  const monthly = Number(debt.monthly_payment)
  return {
    primary: isFinite(rate) && rate > 0
      ? { value: formatPercent(rate, { decimals: 1 }), label: 'rente', tone: 'neutral' }
      : undefined,
    secondary: monthly > 0
      ? { value: `${formatCurrency(monthly)}/mnd`, tone: 'neutral' }
      : undefined,
  }
}

// ── Public API ─────────────────────────────────────────────────

export function computeDebtKpi(debt: Debt, ctx: DebtKpiContext = {}): KpiPair {
  const dispatch: Record<DebtType, (d: Debt, c: DebtKpiContext) => KpiPair> = {
    mortgage: kpiMortgage,
    personal_loan: kpiSimpleRateAndTerm,
    student_loan: kpiStudentLoan,
    car_loan: kpiSimpleRateAndTerm,
    credit_card: kpiCreditCard,
    revolving_credit: kpiCreditCard,
    payment_plan: kpiPaymentPlan,
    belastingschuld: kpiBelastingschuld,
    familielening: kpiFamilielening,
    dga_schuld: kpiDgaSchuld,
    other: kpiOther,
  }
  const fn = dispatch[debt.debt_type]
  return fn ? fn(debt, ctx) : {}
}
