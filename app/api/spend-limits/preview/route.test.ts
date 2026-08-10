import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * POST /api/spend-limits/preview — de server als enige match-autoriteit (B3).
 *
 * Wat hier bewaakt wordt:
 *  1. de POORT: 401 zonder sessie, 400 bij een body die het zod-schema niet kent
 *     (AC-B3-05) — en in beide gevallen wordt de database niet aangeraakt;
 *  2. het TE-KORT-pad: labels die na normalisatie te weinig overhouden leveren
 *     een expliciete uitkomst en géén misleidende lege trefferlijst (AC-B3-03);
 *  3. het VENSTER en de KORREL: allebei uit de motor
 *     (`resolveSpendLimitPeriods` / `SPEND_LIMIT_GRAIN_BY_PERIOD`), niet uit een
 *     eigen datumrekening in de route (D-P3);
 *  4. de SOM: refunds verrekend, transfers eruit, namen compleet — inclusief een
 *     naam die buiten elke suggestielijst zou vallen (AC-B3-01);
 *  5. de OVERLAP-observatie: namen van andere potten, zonder bedrag (AC-B3-02);
 *  6. geen rauwe DB-fouttekst in een 500.
 *
 * De motor draait hier ECHT mee (niet gemockt): dat is precies de eigenschap die
 * getoetst moet worden — de preview telt op met dezelfde functie die de pot
 * straks voedt.
 *
 * Sinds 10-08-2026 kent de route ÉÉN pad in plaats van twee takken: een regel mag
 * budgetten en tegenpartijen tegelijk dragen (EN), dus er valt niets meer te
 * discrimineren. De suites hieronder zijn navenant per DIMENSIE geordend en niet
 * meer per tak.
 */

const { mockCreateClient, mockGetAuthClaims, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetAuthClaims: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: mockGetAuthClaims,
}))

import { POST } from './route'
import type { SpendLimitPreviewResponse } from './route'

// ── Testgereedschap ─────────────────────────────────────────────────────────

/** Eén rij zoals `spend_limit_rule_aggregate` 'm teruggeeft. */
interface AggRow {
  rule_index: number
  bucket_start: string
  budget_id: string | null
  transaction_type: string | null
  sum_positief: number
  sum_negatief: number
  count: number
  matched_names: string[] | null
}

interface LimitRow {
  id: string
  name: string
  is_active: boolean
  spend_limit_rules: {
    budget_ids: string[] | null
    include_child_budgets?: boolean | null
    counterparty_keys: string[] | null
  }[]
}

interface BudgetRow {
  id: string
  name: string
  parent_id: string | null
}

interface QueryResult {
  data: unknown
  error: unknown
}

/** Thenable `.select().eq()`-keten, met de aanroepen zichtbaar. */
interface QueryChain {
  select: (columns: string) => QueryChain
  eq: (column: string, value: unknown) => QueryChain
  then: <T>(onfulfilled: (value: QueryResult) => T) => Promise<T>
}

const eqCalls: [string, unknown][] = []
let selectColumns = ''

function chainFor(result: QueryResult, trace: boolean): QueryChain {
  const chain: QueryChain = {
    select: (columns) => {
      if (trace) selectColumns = columns
      return chain
    },
    eq: (column, value) => {
      if (trace) eqCalls.push([column, value])
      return chain
    },
    then: (onfulfilled) => Promise.resolve(result).then(onfulfilled),
  }
  return chain
}

/**
 * De route raakt altijd twee tabellen: `budgets` (voor de subboom én voor de
 * overlap-vergelijking) en `spend_limits`. Alleen die laatste wordt getraceerd —
 * dat is de query waarvan de kolom-/filtervorm ertoe doet.
 */
function stubTables(opts: { budgets?: BudgetRow[]; limits?: LimitRow[]; limitsError?: unknown } = {}) {
  mockFrom.mockImplementation((table: string) =>
    table === 'budgets'
      ? chainFor({ data: opts.budgets ?? [], error: null }, false)
      : chainFor({ data: opts.limits ?? [], error: opts.limitsError ?? null }, true),
  )
}

function previewRequest(body: unknown) {
  return new Request('http://localhost/api/spend-limits/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Een regel met alleen tegenpartijen. */
function cpRequest(body: Record<string, unknown> = {}) {
  return previewRequest({ counterpartyLabels: ['SHELL'], ...body })
}

/** Een regel met alleen budgetten. */
function budgetRequest(body: Record<string, unknown> = {}) {
  return previewRequest({ budgetIds: [HOOFD], ...body })
}

/** Het id van de pot die "in bewerking" is; moet zichzelf nooit als overlap zien. */
const EDIT_SUBJECT_ID = '11111111-2222-4333-8444-555555555555'
const HOOFD = 'aaaaaaaa-0000-4000-8000-000000000001'
const SUB = 'aaaaaaaa-0000-4000-8000-000000000002'
const ANDERS = 'aaaaaaaa-0000-4000-8000-000000000003'

function malformedRequest() {
  return new Request('http://localhost/api/spend-limits/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ dit is geen json',
  })
}

async function readPreview(res: Response): Promise<SpendLimitPreviewResponse> {
  return (await res.json()) as SpendLimitPreviewResponse
}

/** Eén aggregaat-rij; `spend` is een positief uitgavebedrag. */
function aggRow(over: Partial<AggRow> & { bucket_start: string }): AggRow {
  return {
    rule_index: 0,
    budget_id: null,
    transaction_type: 'expense',
    sum_positief: 0,
    sum_negatief: 0,
    count: 1,
    matched_names: null,
    ...over,
  }
}

function ruleAggCalls() {
  return mockRpc.mock.calls.filter((c) => c[0] === 'spend_limit_rule_aggregate')
}

beforeEach(() => {
  // 8 augustus 2026, lokale tijd: maandvenster = 2025-08 t/m 2026-08 (13),
  // kwartaalvenster = 2024-Q3 t/m 2026-Q3 (9).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 7, 8, 12, 0, 0))

  mockRpc.mockReset()
  mockFrom.mockReset()
  mockGetAuthClaims.mockReset()
  eqCalls.length = 0
  selectColumns = ''

  mockGetAuthClaims.mockResolvedValue({ sub: 'user-1' })
  mockCreateClient.mockResolvedValue({ rpc: mockRpc, from: mockFrom })
  mockRpc.mockResolvedValue({ data: [], error: null })
  stubTables()
})

afterEach(() => {
  vi.useRealTimers()
})

// ── De poort ────────────────────────────────────────────────────────────────

describe('POST /api/spend-limits/preview — poort', () => {
  it('401 zonder sessie, zonder de database aan te raken', async () => {
    mockGetAuthClaims.mockResolvedValue(null)

    const res = await POST(cpRequest())

    expect(res.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij een body die geen json is', async () => {
    const res = await POST(malformedRequest())
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 bij een label van het verkeerde type', async () => {
    const res = await POST(cpRequest({ counterpartyLabels: [42] }))
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 bij een onbekende periodesoort', async () => {
    const res = await POST(cpRequest({ period: 'decennium' }))
    expect(res.status).toBe(400)
  })

  it('aanvaardt de vijf periodesoorten die de motor kent', async () => {
    for (const period of ['day', 'week', 'month', 'quarter', 'year']) {
      const res = await POST(cpRequest({ period }))
      expect(res.status).toBe(200)
    }
  })

  it('400 bij een budget-id dat geen uuid is', async () => {
    const res = await POST(budgetRequest({ budgetIds: ['geen-uuid'] }))
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 bij een excludeLimitId dat geen uuid is', async () => {
    const res = await POST(cpRequest({ excludeLimitId: 'x' }))
    expect(res.status).toBe(400)
  })

  it('geeft bij een LEGE regel een lege preview in plaats van een 400', async () => {
    // Een half ingevuld formulier hoort niets te zeggen, niet te schreeuwen — en
    // een regel zonder dimensies zou bovendien op álles matchen, dus die vraag
    // stellen we de database niet eens.
    const res = await POST(previewRequest({ budgetIds: [], counterpartyLabels: [] }))
    const body = await readPreview(res)

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.matchedTransactionCount).toBe(0)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

// ── Te kort om te matchen ───────────────────────────────────────────────────

describe('te-kort-uitkomst', () => {
  it('geeft `too_short` zodra geen enkel label genoeg overhoudt (AC-B3-03)', async () => {
    for (const label of ['s', '!', '#!', 'é']) {
      mockRpc.mockClear()
      const body = await readPreview(await POST(cpRequest({ counterpartyLabels: [label] })))

      expect(body.status).toBe('too_short')
      expect(body.matchedAmountByPeriod).toEqual([])
      expect(mockRpc).not.toHaveBeenCalled()
    }
  })

  it('telt gewoon door zodra ÉÉN label wél bruikbaar is', async () => {
    const body = await readPreview(await POST(cpRequest({ counterpartyLabels: ['s', 'SHELL'] })))

    expect(body.status).toBe('ok')
    // Het te korte label valt eruit; er wordt niet op gematcht.
    expect(body.keys).toEqual(['SHELL'])
  })
})

// ── Sleutels, venster en korrel ─────────────────────────────────────────────

describe('sleutel-afleiding, venster en korrel', () => {
  it('leidt de sleutels serverzijdig af uit de labels', async () => {
    const body = await readPreview(
      await POST(cpRequest({ counterpartyLabels: ['Shell (NL)', 'Café Zürich'] })),
    )

    expect(body.keys).toEqual(['SHELLNL', 'CAFZRICH'])
    expect(ruleAggCalls()[0][1]).toMatchObject({
      p_rules: [{ p: 0, i: 0, b: [], k: ['SHELLNL', 'CAFZRICH'] }],
      p_grain: 'month',
    })
  })

  it('haalt het venster uit de motor — maand', async () => {
    await POST(cpRequest())
    const calls = ruleAggCalls()

    expect(calls[0][1].p_from).toBe('2025-08-01')
    expect(calls[calls.length - 1][1].p_to).toBe('2026-09-01')
  })

  it('rekt het venster mee met de periodesoort — kwartaal', async () => {
    await POST(cpRequest({ period: 'quarter' }))
    expect(ruleAggCalls()[0][1].p_from).toBe('2024-07-01')
  })

  it('knipt een jaarvenster in stukken, zoals de loader (dezelfde knipregel)', async () => {
    await POST(cpRequest({ period: 'year' }))
    const calls = ruleAggCalls()

    // 2023-01 t/m 2026-09 = 44 maanden ⇒ 4 stukken van hoogstens 12.
    expect(calls).toHaveLength(4)
    expect(calls[0][1].p_from).toBe('2023-01-01')
    expect(calls[calls.length - 1][1].p_to).toBe('2026-09-01')
    // Sluitend en zonder overlap.
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i][1].p_from).toBe(calls[i - 1][1].p_to)
    }
  })

  it('vraagt de korrel op die bij de periodesoort hoort', async () => {
    for (const [period, grain] of [
      ['day', 'day'],
      ['week', 'week'],
      ['month', 'month'],
      ['quarter', 'month'],
      ['year', 'month'],
    ]) {
      mockRpc.mockClear()
      await POST(cpRequest({ period }))
      expect(ruleAggCalls()[0][1].p_grain).toBe(grain)
    }
  })
})

// ── De som ──────────────────────────────────────────────────────────────────

describe('de som', () => {
  beforeEach(() => {
    const ROWS = [
      // Juli: €150 uitgegeven, €50 teruggekregen ⇒ netto €100.
      aggRow({ bucket_start: '2026-07-01', sum_negatief: -150, count: 3, matched_names: ['Shell Express 1032'] }),
      aggRow({ bucket_start: '2026-07-01', sum_positief: 50, count: 1, matched_names: ['Shell Express 1032'] }),
      // Een eigen overboeking telt nergens mee.
      aggRow({ bucket_start: '2026-07-01', sum_negatief: -9000, transaction_type: 'transfer', count: 1, matched_names: ['Shell intern'] }),
      // Juni: een naam die in geen enkele top-40 zou staan.
      aggRow({ bucket_start: '2026-06-01', sum_negatief: -40, count: 1, matched_names: ['SHELL #57 ergens ver weg'] }),
    ]

    // Het chunk-venster wordt ECHT toegepast. Zonder die filter zou dezelfde rij
    // in elk stuk terugkomen en dubbel tellen — een mock-artefact dat de echte
    // RPC (`t.date >= p_from AND t.date < p_to`) per definitie niet heeft, en dat
    // een testfout zou verbergen achter een tweemaal zo hoog bedrag.
    mockRpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
      if (fn !== 'spend_limit_rule_aggregate') return Promise.resolve({ data: [], error: null })
      const from = String(args.p_from)
      const to = String(args.p_to)
      return Promise.resolve({
        data: ROWS.filter((r) => r.bucket_start >= from && r.bucket_start < to),
        error: null,
      })
    })
  })

  it('verrekent refunds en sluit transfers uit — dezelfde regels als de motor', async () => {
    const body = await readPreview(await POST(cpRequest()))
    const juli = body.matchedAmountByPeriod.find((p) => p.periodKey === '2026-07')

    expect(juli?.matchedAmount).toBe(100)
    expect(juli?.matchedTransactionCount).toBe(4)
    // €9.000 aan overboekingen raakt het bedrag niet.
    expect(body.matchedAmountByPeriod.every((p) => p.matchedAmount < 1000)).toBe(true)
  })

  it('somt de namen op die daadwerkelijk meetelden, óók buiten elke suggestielijst', async () => {
    const body = await readPreview(await POST(cpRequest()))
    expect(body.matchedNames).toContain('SHELL #57 ergens ver weg')
  })

  it('markeert de lopende periode als voorlopig', async () => {
    const body = await readPreview(await POST(cpRequest()))
    const open = body.matchedAmountByPeriod.filter((p) => p.isOpen)

    expect(open).toHaveLength(1)
    expect(open[0].periodKey).toBe('2026-08')
  })
})

// ── Budget-dimensie ─────────────────────────────────────────────────────────

describe('budget-dimensie', () => {
  beforeEach(() => {
    stubTables({
      budgets: [
        { id: HOOFD, name: 'Boodschappen', parent_id: null },
        { id: SUB, name: 'Supermarkt', parent_id: HOOFD },
        { id: ANDERS, name: 'Vervoer', parent_id: null },
      ],
    })
  })

  it('rolt de subboom op en stuurt álle ids mee', async () => {
    await POST(budgetRequest())
    const rules = ruleAggCalls()[0][1].p_rules as { b: string[] }[]

    expect([...rules[0].b].sort()).toEqual([HOOFD, SUB].sort())
  })

  it('laat de subboom weg zodra includeChildBudgets uit staat', async () => {
    await POST(budgetRequest({ includeChildBudgets: false }))
    const rules = ruleAggCalls()[0][1].p_rules as { b: string[] }[]

    expect(rules[0].b).toEqual([HOOFD])
  })

  it('noemt de (sub)budgetten die daadwerkelijk boekingen dragen', async () => {
    mockRpc.mockResolvedValue({
      data: [
        aggRow({ bucket_start: '2026-07-01', budget_id: SUB, sum_negatief: -30 }),
        // Transfer: telt niet mee en hoort dus ook niet in de opsomming.
        aggRow({ bucket_start: '2026-07-01', budget_id: ANDERS, sum_negatief: -99, transaction_type: 'transfer' }),
      ],
      error: null,
    })

    const body = await readPreview(await POST(budgetRequest()))
    expect(body.matchedNames).toEqual(['Supermarkt'])
    expect(body.keys).toEqual([])
    expect(body.ruleType).toBe('budget')
  })

  it('herkent een regel met beide dimensies als gemengd', async () => {
    const body = await readPreview(
      await POST(previewRequest({ budgetIds: [HOOFD], counterpartyLabels: ['SHELL'] })),
    )
    expect(body.ruleType).toBe('mixed')

    const rules = ruleAggCalls()[0][1].p_rules as { b: string[]; k: string[] }[]
    expect(rules[0].k).toEqual(['SHELL'])
    expect(rules[0].b.length).toBeGreaterThan(0)
  })
})

// ── Overlap-observatie ──────────────────────────────────────────────────────

describe('overlap-observatie', () => {
  it('noemt de bestaande pot met een rakende sleutel, zonder bedrag (AC-B3-02/D38)', async () => {
    stubTables({
      limits: [
        {
          id: 'pot-1',
          name: 'Tanken',
          is_active: true,
          spend_limit_rules: [{ budget_ids: [], counterparty_keys: ['SHELL'] }],
        },
      ],
    })

    const body = await readPreview(await POST(cpRequest({ counterpartyLabels: ['SHELLNL'] })))

    expect(body.overlappingLimits).toEqual([
      {
        id: 'pot-1',
        name: 'Tanken',
        ruleType: 'counterparty',
        isActive: true,
        reason: 'counterparty_key_substring',
      },
    ])
  })

  it('ziet ook een regel die niet de eerste van de pot is', async () => {
    stubTables({
      budgets: [{ id: HOOFD, name: 'Boodschappen', parent_id: null }],
      limits: [
        {
          id: 'pot-2',
          name: 'Uit eten',
          is_active: true,
          spend_limit_rules: [
            { budget_ids: [HOOFD], include_child_budgets: false, counterparty_keys: [] },
            { budget_ids: [], counterparty_keys: ['SHELL'] },
          ],
        },
      ],
    })

    const body = await readPreview(await POST(cpRequest()))
    expect(body.overlappingLimits.map((o) => o.id)).toEqual(['pot-2'])
    expect(body.overlappingLimits[0].ruleType).toBe('mixed')
  })

  it('sluit de pot die je bewerkt uit — die overlapt niet met zichzelf', async () => {
    stubTables({
      limits: [
        {
          id: EDIT_SUBJECT_ID,
          name: 'Zichzelf',
          is_active: true,
          spend_limit_rules: [{ budget_ids: [], counterparty_keys: ['SHELL'] }],
        },
      ],
    })

    const body = await readPreview(await POST(cpRequest({ excludeLimitId: EDIT_SUBJECT_ID })))
    expect(body.overlappingLimits).toEqual([])
  })

  it('vraagt uitsluitend de kolommen op die de observatie nodig heeft', async () => {
    await POST(cpRequest())

    expect(selectColumns).not.toContain('*')
    expect(selectColumns).toContain('spend_limit_rules(')
    expect(eqCalls).toContainEqual(['is_archived', false])
  })
})

// ── Betrouwbaarheid ─────────────────────────────────────────────────────────

describe('betrouwbaarheid', () => {
  it('meldt een mogelijk afgekapt antwoord in plaats van stil een te laag getal', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockRpc.mockResolvedValue({
      data: Array.from({ length: 1000 }, () => aggRow({ bucket_start: '2026-07-01', sum_negatief: -1 })),
      error: null,
    })

    const body = await readPreview(await POST(cpRequest()))

    expect(body.aggregateTruncationSuspected).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('lekt geen rauwe DB-fouttekst in een 500', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({ data: null, error: { message: 'relation "geheim" does not exist' } })

    const res = await POST(cpRequest())
    const body = (await res.json()) as { error?: string }

    expect(res.status).toBe(500)
    expect(body.error).not.toContain('geheim')
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('lekt ook geen fouttekst wanneer de potten-query faalt', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubTables({ limitsError: { message: 'relation "spend_limits" does not exist' } })

    const res = await POST(cpRequest())
    const body = (await res.json()) as { error?: string }

    expect(res.status).toBe(500)
    expect(body.error).not.toContain('spend_limits')
    err.mockRestore()
  })
})
