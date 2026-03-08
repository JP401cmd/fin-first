'use client'

import { useState } from 'react'
import {
  applyPrivacyFilter,
  normalisePrivacySettings,
  DEFAULT_PRIVACY_SETTINGS,
  type PrivacyLevel,
} from '@/lib/household-data'

interface TestResult {
  name: string
  passed: boolean
  details: string
}

function runTests(): TestResult[] {
  const results: TestResult[] = []

  // ── normalisePrivacySettings ──────────────────────────────────────────
  // Test 1: null input returns defaults
  const t1 = normalisePrivacySettings(null)
  results.push({
    name: 'normalisePrivacySettings(null) returns defaults',
    passed: JSON.stringify(t1) === JSON.stringify(DEFAULT_PRIVACY_SETTINGS),
    details: JSON.stringify(t1),
  })

  // Test 2: English keys pass through
  const t2 = normalisePrivacySettings({ assets: 'full', debts: 'hidden', budgets: 'totals', transactions: 'full', income: 'totals' })
  results.push({
    name: 'English keys pass through correctly',
    passed: t2.assets === 'full' && t2.debts === 'hidden' && t2.budgets === 'totals',
    details: JSON.stringify(t2),
  })

  // Test 3: Dutch keys are converted to English
  const t3 = normalisePrivacySettings({ vermogen: 'volledig', schulden: 'verborgen', budgetten: 'totalen', transacties: 'volledig', inkomen: 'totalen' })
  results.push({
    name: 'Dutch keys converted to English',
    passed: t3.assets === 'full' && t3.debts === 'hidden' && t3.budgets === 'totals' && t3.transactions === 'full' && t3.income === 'totals',
    details: JSON.stringify(t3),
  })

  // ── applyPrivacyFilter ────────────────────────────────────────────────
  const mockAssets = [
    { id: '1', name: 'Belegging A', current_value: 10000, ownership: 'personal', user_id: 'partner' },
    { id: '2', name: 'Belegging B', current_value: 25000, ownership: 'personal', user_id: 'partner' },
    { id: '3', name: 'Spaargeld', current_value: 5000, ownership: 'personal', user_id: 'partner' },
  ]

  // Test 4: 'full' returns all items unchanged
  const t4 = applyPrivacyFilter(mockAssets, 'full', 'Partner vermogen', 'current_value')
  results.push({
    name: "'full' returns all individual items",
    passed: t4.items.length === 3 && !t4.isAggregated && t4.aggregatedTotal === null,
    details: `items: ${t4.items.length}, aggregated: ${t4.isAggregated}`,
  })

  // Test 5: 'totals' returns single aggregated item
  const t5 = applyPrivacyFilter(mockAssets, 'totals', 'Partner vermogen (totaal)', 'current_value')
  results.push({
    name: "'totals' returns single aggregated item",
    passed: t5.items.length === 1 && t5.isAggregated && t5.aggregatedTotal === 40000,
    details: `items: ${t5.items.length}, total: ${t5.aggregatedTotal}, name: ${(t5.items[0] as Record<string,unknown>)?.name}`,
  })

  // Test 6: 'totals' aggregated item has correct total
  results.push({
    name: "'totals' total is sum of all items (10000 + 25000 + 5000 = 40000)",
    passed: t5.aggregatedTotal === 40000,
    details: `expected: 40000, got: ${t5.aggregatedTotal}`,
  })

  // Test 7: 'totals' aggregated item has _aggregated flag
  const aggItem = t5.items[0] as Record<string, unknown>
  results.push({
    name: "'totals' aggregated item has _aggregated flag",
    passed: aggItem?._aggregated === true && aggItem?._aggregatedCount === 3,
    details: `_aggregated: ${aggItem?._aggregated}, count: ${aggItem?._aggregatedCount}`,
  })

  // Test 8: 'hidden' returns empty array
  const t8 = applyPrivacyFilter(mockAssets, 'hidden', 'Partner vermogen', 'current_value')
  results.push({
    name: "'hidden' returns empty array",
    passed: t8.items.length === 0 && !t8.isAggregated,
    details: `items: ${t8.items.length}`,
  })

  // Test 9: Empty array with 'totals' returns empty
  const t9 = applyPrivacyFilter([], 'totals' as PrivacyLevel, 'Partner vermogen', 'current_value')
  results.push({
    name: "'totals' with empty array returns aggregatedTotal=0",
    passed: t9.items.length === 0 && t9.isAggregated && t9.aggregatedTotal === 0,
    details: `items: ${t9.items.length}, total: ${t9.aggregatedTotal}`,
  })

  // Test 10: Debts use current_balance key
  const mockDebts = [
    { id: '1', name: 'Hypotheek', current_balance: 200000, ownership: 'personal', user_id: 'partner' },
    { id: '2', name: 'Studielening', current_balance: 15000, ownership: 'personal', user_id: 'partner' },
  ]
  const t10 = applyPrivacyFilter(mockDebts, 'totals', 'Partner schulden (totaal)', 'current_balance')
  results.push({
    name: "'totals' works with debts (current_balance key)",
    passed: t10.aggregatedTotal === 215000 && t10.items.length === 1,
    details: `total: ${t10.aggregatedTotal}`,
  })

  // Test 11: Default privacy settings have all categories as 'totals'
  results.push({
    name: 'Default privacy: all categories are totals',
    passed: Object.values(DEFAULT_PRIVACY_SETTINGS).every(v => v === 'totals'),
    details: JSON.stringify(DEFAULT_PRIVACY_SETTINGS),
  })

  // Test 12: Categories are assets, debts, budgets, transactions, income
  const expectedCats = ['assets', 'debts', 'budgets', 'transactions', 'income']
  results.push({
    name: 'Privacy has all 5 categories',
    passed: expectedCats.every(c => c in DEFAULT_PRIVACY_SETTINGS),
    details: Object.keys(DEFAULT_PRIVACY_SETTINGS).join(', '),
  })

  return results
}

export default function TestHouseholdPrivacyFilter() {
  const [results] = useState(runTests)
  const passing = results.filter(r => r.passed).length
  const total = results.length

  return (
    <div className="mx-auto max-w-2xl p-8 space-y-6">
      <h1 className="text-2xl font-bold">Test: Household Privacy Filtering</h1>
      <p className="text-sm text-gray-500">
        Tests for applyPrivacyFilter and normalisePrivacySettings utilities.
      </p>

      <div className={`rounded-lg p-4 text-lg font-bold ${passing === total ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        {passing}/{total} tests passing
      </div>

      <div className="space-y-2">
        {results.map((r, i) => (
          <div key={i} className={`rounded-lg border p-3 ${r.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${r.passed ? 'text-green-600' : 'text-red-600'}`}>
                {r.passed ? '✓' : '✗'}
              </span>
              <span className="text-sm font-medium text-gray-900">{r.name}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500 font-mono">{r.details}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
