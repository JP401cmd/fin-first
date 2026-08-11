import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Route-tests voor POST /api/transactions/bulk-delete — HARD verwijderen van
 * een bevroren id-lijst (F16–F18). Geen prullenbak (besluit B1), dus elke poort
 * hier telt.
 *
 * `bulkDeleteTransactions`/`collectLinkedCounterpartIds` hebben elk hun eigen
 * fake-client-unittest; deze route-tests bewaken de SAMENSTELLING:
 *
 *  - **AC11** (route-niveau): `user.id` komt uit de sessie, op leesronde,
 *    schrijfronde én de own-row-verificatie van tegenboekingen.
 *  - **AC14**: een gesneuvelde batch wordt gemeld, de rest gaat door.
 *  - De type-to-confirm-poort (F17) is ook een SERVER-poort, niet alleen
 *    UI-versiering: boven de drempel weigert de route zonder (of met een
 *    verkeerd) `confirmCount`.
 *  - Tegenboekingen (`linked_transfer_id`) gaan standaard mee, maar pas ná
 *    own-row-verificatie — een tegenboeking bij de partner mag niet meetellen
 *    in het te overtypen aantal.
 */

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))

import { POST } from './route'
import { TYPE_TO_CONFIRM_THRESHOLD } from '@/lib/transactions/bulk-contract'

const USER_ID = 'user-1'

function hashHex(s: string, len: number): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0
  let out = ''
  let seed = h
  while (out.length < len) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    out += seed.toString(16).padStart(8, '0')
  }
  return out.slice(0, len)
}

function uuid(label: string): string {
  return `${hashHex('p1:' + label, 8)}-${hashHex('p2:' + label, 4)}-4${hashHex('p3:' + label, 3)}-8${hashHex('p4:' + label, 3)}-${hashHex('p5:' + label, 12)}`
}

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
  /** Batches (in aanroepvolgorde over ALLE deletes heen) die moeten falen. */
  failBatchIndexes?: number[]
}

function makeClient(candidates: CandidateRow[], opts: ClientOpts = {}) {
  const authenticated = opts.authenticated ?? true
  const failBatchIndexes = new Set(opts.failBatchIndexes ?? [])
  let deleteCallIndex = -1

  const readCalls: { userId?: string }[] = []
  const deleteCalls: { userId?: string; ids: string[] }[] = []

  const client = {
    auth: {
      getUser: async () => ({ data: { user: authenticated ? { id: USER_ID } : null } }),
    },
    from(table: string) {
      if (table === 'transactions') {
        let mode: 'select' | 'delete' | null = null
        let deleteIds: string[] = []
        /** Onthoudt de `.in('id', …)`-lijst ook voor de SELECT-tak (readBulkCandidates). */
        let filterIds: string[] | undefined
        let filterUserId: string | undefined
        const readCall: { userId?: string } = {}
        const chain: Record<string, unknown> = {}
        chain.select = (_cols: string) => {
          if (mode === null) {
            mode = 'select'
            readCalls.push(readCall)
          } else if (mode === 'delete') {
            // `.select('id')` na een DELETE.
            deleteCallIndex += 1
            const thisBatch = deleteCallIndex
            deleteCalls.push({ userId: filterUserId, ids: [...deleteIds] })
            if (failBatchIndexes.has(thisBatch)) {
              return Promise.resolve({ data: null, error: { message: 'batch stuk' } })
            }
            const scoped = filterUserId
              ? deleteIds.filter((id) => candidates.find((c) => c.id === id)?.user_id === filterUserId)
              : deleteIds
            return Promise.resolve({ data: scoped.map((id) => ({ id })), error: null })
          }
          return chain
        }
        chain.delete = () => {
          mode = 'delete'
          return chain
        }
        chain.eq = (col: string, val: string) => {
          if (col === 'user_id') {
            filterUserId = val
            if (mode === 'select') readCall.userId = val
          }
          return chain
        }
        chain.in = (_col: string, ids: string[]) => {
          deleteIds = ids
          filterIds = ids
          return chain
        }
        chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          let scoped = filterUserId ? candidates.filter((r) => r.user_id === filterUserId) : candidates
          if (filterIds) {
            const idSet = new Set(filterIds)
            scoped = scoped.filter((r) => idSet.has(r.id))
          }
          return Promise.resolve({ data: scoped, error: null }).then(resolve, reject)
        }
        return chain
      }
      throw new Error(`onverwachte tabel: ${table}`)
    },
  }

  return { client, readCalls, deleteCalls }
}

function makeRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/transactions/bulk-delete', () => {
  it('verwijdert own-row en telt uit de database', async () => {
    const ids = [uuid('a'), uuid('b')]
    const candidates = ids.map((id) => makeRow({ id }))
    const { client, deleteCalls } = makeClient(candidates)
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({ ids, expectedCount: 2, includeLinkedCounterparts: false }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.requested).toBe(2)
    expect(body.deleted).toBe(2)
    expect(deleteCalls[0]?.userId).toBe(USER_ID)
  })

  it('AC11 (route) — user_id komt uit de sessie op lees- én schrijfronde', async () => {
    const candidates = [makeRow({ id: uuid('a') }), makeRow({ id: uuid('partner'), user_id: 'user-2' })]
    const { client, readCalls, deleteCalls } = makeClient(candidates)
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({ ids: [uuid('a')], expectedCount: 1, includeLinkedCounterparts: false }),
    )
    const body = await res.json()

    expect(body.deleted).toBe(1)
    expect(readCalls[0]?.userId).toBe(USER_ID)
    expect(deleteCalls[0]?.userId).toBe(USER_ID)
  })

  it('AC14 — een gesneuvelde batch wordt gemeld, de rest gaat door', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => uuid(`tx-${i}`))
    const candidates = ids.map((id) => makeRow({ id }))
    const { client } = makeClient(candidates, { failBatchIndexes: [0] })
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({ ids, expectedCount: 250, confirmCount: 250, includeLinkedCounterparts: false }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.requested).toBe(250)
    expect(body.deleted).toBe(50)
    expect(body.failedIds).toHaveLength(200)
  })

  it('confirm_mismatch — boven de drempel wordt een verkeerd (of ontbrekend) confirmCount geweigerd', async () => {
    const ids = Array.from({ length: TYPE_TO_CONFIRM_THRESHOLD + 1 }, (_, i) => uuid(`tx-${i}`))
    const candidates = ids.map((id) => makeRow({ id }))
    const { client, deleteCalls } = makeClient(candidates)
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({ ids, expectedCount: ids.length, includeLinkedCounterparts: false }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('confirm_mismatch')
    // Geen enkele delete-call mag zijn uitgevoerd: de poort staat VÓÓR de mutatie.
    expect(deleteCalls).toHaveLength(0)
  })

  it('confirm_mismatch telt de tegenboekingen mee in het vereiste totaal', async () => {
    // 20 geselecteerd (onder de drempel) + 6 tegenboekingen = 26, boven de
    // drempel van 25 — het overgetypte aantal moet dus 26 zijn, niet 20.
    const selected = Array.from({ length: 20 }, (_, i) => uuid(`sel-${i}`))
    const counterparts = Array.from({ length: 6 }, (_, i) => uuid(`tp-${i}`))
    const candidates = [
      ...selected.map((id, i) => makeRow({ id, linked_transfer_id: counterparts[i % 6] })),
      ...counterparts.map((id) => makeRow({ id })),
    ]
    const { client, deleteCalls } = makeClient(candidates)
    mockCreateClient.mockResolvedValue(client)

    const wrongRes = await POST(
      makeRequest({
        ids: selected,
        expectedCount: selected.length,
        confirmCount: 20,
        includeLinkedCounterparts: true,
      }),
    )
    expect(wrongRes.status).toBe(400)
    const wrongBody = await wrongRes.json()
    expect(wrongBody.code).toBe('confirm_mismatch')
    expect(deleteCalls).toHaveLength(0)

    const rightRes = await POST(
      makeRequest({
        ids: selected,
        expectedCount: selected.length,
        confirmCount: 26,
        includeLinkedCounterparts: true,
      }),
    )
    expect(rightRes.status).toBe(200)
    const rightBody = await rightRes.json()
    expect(rightBody.deleted).toBe(20)
    expect(rightBody.orphansCleared).toBe(6)
  })

  it('een tegenboeking van de partner telt NIET mee — own-row geverifieerd vóór het totaal', async () => {
    const selectedId = uuid('sel')
    const partnerCounterpartId = uuid('partner-tp')
    const candidates = [
      makeRow({ id: selectedId, linked_transfer_id: partnerCounterpartId }),
      // De "tegenboeking" bestaat, maar is van de partner — readBulkCandidates
      // (own-row) laat hem dus weg bij de verificatieronde.
      makeRow({ id: partnerCounterpartId, user_id: 'user-2' }),
    ]
    const { client } = makeClient(candidates)
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({ ids: [selectedId], expectedCount: 1, includeLinkedCounterparts: true }),
    )
    const body = await res.json()

    // Dubbele borging: de schrijfronde is zelf óók own-row gescoped, dus zelfs
    // een niet-geverifieerde tegenboeking zou nooit daadwerkelijk verwijderd
    // worden. Dat maakt "orphansCleared: 0" alléén geen falsifieerbaar bewijs
    // van de VERIFICATIE zelf — zie de volgende test voor dat bewijs via het
    // te bevestigen aantal.
    expect(res.status).toBe(200)
    expect(body.deleted).toBe(1)
    expect(body.orphansCleared).toBe(0)
  })

  it('het te bevestigen aantal telt alleen geverifieerde tegenboekingen — een partnerrij mag het totaal niet opblazen', async () => {
    // 26 eigen rijen: 25 gekoppeld aan een EIGEN tegenboeking (telt mee), 1
    // gekoppeld aan een tegenboeking van de PARTNER (hoort NIET mee te tellen).
    // Correct totaal: 26 + 25 = 51. Zou de own-row-verificatie ontbreken, dan
    // zou de partnerrij meetellen en kwam de server op 52 uit — en zou het
    // hieronder verstuurde `confirmCount: 51` als `confirm_mismatch` afketsen.
    // Dat maakt dit een falsifieerbaar bewijs van de verificatie zélf, in
    // tegenstelling tot alleen `orphansCleared` toetsen (dat de schrijfronde se
    // eigen own-row-scoping zou kunnen maskeren — zie de vorige test).
    const selected = Array.from({ length: 26 }, (_, i) => uuid(`sel2-${i}`))
    const ownCounterparts = Array.from({ length: 25 }, (_, i) => uuid(`tp2-${i}`))
    const partnerCounterpart = uuid('tp2-partner')
    const candidates = [
      ...selected.slice(0, 25).map((id, i) => makeRow({ id, linked_transfer_id: ownCounterparts[i] })),
      makeRow({ id: selected[25], linked_transfer_id: partnerCounterpart }),
      ...ownCounterparts.map((id) => makeRow({ id })),
      makeRow({ id: partnerCounterpart, user_id: 'user-2' }),
    ]
    const { client, deleteCalls } = makeClient(candidates)
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({
        ids: selected,
        expectedCount: selected.length,
        confirmCount: 51,
        includeLinkedCounterparts: true,
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.deleted).toBe(26)
    expect(body.orphansCleared).toBe(25)
    expect(deleteCalls.reduce((n, c) => n + c.ids.length, 0)).toBe(51)
  })

  it('count_mismatch → 400, geen mutatie', async () => {
    const { client, deleteCalls } = makeClient([makeRow({ id: uuid('a') })])
    mockCreateClient.mockResolvedValue(client)

    const res = await POST(
      makeRequest({ ids: [uuid('a')], expectedCount: 2, includeLinkedCounterparts: false }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('count_mismatch')
    expect(deleteCalls).toHaveLength(0)
  })

  it('niet ingelogd → 401', async () => {
    const { client } = makeClient([], { authenticated: false })
    mockCreateClient.mockResolvedValue(client)
    const res = await POST(
      makeRequest({ ids: [uuid('a')], expectedCount: 1, includeLinkedCounterparts: false }),
    )
    expect(res.status).toBe(401)
  })
})
