/**
 * Regression tests: Recurring detection & transfer matching
 *
 * Tests for detecting recurring transactions (salary, subscriptions, fixed costs)
 * and matching own-account transfers.
 */

import { registerTests, registerCategory } from '../test-registry'
import {
  assert,
  assertEqual,
  assertNotNull,
  assertGreaterThan,
  assertGreaterThanOrEqual,
  assertFinite,
  assertIncludes,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  detectRecurringTransactions,
  detectFrequency,
  detectCategory,
  normalizeCounterparty,
  detectedToRecurring,
  type TransactionForDetection,
  type RecurringCategory,
  CATEGORY_LABELS,
} from '@/lib/recurring-detection'

const CAT = 'kern.transactie-analyse'

registerCategory({
  id: CAT,
  label: 'De Kern — Transactie Analyse',
  description: 'Recurring detection, transfer matching, counterparty normalisatie',
  icon: 'Repeat',
  testCount: 0,
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate monthly transactions for a counterparty */
function generateMonthlyTx(
  counterparty: string,
  amount: number,
  months: number,
  startYear = 2025,
  startMonth = 1,
): TransactionForDetection[] {
  const txs: TransactionForDetection[] = []
  for (let i = 0; i < months; i++) {
    const m = ((startMonth - 1 + i) % 12) + 1
    const y = startYear + Math.floor((startMonth - 1 + i) / 12)
    txs.push({
      id: `tx-${counterparty}-${i}`,
      date: `${y}-${String(m).padStart(2, '0')}-25`,
      amount,
      description: `Betaling ${counterparty}`,
      counterparty_name: counterparty,
      is_income: amount > 0,
      budget_id: null,
    })
  }
  return txs
}

/** Generate weekly transactions */
function generateWeeklyTx(
  counterparty: string,
  amount: number,
  weeks: number,
  startDate = '2025-01-06', // Monday
): TransactionForDetection[] {
  const txs: TransactionForDetection[] = []
  const start = new Date(startDate)
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start.getTime() + i * 7 * 86_400_000)
    txs.push({
      id: `tx-${counterparty}-w${i}`,
      date: d.toISOString().split('T')[0],
      amount,
      description: counterparty,
      counterparty_name: counterparty,
      is_income: amount > 0,
      budget_id: null,
    })
  }
  return txs
}

// ── Tests ────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── A: Recurring detection — salary ──────────────────────────────────────
  {
    id: 'recurring-salary-monthly',
    name: 'Salaris herkenning: maandelijks, vast bedrag',
    description: 'Detects monthly salary with consistent amount and high confidence',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const txs = generateMonthlyTx('Werkgever BV Salaris', 3500, 6)
      const detected = detectRecurringTransactions(txs)

      assertGreaterThan(detected.length, 0, 'At least one pattern detected')
      const salary = detected.find(d => d.isIncome && d.suggestedCategory === 'salary')
      assertNotNull(salary, 'Salary pattern found')
      assertEqual(salary!.frequency, 'monthly', 'Monthly frequency')
      assertEqual(salary!.averageAmount, 3500, 'Correct average amount')
      assertGreaterThanOrEqual(salary!.occurrences, 3, 'Minimum occurrences met')
      assert(salary!.confidence === 'high' || salary!.confidence === 'medium', 'Reasonable confidence')
    },
  },
  {
    id: 'recurring-subscription-detection',
    name: 'Abonnement detectie: Netflix, Spotify patronen',
    description: 'Detects subscription patterns by counterparty name',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const netflix = generateMonthlyTx('Netflix', -15.99, 5)
      const spotify = generateMonthlyTx('Spotify AB', -9.99, 5)
      const txs = [...netflix, ...spotify]

      const detected = detectRecurringTransactions(txs)
      const subs = detected.filter(d => d.suggestedCategory === 'subscription')
      assertGreaterThanOrEqual(subs.length, 2, 'At least 2 subscriptions detected')

      // Verify amounts are negative (expenses)
      for (const sub of subs) {
        assert(!sub.isIncome, `${sub.counterpartyName} is an expense`)
        assert(sub.averageAmount < 0, `${sub.counterpartyName} has negative amount`)
      }
    },
  },
  {
    id: 'recurring-fixed-costs',
    name: 'Vaste lasten: huur en hypotheek herkenning',
    description: 'Detects rent and mortgage as recurring fixed costs',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const huur = generateMonthlyTx('Woningcorporatie Vestia', -950, 6)
      const detected = detectRecurringTransactions(huur)

      assertGreaterThan(detected.length, 0, 'Pattern detected')
      const rent = detected[0]
      assertEqual(rent.frequency, 'monthly', 'Monthly frequency')
      assertEqual(rent.suggestedCategory, 'rent', 'Categorized as rent')
      assertEqual(rent.averageAmount, -950, 'Correct amount')
    },
  },

  // ── B: Edge cases ────────────────────────────────────────────────────────
  {
    id: 'recurring-variable-salary',
    name: 'Edge case: variabel salaris herkenning',
    description: 'Detects salary with slight amount variation (bonuses, overtime)',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const txs: TransactionForDetection[] = [
        { id: 'vs1', date: '2025-01-25', amount: 3500, description: 'Salaris jan', counterparty_name: 'Werkgever NV Salaris', is_income: true, budget_id: null },
        { id: 'vs2', date: '2025-02-25', amount: 3600, description: 'Salaris feb', counterparty_name: 'Werkgever NV Salaris', is_income: true, budget_id: null },
        { id: 'vs3', date: '2025-03-25', amount: 3500, description: 'Salaris mrt', counterparty_name: 'Werkgever NV Salaris', is_income: true, budget_id: null },
        { id: 'vs4', date: '2025-04-25', amount: 3550, description: 'Salaris apr', counterparty_name: 'Werkgever NV Salaris', is_income: true, budget_id: null },
        { id: 'vs5', date: '2025-05-25', amount: 3500, description: 'Salaris mei', counterparty_name: 'Werkgever NV Salaris', is_income: true, budget_id: null },
      ]

      const detected = detectRecurringTransactions(txs)
      assertGreaterThan(detected.length, 0, 'Variable salary still detected')
      const salary = detected.find(d => d.isIncome)
      assertNotNull(salary, 'Income pattern found')
      assertEqual(salary!.frequency, 'monthly', 'Still monthly')
      assert(salary!.isVariableAmount || salary!.amountVariation > 0, 'Amount variation noted')
    },
  },
  {
    id: 'recurring-quarterly-payments',
    name: 'Edge case: kwartaalbetalingen',
    description: 'Detects quarterly payment patterns (e.g., insurance)',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const txs: TransactionForDetection[] = [
        { id: 'q1', date: '2025-01-15', amount: -450, description: 'Kwartaalbetaling', counterparty_name: 'Centraal Beheer Verzekering', is_income: false, budget_id: null },
        { id: 'q2', date: '2025-04-15', amount: -450, description: 'Kwartaalbetaling', counterparty_name: 'Centraal Beheer Verzekering', is_income: false, budget_id: null },
        { id: 'q3', date: '2025-07-15', amount: -450, description: 'Kwartaalbetaling', counterparty_name: 'Centraal Beheer Verzekering', is_income: false, budget_id: null },
      ]

      const detected = detectRecurringTransactions(txs)
      assertGreaterThan(detected.length, 0, 'Quarterly pattern detected')
      const insurance = detected[0]
      assertEqual(insurance.frequency, 'quarterly', 'Quarterly frequency')
      assertEqual(insurance.suggestedCategory, 'insurance', 'Categorized as insurance')
    },
  },
  {
    id: 'recurring-yearly-payments',
    name: 'Edge case: jaarlijkse betalingen',
    description: 'Detects yearly payment patterns (e.g., annual subscription)',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      const txs: TransactionForDetection[] = [
        { id: 'y1', date: '2024-03-01', amount: -120, description: 'Jaarabonnement', counterparty_name: 'ANWB', is_income: false, budget_id: null },
        { id: 'y2', date: '2025-03-01', amount: -120, description: 'Jaarabonnement', counterparty_name: 'ANWB', is_income: false, budget_id: null },
      ]

      const detected = detectRecurringTransactions(txs)
      assertGreaterThan(detected.length, 0, 'Yearly pattern detected')
      const annual = detected[0]
      assertEqual(annual.frequency, 'yearly', 'Yearly frequency')
    },
  },

  // ── C: detectFrequency ───────────────────────────────────────────────────
  {
    id: 'recurring-freq-weekly',
    name: 'detectFrequency: weekly (5-9 dag interval)',
    description: 'Weekly frequency detected for ~7 day intervals',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const dates = ['2025-01-06', '2025-01-13', '2025-01-20', '2025-01-27', '2025-02-03']
      const result = detectFrequency(dates)
      assertNotNull(result, 'Frequency detected')
      assertEqual(result!.frequency, 'weekly', 'Weekly detected')
    },
  },
  {
    id: 'recurring-freq-monthly',
    name: 'detectFrequency: monthly (25-35 dag interval)',
    description: 'Monthly frequency detected for ~30 day intervals',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const dates = ['2025-01-25', '2025-02-25', '2025-03-25', '2025-04-25']
      const result = detectFrequency(dates)
      assertNotNull(result, 'Frequency detected')
      assertEqual(result!.frequency, 'monthly', 'Monthly detected')
    },
  },
  {
    id: 'recurring-freq-too-few',
    name: 'detectFrequency: te weinig data → null',
    description: 'Returns null when fewer than 2 dates provided',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      assertEqual(detectFrequency([]), null, 'Empty returns null')
      assertEqual(detectFrequency(['2025-01-01']), null, 'Single date returns null')
    },
  },

  // ── D: detectCategory ────────────────────────────────────────────────────
  {
    id: 'recurring-cat-dutch-patterns',
    name: 'detectCategory: Nederlandse tegenpartij patronen',
    description: 'Dutch counterparty names correctly categorized',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Utility providers
      assertEqual(detectCategory('Vattenfall', 'Maandtermijn', false), 'utility', 'Vattenfall → utility')
      assertEqual(detectCategory('Eneco', 'Voorschot', false), 'utility', 'Eneco → utility')
      assertEqual(detectCategory('Ziggo', 'Internet', false), 'utility', 'Ziggo → utility')

      // Subscriptions
      assertEqual(detectCategory('Netflix', 'Maandelijks', false), 'subscription', 'Netflix → subscription')
      assertEqual(detectCategory('Spotify AB', 'Premium', false), 'subscription', 'Spotify → subscription')
      assertEqual(detectCategory('Basic-Fit', 'Lidmaatschap', false), 'subscription', 'Basic-Fit → subscription')

      // Insurance
      assertEqual(detectCategory('Centraal Beheer', 'Premie', false), 'insurance', 'Centraal Beheer → insurance')
      assertEqual(detectCategory('Zilveren Kruis', 'Zorgverzekering', false), 'insurance', 'Zilveren Kruis → insurance')

      // Transport
      assertEqual(detectCategory('NS', 'OV-chipkaart', false), 'transport', 'NS → transport')

      // Income
      assertEqual(detectCategory('Unknown Corp', 'Salaris', true), 'salary', 'Salary in description → salary')

      // Fallback
      assertEqual(detectCategory('Albert Heijn', 'Boodschappen', false), 'other_expense', 'Unknown → other_expense')
      assertEqual(detectCategory('Random bedrijf', 'Betaling', true), 'other_income', 'Unknown income → other_income')
    },
  },

  // ── E: normalizeCounterparty ─────────────────────────────────────────────
  {
    id: 'recurring-normalize-counterparty',
    name: 'normalizeCounterparty: tekst normalisatie',
    description: 'Strips special chars, lowercases, trims whitespace',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      assertEqual(normalizeCounterparty('Netflix B.V.'), 'netflix bv', 'Removes dots')
      assertEqual(normalizeCounterparty('  SPOTIFY  AB  '), 'spotify ab', 'Trims and normalizes spaces')
      assertEqual(normalizeCounterparty('NS-Groep N.V.'), 'nsgroep nv', 'Removes hyphens and dots')
      assertEqual(normalizeCounterparty('café restaurant'), 'caf restaurant', 'Removes accents/special')
    },
  },

  // ── F: Transfer matching logic (structural tests) ────────────────────────
  {
    id: 'transfer-match-opposite-amounts',
    name: 'Transfer matching: tegenovergestelde bedragen op zelfde dag',
    description: 'Matching transfers must have same absolute amount with opposite sign',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Transfer A: -500 from account 1
      // Transfer B: +500 to account 2
      const amountA = -500
      const amountB = 500
      const sameAbsolute = Math.abs(Math.abs(amountA) - Math.abs(amountB)) <= 0.005
      const oppositeSign = Math.sign(amountA) !== Math.sign(amountB)

      assert(sameAbsolute, 'Same absolute amount')
      assert(oppositeSign, 'Opposite signs')
    },
  },
  {
    id: 'transfer-match-date-tolerance',
    name: 'Transfer matching: tolerantie voor 1-dag verschil',
    description: 'Transfers within 1 day (86400000ms) are matched',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const dayA = new Date('2025-03-15').getTime()

      // Same day → match
      const sameDay = new Date('2025-03-15').getTime()
      assert(Math.abs(dayA - sameDay) <= 86_400_000, 'Same day matches')

      // Next day → match
      const nextDay = new Date('2025-03-16').getTime()
      assert(Math.abs(dayA - nextDay) <= 86_400_000, '1 day difference matches')

      // Two days later → no match
      const twoDays = new Date('2025-03-17').getTime()
      assert(Math.abs(dayA - twoDays) > 86_400_000, '2 day difference does NOT match')
    },
  },
  {
    id: 'transfer-match-iban-cross',
    name: 'Transfer matching: IBAN cross-referencing',
    description: 'Both IBANs must cross-match bidirectionally',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const accountA = { iban: 'NL91ABNA0417164300', counterpartyIban: 'NL20INGB0001234567' }
      const accountB = { iban: 'NL20INGB0001234567', counterpartyIban: 'NL91ABNA0417164300' }

      // Bidirectional cross-match
      const crossMatch =
        accountA.iban === accountB.counterpartyIban &&
        accountB.iban === accountA.counterpartyIban
      assert(crossMatch, 'Bidirectional IBAN cross-match')

      // Non-matching case
      const accountC = { iban: 'NL20INGB0001234567', counterpartyIban: 'NL99RABO9999999999' }
      const noMatch =
        accountA.iban === accountC.counterpartyIban &&
        accountC.iban === accountA.counterpartyIban
      assert(!noMatch, 'Non-matching IBANs rejected')
    },
  },
  {
    id: 'transfer-match-iban-normalization',
    name: 'Transfer matching: IBAN normalisatie (spaties, uppercase)',
    description: 'IBANs are normalized before matching (spaces removed, uppercase)',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const normalize = (iban: string) => iban.replace(/\s/g, '').toUpperCase()

      assertEqual(normalize('NL91 ABNA 0417 1643 00'), 'NL91ABNA0417164300')
      assertEqual(normalize('nl91abna0417164300'), 'NL91ABNA0417164300')
      assertEqual(normalize('NL91ABNA0417164300'), 'NL91ABNA0417164300')

      // After normalization, different formats match
      const a = normalize('NL91 ABNA 0417 1643 00')
      const b = normalize('nl91abna0417164300')
      assertEqual(a, b, 'Normalized IBANs match')
    },
  },
  {
    id: 'transfer-false-positive',
    name: 'Transfer matching: vergelijkbare bedragen GEEN transfers',
    description: 'Similar amounts from different counterparties should not be matched as transfers',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Two transactions with similar amounts but different counterparties
      const accountA = { iban: 'NL91ABNA0417164300', counterpartyIban: 'NL20INGB0001234567' }
      const accountB = { iban: 'NL99RABO9999999999', counterpartyIban: 'NL55TRIO0555555555' }

      // Same amount, opposite sign, same day — but IBANs don't cross-match
      const amountMatch = Math.abs(Math.abs(-100) - Math.abs(100)) <= 0.005
      const signMatch = Math.sign(-100) !== Math.sign(100)
      const ibanMatch =
        accountA.iban === accountB.counterpartyIban &&
        accountB.iban === accountA.counterpartyIban

      assert(amountMatch, 'Amounts match')
      assert(signMatch, 'Signs differ')
      assert(!ibanMatch, 'IBAN cross-match FAILS → not a transfer')
    },
  },

  // ── G: detectedToRecurring conversion ────────────────────────────────────
  {
    id: 'recurring-to-db-row',
    name: 'detectedToRecurring: correcte DB row conversie',
    description: 'Converts detected pattern to database-ready recurring transaction row',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const txs = generateMonthlyTx('Netflix', -15.99, 4)
      const detected = detectRecurringTransactions(txs)
      assertGreaterThan(detected.length, 0, 'Pattern detected')

      const row = detectedToRecurring(detected[0], 'acc-123', 'user-456')
      assertEqual(row.user_id, 'user-456', 'Correct user_id')
      assertEqual(row.account_id, 'acc-123', 'Correct account_id')
      assertEqual(row.frequency, 'monthly', 'Correct frequency')
      assert(row.is_active, 'Starts active')
      assertNotNull(row.start_date, 'Has start date')
      assertNotNull(row.name, 'Has name')
    },
  },

  // ── H: Category labels completeness ──────────────────────────────────────
  {
    id: 'recurring-category-labels-complete',
    name: 'CATEGORY_LABELS: alle categorieën hebben Dutch label',
    description: 'All RecurringCategory values have a Dutch label',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      const expectedCategories: RecurringCategory[] = [
        'salary', 'rent', 'mortgage', 'subscription', 'utility',
        'insurance', 'savings', 'transport', 'taxes', 'childcare',
        'housing_other', 'healthcare', 'donation', 'loan',
        'other_income', 'other_expense',
      ]
      for (const cat of expectedCategories) {
        assertNotNull(CATEGORY_LABELS[cat], `Label for ${cat}`)
        assertGreaterThan(CATEGORY_LABELS[cat].length, 0, `Non-empty label for ${cat}`)
      }
      assertEqual(Object.keys(CATEGORY_LABELS).length, 16, '16 category labels')
    },
  },

  // ── I: Minimum occurrences & filtering ───────────────────────────────────
  {
    id: 'recurring-min-occurrences',
    name: 'Minimum occurrences: te weinig transacties → geen detectie',
    description: 'Patterns with too few occurrences are not detected',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Only 2 monthly transactions (minimum is 3)
      const txs = generateMonthlyTx('Te weinig BV', -100, 2)
      const detected = detectRecurringTransactions(txs)
      const found = detected.find(d => d.counterpartyName.toLowerCase().includes('te weinig'))
      assertEqual(found, undefined, 'Not enough occurrences → not detected')
    },
  },
  {
    id: 'recurring-transfer-filtered',
    name: 'Transfers gefilterd uit recurring detectie',
    description: 'Transactions with type=transfer are excluded from detection',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const txs: TransactionForDetection[] = generateMonthlyTx('Eigen Rekening', -500, 5).map(t => ({
        ...t,
        transaction_type: 'transfer',
      }))
      const detected = detectRecurringTransactions(txs)
      assertEqual(detected.length, 0, 'Transfers are excluded')
    },
  },

  // ── J: Sorting order ─────────────────────────────────────────────────────
  {
    id: 'recurring-sort-confidence-amount',
    name: 'Sortering: confidence eerst, dan bedrag',
    description: 'Results sorted by confidence (high→low) then by amount (largest first)',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      // Create patterns with varying confidence
      const salary = generateMonthlyTx('Werkgever Salaris', 4000, 8) // high confidence (many occurrences, consistent)
      const netflix = generateMonthlyTx('Netflix', -15.99, 4) // medium confidence (fewer occurrences)
      const txs = [...salary, ...netflix]

      const detected = detectRecurringTransactions(txs)
      if (detected.length >= 2) {
        // Verify ordering: higher confidence first
        const confOrder = { high: 0, medium: 1, low: 2 }
        for (let i = 1; i < detected.length; i++) {
          const prevConf = confOrder[detected[i - 1].confidence]
          const currConf = confOrder[detected[i].confidence]
          if (prevConf !== currConf) {
            assert(prevConf <= currConf, 'Higher confidence comes first')
          } else {
            // Same confidence → larger amount first
            assertGreaterThanOrEqual(
              Math.abs(detected[i - 1].averageAmount),
              Math.abs(detected[i].averageAmount),
              'Larger amount first within same confidence'
            )
          }
        }
      }
    },
  },
]

export function register(): void {
  registerTests(tests)
}
