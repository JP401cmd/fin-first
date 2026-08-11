import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Route-tests voor PATCH /api/transactions/bulk-budget — hercategoriseer een
 * bevroren id-lijst naar één budget (F14/F15).
 *
 * Wat tot nu toe ontbrak: `readBulkCandidates`, `planBulkBudgetUpdate` en
 * `bulkUpdateTransactions` hebben elk hun eigen fake-client-test
 * (`lib/transactions/bulk-mutate.test.ts`), maar de SAMENSTELLING in `route.ts`
 * — welke `user.id` erin gaat, hoe de budget-lookup werkt, wat een gefaalde
 * batch oplevert in de JSON die de gebruiker ziet — had nul dekking. Dat is
 * precies de laag waar drie losse, correcte onderdelen tóch een verkeerd geheel
 * kunnen vormen.
 *
 *  - **AC6**: 1.500 geselecteerde transacties → 1.500 gewijzigd, geteld uit de
 *    database (niet uit `expectedCount`), over meerdere batches van 200 heen.
 *  - **AC7/AC8**: het canonieke trio, mét de own-row budget-lookup die
 *    `targetsEigenRekening` bepaalt.
 *  - **AC11** (route-niveau): `user.id` komt uit `supabase.auth.getUser()` — de
 *    enige plek waar de scoping vandaan kan komen, want het request-body-schema
 *    kent geen `userId`-veld.
 *  - **AC14**: een gesneuvelde batch wordt gemeld (`failedIds`), de rest gaat
 *    door.
 *
 * `ids` en `budgetId` moeten geldige UUID's zijn (zod-schema); `uuid(label)`
 * levert een deterministische, geldige UUID per leesbaar label.
 */

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))

import { PATCH } from './route'

const USER_ID = 'user-1'

function hashHex(s: string, len: number): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0
  // Genereer meer entropie dan één 32-bit hash door de lengte-index mee te hashen.
  let out = ''
  let seed = h
  while (out.length < len) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    out += seed.toString(16).padStart(8, '0')
  }
  return out.slice(0, len)
}

/** Deterministische, geldige UUID (versie 4-vorm) voor een leesbaar label. */
function uuid(label: string): string {
  return `${hashHex('p1:' + label, 8)}-${hashHex('p2:' + label, 4)}-4${hashHex('p3:' + label, 3)}-8${hashHex('p4:' + label, 3)}-${hashHex('p5:' + label, 12)}`
}

const BUDGET_BOODSCHAPPEN = uuid('budget-boodschappen')
const BUDGET_EIGEN_REKENING = uuid('budget-eigen-rekening')

type CandidateRow = {
  id: string
  user_id: string
  is_split: boolean | null
  transaction_type: string | null
  linked_transfer_id: string | null
}

function makeRow(over: Partial<CandidateRow> & { id: string }): CandidateRow {
  return { user_id: USER_ID, is_split: false, transaction_type: null, linked_transfer_id: null, ...over }
}

interface ClientOpts {
  authenticated?: boolean
  budgets?: { id: string; user_id: string; slug: string | null }[]
  /** Batches (in aanroepvolgorde) die bij het UPDATEn moeten falen. */
  failBatchIndexes?: number[]
}

function makeClient(candidates: CandidateRow[], opts: ClientOpts = {}) {
  const authenticated = opts.authenticated ?? true
  const budgets = opts.budgets ?? []
  const failBatchIndexes = new Set(opts.failBatchIndexes ?? [])
  let updateCallIndex = -1

  const readCalls: { userId?: string }[] = []
  const updateCalls: { userId?: string; ids: string[]; patch: Record<string, unknown> }[] = []
  const budgetReadCalls: { userId?: string; id?: string }[] = []

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: authenticated ? { id: USER_ID } : null },
      }),
    },
    from(table: string) {
      if (table === 'budgets') {
        const call: { userId?: string; id?: string } = {}
        budgetReadCalls.push(call)
        const chain = {
          select: () => chain,
          eq: (col: string, val: string) => {
            if (col === 'user_id') call.userId = val
            if (col === 'id') call.id = val
            return chain
          },
          maybeSingle: () =>
            Promise.resolve({
              data: budgets.find((b) => b.id === call.id && b.user_id === call.userId) ?? null,
              error: null,
            }),
        }
        return chain
      }
      if (table === 'transactions') {
        // Eén 'from' call kan zowel een SELECT (readBulkCandidates) als een
        // UPDATE (bulkUpdateTransactions) zijn; het verschil zit in welke
        // builder-methode als eerste wordt aangeroepen.
        let mode: 'select' | 'update' | null = null
        let updateIds: string[] = []
        let updatePatch: Record<string, unknown> = {}
        let filterUserId: string | undefined
        const readCall: { userId?: string } = {}
        const chain: Record<string, unknown> = {}
        chain.select = (_cols: string) => {
          if (mode === null) {
            mode = 'select'
            readCalls.push(readCall)
          }
          return chain
        }
        chain.update = (patch: Record<string, unknown>) => {
          mode = 'update'
          updatePatch = patch
          return chain
        }
        chain.not = () => chain
        chain.eq = (col: string, val: string) => {
          if (col === 'user_id') {
            filterUserId = val
            if (mode === 'select') readCall.userId = val
          }
          return chain
        }
        let filterIds: string[] | undefined
        chain.in = (_col: string, ids: string[]) => {
          updateIds = ids
          filterIds = ids
          return chain
        }
        chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          let scoped = filterUserId ? candidates.filter((r) => r.user_id === filterUserId) : candidates
          if (filterIds) {
            const idSet = new Set(filterIds)
            scoped = scoped.filter((r) => idSet.has(r.id))
          }
          const result = { data: scoped, error: null }
          return Promise.resolve(result).then(resolve, reject)
        }
        // `.select('id')` ná een UPDATE — een aparte tak omdat de update-keten
        // op `.select('id')` eindigt en dat NIET de leesronde mag hertriggeren.
        const originalSelect = chain.select as (cols: string) => unknown
        chain.select = (cols: string) => {
          if (mode === 'update') {
            updateCallIndex += 1
            const thisBatch = updateCallIndex
            updateCalls.push({ userId: filterUserId, ids: [...updateIds], patch: { ...updatePatch } })
            if (failBatchIndexes.has(thisBatch)) {
              return Promise.resolve({ data: null, error: { message: 'batch stuk' } })
            }
            const scoped = filterUserId
              ? updateIds.filter((id) => candidates.find((c) => c.id === id)?.user_id === filterUserId)
              : updateIds
            return Promise.resolve({ data: scoped.map((id) => ({ id })), error: null })
          }
          return originalSelect(cols)
        }
        return chain
      }
      throw new Error(`onverwachte tabel: ${table}`)
    },
  }

  return { client, readCalls, updateCalls, budgetReadCalls }
}

function makeRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/transactions/bulk-budget', () => {
  it('AC6 — 1.500 geselecteerde transacties: alle 1.500 worden gewijzigd, geteld uit de database', async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => uuid(`tx-${i}`))
    const candidates = ids.map((id) => makeRow({ id }))
    const { client, updateCalls } = makeClient(candidates, { budgets: [] })
    mockCreateClient.mockResolvedValue(client)

    const res = await PATCH(makeRequest({ ids, expectedCount: 1500, budgetId: null }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.requested).toBe(1500)
    expect(body.updated).toBe(1500)
    expect(body.failedIds).toEqual([])
    // Alle rijen hebben hetzelfde patroon (geen transfer-markering), dus één
    // schrijfgroep — maar wel over meerdere batches van BULK_BATCH_SIZE (200).
    expect(updateCalls.length).toBeGreaterThanOrEqual(8) // ceil(1500/200)
    expect(updateCalls.reduce((n, c) => n + c.ids.length, 0)).toBe(1500)
  })

  it('AC7 — Eigen rekening: schrijft het canonieke trio, ná een own-row budget-lookup', async () => {
    const candidates = [makeRow({ id: uuid('a') }), makeRow({ id: uuid('b'), transaction_type: 'DEBIT' })]
    const { client, updateCalls, budgetReadCalls } = makeClient(candidates, {
      budgets: [{ id: BUDGET_EIGEN_REKENING, user_id: USER_ID, slug: 'eigen-rekening' }],
    })
    mockCreateClient.mockResolvedValue(client)

    const res = await PATCH(
      makeRequest({ ids: [uuid('a'), uuid('b')], expectedCount: 2, budgetId: BUDGET_EIGEN_REKENING }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.updated).toBe(2)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].patch).toMatchObject({
      budget_id: BUDGET_EIGEN_REKENING,
      category_source: 'transfer',
      transaction_type: 'transfer',
    })
    // De budget-lookup zelf is own-row — een willekeurige budget-id van een
    // ander account mag hier niet "Eigen rekening" kunnen worden.
    expect(budgetReadCalls[0]?.userId).toBe(USER_ID)
  })

  it('AC8 — terug naar een gewoon budget: wist de markering alleen op rijen die nú een verschuiving zijn', async () => {
    const candidates = [
      makeRow({ id: uuid('t1'), transaction_type: 'transfer' }),
      makeRow({ id: uuid('g1'), transaction_type: 'DEBIT' }),
    ]
    const { client, updateCalls } = makeClient(candidates, {
      budgets: [{ id: BUDGET_BOODSCHAPPEN, user_id: USER_ID, slug: 'boodschappen' }],
    })
    mockCreateClient.mockResolvedValue(client)

    const res = await PATCH(
      makeRequest({ ids: [uuid('t1'), uuid('g1')], expectedCount: 2, budgetId: BUDGET_BOODSCHAPPEN }),
    )
    const body = await res.json()

    expect(body.updated).toBe(2)
    const wissers = updateCalls.find((c) => c.ids.includes(uuid('t1')))!
    const rest = updateCalls.find((c) => c.ids.includes(uuid('g1')))!
    expect(wissers.patch).toMatchObject({ transaction_type: null, category_source: 'manual' })
    expect(rest.patch).not.toHaveProperty('transaction_type')
  })

  it('AC11 (route) — user_id komt uit de sessie, niet uit de request-body, op zowel lees- als schrijfronde', async () => {
    const candidates = [makeRow({ id: uuid('a') }), makeRow({ id: uuid('partner-row'), user_id: 'user-2' })]
    const { client, readCalls, updateCalls } = makeClient(candidates, { budgets: [] })
    mockCreateClient.mockResolvedValue(client)

    // Schema kent geen userId-veld — dit toont dat zelfs een aanwezig veld
    // genegeerd wordt en de sessie-id wint.
    const res = await PATCH(
      makeRequest({ ids: [uuid('a')], expectedCount: 1, budgetId: null, userId: 'user-2' }),
    )
    const body = await res.json()

    expect(body.updated).toBe(1)
    expect(readCalls[0]?.userId).toBe(USER_ID)
    expect(updateCalls[0]?.userId).toBe(USER_ID)
  })

  it('AC14 — een gesneuvelde batch wordt gemeld, de rest gaat door', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => uuid(`tx-${i}`))
    const candidates = ids.map((id) => makeRow({ id }))
    // Twee batches (200 + 50); de eerste faalt.
    const { client } = makeClient(candidates, { budgets: [], failBatchIndexes: [0] })
    mockCreateClient.mockResolvedValue(client)

    const res = await PATCH(makeRequest({ ids, expectedCount: 250, budgetId: null }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.requested).toBe(250)
    expect(body.updated).toBe(50)
    expect(body.failedIds).toHaveLength(200)
  })

  it('count_mismatch — het bevestigde aantal wijkt af van de ontdubbelde id-lijst → 400, geen mutatie', async () => {
    const { client, updateCalls } = makeClient([makeRow({ id: uuid('a') })], { budgets: [] })
    mockCreateClient.mockResolvedValue(client)

    const res = await PATCH(makeRequest({ ids: [uuid('a')], expectedCount: 2, budgetId: null }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('count_mismatch')
    expect(updateCalls).toHaveLength(0)
  })

  it('onbekend budget → 400, geen mutatie', async () => {
    const { client, updateCalls } = makeClient([makeRow({ id: uuid('a') })], { budgets: [] })
    mockCreateClient.mockResolvedValue(client)

    const res = await PATCH(
      makeRequest({ ids: [uuid('a')], expectedCount: 1, budgetId: uuid('onbekend-budget') }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('unknown_budget')
    expect(updateCalls).toHaveLength(0)
  })

  it('niet ingelogd → 401', async () => {
    const { client } = makeClient([], { authenticated: false })
    mockCreateClient.mockResolvedValue(client)
    const res = await PATCH(makeRequest({ ids: [uuid('a')], expectedCount: 1, budgetId: null }))
    expect(res.status).toBe(401)
  })
})
