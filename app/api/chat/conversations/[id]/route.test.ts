import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Contracttests voor `/api/chat/conversations/[id]` (melding W-004, ADR 0137).
 *
 * De scherpste eis hier is de FOUTVORM bij andermans gesprek: 404, niet 403.
 * Een 403 zou bevestigen dát dat gesprek bestaat, en het bestaan van een
 * gesprek is zelf al informatie over een andere gebruiker. Omdat de route dat
 * niet met een expliciete eigenaarsvergelijking doet maar met een filter die
 * simpelweg niets oplevert, is "0 rijen ⇒ 404" precies wat getest moet worden.
 *
 * Verder: dat PATCH een `.select()` doet. Een UPDATE die door RLS 0 rijen raakt
 * geeft `error: null` — zonder die select zou de client een succes-toast zien
 * terwijl er niets gebeurde (dezelfde valkuil als bij /api/assets/[id]).
 */

const mockGetCachedUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))
vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: (...args: unknown[]) => mockGetCachedUser(...args),
}))

import { GET, PATCH, DELETE } from './route'

const USER = { id: 'user-1' }
const ID = '11111111-1111-4111-8111-111111111111'

const CONV_ROW = {
  id: ID,
  title: 'Kan ik stoppen met werken?',
  origin: 'cloud',
  message_count: 2,
  next_seq: 2,
  truncated: true,
  created_at: '2026-09-01T10:00:00.000Z',
  last_message_at: '2026-09-02T12:00:00.000Z',
}

const MESSAGE_ROWS = [
  { seq: 0, role: 'user', content: 'Kan ik stoppen met werken?', rich_kinds: [], created_at: '2026-09-01T10:00:00.000Z' },
  {
    seq: 1,
    role: 'assistant',
    content: 'Dat hangt af van je vrijheidstijd.',
    // 'onzin' hoort weggefilterd te worden: de UI rendert per soort een
    // neutrale regel en mag geen onbekende soort binnenkrijgen.
    rich_kinds: ['visualisatie', 'onzin'],
    created_at: '2026-09-01T10:00:05.000Z',
  },
]

type Calls = Record<string, unknown[][]>
const calls: Record<string, Calls> = {}

/** Per tabel een eigen resultaat, zodat GET beide reads los kan sturen. */
function mockTables(results: Record<string, unknown>) {
  for (const key of Object.keys(calls)) delete calls[key]
  mockFrom.mockImplementation((table: string) => {
    const tableCalls: Calls = (calls[table] ||= {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {}
    for (const method of ['select', 'eq', 'order', 'update', 'delete']) {
      chain[method] = vi.fn((...args: unknown[]) => {
        ;(tableCalls[method] ||= []).push(args)
        return chain
      })
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve(results[table]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain.then = (onF: any, onR: any) => Promise.resolve(results[table]).then(onF, onR)
    return chain
  })
}

function req(body?: unknown) {
  return {
    json: () => Promise.resolve(body),
  } as unknown as import('next/server').NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  mockGetCachedUser.mockReset()
  mockFrom.mockReset()
})

describe('GET /api/chat/conversations/[id]', () => {
  it('400 bij een id dat geen uuid is — die gaat nooit naar Postgres', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const res = await GET(req(), params('niet-een-uuid'))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('401 zonder sessie', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    const res = await GET(req(), params(ID))
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('404 bij een gesprek van iemand anders (geen 403 — dat zou het bestaan verklappen)', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({ chat_conversations: { data: null, error: null } })

    const res = await GET(req(), params(ID))
    expect(res.status).toBe(404)
    // De berichten zijn dan nooit opgevraagd.
    expect(mockFrom).not.toHaveBeenCalledWith('chat_messages')
  })

  it('hydrateert op seq oplopend, scoopt beide reads op de eigen rij en filtert onbekende richKinds', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({
      chat_conversations: { data: CONV_ROW, error: null },
      chat_messages: { data: MESSAGE_ROWS, error: null },
    })

    const res = await GET(req(), params(ID))
    expect(res.status).toBe(200)

    expect(calls.chat_conversations.eq).toEqual([['id', ID], ['user_id', 'user-1']])
    expect(calls.chat_messages.eq).toEqual([['conversation_id', ID], ['user_id', 'user-1']])
    expect(calls.chat_messages.order).toEqual([['seq', { ascending: true }]])

    const body = await res.json()
    expect(body.conversation.truncated).toBe(true)
    // Bij het hervatten heeft de client nextSeq nodig om zijn eerste nieuwe
    // beurt te nummeren; hij mag die niet uit het aantal geladen berichten
    // afleiden (dit gesprek is gesnoeid, truncated staat op true).
    expect(body.conversation.nextSeq).toBe(2)
    expect(body.messages).toHaveLength(2)
    expect(body.messages[1]).toEqual({
      seq: 1,
      role: 'assistant',
      content: 'Dat hangt af van je vrijheidstijd.',
      richKinds: ['visualisatie'],
      createdAt: '2026-09-01T10:00:05.000Z',
    })
  })
})

describe('PATCH /api/chat/conversations/[id]', () => {
  it.each([
    ['lege titel', { title: '  ' }],
    ['te lange titel', { title: 'x'.repeat(121) }],
    ['geen titel', {}],
  ])('400 bij %s', async (_naam, body) => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({ chat_conversations: { data: CONV_ROW, error: null } })
    const res = await PATCH(req(body), params(ID))
    expect(res.status).toBe(400)
  })

  it('404 wanneer de update 0 rijen raakt (RLS geeft daar geen fout bij)', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({ chat_conversations: { data: null, error: null } })
    const res = await PATCH(req({ title: 'Nieuwe naam' }), params(ID))
    expect(res.status).toBe(404)
  })

  it('hernoemt alleen title, op de eigen rij, en leest het resultaat terug', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({ chat_conversations: { data: { ...CONV_ROW, title: 'Nieuwe naam' }, error: null } })

    const res = await PATCH(req({ title: 'Nieuwe naam' }), params(ID))
    expect(res.status).toBe(200)
    expect(calls.chat_conversations.update).toEqual([[{ title: 'Nieuwe naam' }]])
    expect(calls.chat_conversations.eq).toEqual([['id', ID], ['user_id', 'user-1']])
    // Zonder deze select zou 0 geraakte rijen als succes langskomen.
    expect(calls.chat_conversations.select?.length).toBe(1)
    const body = await res.json()
    expect(body.conversation.title).toBe('Nieuwe naam')
    // Ook het hernoemen levert het volledige contract; anders zou de client na
    // een rename een meta zonder nextSeq in handen krijgen.
    expect(body.conversation.nextSeq).toBe(2)
  })
})

describe('DELETE /api/chat/conversations/[id]', () => {
  it('404 wanneer er niets verwijderd werd', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({ chat_conversations: { data: [], error: null } })
    const res = await DELETE(req(), params(ID))
    expect(res.status).toBe(404)
  })

  it('verwijdert de eigen rij en meldt ok — de berichten cascaden mee', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({ chat_conversations: { data: [{ id: ID }], error: null } })

    const res = await DELETE(req(), params(ID))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls.chat_conversations.eq).toEqual([['id', ID], ['user_id', 'user-1']])
    // Eén delete, geen tweede op chat_messages: die gaat via de FK-cascade.
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })
})
