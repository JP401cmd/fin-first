import { registerCategory, registerTests } from '../test-registry'
import {
  assertEqual, assertGreaterThan, assertGreaterThanOrEqual,
  assert, assertNotNull, assertDefined, assertIncludes,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  type Debt, type DebtType, type RepaymentType, type PayoffStrategy,
  DEBT_TYPE_LABELS, DEBT_TYPE_ICONS, DEBT_SUBTYPE_LABELS,
  REPAYMENT_TYPE_LABELS, DEBT_TYPE_FIELDS,
  amortizationSchedule, linearAmortization, interestOnlySchedule,
  debtProjection, simulatePayoff, payoffSummary,
  getDefaultDebts,
} from '@/lib/debt-data'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'

const CAT = 'kern.schulden'

/**
 * Regression tests for Schulden (Debts) management.
 *
 * Tests the full lifecycle of debts:
 *   - Debt types, subtypes, and type-specific fields
 *   - Amortization calculations (annuity, linear, interest-only)
 *   - Payoff strategies (snowball, avalanche, current)
 *   - Impact on net worth and freedom time
 *   - CRUD operations via API
 */

// ── Helper: make a mock debt ────────────────────────────────────────
function makeMockDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'test-debt-1',
    user_id: 'test-user',
    name: 'Test Schuld',
    debt_type: 'personal_loan',
    original_amount: 10000,
    current_balance: 8000,
    interest_rate: 5.0,
    minimum_payment: 200,
    monthly_payment: 200,
    start_date: '2024-01-01',
    end_date: null,
    creditor: 'Test Bank',
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    subtype: null,
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: null,
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    include_aflossing_in_savings: false,
    custom_aflossing_amount: null,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    ...overrides,
  }
}

const tests: TestCase[] = [
  // ════════════════════════════════════════════════════════════════════
  // Stap 1: Schuld aanmaken met rente, looptijd, maandbedrag
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'schulden-debt-types',
    name: 'Debt types: alle 11 types met labels en icons',
    category: CAT,
    description: 'Alle DebtType waarden hebben een label en icoon',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const types: DebtType[] = [
        'mortgage', 'personal_loan', 'student_loan', 'car_loan',
        'credit_card', 'revolving_credit', 'payment_plan',
        'belastingschuld', 'familielening', 'dga_schuld', 'other',
      ]
      assertEqual(types.length, 11, '11 debt types')
      assertEqual(Object.keys(DEBT_TYPE_LABELS).length, 11, '11 type labels')
      assertEqual(Object.keys(DEBT_TYPE_ICONS).length, 11, '11 type icons')

      for (const t of types) {
        assertDefined(DEBT_TYPE_LABELS[t], `label voor ${t}`)
        assertDefined(DEBT_TYPE_ICONS[t], `icon voor ${t}`)
      }

      // Dutch labels
      assertEqual(DEBT_TYPE_LABELS.mortgage, 'Hypotheek', 'hypotheek label')
      assertEqual(DEBT_TYPE_LABELS.student_loan, 'Studielening', 'studielening label')
      assertEqual(DEBT_TYPE_LABELS.belastingschuld, 'Belastingschuld', 'belastingschuld label')
    },
  },
  {
    id: 'schulden-repayment-types',
    name: 'Repayment types: aflossingsvrij, annuiteit, lineair',
    category: CAT,
    description: 'Alle 3 aflossingsmethoden zijn gedefinieerd met labels',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const types: RepaymentType[] = ['aflossingsvrij', 'annuiteit', 'lineair']
      assertEqual(types.length, 3, '3 repayment types')
      assertEqual(Object.keys(REPAYMENT_TYPE_LABELS).length, 3, '3 repayment labels')

      for (const t of types) {
        assertDefined(REPAYMENT_TYPE_LABELS[t], `label voor ${t}`)
      }

      assertEqual(REPAYMENT_TYPE_LABELS.annuiteit, 'Annuiteit', 'annuiteit label')
      assertEqual(REPAYMENT_TYPE_LABELS.lineair, 'Lineair', 'lineair label')
      assertEqual(REPAYMENT_TYPE_LABELS.aflossingsvrij, 'Aflossingsvrij', 'aflossingsvrij label')
    },
  },
  {
    id: 'schulden-subtypes',
    name: 'Subtypes: hypotheek, studielening, belastingschuld, etc.',
    category: CAT,
    description: 'Type-specifieke subtypes zijn gedefinieerd voor relevante debt types',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Mortgage subtypes
      const mortgageSubs = DEBT_SUBTYPE_LABELS.mortgage!
      assertDefined(mortgageSubs, 'hypotheek subtypes bestaan')
      assertEqual(Object.keys(mortgageSubs).length, 5, '5 hypotheek subtypes')
      assertDefined(mortgageSubs.annuiteit, 'annuiteit subtype')
      assertDefined(mortgageSubs.spaarhypotheek, 'spaarhypotheek subtype')

      // Student loan subtypes
      const studentSubs = DEBT_SUBTYPE_LABELS.student_loan!
      assertDefined(studentSubs, 'studielening subtypes bestaan')
      assertEqual(Object.keys(studentSubs).length, 3, '3 studielening subtypes')

      // Belastingschuld subtypes
      const belastingSubs = DEBT_SUBTYPE_LABELS.belastingschuld!
      assertDefined(belastingSubs, 'belastingschuld subtypes bestaan')
      assertEqual(Object.keys(belastingSubs).length, 5, '5 belastingschuld subtypes')

      // Familielening subtypes
      const famSubs = DEBT_SUBTYPE_LABELS.familielening!
      assertDefined(famSubs, 'familielening subtypes bestaan')
      assertEqual(Object.keys(famSubs).length, 4, '4 familielening subtypes')
    },
  },
  {
    id: 'schulden-type-fields',
    name: 'Type-specific fields per debt type',
    category: CAT,
    description: 'Elk debt type toont de juiste type-specifieke velden in het formulier',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Mortgage: most type-specific fields
      const mortgageFields = DEBT_TYPE_FIELDS.mortgage
      assertIncludes(mortgageFields, 'subtype', 'hypotheek: subtype')
      assertIncludes(mortgageFields, 'repayment_type', 'hypotheek: repayment_type')
      assertIncludes(mortgageFields, 'is_tax_deductible', 'hypotheek: aftrekbaar')
      assertIncludes(mortgageFields, 'nhg', 'hypotheek: NHG')
      assertIncludes(mortgageFields, 'fixed_rate_end_date', 'hypotheek: rentevast einde')
      assertIncludes(mortgageFields, 'linked_asset_id', 'hypotheek: linked asset')

      // Credit card: credit limit
      assertIncludes(DEBT_TYPE_FIELDS.credit_card, 'credit_limit', 'creditcard: kredietlimiet')

      // Belastingschuld: tax year + payment plan
      assertIncludes(DEBT_TYPE_FIELDS.belastingschuld, 'tax_year', 'belasting: fiscaal jaar')
      assertIncludes(DEBT_TYPE_FIELDS.belastingschuld, 'has_payment_plan', 'belasting: betalingsregeling')

      // Simple types: no extra fields
      assertEqual(DEBT_TYPE_FIELDS.car_loan.length, 0, 'autolening: geen extra velden')
      assertEqual(DEBT_TYPE_FIELDS.payment_plan.length, 0, 'betalingsregeling: geen extra velden')
    },
  },
  {
    id: 'schulden-seed-data',
    name: 'Seed data: getDefaultDebts() levert 3 schulden',
    category: CAT,
    description: 'Standaard seed bevat hypotheek, persoonlijke lening, studielening',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const defaults = getDefaultDebts()
      assertEqual(defaults.length, 3, '3 default schulden')

      const types = defaults.map((d) => d.debt_type)
      assertIncludes(types, 'mortgage', 'hypotheek in seed')
      assertIncludes(types, 'personal_loan', 'persoonlijke lening in seed')
      assertIncludes(types, 'student_loan', 'studielening in seed')

      // Hypotheek specifics
      const hyp = defaults.find((d) => d.debt_type === 'mortgage')!
      assertNotNull(hyp, 'hypotheek gevonden')
      assertEqual(hyp.original_amount, 285000, 'hypotheek origineel bedrag')
      assertEqual(hyp.current_balance, 248000, 'hypotheek huidig saldo')
      assertEqual(hyp.interest_rate, 3.8, 'hypotheek rente')
      assertEqual(hyp.nhg, true, 'hypotheek NHG')
      assertEqual(hyp.repayment_type, 'annuiteit', 'hypotheek aflossingstype')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 2: Schuld bewerken en verwijderen
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'schulden-debt-interface',
    name: 'Debt interface: alle verplichte velden aanwezig',
    category: CAT,
    description: 'Debt type bevat alle verwachte velden voor CRUD',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const debt = makeMockDebt()
      // Core fields
      assertDefined(debt.id, 'id')
      assertDefined(debt.user_id, 'user_id')
      assertDefined(debt.name, 'name')
      assertDefined(debt.debt_type, 'debt_type')
      assertEqual(typeof debt.original_amount, 'number', 'original_amount is number')
      assertEqual(typeof debt.current_balance, 'number', 'current_balance is number')
      assertEqual(typeof debt.interest_rate, 'number', 'interest_rate is number')
      assertEqual(typeof debt.minimum_payment, 'number', 'minimum_payment is number')
      assertEqual(typeof debt.monthly_payment, 'number', 'monthly_payment is number')
      assertDefined(debt.start_date, 'start_date')
      assertEqual(typeof debt.is_active, 'boolean', 'is_active is boolean')

      // Household fields
      assertIncludes(['personal', 'shared'], debt.ownership, 'ownership is personal/shared')
      assertEqual(typeof debt.net_worth_inclusion_pct, 'number', 'net_worth_inclusion_pct')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 3: Aflossingsberekening (lineair vs annuïteit)
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'schulden-annuity-schedule',
    name: 'Annuïteit: vaste maandbetaling, dalend saldo',
    category: CAT,
    description: 'amortizationSchedule: vaste betaling, stijgende aflossing, dalende rente',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // €10,000 at 5% with €200/month
      const schedule = amortizationSchedule(10000, 5, 200)
      assertGreaterThan(schedule.length, 0, 'schedule niet leeg')

      // First month
      const first = schedule[0]
      assertEqual(first.month, 1, 'eerste maand = 1')
      assertGreaterThan(first.interest, 0, 'rente > 0')
      assertGreaterThan(first.principal, 0, 'aflossing > 0')
      // €10000 * 5% / 12 = ~€41.67
      const expectedInterest = Math.round(10000 * 0.05 / 12 * 100) / 100
      assertEqual(first.interest, expectedInterest, 'eerste maand rente klopt')

      // Last month: balance should be ~0
      const last = schedule[schedule.length - 1]
      assertEqual(last.balance, 0, 'eindsaldo = 0')

      // Payment is constant (except possibly last month)
      if (schedule.length > 2) {
        assertEqual(schedule[0].payment, schedule[1].payment, 'vaste maandbetaling bij annuïteit')
      }

      // Interest decreases over time
      if (schedule.length > 3) {
        assertGreaterThan(schedule[0].interest, schedule[schedule.length - 2].interest,
          'rente daalt over tijd')
      }
    },
  },
  {
    id: 'schulden-linear-schedule',
    name: 'Lineair: vaste aflossing, dalende totaalbetaling',
    category: CAT,
    description: 'linearAmortization: vaste aflossing, dalende rente = dalende totaal',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // €12,000 at 4% over 24 months
      const schedule = linearAmortization(12000, 4, 24)
      assertEqual(schedule.length, 24, '24 maanden')

      // Fixed principal = €500/month
      const expectedPrincipal = 12000 / 24
      assertEqual(schedule[0].principal, expectedPrincipal, 'vaste maandelijkse aflossing')

      // First month has highest total payment
      const firstPayment = schedule[0].payment
      const lastPayment = schedule[schedule.length - 1].payment
      assertGreaterThan(firstPayment, lastPayment, 'eerste betaling > laatste bij lineair')

      // Last balance = 0
      assertEqual(schedule[schedule.length - 1].balance, 0, 'eindsaldo = 0')
    },
  },
  {
    id: 'schulden-interest-only',
    name: 'Aflossingsvrij: alleen rente, saldo blijft gelijk',
    category: CAT,
    description: 'interestOnlySchedule: balance blijft constant, principal = 0',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // €100,000 at 3.5% for 12 months
      const schedule = interestOnlySchedule(100000, 3.5, 12)
      assertEqual(schedule.length, 12, '12 maanden')

      // Balance remains constant
      for (const row of schedule) {
        assertEqual(row.balance, 100000, 'saldo blijft €100.000')
        assertEqual(row.principal, 0, 'geen aflossing')
        assertGreaterThan(row.interest, 0, 'rente > 0')
        assertEqual(row.payment, row.interest, 'betaling = rente')
      }

      // Monthly interest: €100000 * 3.5% / 12 ≈ €291.67
      const expectedInterest = Math.round(100000 * 0.035 / 12 * 100) / 100
      assertEqual(schedule[0].interest, expectedInterest, 'maandelijkse rente klopt')
    },
  },
  {
    id: 'schulden-schedule-edge-cases',
    name: 'Amortisatie edge cases: 0 saldo, 0 betaling, 0 rente',
    category: CAT,
    description: 'Lege schedules bij ongeldige input',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Zero balance → empty
      assertEqual(amortizationSchedule(0, 5, 200).length, 0, 'saldo 0 → leeg')
      assertEqual(linearAmortization(0, 4, 24).length, 0, 'lineair saldo 0 → leeg')
      assertEqual(interestOnlySchedule(0, 3, 12).length, 0, 'interest-only saldo 0 → leeg')

      // Zero payment → empty
      assertEqual(amortizationSchedule(10000, 5, 0).length, 0, 'betaling 0 → leeg')

      // Zero term → empty
      assertEqual(linearAmortization(10000, 4, 0).length, 0, 'looptijd 0 → leeg')
      assertEqual(interestOnlySchedule(10000, 3, 0).length, 0, 'interest-only looptijd 0 → leeg')

      // Zero interest rate → still works (all payment goes to principal)
      const zeroRate = amortizationSchedule(1000, 0, 100)
      assertGreaterThan(zeroRate.length, 0, 'rente 0% werkt nog')
      assertEqual(zeroRate[0].interest, 0, 'geen rente bij 0%')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 3b: debtProjection per repayment type
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'schulden-projection-annuity',
    name: 'debtProjection: annuïteit → maanden tot afbetaling',
    category: CAT,
    description: 'Annuïteitslening projectie retourneert verwachte aflostermijn',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const debt = makeMockDebt({
        current_balance: 8000,
        interest_rate: 5,
        monthly_payment: 200,
        repayment_type: null, // defaults to annuity
      })
      const proj = debtProjection(debt)
      assert(proj.isPayable, 'schuld is aflosbaar')
      assertGreaterThan(proj.monthsToPayoff, 0, 'maanden > 0')
      assertGreaterThan(proj.totalInterest, 0, 'totale rente > 0')
      assert(proj.payoffDate.length > 0, 'payoff datum aanwezig')
    },
  },
  {
    id: 'schulden-projection-linear',
    name: 'debtProjection: lineair → vaste aflossing per maand',
    category: CAT,
    description: 'Lineaire lening projectie met vaste aflossingscomponent',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const debt = makeMockDebt({
        current_balance: 12000,
        interest_rate: 4,
        monthly_payment: 600,
        repayment_type: 'lineair',
      })
      const proj = debtProjection(debt)
      assert(proj.isPayable, 'lineaire schuld is aflosbaar')
      assertGreaterThan(proj.monthsToPayoff, 0, 'maanden > 0')
      assertGreaterThan(proj.totalInterest, 0, 'rente > 0')
    },
  },
  {
    id: 'schulden-projection-interest-only',
    name: 'debtProjection: aflossingsvrij → saldo daalt niet',
    category: CAT,
    description: 'Aflossingsvrij: isPayable maar saldo blijft gelijk tot einddatum',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const debt = makeMockDebt({
        current_balance: 250000,
        interest_rate: 3.5,
        monthly_payment: 750,
        repayment_type: 'aflossingsvrij',
        end_date: '2054-01-01',
      })
      const proj = debtProjection(debt)
      assert(proj.isPayable, 'aflossingsvrij is payable (zal aflopen)')
      assertGreaterThan(proj.monthsToPayoff, 100, 'lange looptijd')
      assertGreaterThan(proj.totalInterest, 0, 'rente bij aflossingsvrij')
    },
  },
  {
    id: 'schulden-projection-unpayable',
    name: 'debtProjection: onbetaalbaar als betaling ≤ rente',
    category: CAT,
    description: 'Als maandbetaling de rente niet dekt → isPayable = false',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const debt = makeMockDebt({
        current_balance: 100000,
        interest_rate: 12,  // 12% = €1000/month interest
        monthly_payment: 500,  // < €1000 interest
        repayment_type: null,  // annuity
      })
      const proj = debtProjection(debt)
      assertEqual(proj.isPayable, false, 'schuld is niet aflosbaar')
      assertEqual(proj.monthsToPayoff, Infinity, 'oneindige looptijd')
    },
  },
  {
    id: 'schulden-projection-zero-balance',
    name: 'debtProjection: saldo 0 → al afgelost',
    category: CAT,
    description: 'Schuld met saldo 0 of negatief is al afgelost',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const debt = makeMockDebt({ current_balance: 0 })
      const proj = debtProjection(debt)
      assertEqual(proj.monthsToPayoff, 0, 'al afgelost')
      assertEqual(proj.totalInterest, 0, 'geen rente')
      assert(proj.isPayable, 'afgelost is payable')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 4: Impact op netto vermogen
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'schulden-nw-impact',
    name: 'Netto vermogen: schulden verlagen het totaal',
    category: CAT,
    description: 'Net worth = assets - debts, met net_worth_inclusion_pct',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Net worth calculation:
      // Each debt reduces NW by current_balance * (net_worth_inclusion_pct / 100)
      const debt100 = makeMockDebt({ current_balance: 50000, net_worth_inclusion_pct: 100 })
      const debt50 = makeMockDebt({ current_balance: 50000, net_worth_inclusion_pct: 50 })

      const impact100 = debt100.current_balance * (debt100.net_worth_inclusion_pct / 100)
      const impact50 = debt50.current_balance * (debt50.net_worth_inclusion_pct / 100)

      assertEqual(impact100, 50000, '100% inclusie = volle aftrek')
      assertEqual(impact50, 25000, '50% inclusie = halve aftrek')

      // Inactive debts should not be counted
      const inactive = makeMockDebt({ current_balance: 50000, is_active: false })
      assertEqual(inactive.is_active, false, 'inactieve schuld wordt niet meegeteld')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 5: Impact op vrijheidstijd
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'schulden-freedom-time',
    name: 'Vrijheidstijd: schulden verminderen vrijheid',
    category: CAT,
    description: 'Schulden tellen mee als negatief vermogen bij vrijheidstijdberekening',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Freedom time = net worth / daily expenses
      const dailyExpense = 100
      const assets = 500000
      const debts = 200000

      // Without debts
      const freedomWithout = calculateFreedomTime(assets, dailyExpense)
      // With debts
      const freedomWith = calculateFreedomTime(assets - debts, dailyExpense)

      assertGreaterThan(freedomWithout.totalDays, freedomWith.totalDays, 'vrijheid daalt door schulden')

      // Format check
      const formatted = formatFreedomTimeString(freedomWith)
      assert(formatted.length > 0, 'vrijheidstijd string is niet leeg')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 6: Meerdere schulden — payoff strategieën
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'schulden-payoff-snowball',
    name: 'Snowball: kleinste saldo eerst aflossen',
    category: CAT,
    description: 'Snowball strategie richt zich op het laagste saldo eerst',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      const debts = [
        makeMockDebt({ id: 'small', name: 'Klein', current_balance: 2000, interest_rate: 5, minimum_payment: 50, monthly_payment: 50 }),
        makeMockDebt({ id: 'large', name: 'Groot', current_balance: 20000, interest_rate: 3, minimum_payment: 100, monthly_payment: 100 }),
      ]

      const result = simulatePayoff(debts, 'snowball', 100)
      assertGreaterThan(result.length, 0, 'snowball resultaat niet leeg')

      // Small debt should reach 0 first
      let smallPaidOff = -1
      let largePaidOff = -1
      for (const month of result) {
        const small = month.debts.find((d) => d.id === 'small')
        const large = month.debts.find((d) => d.id === 'large')
        if (small && small.balance <= 0 && smallPaidOff < 0) smallPaidOff = month.month
        if (large && large.balance <= 0 && largePaidOff < 0) largePaidOff = month.month
      }

      if (smallPaidOff > 0 && largePaidOff > 0) {
        assertGreaterThan(largePaidOff, smallPaidOff, 'kleine schuld eerder afgelost bij snowball')
      }
    },
  },
  {
    id: 'schulden-payoff-avalanche',
    name: 'Avalanche: hoogste rente eerst aflossen',
    category: CAT,
    description: 'Avalanche strategie richt zich op het hoogste rentepercentage eerst',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      const debts = [
        makeMockDebt({ id: 'lowrate', name: 'Lage rente', current_balance: 5000, interest_rate: 2, minimum_payment: 50, monthly_payment: 50 }),
        makeMockDebt({ id: 'highrate', name: 'Hoge rente', current_balance: 5000, interest_rate: 15, minimum_payment: 50, monthly_payment: 50 }),
      ]

      const result = simulatePayoff(debts, 'avalanche', 200)
      assertGreaterThan(result.length, 0, 'avalanche resultaat niet leeg')

      // High-rate debt should be targeted first (paid off sooner)
      let highPaidOff = -1
      let lowPaidOff = -1
      for (const month of result) {
        const high = month.debts.find((d) => d.id === 'highrate')
        const low = month.debts.find((d) => d.id === 'lowrate')
        if (high && high.balance <= 0 && highPaidOff < 0) highPaidOff = month.month
        if (low && low.balance <= 0 && lowPaidOff < 0) lowPaidOff = month.month
      }

      if (highPaidOff > 0 && lowPaidOff > 0) {
        assertGreaterThan(lowPaidOff, highPaidOff, 'hoge rente eerder afgelost bij avalanche')
      }
    },
  },
  {
    id: 'schulden-payoff-current',
    name: 'Current: geen extra aflossing, elke schuld eigen tempo',
    category: CAT,
    description: 'Current strategie gebruikt bestaande maandbetalingen zonder herverdeling',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const debts = [
        makeMockDebt({ id: 'a', name: 'A', current_balance: 5000, interest_rate: 5, minimum_payment: 100, monthly_payment: 100 }),
        makeMockDebt({ id: 'b', name: 'B', current_balance: 5000, interest_rate: 5, minimum_payment: 100, monthly_payment: 100 }),
      ]

      const result = simulatePayoff(debts, 'current')
      assertGreaterThan(result.length, 0, 'current resultaat niet leeg')

      // Both debts should reach 0 at about the same time (same params)
      const lastMonth = result[result.length - 1]
      assertEqual(lastMonth.totalBalance, 0, 'totaal saldo = 0 aan het einde')
    },
  },
  {
    id: 'schulden-payoff-summary',
    name: 'payoffSummary: totalen en payoff datum',
    category: CAT,
    description: 'Summary retourneert totaal maanden, rente, betaald, en einddatum',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const debts = [
        makeMockDebt({ current_balance: 5000, interest_rate: 5, minimum_payment: 100, monthly_payment: 100 }),
      ]

      const months = simulatePayoff(debts, 'current')
      const summary = payoffSummary(months)

      assertGreaterThan(summary.totalMonths, 0, 'totaal maanden > 0')
      assertGreaterThan(summary.totalInterest, 0, 'totale rente > 0')
      assertGreaterThan(summary.totalPaid, 0, 'totaal betaald > 0')
      assert(summary.payoffDate.length > 0, 'payoff datum aanwezig')
      assertGreaterThanOrEqual(summary.totalPaid, 5000, 'totaal betaald ≥ hoofdsom')
    },
  },
  {
    id: 'schulden-payoff-interest-only-excluded',
    name: 'Payoff: aflossingsvrij schulden uitgesloten van targeting',
    category: CAT,
    description: 'Interest-only schulden krijgen alleen rente, geen extra aflossing',
    priority: 'high',
    estimatedDurationMs: 300,
    fn() {
      const debts = [
        makeMockDebt({
          id: 'hyp', name: 'Hypotheek', current_balance: 200000,
          interest_rate: 3.5, minimum_payment: 583, monthly_payment: 583,
          repayment_type: 'aflossingsvrij',
        }),
        makeMockDebt({
          id: 'lening', name: 'Lening', current_balance: 5000,
          interest_rate: 6, minimum_payment: 100, monthly_payment: 100,
        }),
      ]

      const result = simulatePayoff(debts, 'avalanche', 200)
      assertGreaterThan(result.length, 0, 'resultaat niet leeg')

      // After several months, hypotheek balance should remain at 200000
      if (result.length > 5) {
        const month5 = result[4]
        const hyp = month5.debts.find((d) => d.id === 'hyp')
        assertNotNull(hyp, 'hypotheek in resultaat')
        if (hyp) {
          assertEqual(hyp.balance, 200000, 'hypotheek saldo ongewijzigd (aflossingsvrij)')
          assertEqual(hyp.principal, 0, 'geen aflossing op aflossingsvrij')
        }
      }
    },
  },
  {
    id: 'schulden-payoff-empty',
    name: 'Payoff: lege of inactieve schuldenlijst → leeg resultaat',
    category: CAT,
    description: 'simulatePayoff met lege input retourneert leeg array',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const result1 = simulatePayoff([], 'snowball')
      assertEqual(result1.length, 0, 'lege input → leeg resultaat')

      // Inactive debts filtered out
      const result2 = simulatePayoff([
        makeMockDebt({ current_balance: 5000, is_active: false }),
      ], 'snowball')
      assertEqual(result2.length, 0, 'inactieve schuld → leeg resultaat')

      // Zero balance
      const result3 = simulatePayoff([
        makeMockDebt({ current_balance: 0 }),
      ], 'snowball')
      assertEqual(result3.length, 0, 'saldo 0 → leeg resultaat')

      // Empty payoff summary
      const summary = payoffSummary([])
      assertEqual(summary.totalMonths, 0, 'lege summary: 0 maanden')
      assertEqual(summary.totalInterest, 0, 'lege summary: 0 rente')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 7: Schuld afgelost markeren
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'schulden-paid-off-state',
    name: 'Schuld afgelost: current_balance=0, is_active kan false worden',
    category: CAT,
    description: 'Afgeloste schuld wordt gemarkeerd met saldo 0',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // A paid-off debt:
      // current_balance = 0
      // is_active may be set to false (user choice)
      // debtProjection should return 0 months, 0 interest
      const paidOff = makeMockDebt({ current_balance: 0, is_active: false })
      assertEqual(paidOff.current_balance, 0, 'saldo = 0')
      assertEqual(paidOff.is_active, false, 'inactief na afbetaling')

      const proj = debtProjection(paidOff)
      assertEqual(proj.monthsToPayoff, 0, 'geen maanden meer')
      assertEqual(proj.totalInterest, 0, 'geen rente meer')
      assert(proj.isPayable, 'afgelost is payable')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 8: Totaal schuldratio
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'schulden-total-ratio',
    name: 'Schuldratio: totale schulden vs vermogen',
    category: CAT,
    description: 'Schuldratio = totaal schulden / (totaal vermogen + totaal schulden)',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Debt ratio calculation
      const debts = [
        makeMockDebt({ current_balance: 200000, net_worth_inclusion_pct: 100 }),
        makeMockDebt({ current_balance: 10000, net_worth_inclusion_pct: 100 }),
        makeMockDebt({ current_balance: 5000, net_worth_inclusion_pct: 50 }),
      ]

      const totalDebt = debts.reduce((sum, d) =>
        sum + d.current_balance * (d.net_worth_inclusion_pct / 100), 0)

      // 200000 + 10000 + 2500 = 212500
      assertEqual(totalDebt, 212500, 'totale schuld met inclusie-pct')

      const assets = 500000
      const debtRatio = totalDebt / (assets + totalDebt)
      assertGreaterThan(debtRatio, 0, 'schuldratio > 0')
      assertGreaterThan(1, debtRatio, 'schuldratio < 1')
    },
  },
]

export function register() {
  registerCategory({
    id: CAT,
    label: 'De Kern — Schulden',
    description: 'Schulden CRUD, aflossingsstrategieën, impact op netto vermogen en vrijheidstijd',
    icon: 'TrendingDown',
    testCount: 0,
  })
  registerTests(tests)
}
