import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Contracttests voor `/api/chat/history-settings` (melding W-004, ADR 0137).
 *
 * Drie afspraken die er echt toe doen:
 *   1. Een ONTBREKENDE kolom (42703, migratie nog niet toegepast) valt terug op
 *      'account' i.p.v. een 500 — anders is de opslagkeuze onbedienbaar in een
 *      omgeving die achterloopt. Elke ándere leesfout gooit wél door.
 *   2. Zonder `deleteExisting` wordt er NIETS verwijderd. Een instelling is
 *      nooit uit zichzelf een destructieve handeling.
 *   3. De modus wordt vóór de wissing geschreven: faalt de wissing, dan staat
 *      de keuze er en zijn de gesprekken er nog — herstelbaar. Andersom niet.
 */

const mockGetCachedUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))
vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: (...args: unknown[]) => mockGetCachedUser(...args),
}))

import { GET, PUT } from './route'

const USER = { id: 'user-1' }

type Calls = Record<string, unknown[][]>
const calls: Record<string, Calls> = {}
let order: string[] = []

function mockTables(results: Record<string, unknown>) {
  for (const key of Object.keys(calls)) delete calls[key]
  order = []
  mockFrom.mockImplementation((table: string) => {
    const tableCalls: Calls = (calls[table] ||= {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {}
    for (const method of ['select', 'eq', 'update', 'delete']) {
      chain[method] = vi.fn((...args: unknown[]) => {
        ;(tableCalls[method] ||= []).push(args)
        if (method === 'update' || method === 'delete') order.push(`${table}:${method}`)
        return chain
      })
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve(results[table]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain.then = (onF: any, onR: any) => Promise.resolve(results[table]).then(onF, onR)
    return chain
  })
}

function req(body: unknown, malformed = false) {
  return {
    json: () => (malformed ? Promise.reject(new Error('bad json')) : Promise.resolve(body)),
  } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  mockGetCachedUser.mockReset()
  mockFrom.mockReset()
})

describe('GET /api/chat/history-settings', () => {
  it('401 zonder sessie', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('geeft de opgeslagen modus en het aantal servergesprekken', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({
      profiles: { data: { chat_history_mode: 'apparaat' }, error: null },
      chat_conversations: { count: 7, error: null },
    })

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mode: 'apparaat', serverConversationCount: 7 })
    // head:true — het instellingenscherm krijgt een getal, geen gesprekstitels.
    expect(calls.chat_conversations.select).toEqual([['id', { count: 'exact', head: true }]])
    expect(calls.chat_conversations.eq).toEqual([['user_id', 'user-1']])
  })

  it('valt terug op "account" wanneer de kolom nog niet bestaat (42703)', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({
      profiles: { data: null, error: { code: '42703', message: 'column does not exist' } },
      chat_conversations: { count: 0, error: null },
    })

    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).mode).toBe('account')
  })

  it('valt terug op "account" bij een onbekende waarde in de kolom', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({
      profiles: { data: { chat_history_mode: 'ergens-anders' }, error: null },
      chat_conversations: { count: 0, error: null },
    })

    expect((await (await GET()).json()).mode).toBe('account')
  })

  it('500 bij een ándere leesfout — een storing mag niet stil als "account" lezen', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({
      profiles: { data: null, error: { code: '08006', message: 'connection failure' } },
      chat_conversations: { count: 0, error: null },
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('connection failure')
    spy.mockRestore()
  })
})

describe('PUT /api/chat/history-settings', () => {
  it('401 zonder sessie', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    const res = await PUT(req({ mode: 'uit' }))
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it.each([{ mode: 'server' }, { mode: null }, {}, { mode: 'uit', deleteExisting: 'ja' }])(
    '400 bij ongeldige body %j',
    async (body) => {
      mockGetCachedUser.mockResolvedValue(USER)
      mockTables({ profiles: { error: null } })
      const res = await PUT(req(body))
      expect(res.status).toBe(400)
      expect(mockFrom).not.toHaveBeenCalled()
    },
  )

  it('zet de modus op de eigen rij en verwijdert NIETS zonder deleteExisting', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({ profiles: { error: null } })

    const res = await PUT(req({ mode: 'uit' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mode: 'uit', deleted: 0 })
    expect(calls.profiles.update).toEqual([[{ chat_history_mode: 'uit' }]])
    expect(calls.profiles.eq).toEqual([['id', 'user-1']])
    expect(mockFrom).not.toHaveBeenCalledWith('chat_conversations')
  })

  it('verwijdert alleen op expliciet verzoek, en pas ná het zetten van de modus', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({
      profiles: { error: null },
      chat_conversations: { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], error: null },
    })

    const res = await PUT(req({ mode: 'uit', deleteExisting: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mode: 'uit', deleted: 3 })
    expect(calls.chat_conversations.eq).toEqual([['user_id', 'user-1']])
    // Onherstelbaar gaat nooit voorop.
    expect(order).toEqual(['profiles:update', 'chat_conversations:delete'])
  })

  it('wist niets wanneer het zetten van de modus faalt', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockTables({ profiles: { error: { code: '42703', message: 'column does not exist' } } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await PUT(req({ mode: 'uit', deleteExisting: true }))
    expect(res.status).toBe(500)
    expect(mockFrom).not.toHaveBeenCalledWith('chat_conversations')
    spy.mockRestore()
  })
})
