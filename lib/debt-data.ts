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
  | 'other'

export type RepaymentType = 'aflossingsvrij' | 'annuiteit' | 'lineair'

export type MortgageSubtype = 'annuiteit' | 'lineair' | 'aflossingsvrij' | 'spaarhypotheek' | 'beleggingshypotheek'
export type StudentLoanSubtype = 'oud_stelsel' | 'nieuw_stelsel' | 'sf35'
export type PersonalLoanSubtype = 'aflopend' | 'doorlopend'
export type CreditCardSubtype = 'regulier' | 'charge_card'
export type RevolvingCreditSubtype = 'doorlopend_krediet' | 'roodstand'

export type DebtSubtype =
  | MortgageSubtype
  | StudentLoanSubtype
  | PersonalLoanSubtype
  | CreditCardSubtype
  | RevolvingCreditSubtype

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
}

export const DEBT_TYPE_LABELS: Record<DebtType, string> = {
  mortgage: 'Hypotheek',
  personal_loan: 'Persoonlijke lening',
  student_loan: 'Studielening',
  car_loan: 'Autolening',
  credit_card: 'Creditcard',
  revolving_credit: 'Doorlopend krediet',
  payment_plan: 'Afbetalingsregeling',
  other: 'Overig',
}

export const DEBT_TYPE_ICONS: Record<DebtType, string> = {
  mortgage: 'Home',
  personal_loan: 'Banknote',
  student_loan: 'GraduationCap',
  car_loan: 'Car',
  credit_card: 'CreditCard',
  revolving_credit: 'RefreshCw',
  payment_plan: 'CalendarCheck',
  other: 'CircleDot',
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
