/**
 * Regression tests: Vaste Kosten Analyse
 *
 * Tests for the category-split logic that separates recurring expenses
 * into abonnementen (subscriptions) and vaste kosten (fixed costs).
 */

import { registerTests, registerCategory } from '../test-registry'
import {
  assert,
  assertEqual,
  assertGreaterThan,
  assertGreaterThanOrEqual,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  detectRecurringTransactions,
  detectCategory,
  type TransactionForDetection,
  type RecurringCategory,
  CATEGORY_LABELS,
} from '@/lib/recurring-detection'

const CAT = 'wil.vaste-kosten-analyse'

registerCategory({
  id: CAT,
  label: 'De Wil — Vaste Kosten Analyse',
  description: 'Categorie-split, maandbedrag normalisatie, subtotalen',
  icon: 'RefreshCw',
  testCount: 0,
})

// ── Constants (mirroring API route) ──────────────────────────────────────────

const SUBSCRIPTION_CATEGORIES: RecurringCategory[] = ['subscription']
const VASTE_KOSTEN_CATEGORIES: RecurringCategory[] = ['rent', 'mortgage', 'utility', 'insurance', 'transport']
const EXCLUDED_CATEGORIES: RecurringCategory[] = ['salary', 'savings', 'other_income', 'other_expense']

// ── Helpers ──────────────────────────────────────────────────────────────────

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
      date: `${y}-${String(m).padStart(2, '0')}-15`,
      amount,
      description: `Betaling ${counterparty}`,
      counterparty_name: counterparty,
      is_income: amount > 0,
      budget_id: null,
    })
  }
  return txs
}

function toMonthly(amount: number, frequency: string): number {
  const abs = Math.abs(amount)
  switch (frequency) {
    case 'weekly': return (abs * 52) / 12
    case 'quarterly': return abs / 3
    case 'yearly': return abs / 12
    default: return abs
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  {
    id: 'vaste-kosten-category-split',
    name: 'Categorie-split: abonnementen vs vaste kosten correct gescheiden',
    description: 'Mixed recurring items are correctly placed in subscription vs fixed cost groups',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 150,
    fn() {
      const txs = [
        ...generateMonthlyTx('Netflix', -15.99, 6),
        ...generateMonthlyTx('Spotify AB', -9.99, 6),
        ...generateMonthlyTx('Vestia Wooncorporatie', -750, 6),
        ...generateMonthlyTx('Eneco Energie', -180, 6),
        ...generateMonthlyTx('Centraal Beheer Verzekering', -95, 6),
      ]

      const detected = detectRecurringTransactions(txs)
      const expenses = detected.filter(d => !d.isIncome && d.confidence !== 'low')

      const subs = expenses.filter(d => SUBSCRIPTION_CATEGORIES.includes(d.suggestedCategory))
      const vk = expenses.filter(d => VASTE_KOSTEN_CATEGORIES.includes(d.suggestedCategory))

      assertGreaterThanOrEqual(subs.length, 2, 'At least 2 subscriptions (Netflix, Spotify)')
      assertGreaterThanOrEqual(vk.length, 2, 'At least 2 fixed costs (Vestia, Eneco, or Centraal Beheer)')

      // Verify no overlap — an item cannot be in both groups
      const subKeys = new Set(subs.map(s => s.key))
      for (const v of vk) {
        assert(!subKeys.has(v.key), `${v.counterpartyName} should not appear in both groups`)
      }
    },
  },
  {
    id: 'vaste-kosten-subscription-filter',
    name: 'Filter: alleen subscription in links, rent/utility/insurance/transport rechts',
    description: 'Category assignment maps correctly to the two columns',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Test detectCategory directly
      assertEqual(detectCategory('Netflix', 'Netflix betaling', false), 'subscription', 'Netflix = subscription')
      assertEqual(detectCategory('Spotify AB', 'Spotify', false), 'subscription', 'Spotify = subscription')
      assertEqual(detectCategory('Basic-Fit', 'sportschool', false), 'subscription', 'Basic-Fit = subscription')

      const vestia = detectCategory('Vestia', 'huur', false)
      assert(vestia === 'rent', `Vestia = rent, got ${vestia}`)

      const eneco = detectCategory('Eneco', 'energie', false)
      assert(eneco === 'utility', `Eneco = utility, got ${eneco}`)

      const cb = detectCategory('Centraal Beheer', 'verzekering', false)
      assert(cb === 'insurance', `Centraal Beheer = insurance, got ${cb}`)

      const ns = detectCategory('NS', 'ov-chipkaart', false)
      assert(ns === 'transport', `NS = transport, got ${ns}`)

      // Verify column assignment
      assert(SUBSCRIPTION_CATEGORIES.includes('subscription'), 'subscription in left column')
      assert(VASTE_KOSTEN_CATEGORIES.includes('rent'), 'rent in right column')
      assert(VASTE_KOSTEN_CATEGORIES.includes('utility'), 'utility in right column')
      assert(VASTE_KOSTEN_CATEGORIES.includes('insurance'), 'insurance in right column')
      assert(VASTE_KOSTEN_CATEGORIES.includes('transport'), 'transport in right column')
    },
  },
  {
    id: 'vaste-kosten-excluded-categories',
    name: 'Uitsluiting: salary, savings, other_income, other_expense niet in analyse',
    description: 'Income and savings categories are excluded from both columns',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      for (const cat of EXCLUDED_CATEGORIES) {
        assert(
          !SUBSCRIPTION_CATEGORIES.includes(cat) && !VASTE_KOSTEN_CATEGORIES.includes(cat),
          `${cat} should not appear in either column`,
        )
      }

      // Verify salary detection is excluded
      const salary = detectCategory('Werkgever BV', 'salaris', true)
      assertEqual(salary, 'salary', 'Salary correctly detected')
      assert(!SUBSCRIPTION_CATEGORIES.includes(salary), 'Salary not in subscriptions')
      assert(!VASTE_KOSTEN_CATEGORIES.includes(salary), 'Salary not in vaste kosten')
    },
  },
  {
    id: 'vaste-kosten-monthly-normalization',
    name: 'Normalisatie: weekly, quarterly, yearly correct naar maandbedrag',
    description: 'Frequency-based amount normalization produces correct monthly equivalents',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // Weekly: €10/week → €10 × 52 / 12 ≈ €43.33
      const weekly = toMonthly(10, 'weekly')
      assert(Math.abs(weekly - 43.33) < 0.01, `Weekly: expected ~43.33, got ${weekly.toFixed(2)}`)

      // Monthly: €50/month → €50
      const monthly = toMonthly(50, 'monthly')
      assertEqual(monthly, 50, 'Monthly passthrough')

      // Quarterly: €150/quarter → €50/month
      const quarterly = toMonthly(150, 'quarterly')
      assertEqual(quarterly, 50, 'Quarterly to monthly')

      // Yearly: €600/year → €50/month
      const yearly = toMonthly(600, 'yearly')
      assertEqual(yearly, 50, 'Yearly to monthly')
    },
  },
  {
    id: 'vaste-kosten-subtotals',
    name: 'Subtotalen: kolom-subtotalen en grand total kloppen',
    description: 'Column subtotals and grand total are computed correctly',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const txs = [
        ...generateMonthlyTx('Netflix', -15.99, 6),
        ...generateMonthlyTx('Spotify AB', -9.99, 6),
        ...generateMonthlyTx('Eneco Energie', -180, 6),
      ]

      const detected = detectRecurringTransactions(txs)
      const expenses = detected.filter(d => !d.isIncome && d.confidence !== 'low')

      const subs = expenses.filter(d => SUBSCRIPTION_CATEGORIES.includes(d.suggestedCategory))
      const vk = expenses.filter(d => VASTE_KOSTEN_CATEGORIES.includes(d.suggestedCategory))

      const subTotal = subs.reduce((s, d) => s + toMonthly(d.averageAmount, d.frequency), 0)
      const vkTotal = vk.reduce((s, d) => s + toMonthly(d.averageAmount, d.frequency), 0)
      const grandTotal = subTotal + vkTotal

      assertGreaterThan(subTotal, 0, 'Subscription subtotal > 0')
      assertGreaterThan(vkTotal, 0, 'Vaste kosten subtotal > 0')
      assertEqual(grandTotal, subTotal + vkTotal, 'Grand total = sub + vk subtotals')

      // Verify individual amounts are plausible
      assert(subTotal < 100, `Sub total should be ~26, got ${subTotal.toFixed(2)}`)
      assert(vkTotal > 100, `VK total should be ~180, got ${vkTotal.toFixed(2)}`)
    },
  },
  {
    id: 'vaste-kosten-empty-column',
    name: 'Lege kolom: alleen abonnementen zonder vaste kosten',
    description: 'One column can be empty while the other has items',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 80,
    fn() {
      // Only subscriptions, no fixed costs
      const txs = [
        ...generateMonthlyTx('Netflix', -15.99, 6),
        ...generateMonthlyTx('Spotify AB', -9.99, 6),
      ]

      const detected = detectRecurringTransactions(txs)
      const expenses = detected.filter(d => !d.isIncome && d.confidence !== 'low')

      const subs = expenses.filter(d => SUBSCRIPTION_CATEGORIES.includes(d.suggestedCategory))
      const vk = expenses.filter(d => VASTE_KOSTEN_CATEGORIES.includes(d.suggestedCategory))

      assertGreaterThanOrEqual(subs.length, 2, 'At least 2 subscriptions')
      assertEqual(vk.length, 0, 'No vaste kosten when only subscriptions present')
    },
  },
]

export function register() {
  registerTests(tests)
}
