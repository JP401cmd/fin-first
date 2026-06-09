import { describe, it, expect } from 'vitest'
import {
  frequencyMatch,
  categorizeTransaction,
  isOwnAccountTransfer,
  isWalletTransferType,
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

  it('detects an own-account transfer via name pattern (Priority 0)', () => {
    const result = categorizeTransaction(
      'Opwaardering PayPal',
      'PayPal (Europe) S.a.r.l. et Cie',
      -50,
      budgets,
      undefined,
      undefined, // no own IBANs
      null,
      undefined,
      ['paypal'], // ownNamePatterns
    )
    expect(result.isTransfer).toBe(true)
    expect(result.category_source).toBe('transfer')
    expect(result.budget_id).toBeNull()
  })
})

// ── isOwnAccountTransfer ──────────────────────────────────────────────

describe('isOwnAccountTransfer', () => {
  const ownIbans = new Set(['NL02INGB0001234567', 'NL91ABNA0417164300'])

  it('matches a counterparty IBAN in the own-IBAN set (normalized)', () => {
    expect(isOwnAccountTransfer('NL02 INGB 0001234567', ownIbans)).toBe(true)
  })

  it('does not match an unknown IBAN', () => {
    expect(isOwnAccountTransfer('NL99RABO0123456789', ownIbans)).toBe(false)
  })

  it('matches a counterparty name against a name pattern (case-insensitive)', () => {
    expect(
      isOwnAccountTransfer(null, ownIbans, 'PayPal (Europe) S.a.r.l.', ['paypal']),
    ).toBe(true)
  })

  it('returns false when neither IBAN nor name matches', () => {
    expect(
      isOwnAccountTransfer('NL99RABO0123456789', ownIbans, 'Albert Heijn', ['paypal']),
    ).toBe(false)
  })

  it('returns false for null IBAN with no name patterns', () => {
    expect(isOwnAccountTransfer(null, ownIbans)).toBe(false)
  })
})

// ── isWalletTransferType ──────────────────────────────────────────────

describe('isWalletTransferType', () => {
  const values = ['Bank Deposit to PP Account', 'Algemene opname']

  it('matches a known wallet transfer type (case-insensitive)', () => {
    expect(isWalletTransferType('bank deposit to pp account', values)).toBe(true)
    expect(isWalletTransferType('Algemene opname', values)).toBe(true)
  })

  it('does not match a regular payment type', () => {
    expect(isWalletTransferType('Algemene betaling', values)).toBe(false)
  })

  it('returns false for null/empty source type or no configured values', () => {
    expect(isWalletTransferType(null, values)).toBe(false)
    expect(isWalletTransferType('Algemene opname', undefined)).toBe(false)
    expect(isWalletTransferType('Algemene opname', [])).toBe(false)
  })
})
