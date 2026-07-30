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
import { findTransferPairs, type UnlinkedTransfer } from '@/lib/transfer-matching'

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
      // Twee jaarboekingen volstaan voor het patroon zelf (MIN_OCCURRENCES.yearly
      // is 2), maar `detectRecurringTransactions` heeft een instapdrempel op de
      // TOTALE invoer (`recurring-detection.ts`, `transactions.length < 3`). Met
      // maar twee rijen kwam de functie dus nooit voorbij die poort en testte
      // deze case in werkelijkheid niets. De losse ruisregel brengt de invoer op
      // drie zonder het jaarpatroon te raken.
      const txs: TransactionForDetection[] = [
        { id: 'y1', date: '2024-03-01', amount: -120, description: 'Jaarabonnement', counterparty_name: 'ANWB', is_income: false, budget_id: null },
        { id: 'y2', date: '2025-03-01', amount: -120, description: 'Jaarabonnement', counterparty_name: 'ANWB', is_income: false, budget_id: null },
        { id: 'ruis', date: '2025-06-14', amount: -8.5, description: 'Losse aankoop', counterparty_name: 'Kiosk', is_income: false, budget_id: null },
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

  // ── F: Transfer matching logic — roept de echte motor (findTransferPairs
  // uit lib/transfer-matching.ts) aan i.p.v. de matchregels hier te
  // herimplementeren. Deze sectie herimplementeerde voorheen de boolean-logica
  // inline (amount/sign/date/IBAN-vergelijkingen als losse expressies) en kon
  // een echte regressie in de matcher dus per constructie nooit vangen: hij
  // toetste zijn eigen kopie, niet de motor. `lib/transfer-matching.test.ts`
  // dekt findTransferPairs al grondig (vitest); deze cases zijn de
  // in-app-regressie-spiegel daarvan, met dezelfde motor.
  {
    id: 'transfer-match-opposite-amounts',
    name: 'Transfer matching: tegenovergestelde bedragen op zelfde dag',
    description: 'findTransferPairs koppelt alleen bij gelijk absoluut bedrag met tegengesteld teken',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const ibans = new Map([['acc-a', 'NL91ABNA0417164300'], ['acc-b', 'NL20INGB0001234567']])

      // Tegengestelde tekens, gelijk absoluut bedrag → paar
      const opposite: UnlinkedTransfer[] = [
        { id: 'uit', account_id: 'acc-a', date: '2025-03-15', amount: -500, counterparty_iban: 'NL20INGB0001234567' },
        { id: 'in', account_id: 'acc-b', date: '2025-03-15', amount: 500, counterparty_iban: 'NL91ABNA0417164300' },
      ]
      const pairs = findTransferPairs(opposite, ibans)
      assertEqual(pairs.length, 1, 'Tegengestelde bedragen worden gekoppeld')
      assertEqual(pairs[0][0], 'uit')
      assertEqual(pairs[0][1], 'in')

      // Zelfde teken (beide uitgaven) → geen paar, ook al is het bedrag gelijk
      const sameSign: UnlinkedTransfer[] = [
        { id: 'a', account_id: 'acc-a', date: '2025-03-15', amount: -500, counterparty_iban: 'NL20INGB0001234567' },
        { id: 'b', account_id: 'acc-b', date: '2025-03-15', amount: -500, counterparty_iban: 'NL91ABNA0417164300' },
      ]
      assertEqual(findTransferPairs(sameSign, ibans).length, 0, 'Gelijk teken koppelt niet')
    },
  },
  {
    id: 'transfer-match-date-tolerance',
    name: 'Transfer matching: tolerantie voor 1-dag verschil',
    description: 'findTransferPairs koppelt binnen 1 dag (86400000ms), niet daarna',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const ibans = new Map([['acc-a', 'NL91ABNA0417164300'], ['acc-b', 'NL20INGB0001234567']])
      const base = (bDate: string): UnlinkedTransfer[] => [
        { id: 'uit', account_id: 'acc-a', date: '2025-03-15', amount: -250, counterparty_iban: 'NL20INGB0001234567' },
        { id: 'in', account_id: 'acc-b', date: bDate, amount: 250, counterparty_iban: 'NL91ABNA0417164300' },
      ]

      assertEqual(findTransferPairs(base('2025-03-15'), ibans).length, 1, 'Zelfde dag koppelt')
      assertEqual(findTransferPairs(base('2025-03-16'), ibans).length, 1, '1 dag verschil koppelt')
      assertEqual(findTransferPairs(base('2025-03-17'), ibans).length, 0, '2 dagen verschil koppelt NIET')
    },
  },
  {
    id: 'transfer-match-iban-cross',
    name: 'Transfer matching: IBAN cross-referencing',
    description: 'findTransferPairs vereist dat beide IBANs elkaar kruislings bevestigen',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Bidirectioneel kloppende IBANs → paar
      const crossMatch: UnlinkedTransfer[] = [
        { id: 'uit', account_id: 'acc-a', date: '2025-03-15', amount: -300, counterparty_iban: 'NL20INGB0001234567' },
        { id: 'in', account_id: 'acc-b', date: '2025-03-15', amount: 300, counterparty_iban: 'NL91ABNA0417164300' },
      ]
      const ibans = new Map([['acc-a', 'NL91ABNA0417164300'], ['acc-b', 'NL20INGB0001234567']])
      assertEqual(findTransferPairs(crossMatch, ibans).length, 1, 'Bidirectionele IBAN-match koppelt')

      // acc-b's counterparty_iban wijst NIET naar acc-a's eigen IBAN → geen kruislingse bevestiging
      const oneSided: UnlinkedTransfer[] = [
        { id: 'uit', account_id: 'acc-a', date: '2025-03-15', amount: -300, counterparty_iban: 'NL20INGB0001234567' },
        { id: 'in', account_id: 'acc-b', date: '2025-03-15', amount: 300, counterparty_iban: 'NL99RABO9999999999' },
      ]
      assertEqual(findTransferPairs(oneSided, ibans).length, 0, 'Eenzijdige IBAN-match koppelt NIET')
    },
  },
  {
    id: 'transfer-match-iban-normalization',
    name: 'Transfer matching: IBAN normalisatie (spaties, uppercase)',
    description: 'findTransferPairs normaliseert IBANs (spaties/hoofdletters) vóór het vergelijken',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // IBANs in de invoer én in de account-map staan bewust ongelijk
      // geformatteerd (spaties, kleine letters) — de motor moet ze zelf
      // normaliseren, niet de test.
      const transfers: UnlinkedTransfer[] = [
        { id: 'uit', account_id: 'acc-a', date: '2025-03-15', amount: -250, counterparty_iban: 'nl20 ingb 0001 2345 67' },
        { id: 'in', account_id: 'acc-b', date: '2025-03-15', amount: 250, counterparty_iban: 'NL91 ABNA 0417 1643 00' },
      ]
      const ibans = new Map([['acc-a', 'nl91abna0417164300'], ['acc-b', ' NL20INGB0001234567 ']])

      const pairs = findTransferPairs(transfers, ibans)
      assertEqual(pairs.length, 1, 'Genormaliseerde IBANs koppelen ondanks afwijkende invoer-opmaak')
      assertEqual(pairs[0][0], 'uit')
      assertEqual(pairs[0][1], 'in')
    },
  },
  {
    id: 'transfer-false-positive',
    name: 'Transfer matching: vergelijkbare bedragen GEEN transfers',
    description: 'findTransferPairs koppelt NIET wanneer bedrag/datum kloppen maar de IBANs niet kruislings matchen',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Gelijk bedrag, tegengesteld teken, zelfde dag — maar de rekeningen
      // horen niet bij elkaar (geen kruislingse IBAN-bevestiging), dus dit is
      // gewoon twee losse boekingen bij verschillende tegenpartijen.
      const transfers: UnlinkedTransfer[] = [
        { id: 'a', account_id: 'acc-a', date: '2025-03-15', amount: -100, counterparty_iban: 'NL20INGB0001234567' },
        { id: 'b', account_id: 'acc-c', date: '2025-03-15', amount: 100, counterparty_iban: 'NL55TRIO0555555555' },
      ]
      const ibans = new Map([['acc-a', 'NL91ABNA0417164300'], ['acc-c', 'NL99RABO9999999999']])

      assertEqual(findTransferPairs(transfers, ibans).length, 0, 'Geen kruislingse IBAN-match → geen transfer-paar')
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
