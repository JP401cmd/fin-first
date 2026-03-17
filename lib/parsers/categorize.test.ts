import { describe, it, expect } from 'vitest'
import {
  frequencyMatch,
  categorizeTransaction,
  type FrequencyMatch,
} from './categorize'
import type { Budget } from '@/lib/budget-data'

// ── Helper: create a mock budget ──────────────────────────────────────

function mockBudget(id: string, name: string, slug: string): Budget {
  return {
    id,
    name,
    slug,
    type: 'expense',
    parent_id: null,
    sort_order: 0,
    default_limit: '0',
    icon: null,
    color: null,
    is_income: false,
  } as unknown as Budget
}

// ── frequencyMatch ────────────────────────────────────────────────────

describe('frequencyMatch', () => {
  const freqMap = new Map<string, FrequencyMatch>([
    ['name:albert heijn', { budget_id: 'b1', count: 15, total: 16, confidence: 0.94 }],
    ['iban:NL02INGB0001234567', { budget_id: 'b2', count: 5, total: 6, confidence: 0.83 }],
  ])

  it('matches by counterparty name (case-insensitive)', () => {
    const result = frequencyMatch('Albert Heijn', null, freqMap)
    expect(result).not.toBeNull()
    expect(result!.budget_id).toBe('b1')
    expect(result!.confidence).toBe(0.94)
  })

  it('matches by counterparty IBAN (normalized)', () => {
    const result = frequencyMatch(null, 'NL02 INGB 0001234567', freqMap)
    expect(result).not.toBeNull()
    expect(result!.budget_id).toBe('b2')
  })

  it('prefers name match over IBAN match', () => {
    const result = frequencyMatch('Albert Heijn', 'NL02INGB0001234567', freqMap)
    expect(result!.budget_id).toBe('b1')
  })

  it('returns null when no match found', () => {
    const result = frequencyMatch('Unknown Store', 'NL99ABNA9999999999', freqMap)
    expect(result).toBeNull()
  })

  it('returns null for empty counterparty', () => {
    const result = frequencyMatch(null, null, freqMap)
    expect(result).toBeNull()
  })
})

// ── categorizeTransaction with frequency matching ─────────────────────

describe('categorizeTransaction with freqMap', () => {
  const budgets: Budget[] = [
    mockBudget('b-food', 'Boodschappen', 'boodschappen'),
    mockBudget('b-energy', 'Gas Water Licht', 'gas_water_licht'),
    mockBudget('b-freq', 'Frequentie Match', 'freq_match'),
  ]

  const freqMap = new Map<string, FrequencyMatch>([
    ['name:my local shop', { budget_id: 'b-freq', count: 10, total: 12, confidence: 0.83 }],
  ])

  it('frequency match takes priority over keyword rules', () => {
    // "my local shop" has no keyword rule, but has frequency data
    const result = categorizeTransaction(
      'Betaling My Local Shop',
      'My Local Shop',
      -25,
      budgets,
      undefined,
      undefined,
      null,
      freqMap,
    )
    expect(result.budget_id).toBe('b-freq')
    expect(result.confidence).toBe(0.83)
    expect(result.category_source).toBe('rule')
  })

  it('corrections take priority over frequency match', () => {
    const corrections = [
      { match_field: 'counterparty_name' as const, match_value: 'My Local Shop', budget_id: 'b-food' },
    ]
    const result = categorizeTransaction(
      'Betaling My Local Shop',
      'My Local Shop',
      -25,
      budgets,
      corrections,
      undefined,
      null,
      freqMap,
    )
    expect(result.budget_id).toBe('b-food')
    expect(result.confidence).toBe(1.0)
    expect(result.category_source).toBe('manual')
  })

  it('falls back to keyword rules when no frequency match', () => {
    const result = categorizeTransaction(
      'Albert Heijn betaling',
      'Albert Heijn',
      -45,
      budgets,
      undefined,
      undefined,
      null,
      freqMap,
    )
    expect(result.budget_id).toBe('b-food')
    expect(result.category_source).toBe('rule')
  })

  it('returns no match when nothing matches', () => {
    const result = categorizeTransaction(
      'Random payment XYZ',
      'Unknown',
      -10,
      budgets,
      undefined,
      undefined,
      null,
      freqMap,
    )
    expect(result.budget_id).toBeNull()
    expect(result.confidence).toBe(0)
  })

  it('works without freqMap (backward compatible)', () => {
    const result = categorizeTransaction(
      'Albert Heijn betaling',
      'Albert Heijn',
      -45,
      budgets,
    )
    expect(result.budget_id).toBe('b-food')
  })
})
