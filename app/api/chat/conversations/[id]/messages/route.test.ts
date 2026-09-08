import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Contracttests voor `POST /api/chat/conversations/[id]/messages`
 * (melding W-004, ADR 0137).
 *
 * Het gevoeligste pad van brok A: hier gaat de chattekst de database in, via
 * een `security definer`-RPC. Wat hier bewezen moet worden:
 *   - de route stuurt NOOIT een `user_id` mee (de RPC leest die uit de sessie —
 *     een parameter zou betekenen dat de aanroeper hem kan kiezen);
 *   - de weigering van de RPC (42501 / P0002) wordt een 404 en geen 500, en
 *     ook geen 403 (dat zou het bestaan van andermans gesprek verklappen);
 *   - de vrije tekst belandt niet in een foutbody.
 */

const mockGetCachedUser = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mockRpc })),
}))
vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: (...args: unknown[]) => mockGetCachedUser(...args),
}))

import { POST } from './route'

const USER = { id: 'user-1' }
const ID = '11111111-1111-4111-8111-111111111111'

const TURN = [
  { seq: 0, role: 'user', content: 'Ik heb een schuld bij mijn ouders', richKinds: [], createdAt: '2026-09-01T10:00:00.000Z' },
  { seq: 1, role: 'assistant', content: 'Dat kost je zoveel vrijheidstijd.', richKinds: ['visualisatie'], createdAt: '2026-09-01T10:00:05.000Z' },
]

const CONV_ROW = {
  id: ID,
  title: 'Kan ik stoppen met werken?',
  origin: 'cloud',
  message_count: 2,
  next_seq: 2,
  truncated: false,
  created_at: '2026-09-01T10:00:00.000Z',
  last_message_at: '2026-09-01T10:00:05.000Z',
}

function req(body: unknown, malformed = false) {
  return {
    json: () => (malformed ? Promise.reject(new Error('bad json')) : Promise.resolve(body)),
  } as unknown as import('next/server').NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  mockGetCachedUser.mockReset()
  mockRpc.mockReset()
})

describe('POST /api/chat/conversations/[id]/messages', () => {
  it('401 zonder sessie en roept de RPC niet aan', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    const res = await POST(req({ messages: TURN }), params(ID))
    expect(res.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 bij een id dat geen uuid is', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const res = await POST(req({ messages: TURN }), params('nope'))
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each([
    ['lege lijst', { messages: [] }],
    ['drie berichten', { messages: [...TURN, { ...TURN[0], seq: 2 }] }],
    ['negatieve seq', { messages: [{ ...TURN[0], seq: -1 }] }],
    ['onbekende rol', { messages: [{ ...TURN[0], role: 'system' }] }],
    ['onbekende richKind', { messages: [{ ...TURN[0], richKinds: ['grafiekje'] }] }],
    ['content te lang', { messages: [{ ...TURN[0], content: 'x'.repeat(32001) }] }],
    ['geen messages', {}],
    // createdAt gaat ongewijzigd naar een TIMESTAMPTZ-cast in de RPC. Zonder
    // vormcontrole gaf 'banana' een 22007 (→ 500 i.p.v. 400) en was 'infinity'
    // een GELDIG literal dat via greatest() in last_message_at landde: het
    // gesprek stond dan permanent bovenaan en de keyset-pagineerder weigerde
    // zijn eigen cursor. De gebruiker kon dat niet herstellen — last_message_at
    // valt buiten zijn kolom-GRANT.
    ['createdAt is geen tijdstip', { messages: [{ ...TURN[0], createdAt: 'banana' }] }],
    ['createdAt is "infinity"', { messages: [{ ...TURN[0], createdAt: 'infinity' }] }],
    ['createdAt is leeg', { messages: [{ ...TURN[0], createdAt: '' }] }],
    ['createdAt is alleen een datum', { messages: [{ ...TURN[0], createdAt: '2026-09-01' }] }],
  ])('400 bij %s', async (_naam, body) => {
    mockGetCachedUser.mockResolvedValue(USER)
    const res = await POST(req(body), params(ID))
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('400 bij twee gelijke seq binnen één beurt (de UNIQUE zou er stil één slikken)', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const res = await POST(req({ messages: [TURN[0], { ...TURN[1], seq: 0 }] }), params(ID))
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('roept append_chat_turn aan zónder user_id en antwoordt in C1-vorm', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockRpc.mockResolvedValue({ data: CONV_ROW, error: null })

    const res = await POST(req({ messages: TURN }), params(ID))
    expect(res.status).toBe(200)

    expect(mockRpc).toHaveBeenCalledWith('append_chat_turn', {
      p_conversation: ID,
      p_messages: TURN,
    })
    // De eigenaar komt uit de sessie, niet uit de payload.
    const args = JSON.stringify(mockRpc.mock.calls[0][1])
    expect(args).not.toContain('user_id')
    expect(args).not.toContain('user-1')

    const body = await res.json()
    expect(body.conversation.messageCount).toBe(2)
    expect(body.conversation.backend).toBe('server')
  })

  it('accepteert een createdAt met tijdzone-offset (niet elke klok staat op UTC)', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockRpc.mockResolvedValue({ data: CONV_ROW, error: null })

    const res = await POST(
      req({ messages: [{ ...TURN[0], createdAt: '2026-09-01T12:00:00+02:00' }] }),
      params(ID),
    )
    expect(res.status).toBe(200)
  })

  it('geeft nextSeq door uit de RPC-rij (de client houdt geen eigen teller bij)', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    // Gesnoeid gesprek: message_count zit op de cap, seq loopt door. Precies het
    // geval waarin een uit messageCount afgeleide teller op bestaande nummers
    // zou botsen — en een botsing is hier een STIL verlies, geen fout.
    mockRpc.mockResolvedValue({
      data: { ...CONV_ROW, message_count: 200, next_seq: 412, truncated: true },
      error: null,
    })

    const res = await POST(req({ messages: TURN }), params(ID))
    const body = await res.json()
    expect(body.conversation.nextSeq).toBe(412)
    expect(body.conversation.messageCount).toBe(200)
    expect(Object.keys(body.conversation)).not.toContain('next_seq')
  })

  it.each(['42501', 'P0002'])('404 wanneer de RPC weigert met %s', async (code) => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockRpc.mockResolvedValue({ data: null, error: { code, message: 'Geen toegang tot dit gesprek' } })

    const res = await POST(req({ messages: TURN }), params(ID))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Gesprek niet gevonden')
  })

  it('500 bij een onbekende DB-fout, zonder de rauwe melding of de chattekst in de body', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'new row violates check constraint "chat_messages_content_len"' },
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(req({ messages: TURN }), params(ID))
    expect(res.status).toBe(500)
    const raw = JSON.stringify(await res.json())
    expect(raw).not.toContain('check constraint')
    expect(raw).not.toContain('schuld bij mijn ouders')
    spy.mockRestore()
  })
})
