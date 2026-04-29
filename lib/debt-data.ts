/**
 * Debt types, default seed data, and financial calculations
 * (amortization, snowball, avalanche, projections).
 */

// ── Types ────────────────────────────────────────────────────

export type DebtType =
  | 'mortgage'
  | 'personal_loan'
  | 'student_loan'
  | 'car_loan'
  | 'credit_card'
  | 'revolving_credit'
  | 'payment_plan'
  | 'belastingschuld'
  | 'familielening'
  | 'dga_schuld'
  | 'other'

export type RepaymentType = 'aflossingsvrij' | 'annuiteit' | 'lineair'

export type MortgageSubtype = 'annuiteit' | 'lineair' | 'aflossingsvrij' | 'spaarhypotheek' | 'beleggingshypotheek'
export type StudentLoanSubtype = 'oud_stelsel' | 'nieuw_stelsel' | 'sf35'
export type PersonalLoanSubtype = 'aflopend' | 'doorlopend'
export type CreditCardSubtype = 'regulier' | 'charge_card'
export type RevolvingCreditSubtype = 'doorlopend_krediet' | 'roodstand'

export type BelastingschuldSubtype = 'inkomstenbelasting' | 'voorlopige_aanslag' | 'box3_nabetaling' | 'btw' | 'overig_belasting'
export type FamilieleningSubtype = 'ouders' | 'familie' | 'vrienden' | 'overig_onderhand'

export type DebtSubtype =
  | MortgageSubtype
  | StudentLoanSubtype
  | PersonalLoanSubtype
  | CreditCardSubtype
  | RevolvingCreditSubtype
  | BelastingschuldSubtype
  | FamilieleningSubtype

export interface Debt {
  id: string
  user_id: string
  name: string
  debt_type: DebtType
  original_amount: number
  current_balance: number
  interest_rate: number // annual %
  minimum_payment: number
  monthly_payment: number
  start_date: string
  end_date: string | null
  creditor: string | null
  notes: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // Type-specific fields
  subtype: string | null
  is_tax_deductible: boolean | null
  fixed_rate_end_date: string | null
  nhg: boolean | null
  linked_asset_id: string | null
  credit_limit: number | null
  repayment_type: RepaymentType | null
  draagkrachtmeting_date: string | null
  // Belastingschuld fields
  tax_year: number | null
  has_payment_plan: boolean
  // Familielening fields
  has_written_agreement: boolean
  // Household fields
  ownership: 'personal' | 'shared'
  household_id: string | null
  partner_split_pct: number | null // 0–100, per-debt split override (null = use household default)
  // Net worth inclusion
  net_worth_inclusion_pct: number // 0–100, default 100
  // Aflossing in spaarquote
  include_aflossing_in_savings: boolean
  custom_aflossing_amount: number | null // null = berekend, getal = eigen bedrag p/m
  // ── App-koppeling (zie components/core/category-deepening-registry.ts) ──
  // Aflosstrategie-app (en Hypotheekplanner voor mortgages) tracken een
  // schuld op basis van deze boolean. Default false zodat bestaande
  // gebruikers geen app-tracking krijgen zonder dat ze die hebben geactiveerd.
  has_strategy_tracking: boolean
}

export const DEBT_TYPE_LABELS: Record<DebtType, string> = {
  mortgage: 'Hypotheek',
  personal_loan: 'Persoonlijke lening',
  student_loan: 'Studielening',
  car_loan: 'Autolening',
  credit_card: 'Creditcard',
  revolving_credit: 'Doorlopend krediet',
  payment_plan: 'Afbetalingsregeling',
  belastingschuld: 'Belastingschuld',
  familielening: 'Familielening',
  dga_schuld: 'DGA-schuld aan eigen BV',
  other: 'Overig',
}

export const DEBT_TYPE_ICONS: Record<DebtType, string> = {
  mortgage: 'Building',
  personal_loan: 'Banknote',
  student_loan: 'GraduationCap',
  car_loan: 'Car',
  credit_card: 'CreditCard',
  revolving_credit: 'Repeat',
  payment_plan: 'Clock',
  belastingschuld: 'Receipt',
  familielening: 'Users',
  dga_schuld: 'Briefcase',
  other: 'MoreHorizontal',
}

/**
 * Kleur-palet voor schuld-typen — monochroom semantisch rood (`--negative`)
 * met intensiteit-laddertje. Differentiatie loopt langs de **looptijd /
 * formaliteit-as**: lange-termijn formele schulden (hypotheek, fiscaal,
 * DGA) staan in de diepste tint, korte-termijn persoonlijk krediet
 * (lening, creditcard) in de medium-tint, en onderhands/overig in de
 * zachtste tint.
 *
 * Eén tegenpool-tint t.o.v. de Kern-bruin asset-laddertje houdt de Kern-
 * pagina visueel rustig en consistent. De kleur volgt het bestaande
 * `--negative` token (oklch 0.50 0.09 25); we variëren alleen de lightness.
 *
 * Wordt hergebruikt in `opbouw-composition-chart.tsx` voor de negatieve
 * gestapelde bars onder de nullijn.
 */
export const DEBT_TYPE_COLORS: Record<DebtType, string> = {
  // Klasse I — lange termijn / formeel
  mortgage: 'oklch(0.50 0.09 25)',
  dga_schuld: 'oklch(0.50 0.09 25)',
  belastingschuld: 'oklch(0.50 0.09 25)',
  // Klasse II — korte termijn / consumptief krediet
  personal_loan: 'oklch(0.58 0.09 25)',
  student_loan: 'oklch(0.58 0.09 25)',
  car_loan: 'oklch(0.58 0.09 25)',
  credit_card: 'oklch(0.58 0.09 25)',
  revolving_credit: 'oklch(0.58 0.09 25)',
  // Klasse III — onderhands / overig
  payment_plan: 'oklch(0.66 0.07 25)',
  familielening: 'oklch(0.66 0.07 25)',
  other: 'oklch(0.71 0.05 25)',
}

// ── Subtypes ─────────────────────────────────────────────────

export const DEBT_SUBTYPE_LABELS: Partial<Record<DebtType, Record<string, string>>> = {
  mortgage: {
    annuiteit: 'Annuiteit',
    lineair: 'Lineair',
    aflossingsvrij: 'Aflossingsvrij',
    spaarhypotheek: 'Spaarhypotheek',
    beleggingshypotheek: 'Beleggingshypotheek',
  },
  student_loan: {
    oud_stelsel: 'Oud stelsel (voor 2018)',
    nieuw_stelsel: 'Nieuw stelsel (na 2018)',
    sf35: 'SF35 (voor 2012)',
  },
  personal_loan: {
    aflopend: 'Aflopend',
    doorlopend: 'Doorlopend',
  },
  credit_card: {
    regulier: 'Regulier',
    charge_card: 'Charge card',
  },
  revolving_credit: {
    doorlopend_krediet: 'Doorlopend krediet',
    roodstand: 'Roodstand',
  },
  belastingschuld: {
    inkomstenbelasting: 'Inkomstenbelasting aanslag',
    voorlopige_aanslag: 'Voorlopige aanslag',
    box3_nabetaling: 'Box 3 nabetaling',
    btw: 'BTW-schuld',
    overig_belasting: 'Overige belastingschuld',
  },
  familielening: {
    ouders: 'Lening van ouders',
    familie: 'Lening van overige familie',
    vrienden: 'Lening van vrienden',
    overig_onderhand: 'Overige onderhandse lening',
  },
}

export const REPAYMENT_TYPE_LABELS: Record<RepaymentType, string> = {
  aflossingsvrij: 'Aflossingsvrij',
  annuiteit: 'Annuiteit',
  lineair: 'Lineair',
}

export const DEBT_SUBTYPE_DEFAULTS: Record<string, Partial<{
  repayment_type: RepaymentType
  is_tax_deductible: boolean
}>> = {
  // Mortgage subtypes
  annuiteit: { repayment_type: 'annuiteit', is_tax_deductible: true },
  lineair: { repayment_type: 'lineair', is_tax_deductible: true },
  aflossingsvrij: { repayment_type: 'aflossingsvrij', is_tax_deductible: false },
  spaarhypotheek: { repayment_type: 'aflossingsvrij', is_tax_deductible: true },
  beleggingshypotheek: { repayment_type: 'aflossingsvrij', is_tax_deductible: true },
  // Familielening subtypes
  ouders: { repayment_type: 'lineair' },
  familie: { repayment_type: 'lineair' },
  vrienden: { repayment_type: 'lineair' },
  overig_onderhand: { repayment_type: 'lineair' },
}

/** Which type-specific fields to show per debt_type */
export const DEBT_TYPE_FIELDS: Record<DebtType, string[]> = {
  mortgage: ['subtype', 'repayment_type', 'is_tax_deductible', 'fixed_rate_end_date', 'nhg', 'linked_asset_id'],
  student_loan: ['subtype', 'draagkrachtmeting_date'],
  personal_loan: ['subtype'],
  credit_card: ['subtype', 'credit_limit'],
  revolving_credit: ['subtype', 'credit_limit'],
  car_loan: [],
  payment_plan: [],
  belastingschuld: ['subtype', 'tax_year', 'has_payment_plan'],
  familielening: ['subtype', 'repayment_type', 'has_written_agreement'],
  dga_schuld: ['linked_asset_id', 'repayment_type'],
  other: [],
}

// ── Amortization calculation ─────────────────────────────────

export interface AmortizationRow {
  month: number
  date: string
  payment: number
  principal: number
  interest: number
  balance: number
}

/**
 * Generate a full amortization schedule for a single debt.
 * Returns month-by-month breakdown until balance reaches 0 (max 600 months = 50 years).
 */
export function amortizationSchedule(
  balance: number,
  annualRate: number,
  monthlyPayment: number,
  startDate: Date = new Date(),
): AmortizationRow[] {
  if (balance <= 0 || monthlyPayment <= 0) return []

  const monthlyRate = annualRate / 100 / 12
  const rows: AmortizationRow[] = []
  let remaining = balance
  let month = 0

  while (remaining > 0.01 && month < 600) {
    month++
    const interestCharge = remaining * monthlyRate
    const payment = Math.min(monthlyPayment, remaining + interestCharge)
    const principal = payment - interestCharge
    remaining = Math.max(0, remaining - principal)

    const date = new Date(startDate)
    date.setMonth(date.getMonth() + month)

    rows.push({
      month,
      date: date.toISOString().split('T')[0],
      payment: Math.round(payment * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interestCharge * 100) / 100,
      balance: Math.round(remaining * 100) / 100,
    })
  }

  return rows
}

/**
 * Generate a linear amortization schedule.
 * Fixed monthly principal + declining interest = declining total payment.
 */
export function linearAmortization(
  balance: number,
  annualRate: number,
  termMonths: number,
  startDate: Date = new Date(),
): AmortizationRow[] {
  if (balance <= 0 || termMonths <= 0) return []

  const monthlyRate = annualRate / 100 / 12
  const fixedPrincipal = balance / termMonths
  const rows: AmortizationRow[] = []
  let remaining = balance

  for (let month = 1; month <= termMonths && remaining > 0.01; month++) {
    const interestCharge = remaining * monthlyRate
    const principal = Math.min(fixedPrincipal, remaining)
    const payment = principal + interestCharge
    remaining = Math.max(0, remaining - principal)

    const date = new Date(startDate)
    date.setMonth(date.getMonth() + month)

    rows.push({
      month,
      date: date.toISOString().split('T')[0],
      payment: Math.round(payment * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interestCharge * 100) / 100,
      balance: Math.round(remaining * 100) / 100,
    })
  }

  return rows
}

/**
 * Generate an interest-only (aflossingsvrij) schedule.
 * Only interest is paid; balance stays the same until end date.
 */
export function interestOnlySchedule(
  balance: number,
  annualRate: number,
  months: number,
  startDate: Date = new Date(),
): AmortizationRow[] {
  if (balance <= 0 || months <= 0) return []

  const monthlyRate = annualRate / 100 / 12
  const rows: AmortizationRow[] = []

  for (let month = 1; month <= months; month++) {
    const interestCharge = balance * monthlyRate

    const date = new Date(startDate)
    date.setMonth(date.getMonth() + month)

    rows.push({
      month,
      date: date.toISOString().split('T')[0],
      payment: Math.round(interestCharge * 100) / 100,
      principal: 0,
      interest: Math.round(interestCharge * 100) / 100,
      balance: Math.round(balance * 100) / 100,
    })
  }

  return rows
}

// ── Verwachte restschuld ─────────────────────────────────────

export interface ExpectedBalance {
  expectedBalance: number
  monthsElapsed: number
  totalTermMonths: number
  totalInterestPaid: number
}

/**
 * Bereken de verwachte restschuld op basis van het aflossingsschema
 * vanaf de startdatum, ervan uitgaande dat alle maandbetalingen zijn gedaan
 * zonder extra aflossingen.
 * Returnt null als onvoldoende data (geen original_amount, start_date of end_date).
 */
export function computeExpectedBalance(debt: Debt): ExpectedBalance | null {
  const original = Number(debt.original_amount)
  const rate = Number(debt.interest_rate)
  if (original <= 0 || !debt.start_date || !debt.end_date) return null

  const startDate = new Date(debt.start_date)
  const endDate = new Date(debt.end_date)
  const now = new Date()

  const totalTermMonths = Math.max(1, Math.round(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  ))
  const monthsElapsed = Math.max(0, Math.round(
    (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  ))

  // Niet gestart of voorbij einddatum
  if (monthsElapsed <= 0) {
    return { expectedBalance: original, monthsElapsed: 0, totalTermMonths, totalInterestPaid: 0 }
  }

  const rt = debt.repayment_type ?? 'annuiteit'

  // Aflossingsvrij: saldo blijft gelijk
  if (rt === 'aflossingsvrij') {
    const monthlyRate = rate / 100 / 12
    return {
      expectedBalance: original,
      monthsElapsed,
      totalTermMonths,
      totalInterestPaid: Math.round(original * monthlyRate * monthsElapsed * 100) / 100,
    }
  }

  // Lineair
  if (rt === 'lineair') {
    const elapsed = Math.min(monthsElapsed, totalTermMonths)
    const schedule = linearAmortization(original, rate, totalTermMonths, startDate)
    const row = schedule[elapsed - 1]
    const totalInterest = schedule.slice(0, elapsed).reduce((s, r) => s + r.interest, 0)
    return {
      expectedBalance: row ? row.balance : 0,
      monthsElapsed: elapsed,
      totalTermMonths,
      totalInterestPaid: Math.round(totalInterest * 100) / 100,
    }
  }

  // Annuïteit (default)
  const monthlyRate = rate / 100 / 12
  let pmt: number
  if (rate === 0) {
    pmt = original / totalTermMonths
  } else {
    const factor = Math.pow(1 + monthlyRate, totalTermMonths)
    pmt = original * (monthlyRate * factor) / (factor - 1)
  }
  const elapsed = Math.min(monthsElapsed, totalTermMonths)
  const schedule = amortizationSchedule(original, rate, pmt, startDate)
  const row = schedule[elapsed - 1]
  const totalInterest = schedule.slice(0, elapsed).reduce((s, r) => s + r.interest, 0)
  return {
    expectedBalance: row ? row.balance : 0,
    monthsElapsed: elapsed,
    totalTermMonths,
    totalInterestPaid: Math.round(totalInterest * 100) / 100,
  }
}

// ── Rente / aflossing split ──────────────────────────────────

export interface RenteAflossingsSplit {
  monthlyPayment: number
  currentRente: number
  currentAflossing: number
  rentePercentage: number   // 0-100
  remainingMonths: number
}

/**
 * Bereken de maandelijkse rente/aflossing-uitsplitsing voor een schuld.
 * Afleiding op basis van current_balance, interest_rate, repayment_type en dates.
 * Returnt null als onvoldoende data beschikbaar is.
 */
export function computeRenteAflossingsSplit(debt: Debt): RenteAflossingsSplit | null {
  const balance = Number(debt.current_balance)
  const rate = Number(debt.interest_rate)
  const payment = Number(debt.monthly_payment)

  if (balance <= 0) return null

  const monthlyRate = rate / 100 / 12
  const currentRente = balance * monthlyRate

  // Aflossingsvrij: 100% rente, 0% aflossing
  if (debt.repayment_type === 'aflossingsvrij') {
    const monthlyPayment = Math.round(currentRente * 100) / 100
    return {
      monthlyPayment,
      currentRente: monthlyPayment,
      currentAflossing: 0,
      rentePercentage: 100,
      remainingMonths: debt.end_date
        ? Math.max(1, Math.round((new Date(debt.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44)))
        : 360,
    }
  }

  // Bereken resterende maanden uit einddatum
  let remainingMonths: number | null = null
  if (debt.end_date) {
    remainingMonths = Math.max(1, Math.round(
      (new Date(debt.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44),
    ))
  }

  // Lineair: vaste aflossing per maand
  if (debt.repayment_type === 'lineair') {
    if (!remainingMonths && payment <= 0) return null
    const n = remainingMonths ?? (payment > currentRente ? Math.ceil(balance / (payment - currentRente)) : null)
    if (!n || n <= 0) return null
    const aflossing = Math.round((balance / n) * 100) / 100
    const rente = Math.round(currentRente * 100) / 100
    const monthlyPayment = Math.round((aflossing + rente) * 100) / 100
    return {
      monthlyPayment,
      currentRente: rente,
      currentAflossing: aflossing,
      rentePercentage: monthlyPayment > 0 ? Math.round((rente / monthlyPayment) * 10000) / 100 : 0,
      remainingMonths: n,
    }
  }

  // Annuïteit (default): PMT formule of fallback op monthly_payment
  let monthlyPayment: number
  if (remainingMonths && rate > 0) {
    // PMT = P × r(1+r)^n / ((1+r)^n - 1)
    const factor = Math.pow(1 + monthlyRate, remainingMonths)
    monthlyPayment = balance * (monthlyRate * factor) / (factor - 1)
  } else if (remainingMonths && rate === 0) {
    monthlyPayment = balance / remainingMonths
  } else if (payment > 0) {
    // Fallback: gebruik opgeslagen monthly_payment
    monthlyPayment = payment
  } else {
    return null
  }

  monthlyPayment = Math.round(monthlyPayment * 100) / 100
  const rente = Math.round(currentRente * 100) / 100
  const aflossing = Math.round(Math.max(0, monthlyPayment - rente) * 100) / 100

  return {
    monthlyPayment,
    currentRente: rente,
    currentAflossing: aflossing,
    rentePercentage: monthlyPayment > 0 ? Math.round((rente / monthlyPayment) * 10000) / 100 : 0,
    remainingMonths: remainingMonths ?? (payment > currentRente
      ? Math.ceil(Math.log(payment / (payment - balance * monthlyRate)) / Math.log(1 + monthlyRate))
      : 0),
  }
}

/**
 * Calculate months until payoff and total interest for a single debt.
 * Branches on repayment_type for different amortization models.
 */
export function debtProjection(debt: Debt): {
  monthsToPayoff: number
  totalInterest: number
  payoffDate: string
  isPayable: boolean
} {
  const balance = Number(debt.current_balance)
  const rate = Number(debt.interest_rate)
  const payment = Number(debt.monthly_payment)
  const repaymentType = debt.repayment_type

  if (balance <= 0) {
    return { monthsToPayoff: 0, totalInterest: 0, payoffDate: '', isPayable: true }
  }

  // Interest-only (aflossingsvrij): balance never decreases
  if (repaymentType === 'aflossingsvrij') {
    // Calculate end date based on debt end_date, default 360 months (30 years)
    let months = 360
    if (debt.end_date) {
      const end = new Date(debt.end_date)
      const now = new Date()
      months = Math.max(1, Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    }
    const schedule = interestOnlySchedule(balance, rate, months)
    const totalInterest = schedule.reduce((sum, r) => sum + r.interest, 0)
    const lastRow = schedule[schedule.length - 1]
    return {
      monthsToPayoff: months,
      totalInterest: Math.round(totalInterest * 100) / 100,
      payoffDate: lastRow?.date ?? '',
      isPayable: true,
    }
  }

  // Linear: fixed principal, calculate term from payment
  if (repaymentType === 'lineair') {
    const monthlyRate = rate / 100 / 12
    // For linear, first month interest is highest
    const firstInterest = balance * monthlyRate
    // Approximate principal per month from monthly_payment - average interest
    const approxPrincipal = payment - (balance * monthlyRate / 2)
    if (approxPrincipal <= 0) {
      return { monthsToPayoff: Infinity, totalInterest: Infinity, payoffDate: '', isPayable: false }
    }
    const termMonths = Math.ceil(balance / approxPrincipal)
    const schedule = linearAmortization(balance, rate, termMonths)
    const totalInterest = schedule.reduce((sum, r) => sum + r.interest, 0)
    const lastRow = schedule[schedule.length - 1]
    return {
      monthsToPayoff: schedule.length,
      totalInterest: Math.round(totalInterest * 100) / 100,
      payoffDate: lastRow?.date ?? '',
      isPayable: true,
    }
  }

  // Default: annuity (existing logic)
  // Check if payment covers monthly interest
  const monthlyInterest = balance * (rate / 100 / 12)
  if (payment <= monthlyInterest) {
    return { monthsToPayoff: Infinity, totalInterest: Infinity, payoffDate: '', isPayable: false }
  }

  const schedule = amortizationSchedule(balance, rate, payment)
  const totalInterest = schedule.reduce((sum, r) => sum + r.interest, 0)
  const lastRow = schedule[schedule.length - 1]

  return {
    monthsToPayoff: schedule.length,
    totalInterest: Math.round(totalInterest * 100) / 100,
    payoffDate: lastRow?.date ?? '',
    isPayable: true,
  }
}

// ── Payoff strategies ────────────────────────────────────────

export type PayoffStrategy = 'snowball' | 'avalanche' | 'current'

export interface StrategyMonth {
  month: number
  date: string
  debts: {
    id: string
    name: string
    payment: number
    interest: number
    principal: number
    balance: number
  }[]
  totalPayment: number
  totalBalance: number
}

/**
 * Simulate multi-debt payoff with a given strategy and optional extra monthly payment.
 * - snowball: target smallest balance first
 * - avalanche: target highest interest rate first
 * - current: just use each debt's own monthly_payment
 */
export function simulatePayoff(
  debts: Debt[],
  strategy: PayoffStrategy,
  extraMonthly = 0,
): StrategyMonth[] {
  // Track which debts are interest-only (aflossingsvrij) — excluded from targeting
  const interestOnlyIds = new Set(
    debts.filter((d) => d.repayment_type === 'aflossingsvrij').map((d) => d.id),
  )

  const active = debts
    .filter((d) => Number(d.current_balance) > 0 && d.is_active)
    .map((d) => ({
      id: d.id,
      name: d.name,
      balance: Number(d.current_balance),
      rate: Number(d.interest_rate) / 100 / 12,
      minPayment: Number(d.minimum_payment),
      monthlyPayment: Number(d.monthly_payment),
      isInterestOnly: interestOnlyIds.has(d.id),
    }))

  if (active.length === 0) return []

  const totalMinPayments = active.reduce((s, d) => s + d.minPayment, 0)
  const totalBudget = strategy === 'current'
    ? active.reduce((s, d) => s + d.monthlyPayment, 0) + extraMonthly
    : totalMinPayments + extraMonthly

  const results: StrategyMonth[] = []
  const now = new Date()
  let month = 0

  while (active.some((d) => d.balance > 0.01) && month < 600) {
    month++
    const date = new Date(now)
    date.setMonth(date.getMonth() + month)

    // Sort for targeting: snowball by balance, avalanche by rate (descending)
    // Exclude interest-only debts from targeting
    let sorted = [...active.filter((d) => d.balance > 0.01 && !d.isInterestOnly)]
    if (strategy === 'snowball') {
      sorted.sort((a, b) => a.balance - b.balance)
    } else if (strategy === 'avalanche') {
      sorted.sort((a, b) => b.rate - a.rate)
    }

    // Calculate interest first
    const monthDebts: StrategyMonth['debts'] = []
    let budgetLeft = totalBudget

    for (const d of active) {
      if (d.balance <= 0.01) {
        monthDebts.push({
          id: d.id,
          name: d.name,
          payment: 0,
          interest: 0,
          principal: 0,
          balance: 0,
        })
        continue
      }

      const interest = d.balance * d.rate

      // Interest-only debts: pay only interest, no principal reduction
      if (d.isInterestOnly) {
        monthDebts.push({
          id: d.id,
          name: d.name,
          payment: interest,
          interest,
          principal: 0,
          balance: d.balance,
        })
        budgetLeft -= interest
        continue
      }

      const minPay = strategy === 'current'
        ? Math.min(d.monthlyPayment, d.balance + interest)
        : Math.min(d.minPayment, d.balance + interest)

      monthDebts.push({
        id: d.id,
        name: d.name,
        payment: minPay,
        interest,
        principal: minPay - interest,
        balance: d.balance - (minPay - interest),
      })

      budgetLeft -= minPay
    }

    // Apply extra to target debt (snowball/avalanche only)
    if (strategy !== 'current' && budgetLeft > 0) {
      for (const target of sorted) {
        const entry = monthDebts.find((m) => m.id === target.id)
        if (!entry || entry.balance <= 0.01) continue

        const extraPay = Math.min(budgetLeft, entry.balance)
        entry.payment += extraPay
        entry.principal += extraPay
        entry.balance -= extraPay
        budgetLeft -= extraPay
        if (budgetLeft <= 0.01) break
      }
    }

    // Update working balances
    for (const entry of monthDebts) {
      const d = active.find((a) => a.id === entry.id)
      if (d) d.balance = Math.max(0, entry.balance)
    }

    results.push({
      month,
      date: date.toISOString().split('T')[0],
      debts: monthDebts.map((d) => ({
        ...d,
        payment: Math.round(d.payment * 100) / 100,
        interest: Math.round(d.interest * 100) / 100,
        principal: Math.round(d.principal * 100) / 100,
        balance: Math.round(d.balance * 100) / 100,
      })),
      totalPayment: Math.round(monthDebts.reduce((s, d) => s + d.payment, 0) * 100) / 100,
      totalBalance: Math.round(monthDebts.reduce((s, d) => s + d.balance, 0) * 100) / 100,
    })
  }

  return results
}

/**
 * Summary stats for a payoff simulation.
 */
export function payoffSummary(months: StrategyMonth[]): {
  totalMonths: number
  totalInterest: number
  totalPaid: number
  payoffDate: string
} {
  if (months.length === 0) {
    return { totalMonths: 0, totalInterest: 0, totalPaid: 0, payoffDate: '' }
  }

  const totalInterest = months.reduce(
    (sum, m) => sum + m.debts.reduce((s, d) => s + d.interest, 0),
    0,
  )
  const totalPaid = months.reduce((sum, m) => sum + m.totalPayment, 0)

  return {
    totalMonths: months.length,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    payoffDate: months[months.length - 1].date,
  }
}

// ── Seed data (for initial setup) ────────────────────────────

export interface DefaultDebt {
  name: string
  debt_type: DebtType
  original_amount: number
  current_balance: number
  interest_rate: number
  minimum_payment: number
  monthly_payment: number
  start_date: string
  creditor: string
  // Type-specific fields (all optional for seed data)
  subtype?: string
  is_tax_deductible?: boolean
  fixed_rate_end_date?: string
  nhg?: boolean
  linked_asset_id?: string
  credit_limit?: number
  repayment_type?: RepaymentType
  draagkrachtmeting_date?: string
}

export function getDefaultDebts(): DefaultDebt[] {
  return [
    {
      name: 'Hypotheek',
      debt_type: 'mortgage',
      original_amount: 285000,
      current_balance: 248000,
      interest_rate: 3.8,
      minimum_payment: 750,
      monthly_payment: 750,
      start_date: '2020-06-01',
      creditor: 'ABN AMRO',
      subtype: 'annuiteit',
      repayment_type: 'annuiteit',
      is_tax_deductible: true,
      nhg: true,
      fixed_rate_end_date: '2030-06-01',
    },
    {
      name: 'Persoonlijke lening',
      debt_type: 'personal_loan',
      original_amount: 5000,
      current_balance: 2800,
      interest_rate: 6.9,
      minimum_payment: 60,
      monthly_payment: 60,
      start_date: '2023-01-15',
      creditor: 'ING',
      subtype: 'aflopend',
    },
    {
      name: 'Studielening DUO',
      debt_type: 'student_loan',
      original_amount: 18500,
      current_balance: 14200,
      interest_rate: 0.46,
      minimum_payment: 85,
      monthly_payment: 85,
      start_date: '2019-09-01',
      creditor: 'DUO',
      subtype: 'oud_stelsel',
    },
  ]
}

// ── Quick-add wizard extensions ──────────────────────────────
//
// Alles onder deze scheidingslijn wordt uitsluitend gebruikt door de
// `QuickAddWizard`. Bestaande DEBT_* constanten hierboven blijven
// ongewijzigd.

/** Kortere NL-labels voor de quick-add wizard. */
export const DEBT_QUICK_ADD_LABELS: Record<DebtType, string> = {
  mortgage: 'Hypotheek',
  personal_loan: 'Persoonlijke lening',
  student_loan: 'Studielening (DUO)',
  car_loan: 'Autolening',
  credit_card: 'Creditcard',
  revolving_credit: 'Doorlopend krediet',
  payment_plan: 'Afbetalingsregeling',
  belastingschuld: 'Belastingschuld',
  familielening: 'Familielening',
  dga_schuld: 'Lening bij eigen BV',
  other: 'Overig',
}

/** Default naam per type — prefill in stap 3. */
export const DEBT_DEFAULT_NAMES: Partial<Record<DebtType, string>> = {
  mortgage: 'Hypotheek',
  student_loan: 'Studielening DUO',
  credit_card: 'Creditcard',
  belastingschuld: 'Aanslag IB',
}

/**
 * Default looptijd (jaren) per debt-type — gebruikt in `buildDebtDraft`
 * voor `end_date` berekening en `monthly_payment` via
 * `computeDefaultMonthlyPayment`. `null` = doorlopend (geen einddatum).
 */
export const DEFAULT_TERM_YEARS_PER_TYPE: Record<DebtType, number | null> = {
  mortgage: 30,
  personal_loan: 5,
  car_loan: 5,
  student_loan: 15,
  familielening: 10,
  dga_schuld: 10,
  belastingschuld: 1,
  payment_plan: 2,
  credit_card: null,
  revolving_credit: null,
  other: null,
}

/** Default repayment-type per debt-type (laat user later aanpassen in full form). */
export const DEBT_DEFAULT_REPAYMENT_TYPE: Record<DebtType, RepaymentType | null> = {
  mortgage: 'annuiteit',
  personal_loan: 'annuiteit',
  car_loan: 'annuiteit',
  credit_card: 'aflossingsvrij',
  revolving_credit: 'aflossingsvrij',
  student_loan: 'lineair',
  familielening: 'lineair',
  dga_schuld: 'lineair',
  belastingschuld: 'lineair',
  payment_plan: 'lineair',
  other: null,
}

/** Volgorde in de quick-add type-grid — meest voorkomende schulden eerst. */
export const QUICK_ADD_DEBT_ORDER: readonly DebtType[] = [
  'mortgage',
  'personal_loan',
  'student_loan',
  'car_loan',
  'credit_card',
  'revolving_credit',
  'belastingschuld',
  'payment_plan',
  'familielening',
  'dga_schuld',
  'other',
] as const

/** Configuratie voor het (optionele) derde veld in stap 3. */
export type DebtField3Kind =
  | null
  | { kind: 'percentage'; label: string; defaultValue?: number }
  | { kind: 'currency'; label: string }
  | { kind: 'year'; label: string; defaultValue?: number }

export const DEBT_QUICK_ADD_FIELD3: Record<DebtType, DebtField3Kind> = {
  mortgage: { kind: 'percentage', label: 'Rente (%)' },
  personal_loan: { kind: 'percentage', label: 'Rente (%)' },
  student_loan: null, // DUO-rente via defaults
  car_loan: { kind: 'percentage', label: 'Rente (%)' },
  credit_card: { kind: 'percentage', label: 'Rente (%)', defaultValue: 14 },
  revolving_credit: { kind: 'percentage', label: 'Rente (%)' },
  payment_plan: { kind: 'currency', label: 'Maandbedrag' },
  belastingschuld: { kind: 'year', label: 'Jaar' },
  familielening: { kind: 'percentage', label: 'Rente (%)', defaultValue: 0 },
  dga_schuld: { kind: 'percentage', label: 'Rente (%)', defaultValue: 2.5 },
  other: { kind: 'percentage', label: 'Rente (%)' },
}

/**
 * Bereken de default maandbedrag voor een schuld op basis van saldo,
 * rente, looptijd en aflossingstype. Gebruikt door `buildDebtDraft`,
 * maar kan later ook door `debt-form.tsx` worden hergebruikt als
 * refactor van de inline-versie (regels 99-132 aldaar).
 *
 * - `aflossingsvrij`: alleen rente per maand.
 * - `annuiteit`: klassieke PMT-formule.
 * - `lineair`: vaste aflossing + rente over huidige saldo.
 * - `null` repayment of ontbrekende looptijd bij niet-aflossingsvrij → 0.
 */
export function computeDefaultMonthlyPayment(
  balance: number,
  ratePct: number,
  years: number | null,
  repayment: RepaymentType | null,
): number {
  if (repayment === 'aflossingsvrij') {
    return Math.round((balance * (ratePct / 100) / 12) * 100) / 100
  }
  if (years == null || years <= 0) return 0

  const months = years * 12
  if (ratePct === 0) return Math.round((balance / months) * 100) / 100

  const monthlyRate = ratePct / 100 / 12
  if (repayment === 'lineair') {
    return Math.round((balance / months + balance * monthlyRate) * 100) / 100
  }
  // annuiteit (default als repayment null of 'annuiteit')
  const factor = Math.pow(1 + monthlyRate, months)
  return Math.round(((balance * (monthlyRate * factor)) / (factor - 1)) * 100) / 100
}
