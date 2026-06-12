import { describe, it, expect } from 'vitest'
import { computeAutoCategorization, computeOwnAccountDetection, detectTransferPairs, type AutoCatContext, type AutoCatTx } from './auto-categorize'
import { BUDGET_SLUGS } from '@/lib/budget-data'
import type { Budget } from '@/lib/budget-data'
import type { CategoryCorrection, FrequencyMatch } from '@/lib/parsers/categorize'

function mockBudget(id: string, name: string, slug: string): Budget {
  return {
    id, name, slug, type: 'expense', parent_id: null, sort_order: 0,
    default_limit: '0', icon: null, color: null, is_income: false,
  } as unknown as Budget
}

const FOOD = mockBudget('food', 'Boodschappen', BUDGET_SLUGS.BOODSCHAPPEN)

function baseContext(overrides: Partial<AutoCatContext> = {}): AutoCatContext {
  return {
    budgets: [FOOD],
    corrections: [],
    freqMap: new Map<string, FrequencyMatch>(),
    ownIbans: new Set(['NL00OWN0000000000']),
    ownNamePatterns: ['mijn spaarpot'],
    eigenRekeningBudgetId: 'eigen',
    ...overrides,
  }
}

const TXS: AutoCatTx[] = [
  { id: 't1', description: 'Albert Heijn 123', counterparty_name: 'Albert Heijn', counterparty_iban: null, amount: -20 },
  { id: 't2', description: 'Overboeking', counterparty_name: null, counterparty_iban: 'NL00 OWN 0000000000', amount: -100 },
  { id: 't3', description: 'Naar pot', counterparty_name: 'Mijn Spaarpot', counterparty_iban: null, amount: -50 },
  { id: 't4', description: 'Qwerty 99999', counterparty_name: 'Qwerty BV', counterparty_iban: null, amount: -10 },
]

describe('computeAutoCategorization', () => {
  it('deelt in op trefwoordregel, eigen-rekening (IBAN + naam) en laat de rest over', () => {
    const r = computeAutoCategorization(TXS, baseContext())
    expect(r.ruleCount).toBe(1)
    expect(r.transferCount).toBe(2)
    expect(r.mirrorCandidateCount).toBe(0)
    expect(r.unmatchedCount).toBe(1)
    expect(r.assignments).toHaveLength(3)

    const a1 = r.assignments.find((a) => a.id === 't1')!
    expect(a1.budget_id).toBe('food')
    expect(a1.category_source).toBe('rule')
    expect(a1.isTransfer).toBe(false)

    const a2 = r.assignments.find((a) => a.id === 't2')!
    expect(a2.budget_id).toBe('eigen')
    expect(a2.category_source).toBe('transfer')
    expect(a2.isTransfer).toBe(true)

    const a3 = r.assignments.find((a) => a.id === 't3')!
    expect(a3.isTransfer).toBe(true)
    expect(a3.budget_id).toBe('eigen')
  })

  it('gebruikt een correctieregel (eerdere toewijzing) → category_source manual', () => {
    const corrections: CategoryCorrection[] = [
      { match_field: 'counterparty_name', match_value: 'Qwerty BV', budget_id: 'food' },
    ]
    const r = computeAutoCategorization(TXS, baseContext({ corrections }))
    const a4 = r.assignments.find((a) => a.id === 't4')!
    expect(a4.budget_id).toBe('food')
    expect(a4.category_source).toBe('manual')
    expect(r.unmatchedCount).toBe(0)
  })

  it('zonder eigen-rekening-budget vallen transfers terug op onmatched', () => {
    const r = computeAutoCategorization(TXS, baseContext({ eigenRekeningBudgetId: null }))
    expect(r.transferCount).toBe(0)
    // t2 en t3 (transfers) konden nergens heen, t4 matcht niet → 3 onmatched
    expect(r.unmatchedCount).toBe(3)
    expect(r.ruleCount).toBe(1)
  })
})

describe('computeOwnAccountDetection', () => {
  it('markeert alleen eigen-rekening-overboekingen (IBAN + naam-patroon)', () => {
    const r = computeOwnAccountDetection(TXS, baseContext())
    expect(r.transferCount).toBe(2)
    expect(r.unmatchedCount).toBe(2)
    expect(r.assignments.map((a) => a.id).sort()).toEqual(['t2', 't3'])
    expect(r.assignments.every((a) => a.isTransfer && a.budget_id === 'eigen' && a.category_source === 'transfer')).toBe(true)
  })

  it('zonder eigen-rekening-budget levert niets op', () => {
    const r = computeOwnAccountDetection(TXS, baseContext({ eigenRekeningBudgetId: null }))
    expect(r.assignments).toHaveLength(0)
    expect(r.transferCount).toBe(0)
  })
})

// ── detectTransferPairs ───────────────────────────────────────────────

function pairTx(id: string, amount: number, date: string, account_id: string | null): AutoCatTx {
  return { id, description: '', counterparty_name: null, counterparty_iban: null, amount, date, account_id }
}

describe('detectTransferPairs', () => {
  it('koppelt een tegengesteld paar op verschillende rekeningen binnen 2 dagen', () => {
    const ids = detectTransferPairs([
      pairTx('a', -100, '2026-06-01', 'acc-1'),
      pairTx('b', 100, '2026-06-02', 'acc-2'),
    ])
    expect([...ids].sort()).toEqual(['a', 'b'])
  })

  it('koppelt NIET wanneer het bedrag hetzelfde teken heeft', () => {
    const ids = detectTransferPairs([
      pairTx('a', -100, '2026-06-01', 'acc-1'),
      pairTx('b', -100, '2026-06-01', 'acc-2'),
    ])
    expect(ids.size).toBe(0)
  })

  it('koppelt NIET op dezelfde rekening', () => {
    const ids = detectTransferPairs([
      pairTx('a', -100, '2026-06-01', 'acc-1'),
      pairTx('b', 100, '2026-06-01', 'acc-1'),
    ])
    expect(ids.size).toBe(0)
  })

  it('koppelt NIET buiten het datumvenster (> 2 dagen)', () => {
    const ids = detectTransferPairs([
      pairTx('a', -100, '2026-06-01', 'acc-1'),
      pairTx('b', 100, '2026-06-04', 'acc-2'),
    ])
    expect(ids.size).toBe(0)
  })

  it('respecteert de bedrag-tolerantie (0.005)', () => {
    const within = detectTransferPairs([
      pairTx('a', -100.004, '2026-06-01', 'acc-1'),
      pairTx('b', 100, '2026-06-01', 'acc-2'),
    ])
    expect(within.size).toBe(2)
    const outside = detectTransferPairs([
      pairTx('a', -100.01, '2026-06-01', 'acc-1'),
      pairTx('b', 100, '2026-06-01', 'acc-2'),
    ])
    expect(outside.size).toBe(0)
  })

  it('elke transactie zit in hooguit één paar (greedy, dichtstbijzijnde datum)', () => {
    // a (-100) kan met b (+100, zelfde dag) of c (+100, +2 dagen). De dichtstbijzijnde
    // (b) wint; c blijft ongepaard (geen ander tegenbeen meer over).
    const ids = detectTransferPairs([
      pairTx('a', -100, '2026-06-01', 'acc-1'),
      pairTx('b', 100, '2026-06-01', 'acc-2'),
      pairTx('c', 100, '2026-06-03', 'acc-3'),
    ])
    expect([...ids].sort()).toEqual(['a', 'b'])
  })

  it('negeert transacties zonder datum of zonder account_id', () => {
    const ids = detectTransferPairs([
      pairTx('a', -100, '2026-06-01', null),
      pairTx('b', 100, '2026-06-01', 'acc-2'),
      { id: 'c', description: '', counterparty_name: null, counterparty_iban: null, amount: 100, date: null, account_id: 'acc-3' },
    ])
    expect(ids.size).toBe(0)
  })
})

// ── Spiegelpaar-integratie in de batch-functies ───────────────────────
//
// GEDRAGSWIJZIGING (code-review H1): een spiegelpaar is een FUZZY signaal (een
// échte uitgave + toevallig gelijke ontvangst binnen 2 dagen is een vals-
// positief). Het wordt daarom NIET meer stil als transfer weggeschreven. De
// batch-functies tellen zulke leden los (`mirrorCandidateCount`) en wijzen ze
// niet toe; de UI biedt ze als review-voorstel aan. De onderstaande tests zijn
// bewust omgezet van "silent apply" naar "tellen, niet toepassen".

describe('spiegelpaar-integratie', () => {
  const pair: AutoCatTx[] = [
    pairTx('p1', -250, '2026-06-01', 'acc-1'),
    pairTx('p2', 250, '2026-06-01', 'acc-2'),
  ]

  it('computeAutoCategorization wijst spiegelparen NIET toe maar telt ze als kandidaat', () => {
    const r = computeAutoCategorization(pair, baseContext())
    expect(r.transferCount).toBe(0)
    expect(r.mirrorCandidateCount).toBe(2)
    expect(r.assignments).toHaveLength(0)
    // Niet als onmatched geteld: kandidaten staan apart, niet in unmatchedCount.
    expect(r.unmatchedCount).toBe(0)
  })

  it('spiegelparen tellen ook zonder eigen-rekening-budget als kandidaat (niet toegepast)', () => {
    const r = computeAutoCategorization(pair, baseContext({ eigenRekeningBudgetId: null }))
    expect(r.transferCount).toBe(0)
    expect(r.mirrorCandidateCount).toBe(2)
    expect(r.unmatchedCount).toBe(0)
  })

  it('een tx die ÉN spiegelpaar ÉN IBAN matcht is een sterk signaal → wél toegewezen', () => {
    // p1 zit in een spiegelpaar én heeft een eigen-rekening-IBAN. Het sterke
    // signaal wint: toegewezen als transfer, niet enkel als kandidaat geteld.
    const strong: AutoCatTx[] = [
      { id: 'p1', description: 'Overboeking', counterparty_name: null, counterparty_iban: 'NL00OWN0000000000', amount: -250, date: '2026-06-01', account_id: 'acc-1' },
      pairTx('p2', 250, '2026-06-01', 'acc-2'),
    ]
    const r = computeAutoCategorization(strong, baseContext())
    expect(r.transferCount).toBe(1)
    expect(r.assignments.map((a) => a.id)).toEqual(['p1'])
    // p2 blijft een spiegelpaar-kandidaat (geen sterk signaal).
    expect(r.mirrorCandidateCount).toBe(1)
  })

  it('computeOwnAccountDetection wijst spiegelparen NIET toe maar telt ze als kandidaat', () => {
    const r = computeOwnAccountDetection(pair, baseContext())
    expect(r.transferCount).toBe(0)
    expect(r.mirrorCandidateCount).toBe(2)
    expect(r.assignments).toHaveLength(0)
  })

  it('computeOwnAccountDetection markeert IBAN/naam-transfers wél en spiegelparen als kandidaat', () => {
    // TXS bevat t2 (IBAN) + t3 (naam) als sterke transfers; voeg een spiegelpaar toe.
    const mixed: AutoCatTx[] = [...TXS, ...pair]
    const r = computeOwnAccountDetection(mixed, baseContext())
    expect(r.transferCount).toBe(2) // t2 + t3 (sterk)
    expect(r.assignments.map((a) => a.id).sort()).toEqual(['t2', 't3'])
    expect(r.mirrorCandidateCount).toBe(2) // p1 + p2 (fuzzy)
  })
})

// ── DST-randgeval (code-review M1) ─────────────────────────────────────

describe('detectTransferPairs — DST', () => {
  it('koppelt over de najaars-DST-grens (2 kalenderdagen = 49 wandklok-uren)', () => {
    // In NL valt de najaars-DST in de nacht van zaterdag op zondag eind oktober;
    // 2026 is dat 25 oktober. Het venster 24→26 okt beslaat 49 uur. Een kale
    // ms/86_400_000 geeft 2.042 (> 2) en zou het paar missen; de kalenderdag-
    // teller (Math.round) houdt het op 2 en koppelt wel.
    const ids = detectTransferPairs([
      pairTx('a', -100, '2026-10-24', 'acc-1'),
      pairTx('b', 100, '2026-10-26', 'acc-2'),
    ])
    expect([...ids].sort()).toEqual(['a', 'b'])
  })
})
