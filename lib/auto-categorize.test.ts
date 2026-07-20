import { describe, it, expect, vi } from 'vitest'
import {
  computeAutoCategorization,
  computeOwnAccountDetection,
  detectTransferPairs,
  runCombinedCategorization,
  buildCombinedGroups,
  orderGroupsLargestFirst,
  type AutoCatContext,
  type AutoCatTx,
  type CombinedAiBatchItem,
  type CombinedAiResult,
  type CombinedTx,
} from './auto-categorize'
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

// ── Combined pass: regelmotor → AI (per genormaliseerde tegenpartij) → propagatie ──
//
// De "gecombineerde automaat" (Notion-kaart jul 2026). Vergrendelt:
//  - regel-hits gaan NOOIT naar de AI-resolver;
//  - 1 nieuwe tegenpartij × N transacties → precies 1 AI-call-item, N−1 propagatie;
//  - propagatie op de GENORMALISEERDE key ("CCV*BAKKER 12" ↔ "Bakker");
//  - richting bewaakt: uitgave-oordeel propageert niet naar een inkomst;
//  - grote batches: #AI-rondes = ceil(onbekende representanten / 20), interleaved;
//  - abort stopt verdere AI-rondes, al-gedane voorstellen blijven;
//  - resolver-fout → failedBatches, geen oneindige lus.

function unknownTx(id: string, counterparty: string | null, amount = -10, overrides: Partial<CombinedTx> = {}): CombinedTx {
  return {
    id,
    description: `betaling ${id}`,
    counterparty_name: counterparty,
    counterparty_iban: null,
    amount,
    ...overrides,
  }
}

/** Resolver die elke representant hetzelfde budget geeft en de batches vastlegt. */
function makeResolver(budgetId: string | null = 'food') {
  const batches: CombinedAiBatchItem[][] = []
  const resolver = vi.fn(async (batch: CombinedAiBatchItem[]): Promise<CombinedAiResult[]> => {
    batches.push(batch)
    return batch.map((b) => ({ id: b.id, budget_id: budgetId, confidence: 0.8, reasoning: 'ai-oordeel' }))
  })
  return { resolver, batches }
}

describe('runCombinedCategorization', () => {
  it('regel-hits gaan nooit naar de AI; onbekenden wel', async () => {
    const { resolver, batches } = makeResolver()
    const txs: CombinedTx[] = [
      unknownTx('r1', 'Albert Heijn'), // trefwoordregel (confidence 1.0)
      unknownTx('u1', 'Qwerty BV'),    // onbekend → AI
    ]
    const result = await runCombinedCategorization(txs, baseContext(), resolver)

    expect(resolver).toHaveBeenCalledTimes(1)
    expect(batches[0].map((b) => b.id)).toEqual(['u1'])
    expect(result.proposals.get('r1')).toMatchObject({ source: 'rule', budget_id: 'food', category_source: 'rule' })
    expect(result.proposals.get('u1')).toMatchObject({ source: 'ai', budget_id: 'food', category_source: 'ai' })
    expect(result.counts).toMatchObject({ rule: 1, ai: 1, propagated: 0, unresolved: 0 })
  })

  it('1 nieuwe tegenpartij × N → precies 1 AI-item, N−1 propagatie', async () => {
    const { resolver, batches } = makeResolver()
    const txs = Array.from({ length: 7 }, (_, i) => unknownTx(`n${i}`, 'Qwerty BV'))
    const result = await runCombinedCategorization(txs, baseContext(), resolver)

    expect(resolver).toHaveBeenCalledTimes(1)
    expect(batches[0]).toHaveLength(1) // 1 representant, niet 7 payload-items
    expect(result.counts.ai).toBe(1)
    expect(result.counts.propagated).toBe(6)
    // Alle zeven hebben een voorstel op hetzelfde budget.
    for (const tx of txs) expect(result.proposals.get(tx.id)?.budget_id).toBe('food')
  })

  it('propageert op de GENORMALISEERDE tegenpartij-key (PSP-ruis)', async () => {
    const { resolver } = makeResolver()
    const txs = [
      unknownTx('psp1', 'CCV*BAKKER 12'),
      unknownTx('psp2', 'Bakker'),
      unknownTx('psp3', 'ZETTLE_*Bakker'),
    ]
    const result = await runCombinedCategorization(txs, baseContext(), resolver)

    // Eén genormaliseerde tegenpartij ("bakker") → één AI-item, rest afgeleid.
    expect(resolver).toHaveBeenCalledTimes(1)
    expect(result.counts.ai).toBe(1)
    expect(result.counts.propagated).toBe(2)
  })

  it('bewaakt de richting: een uitgave-oordeel propageert niet naar een inkomst', async () => {
    const { resolver, batches } = makeResolver()
    const txs = [
      unknownTx('out1', 'Qwerty BV', -25),
      unknownTx('out2', 'Qwerty BV', -30),
      unknownTx('in1', 'Qwerty BV', 25), // terugbetaling: eigen AI-oordeel
    ]
    const result = await runCombinedCategorization(txs, baseContext(), resolver)

    // Twee richtingen = twee groepen = twee representanten (in één ronde).
    expect(resolver).toHaveBeenCalledTimes(1)
    expect(batches[0]).toHaveLength(2)
    expect(result.counts.ai).toBe(2)
    expect(result.counts.propagated).toBe(1)
    expect(result.proposals.get('in1')?.source).toBe('ai')
  })

  it('grote batch: #AI-rondes = ceil(onbekende representanten / 20), interleaved met propagatie', async () => {
    // "6000-transacties-scenario" in het klein gehouden op aantallen die de
    // wiskunde exact toetsen: 50 unieke onbekende tegenpartijen × 120 transacties
    // elk = 6000 transacties → ceil(50/20) = 3 AI-rondes van 20+20+10, en
    // 50 × 119 = 5950 propagaties. Regel-hits (nog eens 100 stuks) blijven gratis.
    // NB: namen zónder "spatie + 2-5 cijfers" — normalizeCounterparty stript
    // trailing kassanummers ("Winkel 12" → "winkel"), wat hier juist NIET de
    // bedoeling is: we willen 50 échte unieke tegenpartijen.
    const { resolver, batches } = makeResolver()
    const txs: CombinedTx[] = []
    for (let c = 0; c < 50; c++) {
      for (let i = 0; i < 120; i++) txs.push(unknownTx(`c${c}-${i}`, `Bedrijf${c}`))
    }
    for (let i = 0; i < 100; i++) txs.push(unknownTx(`ah-${i}`, 'Albert Heijn'))

    const progress: number[] = []
    const result = await runCombinedCategorization(txs, baseContext(), resolver, {
      onProgress: (p) => progress.push(p.round),
    })

    expect(resolver).toHaveBeenCalledTimes(3)
    expect(batches.map((b) => b.length)).toEqual([20, 20, 10])
    expect(result.aiRounds).toBe(3)
    expect(result.counts).toMatchObject({ rule: 100, ai: 50, propagated: 5950, unresolved: 0 })
    // Interleaving zichtbaar in de voortgang: rondes 0 → 1 → 2 → 3.
    expect(progress[0]).toBe(0)
    expect(progress[progress.length - 1]).toBe(3)
  })

  it('interleaving cross-key: een IBAN-groep wordt ná een eerdere AI-ronde zonder nieuwe call afgehandeld', async () => {
    // Groep A (op naam, rep heeft óók een IBAN) wordt in ronde 1 beantwoord;
    // groep B deelt dat IBAN maar heeft geen naam → wordt vóór ronde 2 door de
    // propagatie-veeg opgelost i.p.v. een eigen AI-call te krijgen. We forceren
    // batchSize 1 zodat B anders een eigen ronde had gehad.
    const { resolver, batches } = makeResolver()
    const txs = [
      unknownTx('a1', 'Qwerty BV', -25, { counterparty_iban: 'NL11 RABO 0123 4567 89' }),
      unknownTx('b1', null, -40, { counterparty_iban: 'NL11RABO0123456789' }),
    ]
    const result = await runCombinedCategorization(txs, baseContext(), resolver, { batchSize: 1 })

    expect(resolver).toHaveBeenCalledTimes(1)
    expect(batches[0].map((b) => b.id)).toEqual(['a1'])
    expect(result.proposals.get('b1')).toMatchObject({ source: 'propagated', budget_id: 'food' })
  })

  it('abort stopt verdere AI-rondes; al-gedane voorstellen blijven staan', async () => {
    const controller = new AbortController()
    const batches: CombinedAiBatchItem[][] = []
    const resolver = vi.fn(async (batch: CombinedAiBatchItem[]): Promise<CombinedAiResult[]> => {
      batches.push(batch)
      controller.abort() // breek af ná de eerste ronde
      return batch.map((b) => ({ id: b.id, budget_id: 'food', confidence: 0.8 }))
    })
    const txs = [
      ...Array.from({ length: 20 }, (_, i) => unknownTx(`x${i}`, `Bedrijf${i}`)),
      unknownTx('later', 'Bedrijf99'),
    ]
    const result = await runCombinedCategorization(txs, baseContext(), resolver, { batchSize: 20, signal: controller.signal })

    expect(resolver).toHaveBeenCalledTimes(1)
    expect(result.aborted).toBe(true)
    expect(result.counts.ai).toBe(20) // ronde 1 volledig verwerkt
    expect(result.proposals.has('later')).toBe(false)
    expect(result.counts.unresolved).toBe(1)
  })

  it('resolver-fout → batch in failedBatches, lus eindigt, rest gaat door', async () => {
    let call = 0
    const resolver = vi.fn(async (batch: CombinedAiBatchItem[]): Promise<CombinedAiResult[]> => {
      call++
      if (call === 1) throw new Error('AI niet beschikbaar')
      return batch.map((b) => ({ id: b.id, budget_id: 'food', confidence: 0.8 }))
    })
    const txs = Array.from({ length: 25 }, (_, i) => unknownTx(`f${i}`, `Bedrijf${i}`))
    const result = await runCombinedCategorization(txs, baseContext(), resolver, { batchSize: 20 })

    expect(resolver).toHaveBeenCalledTimes(2)
    expect(result.failedBatches).toHaveLength(1)
    expect(result.failedBatches[0]).toHaveLength(20)
    expect(result.counts.ai).toBe(5) // ronde 2 slaagde wel
    expect(result.counts.unresolved).toBe(20)
  })

  it('AI-"onbekend" (budget_id null) telt als afgehandeld, geen voorstel en geen dubbel-toewijzing', async () => {
    const { resolver } = makeResolver(null)
    const txs = [unknownTx('u1', 'Qwerty BV'), unknownTx('u2', 'Qwerty BV')]
    const result = await runCombinedCategorization(txs, baseContext(), resolver)

    expect(resolver).toHaveBeenCalledTimes(1)
    expect(result.proposals.size).toBe(0)
    expect(result.counts.unresolved).toBe(2)
  })

  it('minRuleConfidence stuurt zwakke regel-hits alsnog naar de AI (import #101-gedrag)', async () => {
    const { resolver, batches } = makeResolver()
    // "kleding overige"-trefwoordregel heeft confidence 0.7 (< 0.8) — mét een
    // budget voor die slug wordt het een zwakke regel-hit.
    const kleding = mockBudget('kleding', 'Kleding & overige', BUDGET_SLUGS.KLEDING_OVERIGE)
    const ctx = baseContext({ budgets: [FOOD, kleding] })
    const txs = [
      unknownTx('weak1', 'Zalando'),     // trefwoord 0.7 → onder drempel → AI
      unknownTx('strong1', 'Albert Heijn'), // trefwoord 1.0 → blijft regel
    ]
    const result = await runCombinedCategorization(txs, ctx, resolver, { minRuleConfidence: 0.8 })

    expect(batches[0].map((b) => b.id)).toEqual(['weak1'])
    expect(result.proposals.get('weak1')?.source).toBe('ai')
    expect(result.proposals.get('strong1')?.source).toBe('rule')
  })

  it('sterke transfers en spiegelparen worden voorstel (transfer/mirror) en gaan nooit naar de AI', async () => {
    const { resolver, batches } = makeResolver()
    const txs: CombinedTx[] = [
      // Sterk signaal: eigen IBAN.
      unknownTx('t1', null, -100, { counterparty_iban: 'NL00 OWN 0000000000' }),
      // Spiegelpaar (fuzzy): zelfde bedrag tegengesteld, andere rekening.
      unknownTx('m1', 'Onbekend A', -250, { date: '2026-06-01', account_id: 'acc-1' }),
      unknownTx('m2', 'Onbekend B', 250, { date: '2026-06-01', account_id: 'acc-2' }),
    ]
    const result = await runCombinedCategorization(txs, baseContext(), resolver)

    expect(result.proposals.get('t1')).toMatchObject({ source: 'transfer', budget_id: 'eigen', isTransfer: true, category_source: 'transfer' })
    expect(result.proposals.get('m1')).toMatchObject({ source: 'mirror', budget_id: 'eigen', isTransfer: true })
    expect(result.proposals.get('m2')).toMatchObject({ source: 'mirror', budget_id: 'eigen', isTransfer: true })
    // Geen van de drie in een AI-batch.
    const sentIds = new Set(batches.flat().map((b) => b.id))
    expect(sentIds.has('t1')).toBe(false)
    expect(sentIds.has('m1')).toBe(false)
    expect(sentIds.has('m2')).toBe(false)
  })

  it('transacties zonder naam én IBAN vormen singleton-groepen (geen propagatie-key)', async () => {
    const { resolver, batches } = makeResolver()
    const txs = [unknownTx('solo1', null), unknownTx('solo2', null)]
    const result = await runCombinedCategorization(txs, baseContext(), resolver)

    // Beide gaan zelf naar de AI (in één ronde), niets wordt afgeleid.
    expect(batches[0]).toHaveLength(2)
    expect(result.counts.ai).toBe(2)
    expect(result.counts.propagated).toBe(0)
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

// ── WP-E1 (feature #881): buildCombinedGroups / orderGroupsLargestFirst / ─────
// groupOrder / onBeforeRound — motor-scheduling-opties bovenop de bestaande
// combined pass (WP-A). Bestaande 30 tests hierboven blijven ongewijzigd
// (parity-pin); dit blok test alleen de nieuwe opties.

describe('buildCombinedGroups', () => {
  it('groepeert first-seen op genormaliseerde naam+richting, valt terug op IBAN, singleton zonder beide', () => {
    const txs: CombinedTx[] = [
      unknownTx('a1', 'Bakker', -10),
      unknownTx('a2', 'Bakker', -20),
      unknownTx('b1', null, -5, { counterparty_iban: 'NL11RABO0123456789' }),
      unknownTx('b2', null, -7, { counterparty_iban: 'NL11 RABO 0123 4567 89' }),
      unknownTx('c1', null, -3), // geen naam, geen IBAN → singleton
    ]
    const groups = buildCombinedGroups(txs)

    // First-seen Map-insertievolgorde: a-groep (eerst gezien) → b-groep → singleton.
    expect([...groups.keys()]).toEqual([
      'name:bakker:uit',
      'iban:NL11RABO0123456789:uit',
      'tx:c1',
    ])
    expect(groups.get('name:bakker:uit')!.map((t) => t.id)).toEqual(['a1', 'a2'])
    expect(groups.get('iban:NL11RABO0123456789:uit')!.map((t) => t.id)).toEqual(['b1', 'b2'])
    expect(groups.get('tx:c1')!.map((t) => t.id)).toEqual(['c1'])
  })

  it('richting zit in de key: een uitgave en een inkomst van dezelfde tegenpartij vormen aparte groepen', () => {
    const txs: CombinedTx[] = [
      unknownTx('out1', 'Qwerty BV', -25),
      unknownTx('in1', 'Qwerty BV', 25),
    ]
    const groups = buildCombinedGroups(txs)
    expect([...groups.keys()]).toEqual(['name:qwerty:uit', 'name:qwerty:in'])
  })
})

describe('orderGroupsLargestFirst', () => {
  it('sorteert grootste groep eerst', () => {
    const groups = new Map<string, CombinedTx[]>([
      ['small', [unknownTx('s1', 'A')]],
      ['big', [unknownTx('b1', 'B'), unknownTx('b2', 'B'), unknownTx('b3', 'B')]],
      ['medium', [unknownTx('m1', 'C'), unknownTx('m2', 'C')]],
    ])
    const ordered = orderGroupsLargestFirst(['small', 'big', 'medium'], groups)
    expect(ordered).toEqual(['big', 'medium', 'small'])
  })

  it('tie-break bij gelijke grootte: meest recente datum eerst', () => {
    const groups = new Map<string, CombinedTx[]>([
      ['x', [unknownTx('x1', 'X', -10, { date: '2026-06-01' }), unknownTx('x2', 'X', -10, { date: '2026-06-05' })]],
      ['y', [unknownTx('y1', 'Y', -10, { date: '2026-06-10' }), unknownTx('y2', 'Y', -10, { date: '2026-06-02' })]],
    ])
    // Beide groepen tellen 2 leden; y's meest recente datum (06-10) > x's (06-05).
    const ordered = orderGroupsLargestFirst(['x', 'y'], groups)
    expect(ordered).toEqual(['y', 'x'])
  })

  it('een groep zonder datums telt als oudste (lege string) bij de tie-break', () => {
    const groups = new Map<string, CombinedTx[]>([
      ['nodate', [unknownTx('n1', 'N'), unknownTx('n2', 'N')]], // geen date-veld
      ['dated', [unknownTx('d1', 'D', -10, { date: '2026-01-01' }), unknownTx('d2', 'D', -10, { date: '2026-01-02' })]],
    ])
    const ordered = orderGroupsLargestFirst(['nodate', 'dated'], groups)
    expect(ordered).toEqual(['dated', 'nodate'])
  })

  it('muteert de meegegeven keys-array niet', () => {
    const groups = new Map<string, CombinedTx[]>([
      ['a', [unknownTx('a1', 'A'), unknownTx('a2', 'A')]],
      ['b', [unknownTx('b1', 'B')]],
    ])
    const input = ['b', 'a']
    const inputCopy = [...input]
    const ordered = orderGroupsLargestFirst(input, groups)
    expect(input).toEqual(inputCopy) // ongewijzigd
    expect(ordered).toEqual(['a', 'b']) // wél herordend in de return-waarde
    expect(ordered).not.toBe(input) // nieuwe array, geen alias
  })
})

describe('runCombinedCategorization — groupOrder', () => {
  // Drie tegenpartij-groepen van verschillende grootte, in first-seen-volgorde
  // b1(2) → b2(5) → b3(3). batchSize:1 dwingt één representant per AI-ronde af
  // zodat de batch-volgorde de groep-volgorde 1-op-1 weerspiegelt.
  function groupedTxs(): CombinedTx[] {
    return [
      ...Array.from({ length: 2 }, (_, i) => unknownTx(`b1-${i}`, 'Bedrijf1')),
      ...Array.from({ length: 5 }, (_, i) => unknownTx(`b2-${i}`, 'Bedrijf2')),
      ...Array.from({ length: 3 }, (_, i) => unknownTx(`b3-${i}`, 'Bedrijf3')),
    ]
  }

  it('default (geen groupOrder) behoudt de first-seen-volgorde', async () => {
    const { resolver, batches } = makeResolver()
    await runCombinedCategorization(groupedTxs(), baseContext(), resolver, { batchSize: 1 })

    expect(batches.map((b) => b[0].id)).toEqual(['b1-0', 'b2-0', 'b3-0'])
  })

  it("groupOrder: 'largest-first' verwerkt de grootste groep (5 leden) eerst, dan 3, dan 2", async () => {
    const { resolver, batches } = makeResolver()
    const result = await runCombinedCategorization(groupedTxs(), baseContext(), resolver, {
      batchSize: 1,
      groupOrder: 'largest-first',
    })

    expect(batches.map((b) => b[0].id)).toEqual(['b2-0', 'b3-0', 'b1-0'])
    // Contentieuze telling blijft kloppen ongeacht de volgorde.
    expect(result.counts.ai).toBe(3)
    expect(result.counts.propagated).toBe(1 + 2 + 4) // (2-1)+(3-1)+(5-1)
  })
})

describe('runCombinedCategorization — onBeforeRound', () => {
  it('wordt vóór élke AI-ronde geawait: aanroepen = aantal rondes', async () => {
    const { resolver } = makeResolver()
    const txs = [unknownTx('g1', 'Bedrijf1'), unknownTx('g2', 'Bedrijf2')]
    let calls = 0
    const onBeforeRound = vi.fn(async () => {
      calls++
    })
    const result = await runCombinedCategorization(txs, baseContext(), resolver, {
      batchSize: 1, // 2 groepen, batchSize 1 → 2 rondes
      onBeforeRound,
    })

    expect(result.aiRounds).toBe(2)
    expect(onBeforeRound).toHaveBeenCalledTimes(2)
    expect(calls).toBe(2)
  })

  it('een hangende onBeforeRound blokkeert de eerstvolgende AI-call totdat hij resolved', async () => {
    const { resolver } = makeResolver()
    const txs = [unknownTx('g1', 'Bedrijf1')]
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const onBeforeRound = vi.fn(async () => {
      await gate
    })

    const runPromise = runCombinedCategorization(txs, baseContext(), resolver, { onBeforeRound })

    // Laat de microtask-queue leeglopen zonder de gate te openen: de resolver
    // mag nog NIET zijn aangeroepen zolang onBeforeRound hangt.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(resolver).not.toHaveBeenCalled()

    release()
    const result = await runPromise

    expect(resolver).toHaveBeenCalledTimes(1)
    expect(result.proposals.get('g1')?.budget_id).toBe('food')
  })

  it('abort tijdens de onBeforeRound-wacht → aborted=true, eerdere voorstellen blijven, resolver niet meer aangeroepen', async () => {
    const controller = new AbortController()
    const { resolver, batches } = makeResolver()
    const txs = [unknownTx('g1', 'Bedrijf1'), unknownTx('g2', 'Bedrijf2')]
    let round = 0
    const onBeforeRound = vi.fn(async () => {
      round++
      if (round === 2) controller.abort() // breek af vlak vóór de 2e AI-ronde
    })

    const result = await runCombinedCategorization(txs, baseContext(), resolver, {
      batchSize: 1,
      onBeforeRound,
      signal: controller.signal,
    })

    expect(resolver).toHaveBeenCalledTimes(1) // alleen ronde 1 haalde de resolver
    expect(batches).toHaveLength(1)
    expect(result.aborted).toBe(true)
    // Ronde 1 (g1) is al toegewezen vóór het afbreken.
    expect(result.proposals.get('g1')).toMatchObject({ source: 'ai', budget_id: 'food' })
    // Ronde 2 (g2) is nooit aan de AI aangeboden.
    expect(result.proposals.has('g2')).toBe(false)
    expect(result.counts.unresolved).toBe(1)
  })
})

describe('runCombinedCategorization — parity met lege opts (pin)', () => {
  it('gemengde set (regel + sterke transfer + spiegelpaar + AI-groep met propagatie) levert een identiek, vastgepind resultaat', async () => {
    const { resolver } = makeResolver()
    const txs: CombinedTx[] = [
      // Regel-hit (trefwoord, blijft lokaal).
      unknownTx('r1', 'Albert Heijn'),
      // Sterk signaal: eigen IBAN → transfer.
      unknownTx('t1', null, -100, { counterparty_iban: 'NL00 OWN 0000000000' }),
      // Spiegelpaar (fuzzy) → mirror-voorstel, geen AI-call.
      unknownTx('m1', 'Onbekend A', -250, { date: '2026-06-01', account_id: 'acc-1' }),
      unknownTx('m2', 'Onbekend B', 250, { date: '2026-06-01', account_id: 'acc-2' }),
      // Onbekende tegenpartij × 3 → 1 AI-call, 2 propagaties.
      unknownTx('u1', 'Qwerty BV'),
      unknownTx('u2', 'Qwerty BV'),
      unknownTx('u3', 'Qwerty BV'),
    ]

    const result = await runCombinedCategorization(txs, baseContext(), resolver, {})

    expect(result.aiRounds).toBe(1)
    expect(result.aborted).toBe(false)
    expect(result.failedBatches).toEqual([])
    expect(result.counts).toEqual({ rule: 1, transfer: 1, mirror: 2, ai: 1, propagated: 2, unresolved: 0 })

    expect(result.proposals.get('r1')).toMatchObject({ budget_id: 'food', source: 'rule', category_source: 'rule', isTransfer: false })
    expect(result.proposals.get('t1')).toMatchObject({ budget_id: 'eigen', source: 'transfer', category_source: 'transfer', isTransfer: true })
    expect(result.proposals.get('m1')).toMatchObject({ budget_id: 'eigen', source: 'mirror', category_source: 'transfer', isTransfer: true })
    expect(result.proposals.get('m2')).toMatchObject({ budget_id: 'eigen', source: 'mirror', category_source: 'transfer', isTransfer: true })
    expect(result.proposals.get('u1')).toMatchObject({ budget_id: 'food', source: 'ai', category_source: 'ai', isTransfer: false })
    expect(result.proposals.get('u2')).toMatchObject({ budget_id: 'food', source: 'propagated', category_source: 'ai', isTransfer: false })
    expect(result.proposals.get('u3')).toMatchObject({ budget_id: 'food', source: 'propagated', category_source: 'ai', isTransfer: false })
    expect(result.proposals.size).toBe(7)
  })
})

// ── no-match-signaal (bug: "Fin denkt na…" blijft hangen) ────────────────
//
// Bug (bug-reporter): een groep die een AI-ronde doorliep maar géén bruikbaar
// voorstel kreeg (below-threshold/leeg antwoord voor de representant, óf
// batch-fout → failedBatches) is in het huidige resultaat ononderscheidbaar
// van "nog niet verwerkt" — de wizard-kaart blijft daardoor laden tot de héle
// run klaar is.
//
// Beoogd contract (nog NIET geïmplementeerd — deze tests horen ROOD te zijn
// tot de coder het bouwt):
//  1. CombinedRunResult krijgt `noMatchIds: string[]` — tx-ids van ALLE leden
//     van groepen die een AI-ronde doorliepen zonder bruikbaar voorstel.
//  2. Nieuwe optionele callback `opts.onNoMatch?: (txIds: string[]) => void`,
//     per ronde aangeroepen (ná de propagatie-registratie van die ronde) met
//     de no-match-tx-ids van díe ronde; niet aangeroepen zonder no-matches.
//  3. Default-behoudend: zonder de callback/het veld te lezen is het gedrag
//     byte-voor-byte gelijk aan vandaag.
//
// Het contract bestaat nog niet in de typen — we lezen/geven het daarom via
// een lokaal verruimd type i.p.v. `as any`/ts-expect-error op productiecode,
// zodat deze testfile gewoon compileert (`tsc --noEmit` blijft schoon) terwijl
// de assertions op het ontbrekende gedrag rood gaan.
type RunOpts = Parameters<typeof runCombinedCategorization>[3]
type ExtendedOpts = RunOpts & { onNoMatch?: (txIds: string[]) => void }
type CombinedRunResultExt = Awaited<ReturnType<typeof runCombinedCategorization>> & {
  noMatchIds: string[]
}

describe('no-match-signaal', () => {
  it('(a) groep zonder bruikbaar AI-resultaat (representant ontbreekt in de respons) → noMatchIds bevat al haar leden, proposals niet', async () => {
    const txs: CombinedTx[] = [
      unknownTx('a1', 'Bakker'),
      unknownTx('a2', 'Bakker'),
      unknownTx('b1', 'Qwerty BV'),
      unknownTx('b2', 'Qwerty BV'),
    ]
    // Alleen een resultaat voor de Bakker-representant (a1); voor de Qwerty-
    // representant (b1) komt er geen entry terug — below-threshold/leeg
    // antwoord, precies het scenario uit de bug.
    const resolver = vi.fn(async (batch: CombinedAiBatchItem[]): Promise<CombinedAiResult[]> => {
      return batch
        .filter((b) => b.id === 'a1')
        .map((b) => ({ id: b.id, budget_id: 'food', confidence: 0.9 }))
    })

    const result = (await runCombinedCategorization(
      txs,
      baseContext(),
      resolver,
    )) as CombinedRunResultExt

    // Groep A (Bakker) kreeg wél een voorstel.
    expect(result.proposals.has('a1')).toBe(true)
    expect(result.proposals.has('a2')).toBe(true)
    // Groep B (Qwerty) kreeg geen voorstel — dit deel klopt al vandaag.
    expect(result.proposals.has('b1')).toBe(false)
    expect(result.proposals.has('b2')).toBe(false)

    // Het nieuwe contract: noMatchIds moet exact groep B's leden bevatten.
    expect(result.noMatchIds).toBeDefined()
    expect(result.noMatchIds.slice().sort()).toEqual(['b1', 'b2'])
  })

  it('(b) falende AI-ronde (failedBatches-pad) → alle leden van die ronde in noMatchIds', async () => {
    const txs: CombinedTx[] = [
      unknownTx('c1', 'Bakker'),
      unknownTx('c2', 'Bakker'),
      unknownTx('d1', 'Qwerty BV'),
    ]
    const resolver = vi.fn(async (): Promise<CombinedAiResult[]> => {
      throw new Error('AI niet beschikbaar')
    })

    const result = (await runCombinedCategorization(
      txs,
      baseContext(),
      resolver,
    )) as CombinedRunResultExt

    expect(result.failedBatches).toHaveLength(1)
    expect(result.proposals.size).toBe(0)
    expect(result.noMatchIds).toBeDefined()
    expect(result.noMatchIds.slice().sort()).toEqual(['c1', 'c2', 'd1'])
  })

  it('(c) onNoMatch wordt per ronde aangeroepen met exact de no-match-ids van díe ronde; ronde zonder no-match roept niet aan', async () => {
    const txs: CombinedTx[] = [
      unknownTx('e1', 'Bakker'),
      unknownTx('e2', 'Bakker'),
      unknownTx('f1', 'Qwerty BV'),
    ]
    let call = 0
    const resolver = vi.fn(async (batch: CombinedAiBatchItem[]): Promise<CombinedAiResult[]> => {
      call++
      if (call === 1) return [] // ronde 1 (Bakker-groep): geen resultaat → no-match
      return batch.map((b) => ({ id: b.id, budget_id: 'food', confidence: 0.9 })) // ronde 2 (Qwerty): wél match
    })
    const onNoMatch = vi.fn()
    const opts: ExtendedOpts = { batchSize: 1, onNoMatch }

    const result = (await runCombinedCategorization(
      txs,
      baseContext(),
      resolver,
      opts,
    )) as CombinedRunResultExt

    expect(resolver).toHaveBeenCalledTimes(2)
    // Ronde 1 had een no-match (Bakker-groep) → precies 1 aanroep, met e1+e2.
    expect(onNoMatch).toHaveBeenCalledTimes(1)
    expect(onNoMatch).toHaveBeenCalledWith(['e1', 'e2'])
    // Ronde 2 (Qwerty) had géén no-match → geen tweede aanroep (al gedekt door
    // toHaveBeenCalledTimes(1) hierboven, expliciet benoemd voor leesbaarheid).
    expect(result.noMatchIds.slice().sort()).toEqual(['e1', 'e2'])
  })

  it('(e) propagatie-veeg tegen een eerder-onbekende gedeelde key → die leden landen óók in noMatchIds + onNoMatch (code-review L2)', async () => {
    // Twee groepen die een IBAN-key delen maar een andere naam hebben, zodat ze
    // op naam apart groeperen (primary key = naam) maar via de cross-key-veeg
    // elkaar raken. Groep A's representant komt als "onbekend" (geen budget_id)
    // terug → geregistreerd als answered(null) onder naam- én IBAN-key. Groep B
    // wordt vervolgens NIET door een eigen AI-ronde behandeld maar door de veeg,
    // die de gedeelde IBAN-key als eerder-onbekend herkent. Vóór de fix telde de
    // veeg die leden stil als "processed" zonder no-match-signaal → de kaart bleef
    // laden. Na de fix zitten ze in noMatchIds én wordt onNoMatch ervoor aangeroepen.
    const txs: CombinedTx[] = [
      unknownTx('a1', 'Winkel A', -10, { counterparty_iban: 'NL00 SHARED 0000' }),
      unknownTx('b1', 'Winkel B', -10, { counterparty_iban: 'NL00 SHARED 0000' }),
    ]
    // batchSize 1 → groep A gaat eerst als AI-ronde; representant komt zonder
    // budget_id terug (below-threshold). Groep B raakt de veeg in de volgende iteratie.
    const resolver = vi.fn(async (batch: CombinedAiBatchItem[]): Promise<CombinedAiResult[]> =>
      batch.map((b) => ({ id: b.id, budget_id: null, confidence: 0.2 })),
    )
    const onNoMatch = vi.fn()
    const opts: ExtendedOpts = { batchSize: 1, onNoMatch }

    const result = (await runCombinedCategorization(
      txs,
      baseContext(),
      resolver,
      opts,
    )) as CombinedRunResultExt

    // Precies één AI-ronde: groep B is via de veeg afgehandeld, niet via de AI.
    expect(resolver).toHaveBeenCalledTimes(1)
    // Geen enkel voorstel — beide onbekend.
    expect(result.proposals.size).toBe(0)
    // Béíde leden zitten in noMatchIds (a1 uit de AI-ronde, b1 uit de veeg).
    expect(result.noMatchIds.slice().sort()).toEqual(['a1', 'b1'])
    // onNoMatch is voor b1 (de veeg) apart aangeroepen — dát was het gat.
    expect(onNoMatch).toHaveBeenCalledWith(['b1'])
  })

  it('(d) parity-guard: zonder de callback/het veld te lezen blijft bestaand gedrag op een gemengde set byte-voor-byte gelijk (GROEN — bewijst additiviteit)', async () => {
    const { resolver } = makeResolver()
    const txs: CombinedTx[] = [
      unknownTx('r1', 'Albert Heijn'), // trefwoordregel
      unknownTx('t1', null, -100, { counterparty_iban: 'NL00 OWN 0000000000' }), // sterke transfer
      unknownTx('u1', 'Qwerty BV'), // AI-representant
      unknownTx('u2', 'Qwerty BV'), // propagatie
    ]

    const result = await runCombinedCategorization(txs, baseContext(), resolver)

    expect(result.counts).toMatchObject({ rule: 1, transfer: 1, ai: 1, propagated: 1, unresolved: 0 })
    expect(result.proposals.get('r1')).toMatchObject({ source: 'rule' })
    expect(result.proposals.get('t1')).toMatchObject({ source: 'transfer' })
    expect(result.proposals.get('u1')).toMatchObject({ source: 'ai' })
    expect(result.proposals.get('u2')).toMatchObject({ source: 'propagated' })
  })
})
