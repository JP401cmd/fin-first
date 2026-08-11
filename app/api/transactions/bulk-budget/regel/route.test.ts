import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Route-tests voor POST /api/transactions/bulk-budget/regel — het regelaanbod na
 * een geslaagde hercategorisatie (F20/AC13).
 *
 * Deze route schrijft een BLIJVENDE regel. Alles wat hier te ruim is, stuurt
 * daarna élke import: `category_corrections` op `description` matcht als
 * SUBSTRING op priority 1, en een `user_own_ibans`-naampatroon haalt transacties
 * uit je uitgaven. Drie eigenschappen worden daarom hier getoetst, en niet
 * alleen in de losse helper:
 *
 *  1. **Ondergrens op élke tak.** Die gold eerder alleen op de
 *     `user_own_ibans`-tak; een zoekterm van twee tekens kon dus als
 *     budgetcorrectie worden weggeschreven.
 *  2. **Bestemming.** Een "Eigen rekening"-doel landt in `user_own_ibans` en
 *     nooit in `category_corrections` — anders landen imports wél op de
 *     archive-post maar tellen ze gewoon mee (`isRealAggRow` kijkt naar
 *     `transaction_type`).
 *  3. **Geen rauwe LIKE-jokers.** De delete-vóór-insert matcht met `.ilike` op
 *     vrije gebruikerstekst; ongeëscapet wist een `%` álle regels van de
 *     gebruiker, met "Regel opgeslagen" als terugkoppeling.
 */

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))

import { POST } from './route'
import { MIN_RULE_MATCH_LENGTH } from '@/lib/transactions/rule-target'
import { BUDGET_SLUGS } from '@/lib/budget-data'

const USER_ID = 'user-1'
const BUDGET_ID = '11111111-1111-4111-8111-111111111111'

type Budget = { id: string; slug: string | null } | null

function makeClient(budget: Budget, opts: { authenticated?: boolean } = {}) {
  const authenticated = opts.authenticated ?? true
  const upserts: Record<string, unknown>[] = []
  const inserts: Record<string, unknown>[] = []
  const deleteFilters: [string, ...unknown[]][] = []

  const client = {
    auth: {
      getUser: async () => ({ data: { user: authenticated ? { id: USER_ID } : null } }),
    },
    from(table: string) {
      if (table === 'budgets') {
        const chain: Record<string, unknown> = {}
        chain.select = () => chain
        chain.eq = () => chain
        chain.maybeSingle = async () => ({ data: budget, error: null })
        return chain
      }
      if (table === 'user_own_ibans') {
        return {
          upsert: async (row: Record<string, unknown>) => {
            upserts.push(row)
            return { error: null }
          },
        }
      }
      if (table === 'category_corrections') {
        return {
          delete: () => {
            const chain: Record<string, unknown> = {}
            chain.eq = (col: string, val: unknown) => {
              deleteFilters.push(['eq', col, val])
              return chain
            }
            chain.ilike = (col: string, pattern: string) => {
              deleteFilters.push(['ilike', col, pattern])
              return Promise.resolve({ error: null })
            }
            return chain
          },
          insert: async (row: Record<string, unknown>) => {
            inserts.push(row)
            return { error: null }
          },
        }
      }
      throw new Error(`onverwachte tabel: ${table}`)
    },
  }

  return { client, upserts, inserts, deleteFilters }
}

function makeRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request
}

const gewoonBudget: Budget = { id: BUDGET_ID, slug: 'boodschappen' }
const eigenRekening: Budget = { id: BUDGET_ID, slug: BUDGET_SLUGS.EIGEN_REKENING }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/transactions/bulk-budget/regel', () => {
  it('schrijft een budgetcorrectie voor een gewoon budget', async () => {
    const { client, inserts, deleteFilters } = makeClient(gewoonBudget)
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({ matchField: 'counterparty_name', matchValue: 'Albert Heijn', budgetId: BUDGET_ID }),
    )

    expect(res.status).toBe(200)
    expect(inserts).toEqual([
      { user_id: USER_ID, match_field: 'counterparty_name', match_value: 'Albert Heijn', budget_id: BUDGET_ID },
    ])
    expect(deleteFilters).toContainEqual(['eq', 'user_id', USER_ID])
  })

  it('weigert een te korte matchwaarde op de budget-tak (H2)', async () => {
    const { client, inserts } = makeClient(gewoonBudget)
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({ matchField: 'description', matchValue: 'bp', budgetId: BUDGET_ID }),
    )

    expect(res.status).toBe(400)
    // Geen enkele schrijfronde: de poort staat vóór de mutatie.
    expect(inserts).toHaveLength(0)
  })

  it(`accepteert exact ${MIN_RULE_MATCH_LENGTH} tekens (grens, geen valse weigering)`, async () => {
    const { client, inserts } = makeClient(gewoonBudget)
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({
        matchField: 'description',
        matchValue: 'a'.repeat(MIN_RULE_MATCH_LENGTH),
        budgetId: BUDGET_ID,
      }),
    )

    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(1)
  })

  it('escapet LIKE-jokers in de delete-vóór-insert (M4)', async () => {
    const { client, deleteFilters } = makeClient(gewoonBudget)
    mockCreateClient.mockResolvedValue(client)

    await POST(
      makeRequest({ matchField: 'description', matchValue: '50% korting', budgetId: BUDGET_ID }),
    )

    const ilike = deleteFilters.find(([op]) => op === 'ilike')
    expect(ilike).toBeDefined()
    // Ongeëscapet zou dit patroon élke regel van deze gebruiker matchen die met
    // "50" begint en op " korting" eindigt — inclusief regels die er niets mee
    // te maken hebben.
    expect(ilike![2]).toBe('50\\% korting')
    // Wat er wordt OPGESLAGEN blijft de onbewerkte waarde; alleen het
    // zoekpatroon is geëscapet.
    expect(ilike![2]).not.toBe('50% korting')
  })

  it('een Eigen rekening-doel landt in user_own_ibans, niet in category_corrections', async () => {
    const { client, upserts, inserts } = makeClient(eigenRekening)
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({ matchField: 'counterparty_name', matchValue: 'Mijn Spaarrekening', budgetId: BUDGET_ID }),
    )

    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(0)
    expect(upserts).toEqual([
      {
        user_id: USER_ID,
        iban: null,
        match_type: 'name',
        match_value: 'mijn spaarrekening',
        label: 'Mijn Spaarrekening',
      },
    ])
  })

  it('weigert een Eigen rekening-regel op de omschrijving', async () => {
    const { client, upserts } = makeClient(eigenRekening)
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({ matchField: 'description', matchValue: 'naar mijn spaarrekening', budgetId: BUDGET_ID }),
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('unsupported_match_field')
    expect(upserts).toHaveLength(0)
  })

  it('onbekend budget → 400, geen regel', async () => {
    const { client, inserts, upserts } = makeClient(null)
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({ matchField: 'counterparty_name', matchValue: 'Albert Heijn', budgetId: BUDGET_ID }),
    )

    expect(res.status).toBe(400)
    expect(inserts).toHaveLength(0)
    expect(upserts).toHaveLength(0)
  })

  it('niet ingelogd → 401', async () => {
    const { client } = makeClient(gewoonBudget, { authenticated: false })
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({ matchField: 'counterparty_name', matchValue: 'Albert Heijn', budgetId: BUDGET_ID }),
    )
    expect(res.status).toBe(401)
  })
})
