import { describe, it, expect, vi } from 'vitest'
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

  it('prefers IBAN match over name match (IBAN is het eenduidiger signaal)', () => {
    // Bewust bijgewerkt: frequencyMatch probeert nu IBAN VÓÓR naam, gelijk aan de
    // correctie-laag (priority 1). De oude test pinde de omgekeerde volgorde
    // (naam-eerst) vast; dat was de zwakkere keuze. Beide keys bestaan in freqMap
    // maar wijzen naar verschillende budgetten, dus de volgorde is observeerbaar.
    const result = frequencyMatch('Albert Heijn', 'NL02INGB0001234567', freqMap)
    expect(result!.budget_id).toBe('b2')
  })

  it('returns null when no match found', () => {
    const result = frequencyMatch('Unknown Store', 'NL99ABNA9999999999', freqMap)
    expect(result).toBeNull()
  })

  it('returns null for empty counterparty', () => {
    const result = frequencyMatch(null, null, freqMap)
    expect(result).toBeNull()
  })

  it('matcht een PSP-/ruis-variant op dezelfde genormaliseerde naam-key', () => {
    // De map-key is "name:albert heijn"; een binnenkomende "CCV*Albert Heijn 1032"
    // moet via normalizeCounterparty op diezelfde key landen.
    const result = frequencyMatch('CCV*Albert Heijn 1032', null, freqMap)
    expect(result).not.toBeNull()
    expect(result!.budget_id).toBe('b1')
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

// ── Salaris-scenario: deelbudget moet in de (platte) budgets-set zitten ──
// Regressie voor de jun-2026 bug: vanaf de budgetpagina kreeg de sheet de
// budget-BOOM (alleen parents top-level), waardoor het deelbudget
// "Salaris & uitkering" onzichtbaar was voor frequentie- én keyword-laag.
// De sheet flattent nu zelf; deze tests pinnen het pure-functie-contract
// (set mét child → match; set zónder child → null + warn-log).

describe('categorizeTransaction — salaris-scenario (boom-vs-flat regressie)', () => {
  const salarisBudget = mockBudget('b-salaris', 'Salaris & uitkering', 'salaris-uitkering')
  // 15 historische ProjectHuis BV-boekingen — ruim boven de ≥3-drempel.
  // Key is genormaliseerd: normalizeCounterparty('ProjectHuis BV') → 'projecthuis'.
  const freqMap = new Map<string, FrequencyMatch>([
    ['name:projecthuis', { budget_id: 'b-salaris', count: 15, total: 15, confidence: 0.95 }],
  ])

  it('matcht op het deelbudget wanneer de budgets-set plat is (child aanwezig)', () => {
    const result = categorizeTransaction(
      'Salaris december 2025',
      'ProjectHuis BV',
      4200,
      [salarisBudget],
      undefined,
      undefined,
      null,
      freqMap,
    )
    expect(result.budget_id).toBe('b-salaris')
    expect(result.category_source).toBe('rule')
  })

  it('degradeert naar null MET warn-log wanneer het deelbudget ontbreekt (boom-doorgave)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Alleen de parent in de set — exact de situatie vóór de fix.
    const parentOnly = [mockBudget('b-inkomen', 'Inkomen', 'inkomen')]
    const result = categorizeTransaction(
      'Salaris december 2025',
      'ProjectHuis BV',
      4200,
      parentOnly,
      undefined,
      undefined,
      null,
      freqMap,
    )
    expect(result.budget_id).toBeNull()
    // Zowel de frequentie-miss als de keyword-miss horen gelogd te worden —
    // stil degraderen was precies wat de bug onvindbaar maakte.
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
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

// ── category_corrections met budget_id null (FK-violation bug, rood vóór fix) ──
//
// Bug: category_corrections.budget_id FK = NO ACTION / NOT NULL.
// Als een budget wordt verwijderd (save_budget_plan of direct DELETE) terwijl er
// corrections op staan, knalt de DB met FK-violation. Geplande fix: budget_id
// nullable + ON DELETE SET NULL + guard in categorizeTransaction zodat null-corrections
// worden overgeslagen.
//
// VERWACHTE STATUS: de eerste twee tests zijn ROD zolang de fix er niet is, omdat
// het huidige code-pad `idMap.get(c.budget_id)` aanroept met null (JS: geeft
// undefined) en vervolgens `return { budget_id: null, confidence: 1.0, ... }` —
// category_source='manual' terwijl het een wees-rij is. De derde test (regressie
// voor geldige correcties) zou groen moeten zijn.

describe('categorizeTransaction — correction met budget_id null (na fix)', () => {
  const budgets: Budget[] = [
    mockBudget('b-food', 'Boodschappen', 'boodschappen'),
    mockBudget('b-energy', 'Gas Water Licht', 'gas_water_licht'),
  ]

  it('correction met budget_id null wordt overgeslagen, valt door naar keyword-regel', () => {
    // Na de fix: null-corrections zijn wees-rijen (budget verwijderd) → overslaan.
    // "Albert Heijn" → via keyword-regel naar boodschappen.
    const correctionsWithNullBudget = [
      { match_field: 'counterparty_name' as const, match_value: 'Albert Heijn', budget_id: null },
    ]
    const result = categorizeTransaction(
      'Albert Heijn betaling',
      'Albert Heijn',
      -45,
      budgets,
      correctionsWithNullBudget,
    )
    // Moet NIET een null budget_id teruggeven als correction-hit
    expect(result.budget_id).not.toBeNull()            // keyword-fallback geeft een resultaat
    expect(result.category_source).not.toBe('manual')  // het is GEEN manual-correctie-hit
    expect(result.budget_id).toBe('b-food')             // keyword-regel wint: boodschappen
  })

  it('correction met budget_id null via IBAN wordt overgeslagen', () => {
    const correctionsWithNullBudget = [
      { match_field: 'counterparty_iban' as const, match_value: 'NL02INGB0001234567', budget_id: null },
    ]
    const result = categorizeTransaction(
      'Onbekende beschrijving',
      'Onbekende winkel',
      -10,
      budgets,
      correctionsWithNullBudget,
      undefined,
      'NL02INGB0001234567',
    )
    // Null-IBAN-correction mag niet een manual-hit retourneren
    expect(result.category_source).not.toBe('manual')
  })

  it('geldige correction (budget_id ingevuld) wint met confidence 1.0 — regressie', () => {
    // Basisgedrag mag niet worden aangetast door de null-guard
    const validCorrections = [
      { match_field: 'counterparty_name' as const, match_value: 'Albert Heijn', budget_id: 'b-energy' },
    ]
    const result = categorizeTransaction(
      'Albert Heijn betaling',
      'Albert Heijn',
      -45,
      budgets,
      validCorrections,
    )
    expect(result.budget_id).toBe('b-energy')
    expect(result.confidence).toBe(1.0)
    expect(result.category_source).toBe('manual')
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
