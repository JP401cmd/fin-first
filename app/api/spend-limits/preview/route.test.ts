import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * POST /api/spend-limits/preview — de server als enige match-autoriteit (B3).
 *
 * Wat hier bewaakt wordt:
 *  1. de POORT: 401 zonder sessie, 400 bij een body die het zod-schema niet kent
 *     (AC-B3-05) — en in beide gevallen wordt de database niet aangeraakt;
 *  2. het TE-KORT-pad: een label dat na normalisatie te weinig overhoudt levert
 *     een expliciete uitkomst en géén misleidende lege trefferlijst (AC-B3-03);
 *  3. het VENSTER: de datumgrenzen komen uit de motor (resolveSpendLimitPeriods),
 *     niet uit een eigen datumrekening in de route (D-P3);
 *  4. de SOM: refunds verrekend, transfers eruit, namen compleet — inclusief een
 *     naam die buiten elke suggestielijst zou vallen (AC-B3-01);
 *  5. de OVERLAP-observatie: namen van andere potten, zonder bedrag (AC-B3-02);
 *  6. geen rauwe DB-fouttekst in een 500.
 *
 * De motor draait hier ECHT mee (niet gemockt): dat is precies de eigenschap die
 * getoetst moet worden — de preview telt op met dezelfde functie die de pot
 * straks voedt.
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

interface AggRow {
  counterparty_key: string
  month: string
  transaction_type: string | null
  sum_positief: number
  sum_negatief: number
  count: number
  matched_names: string[] | null
}

interface ConfigRow {
  id: string
  name: string
  rule_type: string
  counterparty_key?: string | null
  budget_id?: string | null
  include_child_budgets?: boolean | null
  is_active: boolean
}

interface BudgetRow {
  id: string
  name: string
  parent_id: string | null
}

interface QueryResult {
  data: ConfigRow[] | BudgetRow[] | null
  error: unknown
}

/** Thenable `.select().eq().eq()`-keten, met de aanroepen zichtbaar. */
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

function stubLimitsQuery(result: QueryResult) {
  mockFrom.mockReturnValue(chainFor(result, true))
}

/**
 * De budget-tak raakt twee tabellen. Alleen de `spend_limits`-keten wordt
 * getraceerd — dat is de query waarvan de kolom-/filtervorm ertoe doet.
 */
function stubBudgetBranch(budgets: BudgetRow[], limits: ConfigRow[]) {
  mockFrom.mockImplementation((table: string) =>
    table === 'budgets'
      ? chainFor({ data: budgets, error: null }, false)
      : chainFor({ data: limits, error: null }, true),
  )
}

function previewRequest(body: unknown) {
  return new Request('http://localhost/api/spend-limits/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** De tegenpartij-tak; `ruleType` is de discriminator van het preview-schema. */
function counterpartyRequest(body: Record<string, unknown>) {
  return previewRequest({ ruleType: 'counterparty', ...body })
}

/** De budget-tak. */
function budgetRequest(body: Record<string, unknown>) {
  return previewRequest({ ruleType: 'budget', ...body })
}

/** Het id van de pot die "in bewerking" is; moet zichzelf nooit als overlap zien. */
const EDIT_SUBJECT_ID = '11111111-2222-4333-8444-555555555555'

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
  stubLimitsQuery({ data: [], error: null })
})

afterEach(() => {
  vi.useRealTimers()
})

// ── De poort ────────────────────────────────────────────────────────────────

describe('POST /api/spend-limits/preview — poort', () => {
  it('401 zonder sessie, zonder de database aan te raken', async () => {
    mockGetAuthClaims.mockResolvedValue(null)

    const res = await POST(counterpartyRequest({ counterpartyLabel: 'SHELL' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Niet ingelogd' })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij een ontbrekend label (AC-B3-05)', async () => {
    const res = await POST(counterpartyRequest({}))

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'validation_error' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 bij een verkeerd getypeerd label', async () => {
    const res = await POST(counterpartyRequest({ counterpartyLabel: 42 }))

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 bij een onbekende periodesoort', async () => {
    const res = await POST(counterpartyRequest({ counterpartyLabel: 'SHELL', period: 'week' }))

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 zonder regelsoort: de body kiest de tak, de route raadt niet', async () => {
    const res = await POST(previewRequest({ counterpartyLabel: 'SHELL' }))

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 bij een budget-tak zonder geldig budget-id', async () => {
    const res = await POST(budgetRequest({ budgetId: 'geen-uuid' }))

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 bij een excludeLimitId dat geen uuid is', async () => {
    const res = await POST(counterpartyRequest({ counterpartyLabel: 'SHELL', excludeLimitId: 'x' }))

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 bij malformed JSON in plaats van een 500', async () => {
    const res = await POST(malformedRequest())

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

// ── Te kort om te matchen ───────────────────────────────────────────────────

describe('POST /api/spend-limits/preview — te kort om te matchen (AC-B3-03)', () => {
  it.each([
    ['een label van één teken', 'S', 'S'],
    ['een label dat leeg normaliseert', '!!!', ''],
  ])('%s levert een expliciete uitkomst, geen lege trefferlijst', async (_naam, label, key) => {
    const res = await POST(counterpartyRequest({ counterpartyLabel: label }))
    const body = await readPreview(res)

    expect(res.status).toBe(200)
    expect(body.status).toBe('too_short')
    expect(body.key).toBe(key)
    expect(body.matchedAmountByPeriod).toEqual([])
    expect(body.matchedNames).toEqual([])
    // Geen enkele query: te kort is een uitkomst, geen zoekopdracht.
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ── Venster en som ──────────────────────────────────────────────────────────

describe('POST /api/spend-limits/preview — venster en som', () => {
  it('vraagt het maandvenster op met de sleutel die de server zelf afleidde', async () => {
    const res = await POST(counterpartyRequest({ counterpartyLabel: 'Shell (NL)' }))
    const body = await readPreview(res)

    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('tx_counterparty_month_aggregate', {
      p_from: '2025-08-01',
      p_to: '2026-09-01', // half-open bovengrens, exact als de RPC zelf rekent
      p_keys: ['SHELLNL'],
      p_own_only: false,
    })
    expect(body.key).toBe('SHELLNL')
    expect(body.period).toBe('month')
    expect(body.matchedAmountByPeriod).toHaveLength(13)
    expect(body.matchedAmountByPeriod.at(-1)).toMatchObject({
      periodKey: '2026-08',
      isOpen: true,
    })
  })

  it('leidt het kwartaalvenster uit de motor af, niet uit een eigen datumrekening', async () => {
    const res = await POST(counterpartyRequest({ counterpartyLabel: 'SHELL', period: 'quarter' }))
    const body = await readPreview(res)

    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_from: '2024-07-01' })
    expect(body.matchedAmountByPeriod).toHaveLength(9)
    expect(body.matchedAmountByPeriod.map((p) => p.periodKey).at(-1)).toBe('2026-Q3')
    expect(body.matchedAmountByPeriod.map((p) => p.label).at(-1)).toBe('Q3 2026')
  })

  it('telt netto op via de motor: refund verrekend, transfer eruit', async () => {
    const rows: AggRow[] = [
      {
        counterparty_key: 'SHELL',
        month: '2026-07',
        transaction_type: 'expense',
        sum_positief: 0,
        sum_negatief: -120,
        count: 3,
        matched_names: ['SHELL NL', 'Shell #57'],
      },
      {
        counterparty_key: 'SHELL',
        month: '2026-07',
        transaction_type: 'income',
        sum_positief: 20, // refund op dezelfde tegenpartij
        sum_negatief: 0,
        count: 1,
        matched_names: ['SHELL NL'],
      },
      {
        counterparty_key: 'SHELL',
        month: '2026-07',
        transaction_type: 'transfer', // eigen overboeking: telt nooit mee
        sum_positief: 0,
        sum_negatief: -500,
        count: 1,
        matched_names: ['SHELL SPAARPOT'],
      },
      {
        counterparty_key: 'ANDERS', // andere sleutel in hetzelfde antwoord
        month: '2026-07',
        transaction_type: 'expense',
        sum_positief: 0,
        sum_negatief: -999,
        count: 9,
        matched_names: ['IETS ANDERS'],
      },
    ]
    mockRpc.mockResolvedValue({ data: rows, error: null })

    const body = await readPreview(await POST(counterpartyRequest({ counterpartyLabel: 'shell' })))

    const juli = body.matchedAmountByPeriod.find((p) => p.periodKey === '2026-07')
    expect(juli).toMatchObject({ matchedAmount: 100, matchedTransactionCount: 4, isOpen: false })
    expect(body.matchedTransactionCount).toBe(4)
    // Alle daadwerkelijk gematchte schrijfwijzen — óók de naam die buiten een
    // top-40-suggestielijst zou vallen (AC-B3-01).
    expect(body.matchedNames).toEqual(['SHELL NL', 'Shell #57'])
    expect(body.aggregateTruncationSuspected).toBe(false)
  })

  it('meldt mogelijke afkapping in plaats van stil een te laag getal te tonen', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rows: AggRow[] = Array.from({ length: 1000 }, () => ({
      counterparty_key: 'SHELL',
      month: '2026-07',
      transaction_type: 'expense',
      sum_positief: 0,
      sum_negatief: -1,
      count: 1,
      matched_names: ['SHELL NL'],
    }))
    mockRpc.mockResolvedValue({ data: rows, error: null })

    const body = await readPreview(await POST(counterpartyRequest({ counterpartyLabel: 'SHELL' })))

    expect(body.aggregateTruncationSuspected).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

// ── Overlap-observatie ──────────────────────────────────────────────────────

describe('POST /api/spend-limits/preview — overlap-observatie (AC-B3-02)', () => {
  it('noemt de bestaande pot die dezelfde uitgaven kan zien, zonder bedrag', async () => {
    stubLimitsQuery({
      data: [
        { id: 'p-1', name: 'Tanken', rule_type: 'counterparty', counterparty_key: 'SHELL', is_active: true },
        { id: 'p-2', name: 'Boodschappen', rule_type: 'counterparty', counterparty_key: 'AH', is_active: true },
      ],
      error: null,
    })

    const body = await readPreview(await POST(counterpartyRequest({ counterpartyLabel: 'SHELLNL' })))

    expect(body.overlappingLimits).toEqual([
      {
        id: 'p-1',
        name: 'Tanken',
        ruleType: 'counterparty',
        isActive: true,
        reason: 'counterparty_key_substring',
      },
    ])
    // Alleen niet-gearchiveerde tegenpartij-regels worden opgehaald.
    expect(mockFrom).toHaveBeenCalledWith('spend_limits')
    expect(eqCalls).toEqual([
      ['is_archived', false],
      ['rule_type', 'counterparty'],
    ])
    expect(selectColumns).not.toContain('*')
  })

  it('laat de pot die je BEWERKT niet zichzelf als overlap terugmelden', async () => {
    stubLimitsQuery({
      data: [
        { id: 'p-1', name: 'Tanken', rule_type: 'counterparty', counterparty_key: 'SHELL', is_active: true },
      ],
      error: null,
    })

    const body = await readPreview(
      await POST(
        counterpartyRequest({ counterpartyLabel: 'SHELL', excludeLimitId: EDIT_SUBJECT_ID }),
      ),
    )

    // Zonder de uitsluiting zou p-1 zichzelf terugmelden zodra hij hetzelfde id
    // draagt: dat leest als een waarschuwing terwijl het de regel zelf is.
    expect(body.overlappingLimits.map((o) => o.id)).toEqual(['p-1'])

    stubLimitsQuery({
      data: [
        { id: EDIT_SUBJECT_ID, name: 'Tanken', rule_type: 'counterparty', counterparty_key: 'SHELL', is_active: true },
      ],
      error: null,
    })
    const zelf = await readPreview(
      await POST(
        counterpartyRequest({ counterpartyLabel: 'SHELL', excludeLimitId: EDIT_SUBJECT_ID }),
      ),
    )
    expect(zelf.overlappingLimits).toEqual([])
  })

  it('geeft een lege observatie als geen enkele regel elkaar raakt', async () => {
    stubLimitsQuery({
      data: [
        { id: 'p-3', name: 'Boodschappen', rule_type: 'counterparty', counterparty_key: 'AH', is_active: true },
      ],
      error: null,
    })

    const body = await readPreview(await POST(counterpartyRequest({ counterpartyLabel: 'SHELL' })))

    expect(body.overlappingLimits).toEqual([])
  })
})

// ── Budget-tak ──────────────────────────────────────────────────────────────

describe('POST /api/spend-limits/preview — budget-tak (AC-B3-04)', () => {
  const HOOFD = 'aaaaaaaa-0000-4000-8000-000000000001'
  const KIND = 'aaaaaaaa-0000-4000-8000-000000000002'
  const BUURMAN = 'aaaaaaaa-0000-4000-8000-000000000003'

  const BUDGETS: BudgetRow[] = [
    { id: HOOFD, name: 'Boodschappen', parent_id: null },
    { id: KIND, name: 'Supermarkt', parent_id: HOOFD },
    { id: BUURMAN, name: 'Vakantie', parent_id: null },
  ]

  /** Eén `tx_month_aggregate`-rij; `spend` is een positief uitgavebedrag. */
  function aggRow(month: string, budgetId: string, spend: number, type = 'expense') {
    return {
      month,
      budget_id: budgetId,
      transaction_type: type,
      sum_positief: 0,
      sum_negatief: -spend,
      count: 1,
    }
  }

  /**
   * De nep-RPC past het CHUNK-VENSTER écht toe. Dat is geen nettigheid: zonder
   * die filter zou elke chunk dezelfde rijen teruggeven en zou een dubbeltelling
   * (het bewijs dat de chunk-grenzen niet sluiten) onzichtbaar blijven.
   */
  function stubMonthAggregate(rows: ReturnType<typeof aggRow>[], error: unknown = null) {
    mockRpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
      if (fn !== 'tx_month_aggregate') return Promise.resolve({ data: [], error: null })
      if (error) return Promise.resolve({ data: null, error })
      const from = String(args.p_from).slice(0, 7)
      const to = String(args.p_to).slice(0, 7)
      return Promise.resolve({
        data: rows.filter((r) => r.month >= from && r.month < to),
        error: null,
      })
    })
  }

  it('telt de subboom op met dezelfde motorfuncties als de loader', async () => {
    stubBudgetBranch(BUDGETS, [])
    stubMonthAggregate([
      aggRow('2026-07', HOOFD, 30),
      aggRow('2026-07', KIND, 20), // kind telt mee dankzij includeChildBudgets
      aggRow('2026-07', KIND, 500, 'transfer'), // eigen overboeking: nooit
      aggRow('2026-07', BUURMAN, 999), // ander budget: nooit
      aggRow('2026-06', KIND, 15),
    ])

    const body = await readPreview(await POST(budgetRequest({ budgetId: HOOFD })))

    expect(body.ruleType).toBe('budget')
    expect(body.status).toBe('ok')
    // Een budget matcht op id, niet op tekst — dus geen zoeksleutel.
    expect(body.key).toBeNull()
    expect(body.matchedAmountByPeriod).toHaveLength(13)
    expect(body.matchedAmountByPeriod.find((p) => p.periodKey === '2026-07')).toMatchObject({
      matchedAmount: 50,
      matchedTransactionCount: 2,
      isOpen: false,
    })
    expect(body.matchedAmountByPeriod.find((p) => p.periodKey === '2026-06')?.matchedAmount).toBe(15)
    expect(body.matchedTransactionCount).toBe(3)
    // De opsomming beschrijft dezelfde verzameling als het bedrag: geen transfer,
    // geen vreemd budget.
    expect(body.matchedNames).toEqual(['Boodschappen', 'Supermarkt'])
  })

  it('laat het kind buiten beschouwing zodra includeChildBudgets uit staat', async () => {
    stubBudgetBranch(BUDGETS, [])
    stubMonthAggregate([aggRow('2026-07', HOOFD, 30), aggRow('2026-07', KIND, 20)])

    const body = await readPreview(
      await POST(budgetRequest({ budgetId: HOOFD, includeChildBudgets: false })),
    )

    expect(body.matchedAmountByPeriod.find((p) => p.periodKey === '2026-07')?.matchedAmount).toBe(30)
    expect(body.matchedNames).toEqual(['Boodschappen'])
  })

  it('knipt het jaarvenster in chunks van ten hoogste 12 maanden (max_rows)', async () => {
    // Een jaarpot kijkt 4 kalenderjaren terug. `tx_month_aggregate` groepeert per
    // budget × maand × type en kent geen sleutelfilter, dus zonder knippen kan één
    // antwoord op de PostgREST-cap landen — precies zoals de loader het doet.
    stubBudgetBranch(BUDGETS, [])
    stubMonthAggregate([])

    const body = await readPreview(await POST(budgetRequest({ budgetId: HOOFD, period: 'year' })))

    const calls = mockRpc.mock.calls.filter((c) => c[0] === 'tx_month_aggregate')
    // Venster 2023-01-01 t/m 2026-09-01 = 44 maanden ⇒ ceil(44/12) = 4 stukken.
    expect(calls).toHaveLength(4)
    expect(calls[0][1]).toMatchObject({ p_from: '2023-01-01', p_own_only: false })
    expect(calls.at(-1)?.[1]).toMatchObject({ p_to: '2026-09-01' })
    // Sluitend en zonder overlap: elk stuk begint waar het vorige eindigde.
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i][1].p_from).toBe(calls[i - 1][1].p_to)
    }
    expect(body.matchedAmountByPeriod).toHaveLength(4)
  })

  it('meldt een overlappende budget-pot als regel-observatie, zonder bedrag', async () => {
    stubBudgetBranch(BUDGETS, [
      // Bestaande pot op het KIND: de kandidaat (hoofdbudget incl. kinderen)
      // trekt dat kind mee, dus dit is een afstammeling-overlap.
      { id: 'p-kind', name: 'Supermarkt-grens', rule_type: 'budget', budget_id: KIND, include_child_budgets: true, is_active: true },
      // Op een losstaand budget: raakt niets.
      { id: 'p-los', name: 'Vakantiegrens', rule_type: 'budget', budget_id: BUURMAN, include_child_budgets: true, is_active: true },
    ])
    stubMonthAggregate([])

    const body = await readPreview(await POST(budgetRequest({ budgetId: HOOFD })))

    expect(body.overlappingLimits).toEqual([
      {
        id: 'p-kind',
        name: 'Supermarkt-grens',
        ruleType: 'budget',
        isActive: true,
        reason: 'budget_descendant',
      },
    ])
    // Geen bedrag en geen prioriteit in de observatie.
    expect(JSON.stringify(body.overlappingLimits)).not.toMatch(/amount|priority/i)
    expect(eqCalls).toEqual([
      ['is_archived', false],
      ['rule_type', 'budget'],
    ])
    expect(selectColumns).not.toContain('*')
  })

  it('meldt de pot die je bewerkt niet als overlap met zichzelf', async () => {
    stubBudgetBranch(BUDGETS, [
      { id: EDIT_SUBJECT_ID, name: 'Boodschappengrens', rule_type: 'budget', budget_id: HOOFD, include_child_budgets: true, is_active: true },
    ])
    stubMonthAggregate([])

    const body = await readPreview(
      await POST(budgetRequest({ budgetId: HOOFD, excludeLimitId: EDIT_SUBJECT_ID })),
    )

    expect(body.overlappingLimits).toEqual([])
  })

  it('500 bij een fout in een aggregaat-chunk, zonder de rauwe fouttekst te lekken', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubBudgetBranch(BUDGETS, [])
    stubMonthAggregate([], { message: 'permission denied', code: '42501' })

    const res = await POST(budgetRequest({ budgetId: HOOFD }))

    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('permission denied')
    error.mockRestore()
  })
})

// ── Foutpaden ───────────────────────────────────────────────────────────────

describe('POST /api/spend-limits/preview — foutpaden', () => {
  it('500 bij een RPC-fout, zonder de rauwe fouttekst te lekken', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'function does not exist', code: '42883' },
    })

    const res = await POST(counterpartyRequest({ counterpartyLabel: 'SHELL' }))
    const raw = JSON.stringify(await res.json())

    expect(res.status).toBe(500)
    expect(raw).not.toContain('42883')
    expect(raw).not.toContain('function does not exist')
    error.mockRestore()
  })

  it('500 bij een fout op de configuratie-query (geen stille lege observatie)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubLimitsQuery({ data: null, error: { message: 'permission denied', code: '42501' } })

    const res = await POST(counterpartyRequest({ counterpartyLabel: 'SHELL' }))

    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('permission denied')
    error.mockRestore()
  })
})
