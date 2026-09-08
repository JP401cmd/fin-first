import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Contracttests voor `/api/chat/conversations` (melding W-004, ADR 0137).
 *
 * Wat hier bewezen wordt, is niet "de route doet iets" maar de vier afspraken
 * waar de rest van de brok op leunt:
 *   1. 401 zonder sessie, en dan raakt de route de database NIET.
 *   2. De scoping is expliciet eigen-rij (`.eq('user_id', …)`) — RLS dekt het
 *      al, maar een weggevallen filter zou hier zichtbaar moeten worden.
 *   3. Het antwoord draagt de camelCase C1-veldnamen, nooit `last_message_at`.
 *   4. `origin: 'lokaal'` komt het schema niet in. Dat is de eerste helft van de
 *      privacyvloer; de CHECK-constraint is de tweede.
 */

const mockGetCachedUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))
vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: (...args: unknown[]) => mockGetCachedUser(...args),
}))

import { GET, POST } from './route'

const USER = { id: 'user-1' }

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Kan ik stoppen met werken?',
  origin: 'cloud',
  message_count: 4,
  next_seq: 4,
  truncated: false,
  created_at: '2026-09-01T10:00:00.000Z',
  last_message_at: '2026-09-02T12:00:00.000Z',
}

type Calls = Record<string, unknown[][]>

/** Chainbare query-builder-mock; elke terminal levert `result`. */
function mockChain(result: unknown) {
  const calls: Calls = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {}
  for (const method of ['select', 'eq', 'order', 'limit', 'lt', 'insert']) {
    chain[method] = vi.fn((...args: unknown[]) => {
      ;(calls[method] ||= []).push(args)
      return chain
    })
  }
  chain.single = vi.fn(() => Promise.resolve(result))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain.then = (onF: any, onR: any) => Promise.resolve(result).then(onF, onR)
  mockFrom.mockReturnValue(chain)
  return { chain, calls }
}

function getRequest(query = '') {
  return { url: `http://localhost/api/chat/conversations${query}` } as unknown as import('next/server').NextRequest
}

function postRequest(body: unknown, malformed = false) {
  return {
    json: () => (malformed ? Promise.reject(new Error('bad json')) : Promise.resolve(body)),
  } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  mockGetCachedUser.mockReset()
  mockFrom.mockReset()
})

describe('GET /api/chat/conversations', () => {
  it('401 zonder sessie en raakt de database niet', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    const res = await GET(getRequest())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Niet ingelogd', code: 'unauthorized' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('scoopt op de eigen rij, sorteert aflopend en levert camelCase C1-velden', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const { calls } = mockChain({ data: [ROW], error: null })

    const res = await GET(getRequest())
    expect(res.status).toBe(200)

    expect(mockFrom).toHaveBeenCalledWith('chat_conversations')
    expect(calls.eq).toEqual([['user_id', 'user-1']])
    expect(calls.order).toEqual([['last_message_at', { ascending: false }]])
    expect(calls.limit).toEqual([[50]])
    // Geen select('*') — de kolomlijst is expliciet.
    expect(String(calls.select?.[0]?.[0])).not.toContain('*')

    const body = await res.json()
    expect(body.conversations[0]).toEqual({
      id: ROW.id,
      title: ROW.title,
      origin: 'cloud',
      backend: 'server',
      messageCount: 4,
      // Élke meta-leverende route draagt nextSeq; een contract dat per route
      // verschilt is geen contract.
      nextSeq: 4,
      truncated: false,
      createdAt: ROW.created_at,
      lastMessageAt: ROW.last_message_at,
    })
    // De snake_case kolomnamen mogen de client niet bereiken.
    expect(Object.keys(body.conversations[0])).not.toContain('last_message_at')
  })

  it('pagineert met een keyset-filter op last_message_at', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const { calls } = mockChain({ data: [], error: null })

    const res = await GET(getRequest('?limit=10&before=2026-09-01T00:00:00.000Z'))
    expect(res.status).toBe(200)
    expect(calls.limit).toEqual([[10]])
    expect(calls.lt).toEqual([['last_message_at', '2026-09-01T00:00:00.000Z']])
  })

  it.each(['?limit=0', '?limit=101', '?limit=abc', '?limit=1.5'])('400 bij %s', async (query) => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockChain({ data: [], error: null })
    const res = await GET(getRequest(query))
    expect(res.status).toBe(400)
  })

  it('400 bij een before die geen tijdstip is', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockChain({ data: [], error: null })
    const res = await GET(getRequest('?before=gisteren'))
    expect(res.status).toBe(400)
  })

  it('500 bij een DB-fout, zonder de rauwe foutmelding in de body', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockChain({ data: null, error: { message: 'relation "chat_conversations" does not exist', code: '42P01' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(getRequest())
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('does not exist')
    spy.mockRestore()
  })
})

describe('POST /api/chat/conversations', () => {
  it('401 zonder sessie', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    const res = await POST(postRequest({ title: 'Hoi', origin: 'cloud' }))
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('weigert origin "lokaal" — de privacyvloer, eerste helft', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockChain({ data: ROW, error: null })
    const res = await POST(postRequest({ title: 'Lokaal gevoerd', origin: 'lokaal' }))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it.each([
    ['lege titel', { title: '   ', origin: 'cloud' }],
    ['te lange titel', { title: 'x'.repeat(121), origin: 'cloud' }],
    ['ontbrekende origin', { title: 'Hoi' }],
  ])('400 bij %s', async (_naam, body) => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockChain({ data: ROW, error: null })
    const res = await POST(postRequest(body))
    expect(res.status).toBe(400)
  })

  it('400 bij een malformed body', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const res = await POST(postRequest(null, true))
    expect(res.status).toBe(400)
  })

  it('schrijft user_id uit de sessie en origin cloud, en antwoordt in C1-vorm', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const { calls } = mockChain({ data: ROW, error: null })

    const res = await POST(postRequest({ title: 'Kan ik stoppen met werken?', origin: 'cloud' }))
    expect(res.status).toBe(200)
    expect(calls.insert).toEqual([
      [{ user_id: 'user-1', title: 'Kan ik stoppen met werken?', origin: 'cloud' }],
    ])
    const body = await res.json()
    expect(body.conversation.backend).toBe('server')
    expect(body.conversation.messageCount).toBe(4)
    expect(body.conversation.nextSeq).toBe(4)
  })

  it('een vers gesprek levert nextSeq 0 (de client begint bij beurt 0)', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockChain({ data: { ...ROW, message_count: 0, next_seq: 0 }, error: null })

    const res = await POST(postRequest({ title: 'Nieuw gesprek', origin: 'cloud' }))
    expect((await res.json()).conversation.nextSeq).toBe(0)
  })
})
