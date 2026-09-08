import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { serverChatHistoryStore } from './server-store'

/**
 * Tests voor de serverrug achter `ChatHistoryStore` (melding W-004, ADR 0137).
 *
 * De store praat uitsluitend met `/api/chat/**` — géén supabase-client. Dat is
 * de datapad-conventie (ADR 0058) én de voorwaarde voor R7: een supabase-import
 * hier zou de serverclient de browserbundel in trekken.
 *
 * Wat bewezen wordt: de gebouwde URL's en bodies, dat een fout de
 * `data.error`-string uit de platte envelope opgooit (ADR 0044), en dat
 * `create()` een lokaal gevoerd gesprek weigert zonder ook maar te fetchen —
 * de derde plek waar de privacyvloer staat.
 */

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function ok(payload: unknown) {
  return { ok: true, json: () => Promise.resolve(payload) }
}

function fail(status: number, payload: unknown) {
  return { ok: false, status, json: () => Promise.resolve(payload) }
}

const META = {
  id: 'c1',
  title: 'Kan ik stoppen met werken?',
  origin: 'cloud' as const,
  backend: 'server' as const,
  messageCount: 2,
  nextSeq: 2,
  truncated: false,
  createdAt: '2026-09-01T10:00:00.000Z',
  lastMessageAt: '2026-09-01T10:00:05.000Z',
}

describe('serverChatHistoryStore', () => {
  it('list() zonder opties vraagt de kale lijst op', async () => {
    fetchMock.mockResolvedValue(ok({ conversations: [META] }))
    const result = await serverChatHistoryStore.list()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat/conversations')
    expect(result).toEqual([META])
  })

  it('list() zet limit en before in de querystring', async () => {
    fetchMock.mockResolvedValue(ok({ conversations: [] }))
    await serverChatHistoryStore.list({ limit: 10, before: '2026-09-01T00:00:00.000Z' })
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/chat/conversations?limit=10&before=2026-09-01T00%3A00%3A00.000Z',
    )
  })

  it('load() geeft alleen de berichten terug', async () => {
    const messages = [{ seq: 0, role: 'user', content: 'Hoi', richKinds: [], createdAt: META.createdAt }]
    fetchMock.mockResolvedValue(ok({ conversation: META, messages }))
    await expect(serverChatHistoryStore.load('c1')).resolves.toEqual(messages)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat/conversations/c1')
  })

  it('create() weigert een lokaal gevoerd gesprek en fetcht dan niet — de privacyvloer', async () => {
    await expect(serverChatHistoryStore.create({ title: 'Lokaal', origin: 'lokaal' })).rejects.toThrow(
      /lokale AI/,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('create() post titel en origin cloud met een JSON-header', async () => {
    fetchMock.mockResolvedValue(ok({ conversation: META }))
    await serverChatHistoryStore.create({ title: 'Kan ik stoppen met werken?', origin: 'cloud' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/chat/conversations')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ title: 'Kan ik stoppen met werken?', origin: 'cloud' })
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('appendTurn() post de beurt op het gesprek en geeft de bijgewerkte meta terug', async () => {
    fetchMock.mockResolvedValue(ok({ conversation: { ...META, messageCount: 4, nextSeq: 4 } }))
    const messages = [
      { seq: 2, role: 'user' as const, content: 'En daarna?', richKinds: [], createdAt: META.createdAt },
    ]
    const result = await serverChatHistoryStore.appendTurn('c1', messages)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/chat/conversations/c1/messages')
    expect(JSON.parse(init.body)).toEqual({ messages })
    expect(result.messageCount).toBe(4)
    // Het volgnummer komt van de server terug; een eigen clientteller beweegt
    // niet mee als een schrijfactie faalt en laat de volgende beurt stil op
    // ON CONFLICT DO NOTHING verdampen.
    expect(result.nextSeq).toBe(4)
  })

  it('rename() en remove() gebruiken PATCH en DELETE op hetzelfde pad', async () => {
    fetchMock.mockResolvedValue(ok({ conversation: META }))
    await serverChatHistoryStore.rename('c1', 'Andere naam')
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: 'Andere naam' })

    fetchMock.mockResolvedValue(ok({ ok: true }))
    await serverChatHistoryStore.remove('c1')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/chat/conversations/c1')
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE')
  })

  it('removeAll() leest eerst de huidige modus en schrijft die ONGEWIJZIGD terug', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ mode: 'apparaat', serverConversationCount: 3 }))
      .mockResolvedValueOnce(ok({ mode: 'apparaat', deleted: 3 }))

    await serverChatHistoryStore.removeAll()

    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat/history-settings')
    const [, putInit] = fetchMock.mock.calls[1]
    expect(putInit.method).toBe('PUT')
    // Deze methode wist gesprekken; ze verandert geen instelling.
    expect(JSON.parse(putInit.body)).toEqual({ mode: 'apparaat', deleteExisting: true })
  })

  it('gooit de foutstring uit de platte envelope op', async () => {
    fetchMock.mockResolvedValue(fail(404, { error: 'Gesprek niet gevonden', code: 'not_found' }))
    await expect(serverChatHistoryStore.load('c1')).rejects.toThrow('Gesprek niet gevonden')
  })

  it('valt terug op één generieke zin als het antwoord geen JSON is', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: () => Promise.reject(new Error('html')) })
    await expect(serverChatHistoryStore.list()).rejects.toThrow(/Er ging iets mis bij je gesprekken/)
  })
})
