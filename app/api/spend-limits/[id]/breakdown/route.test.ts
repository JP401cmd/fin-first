import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SPEND_LIMIT_WINDOW_BY_PERIOD,
  resolveSpendLimitPeriods,
} from '@/lib/spend-limits/engine'

/**
 * GET /api/spend-limits/[id]/breakdown — de on-demand per-naam-uitsplitsing.
 *
 * Wat hier geborgd wordt:
 *  - toegang (401 zonder sessie, 404 op een pot die niet van jou is);
 *  - de periodesleutel wordt tegen de MOTOR gevalideerd, niet zelf geparsed —
 *    een onbekende sleutel is een 400, geen lege lijst;
 *  - het datumvenster is HALF-OPEN: `p_to` is de dag ná het periode-einde;
 *  - de rest-bucket = canoniek periodebedrag (uit `computePeriodOutcome`) minus
 *    de som van de top-N, dus geen tweede optelling;
 *  - de top-N-vraag blijft binnen de 50-rijen-begrenzing (AC-B1-13).
 *
 * Mocking-strategie gespiegeld op app/api/budgets/[id]/route.test.ts.
 */

const mockAuthGetUser = vi.fn()
const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
    rpc: mockRpc,
  })),
}))

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const USER_ID = 'user-uuid-1111'

/** De laatste AFGESLOTEN maand in het huidige venster — uit de motor, niet verzonnen. */
const periods = resolveSpendLimitPeriods('month', new Date(), SPEND_LIMIT_WINDOW_BY_PERIOD.month)
const target = periods[periods.length - 2]

/** De dag ná een inclusieve einddatum — het half-open venster dat de RPC's voeren. */
function dayAfter(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(
    next.getDate(),
  ).padStart(2, '0')}`
}

function makeRowChain(resolveWith: unknown) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.select = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolveWith))
  return chain
}

async function callGet(id: string, query: string) {
  const mod = await import('./route')
  const req = new Request(`http://localhost/api/spend-limits/${id}/breakdown${query}`)
  return mod.GET(req, { params: Promise.resolve({ id }) })
}

/**
 * Een ZUIVERE tegenpartij-pot: elke regel kiest alleen tegenpartijen. Alleen die
 * vorm krijgt de per-naam-uitsplitsing — bij een budget- of gemengde regel zou
 * `tx_counterparty_name_breakdown` het budget-deel negeren en dus een
 * uitsplitsing tonen die groter is dan het geheel waar ze bij hoort.
 */
const COUNTERPARTY_ROW = {
  id: VALID_UUID,
  limit_amount: 50,
  period: 'month',
  spend_limit_rules: [
    { id: 'r-1', sort_order: 0, budget_ids: [], counterparty_keys: ['SHELL'] },
  ],
}

describe('GET /api/spend-limits/[id]/breakdown', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAuthGetUser.mockReset()
    mockFrom.mockReset()
    mockRpc.mockReset()
  })

  it('401 zonder sessie', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } })
    const res = await callGet(VALID_UUID, `?periode=${target.periodKey}`)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toMatch(/ingelogd/i)
  })

  it('400 bij een ongeldig id-formaat', async () => {
    const res = await callGet('geen-uuid', `?periode=${target.periodKey}`)
    expect(res.status).toBe(400)
  })

  it('400 zonder periode-parameter', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await callGet(VALID_UUID, '')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/periode/i)
  })

  it('404 wanneer de pot niet van jou is of niet bestaat', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(makeRowChain({ data: null, error: null }))
    const res = await callGet(VALID_UUID, `?periode=${target.periodKey}`)
    expect(res.status).toBe(404)
  })

  it('400 bij een budget-pot: die toont zijn uitsplitsing uit de bundel', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(
      makeRowChain({
        data: {
          ...COUNTERPARTY_ROW,
          spend_limit_rules: [
            { id: 'r-1', sort_order: 0, budget_ids: ['b1'], counterparty_keys: [] },
          ],
        },
        error: null,
      }),
    )
    const res = await callGet(VALID_UUID, `?periode=${target.periodKey}`)
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 bij een GEMENGDE regel — de naam-uitsplitsing zou het budget-deel negeren', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(
      makeRowChain({
        data: {
          ...COUNTERPARTY_ROW,
          spend_limit_rules: [
            { id: 'r-1', sort_order: 0, budget_ids: ['b1'], counterparty_keys: ['SHELL'] },
          ],
        },
        error: null,
      }),
    )
    const res = await callGet(VALID_UUID, `?periode=${target.periodKey}`)
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 bij een periodesleutel die niet in het venster van de motor bestaat', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(makeRowChain({ data: COUNTERPARTY_ROW, error: null }))
    const res = await callGet(VALID_UUID, '?periode=1999-01')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/periode/i)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('200: half-open venster, top-N begrensd op 50, rest = canoniek − som van de namen', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(makeRowChain({ data: COUNTERPARTY_ROW, error: null }))

    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'spend_limit_rule_aggregate') {
        return Promise.resolve({
          data: [
            {
              bucket_start: `${target.periodKey}-01`,
              transaction_type: null,
              sum_positief: 10,
              sum_negatief: -100,
              count: 5,
            },
          ],
          error: null,
        })
      }
      return Promise.resolve({
        data: [
          { counterparty_name: 'SHELL 1234', sum_positief: 0, sum_negatief: -60, count: 3 },
          { counterparty_name: 'Shell Express', sum_positief: 0, sum_negatief: -20, count: 1 },
        ],
        error: null,
      })
    })

    const res = await callGet(VALID_UUID, `?periode=${target.periodKey}`)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.periodKey).toBe(target.periodKey)
    expect(body.names).toEqual([
      { name: 'SHELL 1234', matchedAmount: 60, count: 3 },
      { name: 'Shell Express', matchedAmount: 20, count: 1 },
    ])
    // Canoniek periodebedrag = −(−100 + 10) = 90; top-N telt 80 ⇒ rest 10.
    expect(body.restMatchedAmount).toBe(10)
    expect(body.restCount).toBe(1)

    const aggArgs = mockRpc.mock.calls.find(
      (c) => c[0] === 'spend_limit_rule_aggregate',
    )?.[1] as Record<string, unknown>
    const nameArgs = mockRpc.mock.calls.find(
      (c) => c[0] === 'tx_counterparty_name_breakdown',
    )?.[1] as Record<string, unknown>

    expect(aggArgs.p_from).toBe(target.since)
    expect(aggArgs.p_to).toBe(dayAfter(target.until))
    expect(nameArgs.p_from).toBe(target.since)
    expect(nameArgs.p_to).toBe(dayAfter(target.until))
    expect(nameArgs.p_key).toBe('SHELL')
    expect(nameArgs.p_limit).toBe(50)
    expect(nameArgs.p_own_only).toBe(false)
  })

  it('sluit een overboeking net zo hard uit als de naam-RPC dat sinds 20260808170000 doet', async () => {
    // PARITY-GETUIGE. Sinds migratie 20260808170000 draagt
    // `tx_counterparty_name_breakdown` hetzelfde transfer-filter als `isRealAggRow`.
    // Deze test pint de TS-helft van dat paar: een (joint_)transfer-rij in het
    // maandaggregaat telt niet mee in het canonieke periodebedrag, en de
    // naam-RPC levert er — precies daarom — ook geen naamregel voor. De
    // uitsplitsing telt dus exact op tot het bedrag ernaast, met een lege rest.
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(makeRowChain({ data: COUNTERPARTY_ROW, error: null }))
    mockRpc.mockImplementation((fn: string) =>
      fn === 'spend_limit_rule_aggregate'
        ? Promise.resolve({
            data: [
              {
                bucket_start: `${target.periodKey}-01`,
                transaction_type: 'expense',
                sum_positief: 0,
                sum_negatief: -60,
                count: 2,
              },
              {
                bucket_start: `${target.periodKey}-01`,
                transaction_type: 'transfer', // eigen overboeking: telt nooit mee
                sum_positief: 0,
                sum_negatief: -500,
                count: 1,
              },
            ],
            error: null,
          })
        : Promise.resolve({
            data: [{ counterparty_name: 'SHELL 1234', sum_positief: 0, sum_negatief: -60, count: 2 }],
            error: null,
          }),
    )

    const res = await callGet(VALID_UUID, `?periode=${target.periodKey}`)
    const body = await res.json()
    expect(body.names).toEqual([{ name: 'SHELL 1234', matchedAmount: 60, count: 2 }])
    expect(body.restMatchedAmount).toBe(0)
    expect(body.restCount).toBe(0)
  })

  it('klemt de rest-bucket op 0 bij een refund-staart buiten de top-N', async () => {
    // De resterende, legitieme route naar een negatief verschil: de top-N is
    // gesorteerd op grootste UITGAVE, dus een schrijfwijze die per saldo geld
    // teruggaf valt erbuiten terwijl haar positieve saldo wél in het canonieke
    // periodebedrag zit. De getoonde namen tellen dan hoger op dan dat bedrag.
    // Een negatieve restpost zou een onwaarheid zijn.
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(makeRowChain({ data: COUNTERPARTY_ROW, error: null }))
    mockRpc.mockImplementation((fn: string) =>
      fn === 'spend_limit_rule_aggregate'
        ? Promise.resolve({
            data: [
              {
                bucket_start: `${target.periodKey}-01`,
                transaction_type: 'expense',
                sum_positief: 30, // refund op een naam buiten de top-N
                sum_negatief: -80,
                count: 3,
              },
            ],
            error: null,
          })
        : Promise.resolve({
            // Alleen de uitgevende naam haalde de top-N; canoniek = 50, top-N = 80.
            data: [{ counterparty_name: 'SHELL 1234', sum_positief: 0, sum_negatief: -80, count: 2 }],
            error: null,
          }),
    )

    const res = await callGet(VALID_UUID, `?periode=${target.periodKey}`)
    const body = await res.json()
    expect(body.restMatchedAmount).toBe(0)
    expect(body.restCount).toBe(1)
  })
})
